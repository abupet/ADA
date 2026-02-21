import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";

test.describe("B2B Phase 2 Diagnostics @smoke", () => {
  test("@smoke diagnostics page navigates for vet", async ({ page }) => {
    await login(page, { email: "vet_test@adiuvet.it" });
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // Navigate to diagnostics page via page.evaluate (same pattern as other B2B tests)
    await page.evaluate(() => {
      (window as any).navigateToPage("diagnostics");
    });
    await expect(page.locator("#page-diagnostics")).toBeVisible({ timeout: 10_000 });
  });

  test("@smoke shared-records page navigates for vet", async ({ page }) => {
    await login(page, { email: "vet_test@adiuvet.it" });
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      (window as any).navigateToPage("shared-records");
    });
    await expect(page.locator("#page-shared-records")).toBeVisible({ timeout: 10_000 });
  });

  test("@smoke teleconsult page navigates for vet", async ({ page }) => {
    await login(page, { email: "vet_test@adiuvet.it" });
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      (window as any).navigateToPage("teleconsult");
    });
    await expect(page.locator("#page-teleconsult")).toBeVisible({ timeout: 10_000 });
  });
});
