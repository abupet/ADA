const express = require('express');
const { startSeedJob, getJobStatus, cancelJob, wipeSeededData } = require('./seed.service');
const { requireRole } = require('./rbac.middleware');

function seedRouter({ requireAuth, getOpenAiKey }) {
    const router = express.Router();
    const adminRoles = ['super_admin'];

    // POST /api/seed/start — Start async seed job
    router.post('/api/seed/start', requireAuth, requireRole(adminRoles), async (req, res) => {
        try {
            const { getPool } = require('./db');
            const pool = getPool();

            const config = req.body || {};
            // Use the authenticated user's ID so seeded pets belong to the logged-in user
            if (!config.ownerUserId && req.user && req.user.sub) {
                config.ownerUserId = req.user.sub;
            }
            // Get OpenAI key from environment
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;

            const result = startSeedJob(pool, config, openAiKey);
            if (result.error === 'already_running') {
                return res.status(409).json({ error: 'A seed job is already running' });
            }
            return res.json({ jobId: result.jobId, status: 'started' });
        } catch (e) {
            console.error("POST /api/seed/start error", e);
            return res.status(500).json({ error: "server_error" });
        }
    });

    // GET /api/seed/status — Poll current job status
    router.get('/api/seed/status', requireAuth, requireRole(adminRoles), (req, res) => {
        const status = getJobStatus();
        return res.json(status || { status: 'idle' });
    });

    // POST /api/seed/cancel — Cancel running job
    router.post('/api/seed/cancel', requireAuth, requireRole(adminRoles), (req, res) => {
        cancelJob();
        return res.json({ status: 'cancel_requested' });
    });

    // POST /api/seed/wipe — Delete all seeded data
    router.post('/api/seed/wipe', requireAuth, requireRole(adminRoles), async (req, res) => {
        try {
            const { getPool } = require('./db');
            const pool = getPool();
            const ownerUserId = req.user && req.user.sub ? req.user.sub : null;
            const result = await wipeSeededData(pool, ownerUserId);
            return res.json({ status: 'wiped', details: result });
        } catch (e) {
            console.error("POST /api/seed/wipe error", e);
            return res.status(500).json({ error: "server_error" });
        }
    });

    // GET /api/seed/config — Return default configuration
    router.get('/api/seed/config', requireAuth, requireRole(adminRoles), (req, res) => {
        return res.json({
            petCount: 10,
            soapPerPet: 3,
            docsPerPet: 2,
            vitalsPerPet: 8,
            medsPerPet: 3,
            photosPerPet: 2,
            promoEventsPerPet: 5,
            dogPct: 60,
            catPct: 30,
            rabbitPct: 10,
            mode: 'fresh'
        });
    });

    // ============================================
    // PR 15: Promo endpoints
    // ============================================

    // POST /api/seed/promo/search-brand — Search brand sites
    router.post('/api/seed/promo/search-brand', requireAuth, requireRole(adminRoles), async (req, res) => {
        try {
            const { searchBrandSites } = require('./seed.promogen');
            const brands = (req.body || {}).brands || '';
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
            const result = await searchBrandSites(brands, openAiKey);
            return res.json(result);
        } catch (e) {
            console.error("POST /api/seed/promo/search-brand error", e);
            return res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/seed/promo/scrape-sites — Scrape products from sites
    router.post('/api/seed/promo/scrape-sites', requireAuth, requireRole(adminRoles), async (req, res) => {
        try {
            const { scrapeProductsFromSites } = require('./seed.promogen');
            const siteUrls = (req.body || {}).siteUrls || [];
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
            const result = await scrapeProductsFromSites(siteUrls, openAiKey);
            return res.json({ products: result });
        } catch (e) {
            console.error("POST /api/seed/promo/scrape-sites error", e);
            return res.status(500).json({ error: "server_error" });
        }
    });

    // POST /api/seed/promo/import — Import selected products to catalog
    router.post('/api/seed/promo/import', requireAuth, requireRole(adminRoles), async (req, res) => {
        try {
            const { importProductsToCatalog } = require('./seed.promogen');
            const { getPool } = require('./db');
            const pool = getPool();
            const body = req.body || {};
            const products = body.products || [];
            const tenantId = body.tenantId || null;
            const mode = body.mode || 'append';
            const result = await importProductsToCatalog(pool, products, { tenantId, mode });
            return res.json(result);
        } catch (e) {
            console.error("POST /api/seed/promo/import error", e);
            return res.status(500).json({ error: "server_error" });
        }
    });

    // GET /api/seed/promo/tenants — List available tenants for the seed promo wizard
    router.get('/api/seed/promo/tenants', requireAuth, requireRole(adminRoles), async (req, res) => {
        try {
            const { getPool } = require('./db');
            const pool = getPool();
            const result = await pool.query(
                "SELECT tenant_id, name FROM tenants WHERE status='active' ORDER BY name"
            );
            return res.json({ tenants: result.rows });
        } catch (e) {
            console.error("GET /api/seed/promo/tenants error", e);
            return res.status(500).json({ error: "server_error" });
        }
    });

    return router;
}

module.exports = { seedRouter };
