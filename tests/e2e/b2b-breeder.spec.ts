import { test, expect } from "@playwright/test";

test.describe("B2B Breeder @smoke", () => {
  test("breeder can login and see dashboard", async ({ page }) => {
    await page.goto("/");
    await page.fill('[data-testid="email-input"], #loginEmail', "breeder_test@adiuvet.it");
    await page.fill('[data-testid="password-input"], #loginPassword', process.env.TEST_PASSWORD || "AltriUtentiPerTest72&");
    await page.click('[data-testid="login-button"], #loginBtn');
    await expect(page.locator("#page-breeder-dashboard")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Dashboard Allevamento")).toBeVisible();
  });

  test("breeder sidebar is visible", async ({ page }) => {
    await page.goto("/");
    await page.fill('[data-testid="email-input"], #loginEmail', "breeder_test@adiuvet.it");
    await page.fill('[data-testid="password-input"], #loginPassword', process.env.TEST_PASSWORD || "AltriUtentiPerTest72&");
    await page.click('[data-testid="login-button"], #loginBtn');
    await expect(page.locator("#sidebar-breeder")).toBeVisible({ timeout: 10000 });
  });
});
