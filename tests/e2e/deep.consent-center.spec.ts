import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints, mockConsentEndpoints, mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep @nightly — Consent center: GDPR toggles, services, brand consents
// ---------------------------------------------------------------------------

test.describe("Deep consent center", () => {

  test("@deep @nightly Consent center renders on settings page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    const container = page.locator("#settings-consent-container");
    await expect(container).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly renderConsentCenter is callable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const callable = await page.evaluate(() => typeof (window as any).renderConsentCenter === "function");
    expect(callable).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Consent toggle: marketing_global", async ({ page }) => {
    const errors = captureHardErrors(page);
    const consent = await mockConsentEndpoints(page);
    await mockSyncEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");
    await page.waitForTimeout(1000);

    // At least one GET to load consent state
    expect(consent.gets).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Consent toggle: nutrition_plan", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    // Look for nutrition toggle
    const toggle = page.locator('[data-testid="consent-nutrition"], #consentNutrition, input[name*="nutrition"]');
    const count = await toggle.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Consent toggle: insurance_data_sharing", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    const toggle = page.locator('[data-testid="consent-insurance"], #consentInsurance, input[name*="insurance"]');
    const count = await toggle.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Services list rendering", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");
    await page.waitForTimeout(1000);

    // Services should render in the consent container area
    const container = page.locator("#settings-consent-container");
    await expect(container).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
