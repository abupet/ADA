// backend/src/tips-sources.routes.js
// Tips & Tricks source management: CRUD, crawl, validation

"use strict";

const express = require("express");
const crypto = require("crypto");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

function extractTextFromHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<\/(p|div|li|h[1-6]|tr|br|hr)[^>]*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

// _crawlSource — extracted from router closure so it can be reused by scheduleTipsRefresh
async function _crawlSource(pool, source, getOpenAiKey, triggeredBy) {
    const t0 = Date.now();
    let http_status = null;
    let content_hash = null;
    let content_changed = false;
    let summary_regenerated = false;
    let error = null;

    try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 15000);
        const resp = await fetch(source.url, { signal: ctrl.signal, headers: { "User-Agent": "ADA-Bot/1.0" } });
        clearTimeout(timeout);
        http_status = resp.status;

        if (!resp.ok) {
            error = `HTTP ${resp.status}`;
            await pool.query(
                "UPDATE tips_sources SET http_status = $1, is_available = false, crawl_error = $2, last_crawled_at = NOW(), updated_at = NOW() WHERE source_id = $3",
                [http_status, error, source.source_id]
            );
        } else {
            const htmlText = await resp.text();
            const contentText = extractTextFromHtml(htmlText).substring(0, 10000);
            content_hash = crypto.createHash('sha256').update(contentText).digest('hex');

            if (content_hash !== source.content_hash || !source.last_crawled_at) {
                content_changed = true;
                let summary_it = source.summary_it;
                let key_topics = source.key_topics || [];
                let language = source.language || 'en';

                const oaKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
                if (oaKey && contentText.length > 100) {
                    try {
                        const gptResp = await fetch('https://api.openai.com/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${oaKey}` },
                            body: JSON.stringify({
                                model: 'gpt-4o-mini',
                                messages: [{
                                    role: 'user',
                                    content: `Sei un assistente veterinario. Analizza questo testo da un sito veterinario e produci:\n1. Riassunto in italiano (max 300 parole) dei contenuti utili per veterinari e proprietari\n2. Lista di 5-10 argomenti chiave\n\nSito: ${source.url} (${source.display_name})\n\nTESTO:\n${contentText.substring(0, 6000)}\n\nRispondi SOLO con JSON:\n{"summary_it": "...", "key_topics": ["..."], "detected_language": "en|it|..."}`
                                }],
                                temperature: 0.3
                            })
                        });
                        if (gptResp.ok) {
                            const gptData = await gptResp.json();
                            const gptContent = gptData.choices?.[0]?.message?.content || '';
                            try {
                                const parsed = JSON.parse(gptContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
                                if (parsed.summary_it) summary_it = parsed.summary_it;
                                if (Array.isArray(parsed.key_topics)) key_topics = parsed.key_topics;
                                if (parsed.detected_language) language = parsed.detected_language;
                                summary_regenerated = true;
                            } catch (_) {}
                        }
                    } catch (_) {}
                }

                await pool.query(
                    `UPDATE tips_sources SET content_text = $1, content_hash = $2, summary_it = $3, key_topics = $4, language = $5,
                     http_status = $6, is_available = true, last_crawled_at = NOW(), content_changed_at = NOW(), crawl_error = NULL, updated_at = NOW()
                     WHERE source_id = $7`,
                    [contentText, content_hash, summary_it, key_topics, language, http_status, source.source_id]
                );
            } else {
                await pool.query(
                    "UPDATE tips_sources SET http_status = $1, is_available = true, last_crawled_at = NOW(), crawl_error = NULL, updated_at = NOW() WHERE source_id = $2",
                    [http_status, source.source_id]
                );
            }
        }
    } catch (e) {
        error = e.message || String(e);
        await pool.query(
            "UPDATE tips_sources SET crawl_error = $1, last_crawled_at = NOW(), updated_at = NOW() WHERE source_id = $2",
            [error, source.source_id]
        );
    }

    const duration_ms = Date.now() - t0;

    await pool.query(
        "INSERT INTO tips_sources_crawl_log (source_id, crawl_type, http_status, content_hash, content_changed, summary_regenerated, error, duration_ms, triggered_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [source.source_id, triggeredBy === 'auto-refresh' ? 'auto' : 'manual', http_status, content_hash, content_changed, summary_regenerated, error, duration_ms, triggeredBy]
    );

    return { source_id: source.source_id, display_name: source.display_name, http_status, content_changed, summary_regenerated, error, duration_ms };
}

