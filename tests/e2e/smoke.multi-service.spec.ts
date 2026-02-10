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

async function setupMultiServiceMocks(page: any) {
  // Mock nutrition endpoints
  await page.route("**/api/nutrition/**", async (route: any) => {
    const req = route.request();
    if (req.url().includes("/plan/") && req.method() === "GET") {
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

  // Mock insurance endpoints
  await page.route("**/api/insurance/**", async (route: any) => {
    const req = route.request();
    if (req.url().includes("/coverage/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ policy: null }),
      });
    } else if (req.url().includes("/risk-score/")) {
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

  // Mock consent services endpoint
  await page.route("**/api/promo/consent/services**", async (route: any) => {
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

  // Mock consent endpoints
  await page.route("**/api/promo/consent", async (route: any) => {
    const req = route.request();
    if (req.method() === "GET") {
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  // Mock seed/demo endpoints
  await page.route("**/api/seed/start-demo", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "demo_test", status: "started", mode: "demo" }),
    });
  });

  await page.route("**/api/seed/promo/tenants", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tenants: [{ tenant_id: "t1", name: "Test Brand" }],
      }),
    });
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
}

// ---------------------------------------------------------------------------
// Tests — Nutrition module
// ---------------------------------------------------------------------------

test.describe("Multi-service architecture smoke tests", () => {

  test("@smoke Nutrition globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);

    const globals = await page.evaluate(() => {
      return {
        renderNutritionSlot: typeof (window as any).renderNutritionSlot,
        renderNutritionValidation: typeof (window as any).renderNutritionValidation,
      };
    });

    expect(globals.renderNutritionSlot).toBe("function");
    expect(globals.renderNutritionValidation).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Insurance globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);

    const globals = await page.evaluate(() => {
      return {
        renderInsuranceSlot: typeof (window as any).renderInsuranceSlot,
        checkInsuranceCoverage: typeof (window as any).checkInsuranceCoverage,
      };
    });

    expect(globals.renderInsuranceSlot).toBe("function");
    expect(globals.checkInsuranceCoverage).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Consent center globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);

    const globals = await page.evaluate(() => {
      return {
        renderConsentCenter: typeof (window as any).renderConsentCenter,
      };
    });

    expect(globals.renderConsentCenter).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Nutrition and insurance containers exist in DOM", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);

    const containers = await page.evaluate(() => {
      const ids = [
        "patient-nutrition-container",
        "patient-insurance-container",
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

  test("@smoke Seed demo mode globals are available after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);

    const globals = await page.evaluate(() => {
      return {
        seedStartDemo: typeof (window as any).seedStartDemo,
        seedLoadDemoTenants: typeof (window as any).seedLoadDemoTenants,
      };
    });

    expect(globals.seedStartDemo).toBe("function");
    expect(globals.seedLoadDemoTenants).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Demo mode UI elements exist in seed page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);
    await navigateTo(page, "seed");
    await expect(page.locator("#page-seed.active")).toBeVisible({ timeout: 10_000 });

    // Check demo mode UI elements exist
    const elements = await page.evaluate(() => {
      return {
        demoTenant: !!document.getElementById("seedDemoTenant"),
        demoPromo: !!document.getElementById("seedDemoPromo"),
        demoNutrition: !!document.getElementById("seedDemoNutrition"),
        demoInsurance: !!document.getElementById("seedDemoInsurance"),
      };
    });

    expect(elements.demoTenant, "Demo tenant selector should exist").toBe(true);
    expect(elements.demoPromo, "Demo promo checkbox should exist").toBe(true);
    expect(elements.demoNutrition, "Demo nutrition checkbox should exist").toBe(true);
    expect(elements.demoInsurance, "Demo insurance checkbox should exist").toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Settings page renders consent center container", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupMultiServiceMocks(page);

    await login(page);
    await navigateTo(page, "settings");
    await expect(page.locator("#page-settings.active")).toBeVisible({ timeout: 10_000 });

    const consentContainer = page.locator("#settings-consent-container");
    const exists = await consentContainer.count();
    expect(exists).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
