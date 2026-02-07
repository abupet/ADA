const express = require('express');
const { startSeedJob, getJobStatus, cancelJob, wipeSeededData } = require('./seed.service');

function seedRouter({ requireAuth, getOpenAiKey }) {
    const router = express.Router();

    // POST /api/seed/start — Start async seed job
    router.post('/api/seed/start', requireAuth, async (req, res) => {
        try {
            const { getPool } = require('./db');
            const pool = getPool();

            const config = req.body || {};
            // Get OpenAI key from environment
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;

            const result = startSeedJob(pool, config, openAiKey);
            if (result.error === 'already_running') {
                return res.status(409).json({ error: 'A seed job is already running' });
            }
            return res.json({ jobId: result.jobId, status: 'started' });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });

    // GET /api/seed/status — Poll current job status
    router.get('/api/seed/status', requireAuth, (req, res) => {
        const status = getJobStatus();
        return res.json(status || { status: 'idle' });
    });

    // POST /api/seed/cancel — Cancel running job
    router.post('/api/seed/cancel', requireAuth, (req, res) => {
        cancelJob();
        return res.json({ status: 'cancel_requested' });
    });

    // POST /api/seed/wipe — Delete all seeded data
    router.post('/api/seed/wipe', requireAuth, async (req, res) => {
        try {
            const { getPool } = require('./db');
            const pool = getPool();
            const result = await wipeSeededData(pool);
            return res.json({ status: 'wiped', details: result });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });

    // GET /api/seed/config — Return default configuration
    router.get('/api/seed/config', requireAuth, (req, res) => {
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
    router.post('/api/seed/promo/search-brand', requireAuth, async (req, res) => {
        try {
            const { searchBrandSites } = require('./seed.promogen');
            const brands = (req.body || {}).brands || '';
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
            const result = await searchBrandSites(brands, openAiKey);
            return res.json(result);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });

    // POST /api/seed/promo/scrape-sites — Scrape products from sites
    router.post('/api/seed/promo/scrape-sites', requireAuth, async (req, res) => {
        try {
            const { scrapeProductsFromSites } = require('./seed.promogen');
            const siteUrls = (req.body || {}).siteUrls || [];
            const openAiKey = typeof getOpenAiKey === 'function' ? getOpenAiKey() : null;
            const result = await scrapeProductsFromSites(siteUrls, openAiKey);
            return res.json({ products: result });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });

    // POST /api/seed/promo/import — Import selected products to catalog
    router.post('/api/seed/promo/import', requireAuth, async (req, res) => {
        try {
            const { importProductsToCatalog } = require('./seed.promogen');
            const { getPool } = require('./db');
            const pool = getPool();
            const products = (req.body || {}).products || [];
            const result = await importProductsToCatalog(pool, products);
            return res.json(result);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });

    return router;
}

module.exports = { seedRouter };
