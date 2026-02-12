import type { Page, Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Centralised API mocks — reusable across deep / stress / long tests.
// Every mock returns a "capture" object so tests can assert on calls.
// ---------------------------------------------------------------------------

/* ── Sync ─────────────────────────────────────────────────────────────────── */

export interface SyncCapture {
  pushOps: any[];
  pushAccepted: string[];
  pullCalls: number;
}

export async function mockSyncEndpoints(page: Page): Promise<SyncCapture> {
  const capture: SyncCapture = { pushOps: [], pushAccepted: [], pullCalls: 0 };

  await page.route("**/api/sync/pets/push", async (route: Route) => {
    let body: any = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    const ops = Array.isArray(body.ops) ? body.ops : [];
    capture.pushOps.push(...ops);
    const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
    capture.pushAccepted.push(...accepted);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted, rejected: [] }),
    });
  });

  await page.route("**/api/sync/pets/pull**", async (route: Route) => {
    capture.pullCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ next_cursor: null, changes: [] }),
    });
  });

  return capture;
}

/* ── Promo ────────────────────────────────────────────────────────────────── */

export interface PromoCapture {
  recommendations: number;
  events: any[];
  consents: number;
}

export async function mockPromoEndpoints(page: Page): Promise<PromoCapture> {
  const capture: PromoCapture = { recommendations: 0, events: [], consents: 0 };

  await page.route("**/api/promo/recommendation**", async (route: Route) => {
    capture.recommendations++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pet_id: "test-pet-id",
        recommendations: [{
          product_id: "prod_001",
          name: "Premium Dog Food - Adult",
          category: "food",
          species: "dog",
          description: "High-quality kibble for adult dogs.",
          price_eur: 29.99,
          image_url: null,
        }],
      }),
    });
  });

  await page.route("**/api/promo/event**", async (route: Route) => {
    let body: any = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    if (body.events) capture.events.push(...body.events);
    else if (body.event_type) capture.events.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, inserted: body.events?.length || 1 }),
    });
  });

  return capture;
}

/* ── Consent ──────────────────────────────────────────────────────────────── */

export interface ConsentCapture { gets: number; puts: number; }

export async function mockConsentEndpoints(page: Page): Promise<ConsentCapture> {
  const capture: ConsentCapture = { gets: 0, puts: 0 };

  await page.route("**/api/promo/consent/services**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        services: [
          { service_type: "promo", tenant_id: "t1", name: "Test Brand" },
          { service_type: "nutrition", tenant_id: "t1", name: "Test Brand" },
          { service_type: "insurance", tenant_id: "t1", name: "Test Brand" },
        ],
      }),
    });
  });

  await page.route("**/api/promo/consent", async (route: Route) => {
    if (route.request().method() === "GET") {
      capture.gets++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          marketing_global: "opted_in",
          clinical_tags: "opted_in",
          nutrition_plan: "opted_in",
          insurance_data_sharing: "opted_in",
          brand_consents: {},
          nutrition_brand_consents: {},
          insurance_brand_consents: {},
        }),
      });
    } else {
      capture.puts++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  return capture;
}

/* ── Nutrition ────────────────────────────────────────────────────────────── */

export interface NutritionCapture { calls: number; }

export async function mockNutritionEndpoints(page: Page): Promise<NutritionCapture> {
  const capture: NutritionCapture = { calls: 0 };

  await page.route("**/api/nutrition/**", async (route: Route) => {
    capture.calls++;
    const url = route.request().url();
    if (url.includes("/plan/") && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: null }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  return capture;
}

/* ── Insurance ────────────────────────────────────────────────────────────── */

export interface InsuranceCapture { calls: number; }

export async function mockInsuranceEndpoints(page: Page): Promise<InsuranceCapture> {
  const capture: InsuranceCapture = { calls: 0 };

  await page.route("**/api/insurance/**", async (route: Route) => {
    capture.calls++;
    const url = route.request().url();
    if (url.includes("/coverage/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ policy: null }),
      });
    } else if (url.includes("/risk-score/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          score: { total_score: 35, risk_class: "medium", price_multiplier: 1.3 },
          cached: false,
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  return capture;
}

/* ── Documents ────────────────────────────────────────────────────────────── */

export interface DocumentsCapture { uploads: any[]; reads: number; }

export async function mockDocumentsEndpoints(page: Page): Promise<DocumentsCapture> {
  const capture: DocumentsCapture = { uploads: [], reads: 0 };

  await page.route("**/api/documents/upload**", async (route: Route) => {
    capture.uploads.push({ method: route.request().method() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        document_id: `doc_${Date.now()}`,
        filename: "test-file.pdf",
      }),
    });
  });

  await page.route("**/api/documents/list**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documents: [] }),
    });
  });

  await page.route("**/api/documents/read**", async (route: Route) => {
    capture.reads++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ text: "[MOCK] Document content read by AI." }),
    });
  });

  return capture;
}

/* ── Communication ────────────────────────────────────────────────────────── */

export interface CommunicationCapture { messages: any[]; }

export async function mockCommunicationEndpoints(page: Page): Promise<CommunicationCapture> {
  const capture: CommunicationCapture = { messages: [] };

  await page.route("**/api/messages**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ messages: [] }),
      });
    } else {
      let body: any = {};
      try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
      capture.messages.push(body);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id: `msg_${Date.now()}` }),
      });
    }
  });

  return capture;
}

/* ── Seed / Demo ──────────────────────────────────────────────────────────── */

export async function mockSeedEndpoints(page: Page) {
  await page.route("**/api/seed/start-demo", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "demo_test", status: "started", mode: "demo" }),
    });
  });

  await page.route("**/api/seed/promo/tenants", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tenants: [{ tenant_id: "t1", name: "Test Brand" }],
      }),
    });
  });

  await page.route("**/api/seed/search**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ brand: "Mock Brand", url: "https://example.com" }] }),
    });
  });

  await page.route("**/api/seed/scrape**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [{ name: "Mock Product", price: 19.99 }] }),
    });
  });

  await page.route("**/api/seed/confirm**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, confirmed: 1 }),
    });
  });
}

/* ── Combo: all mocks at once ─────────────────────────────────────────────── */

export async function mockAllEndpoints(page: Page) {
  const sync = await mockSyncEndpoints(page);
  const promo = await mockPromoEndpoints(page);
  const consent = await mockConsentEndpoints(page);
  const nutrition = await mockNutritionEndpoints(page);
  const insurance = await mockInsuranceEndpoints(page);
  const docs = await mockDocumentsEndpoints(page);
  const comm = await mockCommunicationEndpoints(page);
  await mockSeedEndpoints(page);
  return { sync, promo, consent, nutrition, insurance, docs, comm };
}
