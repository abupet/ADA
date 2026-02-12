import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, switchToSuperAdmin } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Seed engine: demo mode, brand search, product management
// ---------------------------------------------------------------------------

test.describe("Deep seed engine", () => {

  test("@deep Seed page visible only for super_admin", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    // Vet should NOT see seed nav
    const seedNav = page.locator('.seed-nav-item, .nav-item[data-page="seed"]');
    const visible = await seedNav.isVisible().catch(() => false);
    expect(visible).toBe(false);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Seed page renders for super_admin", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "seed");

    const elements = await page.evaluate(() => ({
      demoTenant: !!document.getElementById("seedDemoTenant"),
      demoPromo: !!document.getElementById("seedDemoPromo"),
      demoNutrition: !!document.getElementById("seedDemoNutrition"),
      demoInsurance: !!document.getElementById("seedDemoInsurance"),
    }));

    expect(elements.demoTenant).toBe(true);
    expect(elements.demoPromo).toBe(true);
    expect(elements.demoNutrition).toBe(true);
    expect(elements.demoInsurance).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedSearchBrand callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    const callable = await page.evaluate(() => typeof (window as any).seedSearchBrand === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedScrapeSites callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    const callable = await page.evaluate(() => typeof (window as any).seedScrapeSites === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedConfirmProducts callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    const callable = await page.evaluate(() => typeof (window as any).seedConfirmProducts === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedStartDemo callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    const callable = await page.evaluate(() => typeof (window as any).seedStartDemo === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedLoadDemoTenants callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    const callable = await page.evaluate(() => typeof (window as any).seedLoadDemoTenants === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedPreviewNav callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    const callable = await page.evaluate(() => typeof (window as any).seedPreviewNav === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep seedEditProduct callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    const callable = await page.evaluate(() => typeof (window as any).seedEditProduct === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
