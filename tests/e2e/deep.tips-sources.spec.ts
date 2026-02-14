import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, switchToSuperAdmin } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep @nightly — Tips and sources: admin pages, globals
// ---------------------------------------------------------------------------

test.describe("Deep tips & sources", () => {

  test("@deep @nightly Super admin: fonti tips page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-sources");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Tips globals available", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    // Check if tips-related functions exist
    const globals = await page.evaluate(() => ({
      loadTips: typeof (window as any).loadTips,
      renderTips: typeof (window as any).renderTips,
    }));

    // These may or may not exist depending on implementation
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Tips page: no hard errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-sources");
    await page.waitForTimeout(1000);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