// scheduleTipsRefresh — auto-refresh sources older than 7 days, every 6 hours
function scheduleTipsRefresh(getOpenAiKey) {
    const pool = getPool();
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    async function refreshStale() {
        try {
            const { rows } = await pool.query(
                "SELECT * FROM tips_sources WHERE is_active = true AND (last_crawled_at IS NULL OR last_crawled_at < NOW() - INTERVAL '7 days') ORDER BY last_crawled_at ASC NULLS FIRST LIMIT 20"
            );
            if (rows.length === 0) {
                console.log("[tips-auto-refresh] No stale sources to refresh");
                return;
            }
            console.log(`[tips-auto-refresh] Refreshing ${rows.length} stale source(s)...`);
            for (const source of rows) {
                try {
                    const result = await _crawlSource(pool, source, getOpenAiKey, 'auto-refresh');
                    console.log(`[tips-auto-refresh] ${source.display_name}: ${result.error ? 'ERROR ' + result.error : 'OK'} (${result.duration_ms}ms, changed=${result.content_changed})`);
                } catch (e) {
                    console.error(`[tips-auto-refresh] Error crawling ${source.display_name}:`, e.message);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (e) {
            console.error("[tips-auto-refresh] Scheduling error:", e.message);
        }
    }

    // Initial check after 60s (let server start fully)
    setTimeout(refreshStale, 60000);
    // Then every 6 hours
    setInterval(refreshStale, SIX_HOURS);
    console.log("[tips-auto-refresh] Scheduled: check every 6h, initial check in 60s");
}

function tipsSourcesRouter({ requireAuth, getOpenAiKey }) {
    const router = express.Router();
    const pool = getPool();
    const saRoles = ["super_admin"];

    // ==============================
    // PUBLIC (any authenticated user)
    // ==============================

    // GET /api/tips-sources/active-urls — active sources for frontend tips
    router.get("/api/tips-sources/active-urls", requireAuth, async (_req, res) => {
        try {
            const { rows } = await pool.query(
                "SELECT source_id, url, domain, display_name, summary_it, is_available FROM tips_sources WHERE is_active = true ORDER BY display_name"
            );
            res.json({ sources: rows });
        } catch (e) {
            console.error("GET /api/tips-sources/active-urls error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // GET /api/tips-sources/:id/check-live — HEAD check on-demand
    router.get("/api/tips-sources/:id/check-live", requireAuth, async (req, res) => {
        try {
            const { rows } = await pool.query("SELECT * FROM tips_sources WHERE source_id = $1", [req.params.id]);
            if (rows.length === 0) return res.status(404).json({ error: "not_found" });
            const source = rows[0];
            let is_available = false;
            let http_status = null;
            try {
                const ctrl = new AbortController();
                const timeout = setTimeout(() => ctrl.abort(), 10000);
                const resp = await fetch(source.url, { method: "HEAD", signal: ctrl.signal, headers: { "User-Agent": "ADA-Bot/1.0" } });
                clearTimeout(timeout);
                http_status = resp.status;
                is_available = resp.ok;
            } catch (_) {}
            await pool.query(
                "UPDATE tips_sources SET is_available = $1, http_status = $2, last_validated_at = NOW(), updated_at = NOW() WHERE source_id = $3",
                [is_available, http_status, source.source_id]
            );
            res.json({ source_id: source.source_id, display_name: source.display_name, url: source.url, is_available, http_status, summary_it: source.summary_it, last_crawled_at: source.last_crawled_at });
        } catch (e) {
            console.error("GET /api/tips-sources/:id/check-live error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // ==============================
    // ADMIN (super_admin only)
    // ==============================

    // GET /api/tips-sources — list all
    router.get("/api/tips-sources", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const limit = Math.min(200, parseInt(req.query.limit) || 100);
            const offset = parseInt(req.query.offset) || 0;
            const conditions = [];
            const params = [];
            let idx = 1;
            if (req.query.search) { conditions.push(`(display_name ILIKE $${idx} OR url ILIKE $${idx} OR domain ILIKE $${idx})`); params.push('%' + req.query.search + '%'); idx++; }
            if (req.query.is_active === 'true') { conditions.push(`is_active = true`); }
            if (req.query.is_active === 'false') { conditions.push(`is_active = false`); }
            if (req.query.is_available === 'true') { conditions.push(`is_available = true`); }
            if (req.query.is_available === 'false') { conditions.push(`is_available = false`); }
            const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
            const { rows } = await pool.query(
                `SELECT * FROM tips_sources ${where} ORDER BY display_name LIMIT $${idx} OFFSET $${idx + 1}`,
                [...params, limit, offset]
            );
            const countRes = await pool.query(`SELECT COUNT(*) as total FROM tips_sources ${where}`, params);
            res.json({ sources: rows, total: parseInt(countRes.rows[0]?.total || 0) });
        } catch (e) {
            console.error("GET /api/tips-sources error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // GET /api/tips-sources/:id — detail + crawl logs
    router.get("/api/tips-sources/:id", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { rows } = await pool.query("SELECT * FROM tips_sources WHERE source_id = $1", [req.params.id]);
            if (rows.length === 0) return res.status(404).json({ error: "not_found" });
            const logs = await pool.query(
                "SELECT * FROM tips_sources_crawl_log WHERE source_id = $1 ORDER BY created_at DESC LIMIT 10",
                [req.params.id]
            );
            res.json({ source: rows[0], crawl_logs: logs.rows });
        } catch (e) {
            console.error("GET /api/tips-sources/:id error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/tips-sources — create
    router.post("/api/tips-sources", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { url, display_name, crawl_frequency, notes } = req.body;
            if (!url || !url.startsWith('https://')) return res.status(400).json({ error: "URL must start with https://" });
            const domain = new URL(url).hostname.replace(/^www\./, '');
            const { rows } = await pool.query(
                "INSERT INTO tips_sources (url, domain, display_name, crawl_frequency, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *",
                [url, domain, display_name || domain, crawl_frequency || 'monthly', notes || null]
            );
            res.status(201).json({ source: rows[0] });
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ error: "URL already exists" });
            console.error("POST /api/tips-sources error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // PUT /api/tips-sources/:id — update
    router.put("/api/tips-sources/:id", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { display_name, url, is_active, crawl_frequency, notes } = req.body;
            const updates = [];
            const params = [];
            let idx = 1;
            if (display_name !== undefined) { updates.push(`display_name = $${idx}`); params.push(display_name); idx++; }
            if (url !== undefined) {
                if (!url.startsWith('https://')) return res.status(400).json({ error: "URL must start with https://" });
                const domain = new URL(url).hostname.replace(/^www\./, '');
                updates.push(`url = $${idx}`); params.push(url); idx++;
                updates.push(`domain = $${idx}`); params.push(domain); idx++;
            }
            if (is_active !== undefined) { updates.push(`is_active = $${idx}`); params.push(!!is_active); idx++; }
            if (crawl_frequency !== undefined) { updates.push(`crawl_frequency = $${idx}`); params.push(crawl_frequency); idx++; }
            if (notes !== undefined) { updates.push(`notes = $${idx}`); params.push(notes); idx++; }
            if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });
            updates.push('updated_at = NOW()');
            params.push(req.params.id);
            const { rows } = await pool.query(
                `UPDATE tips_sources SET ${updates.join(', ')} WHERE source_id = $${idx} RETURNING *`,
                params
            );
            if (rows.length === 0) return res.status(404).json({ error: "not_found" });
            res.json({ source: rows[0] });
        } catch (e) {
            console.error("PUT /api/tips-sources/:id error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // DELETE /api/tips-sources/:id
    router.delete("/api/tips-sources/:id", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { rowCount } = await pool.query("DELETE FROM tips_sources WHERE source_id = $1", [req.params.id]);
            if (rowCount === 0) return res.status(404).json({ error: "not_found" });
            res.json({ deleted: true });
        } catch (e) {
            console.error("DELETE /api/tips-sources/:id error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/tips-sources/:id/crawl — crawl single source
    router.post("/api/tips-sources/:id/crawl", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { rows } = await pool.query("SELECT * FROM tips_sources WHERE source_id = $1", [req.params.id]);
            if (rows.length === 0) return res.status(404).json({ error: "not_found" });
            const result = await _crawlSource(pool, rows[0], getOpenAiKey, req.user?.sub || 'admin');
            res.json(result);
        } catch (e) {
            console.error("POST /api/tips-sources/:id/crawl error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/tips-sources/crawl-all — crawl all active sources
    router.post("/api/tips-sources/crawl-all", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { rows } = await pool.query("SELECT * FROM tips_sources WHERE is_active = true ORDER BY display_name");
            const results = [];
            for (const source of rows) {
                const r = await _crawlSource(pool, source, getOpenAiKey, req.user?.sub || 'admin');
                results.push(r);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            res.json({ results, total: results.length });
        } catch (e) {
            console.error("POST /api/tips-sources/crawl-all error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/tips-sources/:id/validate — HEAD check
    router.post("/api/tips-sources/:id/validate", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { rows } = await pool.query("SELECT * FROM tips_sources WHERE source_id = $1", [req.params.id]);
            if (rows.length === 0) return res.status(404).json({ error: "not_found" });
            const result = await _validateSource(rows[0]);
            res.json(result);
        } catch (e) {
            console.error("POST /api/tips-sources/:id/validate error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/tips-sources/validate-all
    router.post("/api/tips-sources/validate-all", requireAuth, requireRole(saRoles), async (req, res) => {
        try {
            const { rows } = await pool.query("SELECT * FROM tips_sources WHERE is_active = true ORDER BY display_name");
            const results = [];
            for (const source of rows) {
                const r = await _validateSource(source);
                results.push(r);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            res.json({ results, total: results.length });
        } catch (e) {
            console.error("POST /api/tips-sources/validate-all error", e);
            res.status(500).json({ error: "server_error" });
        }
    });

    // ==============================
    // INTERNAL HELPERS
    // ==============================

    async function _validateSource(source) {
        let is_available = false;
        let http_status = null;
        try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 10000);
            const resp = await fetch(source.url, { method: "HEAD", signal: ctrl.signal, headers: { "User-Agent": "ADA-Bot/1.0" } });
            clearTimeout(timeout);
            http_status = resp.status;
            is_available = resp.ok;
        } catch (_) {}
        await pool.query(
            "UPDATE tips_sources SET is_available = $1, http_status = $2, last_validated_at = NOW(), updated_at = NOW() WHERE source_id = $3",
            [is_available, http_status, source.source_id]
        );
        return { source_id: source.source_id, display_name: source.display_name, is_available, http_status };
    }

    return router;
}

module.exports = { tipsSourcesRouter, extractTextFromHtml, scheduleTipsRefresh };
