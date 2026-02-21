// backend/src/knowledge.routes.js v1
// Veterinary Knowledge Base management API (super_admin only)

const express = require("express");
const { getPool } = require("./db");
const { randomUUID } = require("crypto");
const { requireRole } = require("./rbac.middleware");
const pdfParse = require("pdf-parse");

function serverLog(level, domain, message, data, req) {
    if (process.env.ADA_DEBUG_LOG !== 'true') return;
    console.log(JSON.stringify({
        ts: new Date().toISOString(), level, domain,
        corrId: (req && req.correlationId) || '--------',
        msg: message, data: data || undefined
    }));
}

function knowledgeRouter({ requireAuth, upload, getOpenAiKey }) {
    const router = express.Router();
    const pool = getPool();

    // GET /api/superadmin/knowledge/books
    router.get("/api/superadmin/knowledge/books",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const result = await pool.query(`
                    SELECT b.*,
                        (SELECT COUNT(*) FROM vet_knowledge_chunks c WHERE c.book_id = b.book_id) as chunk_count,
                        (SELECT COALESCE(SUM(c.chunk_tokens), 0) FROM vet_knowledge_chunks c WHERE c.book_id = b.book_id) as total_tokens
                    FROM vet_knowledge_books b
                    ORDER BY b.created_at DESC
                `);
                res.json({ books: result.rows });
            } catch (err) {
                console.error("GET /knowledge/books error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // POST /api/superadmin/knowledge/books/upload
    router.post("/api/superadmin/knowledge/books/upload",
        requireAuth, requireRole(["super_admin"]),
        upload.single("pdf_file"),
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: "no_file", message: "Nessun file PDF caricato" });
                }
                if (req.file.mimetype !== "application/pdf") {
                    return res.status(400).json({ error: "invalid_type", message: "Solo file PDF sono accettati" });
                }

                const { title, author, isbn, edition, publisher, year_published, language, category, description } = req.body;

                if (!title || !title.trim()) {
                    return res.status(400).json({ error: "title_required", message: "Il titolo è obbligatorio" });
                }

                const bookId = randomUUID();
                const userId = req.user?.sub || null;

                await pool.query(`
                    INSERT INTO vet_knowledge_books
                    (book_id, title, author, isbn, edition, publisher, year_published,
                     language, category, description, original_filename, file_size_bytes,
                     processing_status, uploaded_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13)
                `, [
                    bookId, title.trim(), author || null, isbn || null,
                    edition || null, publisher || null,
                    year_published ? parseInt(year_published) : null,
                    language || 'it', category || 'general',
                    description || null, req.file.originalname,
                    req.file.size, userId
                ]);

                processBookAsync(pool, bookId, req.file.buffer, getOpenAiKey).catch(err => {
                    console.error(`[knowledge] Async processing failed for book ${bookId}:`, err);
                });

                serverLog('INFO', 'KNOWLEDGE', 'book upload started', {
                    bookId, title: title.trim(), size: req.file.size
                }, req);

                res.json({
                    book_id: bookId,
                    status: "processing",
                    message: "PDF caricato. L'elaborazione è in corso..."
                });
            } catch (err) {
                console.error("POST /knowledge/books/upload error:", err);
                res.status(500).json({ error: "upload_error", message: err.message });
            }
        }
    );

    // GET /api/superadmin/knowledge/books/:bookId
    router.get("/api/superadmin/knowledge/books/:bookId",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const bookResult = await pool.query(
                    "SELECT * FROM vet_knowledge_books WHERE book_id = $1", [req.params.bookId]
                );
                if (bookResult.rows.length === 0) {
                    return res.status(404).json({ error: "not_found" });
                }

                const chunksResult = await pool.query(`
                    SELECT chunk_id, chunk_index, chapter_title, section_title,
                           page_start, page_end, chunk_tokens,
                           LEFT(chunk_text, 200) as chunk_preview,
                           metadata
                    FROM vet_knowledge_chunks
                    WHERE book_id = $1
                    ORDER BY chunk_index ASC
                `, [req.params.bookId]);

                res.json({
                    book: bookResult.rows[0],
                    chunks: chunksResult.rows,
                    total_chunks: chunksResult.rows.length
                });
            } catch (err) {
                console.error("GET /knowledge/books/:id error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // PUT /api/superadmin/knowledge/books/:bookId
    router.put("/api/superadmin/knowledge/books/:bookId",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const { title, author, isbn, edition, publisher, year_published,
                        language, category, description, enabled } = req.body;

                const result = await pool.query(`
                    UPDATE vet_knowledge_books SET
                        title = COALESCE($2, title),
                        author = COALESCE($3, author),
                        isbn = COALESCE($4, isbn),
                        edition = COALESCE($5, edition),
                        publisher = COALESCE($6, publisher),
                        year_published = COALESCE($7, year_published),
                        language = COALESCE($8, language),
                        category = COALESCE($9, category),
                        description = COALESCE($10, description),
                        enabled = COALESCE($11, enabled),
                        updated_at = NOW()
                    WHERE book_id = $1
                    RETURNING *
                `, [
                    req.params.bookId, title, author, isbn, edition, publisher,
                    year_published ? parseInt(year_published) : null,
                    language, category, description,
                    typeof enabled === 'boolean' ? enabled : null
                ]);

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: "not_found" });
                }
                res.json({ book: result.rows[0] });
            } catch (err) {
                console.error("PUT /knowledge/books/:id error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // DELETE /api/superadmin/knowledge/books/:bookId
    router.delete("/api/superadmin/knowledge/books/:bookId",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const result = await pool.query(
                    "DELETE FROM vet_knowledge_books WHERE book_id = $1 RETURNING title",
                    [req.params.bookId]
                );
                if (result.rows.length === 0) {
                    return res.status(404).json({ error: "not_found" });
                }
                serverLog('INFO', 'KNOWLEDGE', 'book deleted', {
                    bookId: req.params.bookId, title: result.rows[0].title
                }, req);
                res.json({ deleted: true, title: result.rows[0].title });
            } catch (err) {
                console.error("DELETE /knowledge/books/:id error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // POST /api/superadmin/knowledge/books/:bookId/reprocess
    router.post("/api/superadmin/knowledge/books/:bookId/reprocess",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const bookResult = await pool.query(
                    "SELECT * FROM vet_knowledge_books WHERE book_id = $1",
                    [req.params.bookId]
                );
                if (bookResult.rows.length === 0) {
                    return res.status(404).json({ error: "not_found" });
                }

                await pool.query(
                    "UPDATE vet_knowledge_books SET processing_status = 'embedding', updated_at = NOW() WHERE book_id = $1",
                    [req.params.bookId]
                );

                regenerateEmbeddingsAsync(pool, req.params.bookId, getOpenAiKey).catch(err => {
                    console.error(`[knowledge] Embedding regeneration failed for ${req.params.bookId}:`, err);
                });

                return res.json({ status: "reprocessing_embeddings", message: "Rigenerazione embedding in corso..." });
            } catch (err) {
                console.error("POST /knowledge/books/:id/reprocess error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // GET /api/superadmin/knowledge/categories
    router.get("/api/superadmin/knowledge/categories",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const result = await pool.query(
                    "SELECT * FROM vet_knowledge_categories ORDER BY sort_order ASC"
                );
                res.json({ categories: result.rows });
            } catch (err) {
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // GET /api/superadmin/knowledge/stats
    router.get("/api/superadmin/knowledge/stats",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const [booksRes, chunksRes, queriesRes, topSourcesRes] = await Promise.all([
                    pool.query(`
                        SELECT
                            COUNT(*) as total_books,
                            COUNT(*) FILTER (WHERE enabled = true) as active_books,
                            COUNT(*) FILTER (WHERE processing_status = 'ready') as ready_books,
                            COUNT(*) FILTER (WHERE processing_status = 'error') as error_books,
                            COUNT(*) FILTER (WHERE processing_status IN ('pending','extracting','chunking','embedding')) as processing_books
                        FROM vet_knowledge_books
                    `),
                    pool.query(`
                        SELECT
                            COUNT(*) as total_chunks,
                            COALESCE(SUM(chunk_tokens), 0) as total_tokens,
                            ROUND(AVG(chunk_tokens)) as avg_chunk_tokens
                        FROM vet_knowledge_chunks c
                        JOIN vet_knowledge_books b ON c.book_id = b.book_id
                        WHERE b.enabled = true AND b.processing_status = 'ready'
                    `),
                    pool.query(`
                        SELECT
                            COUNT(*) as total_queries,
                            ROUND(AVG(latency_ms)) as avg_latency_ms,
                            ROUND(AVG(top_chunk_similarity)::numeric, 3) as avg_top_similarity,
                            ROUND(AVG(chunks_returned)::numeric, 1) as avg_chunks_returned
                        FROM vet_knowledge_query_log
                        WHERE created_at > NOW() - INTERVAL '30 days'
                    `),
                    pool.query(`
                        SELECT source_service, COUNT(*) as query_count,
                               ROUND(AVG(top_chunk_similarity)::numeric, 3) as avg_similarity
                        FROM vet_knowledge_query_log
                        WHERE created_at > NOW() - INTERVAL '30 days'
                        GROUP BY source_service
                        ORDER BY query_count DESC
                    `)
                ]);

                res.json({
                    books: booksRes.rows[0],
                    chunks: chunksRes.rows[0],
                    queries_30d: queriesRes.rows[0],
                    queries_by_service: topSourcesRes.rows
                });
            } catch (err) {
                console.error("GET /knowledge/stats error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // POST /api/superadmin/knowledge/search
    router.post("/api/superadmin/knowledge/search",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const { query, top_k, similarity_threshold, category } = req.body;
                if (!query || !query.trim()) {
                    return res.status(400).json({ error: "query_required" });
                }

                const { searchKnowledgeBase } = require("./rag.service");
                const results = await searchKnowledgeBase(pool, getOpenAiKey, {
                    query: query.trim(),
                    topK: top_k || 5,
                    similarityThreshold: similarity_threshold || 0.3,
                    category: category || null,
                    sourceService: "manual_test"
                });

                res.json(results);
            } catch (err) {
                console.error("POST /knowledge/search error:", err);
                res.status(500).json({ error: "search_error", message: err.message });
            }
        }
    );

    // GET /api/superadmin/knowledge/query-log
    router.get("/api/superadmin/knowledge/query-log",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit) || 50, 200);
                const offset = parseInt(req.query.offset) || 0;
                const source = req.query.source || null;

                let whereClause = "";
                const params = [limit, offset];
                if (source) {
                    whereClause = "WHERE source_service = $3";
                    params.push(source);
                }

                const result = await pool.query(`
                    SELECT query_id, LEFT(query_text, 200) as query_preview,
                           source_service, chunks_returned, top_chunk_similarity,
                           avg_chunk_similarity, latency_ms, pet_id, tenant_id, created_at
                    FROM vet_knowledge_query_log
                    ${whereClause}
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                `, params);

                res.json({ queries: result.rows, limit, offset });
            } catch (err) {
                console.error("GET /knowledge/query-log error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // GET /api/superadmin/knowledge/chunks/:bookId/browse
    router.get("/api/superadmin/knowledge/chunks/:bookId/browse",
        requireAuth, requireRole(["super_admin"]),
        async (req, res) => {
            try {
                const page = Math.max(1, parseInt(req.query.page) || 1);
                const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 50);
                const offset = (page - 1) * pageSize;

                const [countRes, chunksRes] = await Promise.all([
                    pool.query("SELECT COUNT(*) FROM vet_knowledge_chunks WHERE book_id = $1", [req.params.bookId]),
                    pool.query(`
                        SELECT chunk_id, chunk_index, chapter_title, section_title,
                               page_start, page_end, chunk_text, chunk_tokens, metadata
                        FROM vet_knowledge_chunks
                        WHERE book_id = $1
                        ORDER BY chunk_index ASC
                        LIMIT $2 OFFSET $3
                    `, [req.params.bookId, pageSize, offset])
                ]);

                res.json({
                    chunks: chunksRes.rows,
                    total: parseInt(countRes.rows[0].count),
                    page,
                    pageSize,
                    totalPages: Math.ceil(parseInt(countRes.rows[0].count) / pageSize)
                });
            } catch (err) {
                console.error("GET /knowledge/chunks/:bookId/browse error:", err);
                res.status(500).json({ error: "internal_error" });
            }
        }
    );

    // --- Async processing ---
    async function processBookAsync(pool, bookId, pdfBuffer, getOpenAiKey) {
        const startTime = Date.now();
        try {
            await pool.query(
                "UPDATE vet_knowledge_books SET processing_status = 'extracting', processing_started_at = NOW() WHERE book_id = $1",
                [bookId]
            );

            const pdfData = await pdfParse(pdfBuffer);
            const totalPages = pdfData.numpages || 0;

            await pool.query(
                "UPDATE vet_knowledge_books SET total_pages = $2 WHERE book_id = $1",
                [bookId, totalPages]
            );

            await pool.query(
                "UPDATE vet_knowledge_books SET processing_status = 'chunking' WHERE book_id = $1",
                [bookId]
            );

            const chunks = chunkText(pdfData.text, {
                maxTokens: 600,
                overlapTokens: 100,
                respectParagraphs: true
            });

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                await pool.query(`
                    INSERT INTO vet_knowledge_chunks
                    (book_id, chunk_index, chapter_title, section_title,
                     page_start, page_end, chunk_text, chunk_tokens, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    bookId, i, chunk.chapter || null, chunk.section || null,
                    chunk.pageStart || null, chunk.pageEnd || null,
                    chunk.text, chunk.estimatedTokens,
                    JSON.stringify(chunk.metadata || {})
                ]);
            }

            await pool.query(
                "UPDATE vet_knowledge_books SET processing_status = 'embedding' WHERE book_id = $1",
                [bookId]
            );

            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
            if (!openAiKey) throw new Error("OpenAI API key non configurata");

            const BATCH_SIZE = 20;
            for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
                const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
                const batchTexts = chunks.slice(batchStart, batchEnd).map(c => c.text);

                const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer " + openAiKey,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "text-embedding-3-small",
                        input: batchTexts
                    })
                });

                if (!embResponse.ok) {
                    throw new Error(`Embedding API error: ${embResponse.status}`);
                }

                const embData = await embResponse.json();

                for (let j = 0; j < embData.data.length; j++) {
                    const chunkIndex = batchStart + j;
                    const embedding = embData.data[j].embedding;
                    const vectorStr = '[' + embedding.join(',') + ']';

                    await pool.query(`
                        UPDATE vet_knowledge_chunks
                        SET embedding = $1::vector
                        WHERE book_id = $2 AND chunk_index = $3
                    `, [vectorStr, bookId, chunkIndex]);
                }

                if (batchEnd < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            const totalTime = Date.now() - startTime;
            await pool.query(`
                UPDATE vet_knowledge_books SET
                    processing_status = 'ready',
                    total_chunks = $2,
                    processing_completed_at = NOW(),
                    updated_at = NOW()
                WHERE book_id = $1
            `, [bookId, chunks.length]);

            console.log(`[knowledge] Book ${bookId} processed: ${chunks.length} chunks, ${totalTime}ms`);

        } catch (err) {
            console.error(`[knowledge] Processing error for book ${bookId}:`, err);
            await pool.query(
                "UPDATE vet_knowledge_books SET processing_status = 'error', processing_error = $2, updated_at = NOW() WHERE book_id = $1",
                [bookId, err.message]
            ).catch(() => {});
        }
    }

    // --- Chunking ---
    function chunkText(fullText, options = {}) {
        const maxTokens = options.maxTokens || 600;
        const overlapTokens = options.overlapTokens || 100;

        const charPerToken = 4;
        const maxChars = maxTokens * charPerToken;
        const overlapChars = overlapTokens * charPerToken;

        let text = fullText
            .replace(/\r\n/g, '\n')
            .replace(/\n{4,}/g, '\n\n\n')
            .replace(/[ \t]+/g, ' ');

        const chapterPattern = /^(CAPITOLO|CHAPTER|CAP\.?|PARTE|SEZIONE|SECTION)\s*[\dIVXLCDM]+/im;
        const sectionPattern = /^(\d+\.[\d.]*)\s+[A-Z]/m;

        const paragraphs = text.split(/\n\n+/);
        const chunks = [];
        let currentChunk = "";
        let currentChapter = null;
        let currentSection = null;

        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;

            if (chapterPattern.test(trimmed)) {
                currentChapter = trimmed.substring(0, 100);
            }
            if (sectionPattern.test(trimmed)) {
                currentSection = trimmed.substring(0, 100);
            }

            if ((currentChunk + "\n\n" + trimmed).length > maxChars && currentChunk.length > 0) {
                chunks.push({
                    text: currentChunk.trim(),
                    estimatedTokens: Math.ceil(currentChunk.length / charPerToken),
                    chapter: currentChapter,
                    section: currentSection,
                    metadata: {
                        headings: [currentChapter, currentSection].filter(Boolean)
                    }
                });

                const overlapText = currentChunk.slice(-overlapChars);
                currentChunk = overlapText + "\n\n" + trimmed;
            } else {
                currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
            }
        }

        if (currentChunk.trim()) {
            chunks.push({
                text: currentChunk.trim(),
                estimatedTokens: Math.ceil(currentChunk.length / charPerToken),
                chapter: currentChapter,
                section: currentSection,
                metadata: {
                    headings: [currentChapter, currentSection].filter(Boolean)
                }
            });
        }

        return chunks;
    }

    // --- Regenerate embeddings ---
    async function regenerateEmbeddingsAsync(pool, bookId, getOpenAiKey) {
        try {
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
            if (!openAiKey) throw new Error("OpenAI API key non configurata");

            const chunksRes = await pool.query(
                "SELECT chunk_id, chunk_index, chunk_text FROM vet_knowledge_chunks WHERE book_id = $1 ORDER BY chunk_index",
                [bookId]
            );

            const BATCH_SIZE = 20;
            for (let i = 0; i < chunksRes.rows.length; i += BATCH_SIZE) {
                const batch = chunksRes.rows.slice(i, i + BATCH_SIZE);
                const texts = batch.map(c => c.chunk_text);

                const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer " + openAiKey,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "text-embedding-3-small",
                        input: texts
                    })
                });

                if (!embResponse.ok) throw new Error(`Embedding API error: ${embResponse.status}`);
                const embData = await embResponse.json();

                for (let j = 0; j < embData.data.length; j++) {
                    const vectorStr = '[' + embData.data[j].embedding.join(',') + ']';
                    await pool.query(
                        "UPDATE vet_knowledge_chunks SET embedding = $1::vector WHERE chunk_id = $2",
                        [vectorStr, batch[j].chunk_id]
                    );
                }

                if (i + BATCH_SIZE < chunksRes.rows.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            await pool.query(
                "UPDATE vet_knowledge_books SET processing_status = 'ready', updated_at = NOW() WHERE book_id = $1",
                [bookId]
            );
        } catch (err) {
            console.error(`[knowledge] Embedding regen error for ${bookId}:`, err);
            await pool.query(
                "UPDATE vet_knowledge_books SET processing_status = 'error', processing_error = $2, updated_at = NOW() WHERE book_id = $1",
                [bookId, err.message]
            ).catch(() => {});
        }
    }

    return router;
}

module.exports = { knowledgeRouter };
