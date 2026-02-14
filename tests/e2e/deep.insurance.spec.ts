import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep @nightly — Insurance module: globals, container, risk score, coverage
// ---------------------------------------------------------------------------

test.describe("Deep insurance", () => {

  test("@deep @nightly Insurance globals available", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const globals = await page.evaluate(() => ({
      renderInsuranceSlot: typeof (window as any).renderInsuranceSlot,
      checkInsuranceCoverage: typeof (window as any).checkInsuranceCoverage,
    }));

    expect(globals.renderInsuranceSlot).toBe("function");
    expect(globals.checkInsuranceCoverage).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Insurance container in DOM", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    const exists = await page.evaluate(() => !!document.getElementById("patient-insurance-container"));
    expect(exists).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Insurance: no policy state renders", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "patient");

    const container = page.locator("#patient-insurance-container");
    await expect(container).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Insurance consent toggle in settings", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    const container = page.locator("#settings-consent-container");
    await expect(container).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
