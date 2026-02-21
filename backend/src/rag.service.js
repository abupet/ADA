// backend/src/rag.service.js v1
// RAG (Retrieval-Augmented Generation) service for veterinary knowledge base

/**
 * Search the knowledge base for relevant chunks using vector similarity.
 * @param {object} pool - PostgreSQL pool
 * @param {Function} getOpenAiKey - Function that returns OpenAI API key
 * @param {object} options - Search options
 * @param {string} options.query - The search query text
 * @param {number} [options.topK=5] - Number of top results to return
 * @param {number} [options.similarityThreshold=0.3] - Minimum cosine similarity
 * @param {string} [options.category] - Optional category filter
 * @param {string} [options.sourceService] - Service name for logging
 * @param {string} [options.petId] - Optional pet ID for logging
 * @param {string} [options.tenantId] - Optional tenant ID for logging
 * @returns {object} { chunks, query_text, latency_ms }
 */
async function searchKnowledgeBase(pool, getOpenAiKey, options = {}) {
    const startTime = Date.now();
    const {
        query,
        topK = 5,
        similarityThreshold = 0.3,
        category = null,
        sourceService = "unknown",
        petId = null,
        tenantId = null
    } = options;

    if (!query || !query.trim()) {
        return { chunks: [], query_text: query, latency_ms: 0 };
    }

    const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
    if (!openAiKey) {
        console.warn("[rag] No OpenAI key available for embedding query");
        return { chunks: [], query_text: query, latency_ms: 0 };
    }

    // Generate query embedding
    const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + openAiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: query.trim()
        })
    });

    if (!embResponse.ok) {
        throw new Error(`Embedding API error: ${embResponse.status}`);
    }

    const embData = await embResponse.json();
    const queryEmbedding = embData.data[0].embedding;
    const vectorStr = '[' + queryEmbedding.join(',') + ']';

    // Vector similarity search with cosine distance
    let sql = `
        SELECT c.chunk_id, c.chunk_index, c.chapter_title, c.section_title,
               c.page_start, c.page_end, c.chunk_text, c.chunk_tokens, c.metadata,
               b.title as book_title, b.author as book_author, b.category,
               1 - (c.embedding <=> $1::vector) as similarity
        FROM vet_knowledge_chunks c
        JOIN vet_knowledge_books b ON c.book_id = b.book_id
        WHERE b.enabled = true
          AND b.processing_status = 'ready'
          AND c.embedding IS NOT NULL
          AND 1 - (c.embedding <=> $1::vector) >= $2
    `;
    const params = [vectorStr, similarityThreshold];

    if (category) {
        params.push(category);
        sql += ` AND b.category = $${params.length}`;
    }

    params.push(topK);
    sql += ` ORDER BY c.embedding <=> $1::vector ASC LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    const latencyMs = Date.now() - startTime;

    // Log the query (async, don't block)
    const topSimilarity = result.rows.length > 0 ? parseFloat(result.rows[0].similarity) : 0;
    const avgSimilarity = result.rows.length > 0
        ? result.rows.reduce((sum, r) => sum + parseFloat(r.similarity), 0) / result.rows.length
        : 0;

    pool.query(`
        INSERT INTO vet_knowledge_query_log
        (query_text, query_embedding, source_service, chunks_returned,
         top_chunk_similarity, avg_chunk_similarity, latency_ms, pet_id, tenant_id)
        VALUES ($1, $2::vector, $3, $4, $5, $6, $7, $8, $9)
    `, [
        query.trim(), vectorStr, sourceService,
        result.rows.length, topSimilarity, avgSimilarity,
        latencyMs, petId || null, tenantId || null
    ]).catch(err => {
        console.warn("[rag] Failed to log query:", err.message);
    });

    return {
        chunks: result.rows.map(r => ({
            chunk_id: r.chunk_id,
            chunk_index: r.chunk_index,
            chapter_title: r.chapter_title,
            section_title: r.section_title,
            page_start: r.page_start,
            page_end: r.page_end,
            chunk_text: r.chunk_text,
            chunk_tokens: r.chunk_tokens,
            metadata: r.metadata,
            book_title: r.book_title,
            book_author: r.book_author,
            category: r.category,
            similarity: parseFloat(r.similarity)
        })),
        query_text: query,
        latency_ms: latencyMs
    };
}

/**
 * Build formatted context string from retrieved chunks for injection into prompts.
 * @param {Array} chunks - Array of chunk objects from searchKnowledgeBase
 * @returns {string} Formatted context string
 */
function buildVetKnowledgeContext(chunks) {
    if (!chunks || chunks.length === 0) return "";

    let context = "\n\n--- CONTESTO DA LETTERATURA VETERINARIA ---\n";
    context += "Le seguenti informazioni provengono da testi veterinari di riferimento. Usale per arricchire e supportare la tua risposta quando pertinenti.\n\n";

    for (const chunk of chunks) {
        const source = [];
        if (chunk.book_title) source.push(chunk.book_title);
        if (chunk.book_author) source.push(chunk.book_author);
        if (chunk.chapter_title) source.push("Cap: " + chunk.chapter_title);
        if (chunk.page_start) source.push("p." + chunk.page_start + (chunk.page_end && chunk.page_end !== chunk.page_start ? "-" + chunk.page_end : ""));

        context += `[Fonte: ${source.join(" | ")}] (rilevanza: ${(chunk.similarity * 100).toFixed(0)}%)\n`;
        context += chunk.chunk_text + "\n\n";
    }

    context += "--- FINE CONTESTO LETTERATURA ---\n";
    context += "Nota: integra queste informazioni nella tua risposta in modo naturale, senza citare esplicitamente le fonti all'utente a meno che non sia utile.\n";

    return context;
}

/**
 * All-in-one function to enrich a system prompt with RAG context.
 * Safe to call always — returns the original prompt on any error or if no KB content exists.
 * @param {object} pool - PostgreSQL pool
 * @param {Function} getOpenAiKey - Function that returns OpenAI API key
 * @param {string} systemPrompt - The original system prompt to enrich
 * @param {string} queryContext - Text to use as the search query (e.g., pet info, user question)
 * @param {object} [options] - Optional overrides for searchKnowledgeBase
 * @returns {string} Enriched system prompt (or original on error/no results)
 */
async function enrichSystemPrompt(pool, getOpenAiKey, systemPrompt, queryContext, options = {}) {
    try {
        if (!queryContext || !queryContext.trim()) return systemPrompt;

        // Quick check: are there any enabled, ready books?
        const countResult = await pool.query(
            "SELECT COUNT(*) FROM vet_knowledge_books WHERE enabled = true AND processing_status = 'ready'"
        );
        if (parseInt(countResult.rows[0].count) === 0) return systemPrompt;

        const results = await searchKnowledgeBase(pool, getOpenAiKey, {
            query: queryContext.trim().substring(0, 500), // limit query length
            topK: options.topK || 4,
            similarityThreshold: options.similarityThreshold || 0.35,
            category: options.category || null,
            sourceService: options.sourceService || "unknown",
            petId: options.petId || null,
            tenantId: options.tenantId || null
        });

        if (!results.chunks || results.chunks.length === 0) return systemPrompt;

        const context = buildVetKnowledgeContext(results.chunks);
        return systemPrompt + context;

    } catch (err) {
        console.warn("[rag] enrichSystemPrompt failed (returning original):", err.message);
        return systemPrompt;
    }
}

module.exports = {
    searchKnowledgeBase,
    buildVetKnowledgeContext,
    enrichSystemPrompt
};
