import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, switchToSuperAdmin } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep @nightly — Admin dashboard, catalog, campaigns, CSV wizard
// ---------------------------------------------------------------------------

test.describe("Deep admin dashboard", () => {

  test("@deep @nightly Dashboard: renders without errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "admin-dashboard");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Dashboard: data container present in DOM", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "admin-dashboard");

    const container = page.locator("#page-admin-dashboard.active");
    await expect(container).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Catalog: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "admin-catalog");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Campaigns: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "admin-campaigns");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Wizard CSV: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "admin-wizard");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Wizard CSV: download template callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    const callable = await page.evaluate(() => typeof (window as any).downloadCsvTemplate === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Wizard CSV: handleCsvUpload callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    const callable = await page.evaluate(() => typeof (window as any).handleCsvUpload === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Export CSV: exportPromoCsv callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    const callable = await page.evaluate(() => typeof (window as any).exportPromoCsv === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Admin pages: zero hard errors across all", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    const adminPages = ["admin-dashboard", "admin-catalog", "admin-campaigns", "admin-wizard"];
    for (const p of adminPages) {
      await navigateTo(page, p);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
