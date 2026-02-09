import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateTo(page: any, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate((p: string) => {
    (window as any).navigateToPage(p);
  }, pageName);
}

async function setupPromoMocks(page: any) {
  const captured = { events: [] as any[], recommendations: 0, consents: 0 };

  // Mock promo recommendation endpoint
  await page.route("**/api/promo/recommendation**", async (route: any) => {
    captured.recommendations++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pet_id: "test-pet-id",
        recommendations: [
          {
            product_id: "prod_001",
            name: "Premium Dog Food - Adult",
            category: "food",
            species: "dog",
            description: "High-quality kibble for adult dogs.",
            price_eur: 29.99,
            image_url: null,
          },
        ],
      }),
    });
  });

  // Mock promo events endpoint (single + batch)
  await page.route("**/api/promo/event**", async (route: any) => {
    const req = route.request();
    let body: any = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch {}
    if (body.events) {
      captured.events.push(...body.events);
    } else if (body.event_type) {
      captured.events.push(body);
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, inserted: body.events?.length || 1 }),
    });
  });

  // Mock consent endpoints
  await page.route("**/api/promo/consent**", async (route: any) => {
    const req = route.request();
    captured.consents++;
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          marketing_global: "opted_in",
          clinical_tags: "opted_out",
          brand_consents: {},
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

  // Mock sync endpoints
  await page.route("**/api/sync/pets/push", async (route: any) => {
    const req = route.request();
    let body: any = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch {}
    const ops = Array.isArray(body.ops) ? body.ops : [];
    const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted, rejected: [] }),
    });
  });

  await page.route("**/api/sync/pets/pull**", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ next_cursor: null, changes: [] }),
    });
  });

  return captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Promo system smoke tests", () => {

  test("@smoke Promo globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupPromoMocks(page);

    await login(page);

    // Check that promo functions are loaded
    const promoGlobals = await page.evaluate(() => {
      return {
        loadPromoRecommendation: typeof (window as any).loadPromoRecommendation,
        trackPromoEvent: typeof (window as any).trackPromoEvent,
        renderConsentBanner: typeof (window as any).renderConsentBanner,
        renderVetFlagButton: typeof (window as any).renderVetFlagButton,
      };
    });

    expect(promoGlobals.loadPromoRecommendation).toBe("function");
    expect(promoGlobals.trackPromoEvent).toBe("function");
    expect(promoGlobals.renderConsentBanner).toBe("function");
    expect(promoGlobals.renderVetFlagButton).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Admin dashboard globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupPromoMocks(page);

    await login(page);

    // Check that admin functions are loaded (including new wizard/CSV globals)
    const adminGlobals = await page.evaluate(() => {
      return {
        loadAdminDashboard: typeof (window as any).loadAdminDashboard,
        exportPromoCsv: typeof (window as any).exportPromoCsv,
        initCsvWizard: typeof (window as any).initCsvWizard,
        handleCsvUpload: typeof (window as any).handleCsvUpload,
        downloadCsvTemplate: typeof (window as any).downloadCsvTemplate,
        wizardPreviewNav: typeof (window as any).wizardPreviewNav,
        wizardEditItem: typeof (window as any).wizardEditItem,
      };
    });

    expect(adminGlobals.loadAdminDashboard).toBe("function");
    expect(adminGlobals.exportPromoCsv).toBe("function");
    expect(adminGlobals.initCsvWizard).toBe("function");
    expect(adminGlobals.handleCsvUpload).toBe("function");
    expect(adminGlobals.downloadCsvTemplate).toBe("function");
    expect(adminGlobals.wizardPreviewNav).toBe("function");
    expect(adminGlobals.wizardEditItem).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Seed promo wizard globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupPromoMocks(page);

    await login(page);

    const seedGlobals = await page.evaluate(() => {
      return {
        seedSearchBrand: typeof (window as any).seedSearchBrand,
        seedScrapeSites: typeof (window as any).seedScrapeSites,
        seedConfirmProducts: typeof (window as any).seedConfirmProducts,
        seedPreviewNav: typeof (window as any).seedPreviewNav,
        seedEditProduct: typeof (window as any).seedEditProduct,
        seedSaveProductEdit: typeof (window as any).seedSaveProductEdit,
      };
    });

    expect(seedGlobals.seedSearchBrand).toBe("function");
    expect(seedGlobals.seedScrapeSites).toBe("function");
    expect(seedGlobals.seedConfirmProducts).toBe("function");
    expect(seedGlobals.seedPreviewNav).toBe("function");
    expect(seedGlobals.seedEditProduct).toBe("function");
    expect(seedGlobals.seedSaveProductEdit).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke loadPromoRecommendation calls the API and returns data", async ({ page }) => {
    const errors = captureHardErrors(page);
    const captured = await setupPromoMocks(page);

    await login(page);

    // Directly call loadPromoRecommendation and verify the API is hit
    const result = await page.evaluate(async () => {
      const w = window as any;
      if (typeof w.loadPromoRecommendation !== "function") return { error: "not_a_function" };
      const testPetId = "00000000-0000-0000-0000-000000000001";
      const rec = await w.loadPromoRecommendation(testPetId, "home_feed");
      return { rec, petId: testPetId };
    });

    // Verify the mock was called
    expect(captured.recommendations).toBeGreaterThan(0);
    // Verify the response was parsed correctly
    expect(result.rec).toBeTruthy();
    expect(result.rec.productId || result.rec.product_id).toBeTruthy();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Consent banner renders on settings page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupPromoMocks(page);

    await login(page);

    // Navigate to settings page
    await navigateTo(page, "settings");
    await expect(page.locator("#page-settings.active")).toBeVisible({ timeout: 10_000 });

    // Check consent container exists in DOM
    const consentContainer = page.locator("#settings-consent-container");
    const exists = await consentContainer.count();
    expect(exists).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Promo containers exist in DOM", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupPromoMocks(page);

    await login(page);

    // Verify promo container elements exist in the DOM
    const containers = await page.evaluate(() => {
      const ids = [
        "owner-promo-container",
        "settings-consent-container",
      ];
      return ids.map(id => ({
        id,
        exists: !!document.getElementById(id),
      }));
    });

    for (const c of containers) {
      expect(c.exists, `Container ${c.id} should exist`).toBe(true);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke RBAC helper functions work correctly", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupPromoMocks(page);

    await login(page);

    // Test JWT helpers and role functions
    const helpers = await page.evaluate(() => {
      const w = window as any;
      return {
        getActiveRole: typeof w.getActiveRole === "function" ? w.getActiveRole() : null,
        decodeJwtPayload: typeof w.decodeJwtPayload,
        getJwtRole: typeof w.getJwtRole,
        getJwtTenantId: typeof w.getJwtTenantId,
        getJwtUserId: typeof w.getJwtUserId,
        getDefaultPageForRole: typeof w.getDefaultPageForRole,
      };
    });

    expect(helpers.getActiveRole).toBeTruthy();
    expect(helpers.decodeJwtPayload).toBe("function");
    expect(helpers.getJwtRole).toBe("function");
    expect(helpers.getJwtTenantId).toBe("function");
    expect(helpers.getJwtUserId).toBe("function");
    expect(helpers.getDefaultPageForRole).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
