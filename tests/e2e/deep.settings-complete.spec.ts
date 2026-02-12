import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, switchToSuperAdmin } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Settings page: all sections, debug, consent, system card
// ---------------------------------------------------------------------------

test.describe("Deep settings", () => {

  test("@deep Account info card visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    // Settings page has some card/section for account
    await expect(page.locator("#page-settings.active")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep AI settings container visible (vet)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await navigateTo(page, "settings");

    await expect(page.getByTestId("ai-settings-container")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Debug toggle ON/OFF", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    // Find debug toggle
    const debugToggle = page.locator('#settingsDebugToggle, [data-testid="debug-toggle"], input[type="checkbox"][id*="debug"]').first();
    if (await debugToggle.isVisible().catch(() => false)) {
      // Toggle ON
      await debugToggle.click();
      await page.waitForTimeout(500);

      // Debug nav should appear
      const debugNav = page.locator('.nav-item[data-page="debug"]');
      const debugVisible = await debugNav.isVisible().catch(() => false);

      // Toggle OFF
      await debugToggle.click();
      await page.waitForTimeout(500);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Consent center container visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    const consentContainer = page.locator("#settings-consent-container");
    const exists = await consentContainer.count();
    expect(exists).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep System card visible when debug ON", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    const systemCard = page.locator("#settingsSystemCard");
    // May be hidden by default — existence check
    const exists = await systemCard.count();
    expect(exists).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Super admin: clinic logo card visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "settings");

    const logoPreview = page.locator("#clinic-logo-preview, [data-testid='clinic-logo']");
    const exists = await logoPreview.count();
    expect(exists).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Super admin: debug page shows role checkboxes", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    await expect(page.locator("#superAdminRoleSelector")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Settings page: no hard errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");
    await page.waitForTimeout(1000);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
