import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep @nightly — Nutrition module: globals, container, slot rendering
// ---------------------------------------------------------------------------

test.describe("Deep nutrition", () => {

  test("@deep @nightly Nutrition globals available", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const globals = await page.evaluate(() => ({
      renderNutritionSlot: typeof (window as any).renderNutritionSlot,
      renderNutritionValidation: typeof (window as any).renderNutritionValidation,
    }));

    expect(globals.renderNutritionSlot).toBe("function");
    expect(globals.renderNutritionValidation).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Nutrition container in DOM", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    const exists = await page.evaluate(() => !!document.getElementById("patient-nutrition-container"));
    expect(exists).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Nutrition: no plan state renders", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "patient");

    // The nutrition container should handle null plan gracefully
    const container = page.locator("#patient-nutrition-container");
    await expect(container).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Nutrition consent toggle in settings", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    await navigateTo(page, "settings");

    const container = page.locator("#settings-consent-container");
    await expect(container).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
