import { test, expect } from "@playwright/test";

test.describe("B2B Booking @smoke", () => {
  test("booking services catalog loads", async ({ page }) => {
    await page.goto("/");
    await page.fill('[data-testid="email-input"], #loginEmail', "breeder_test@adiuvet.it");
    await page.fill('[data-testid="password-input"], #loginPassword', process.env.TEST_PASSWORD || "AltriUtentiPerTest72&");
    await page.click('[data-testid="login-button"], #loginBtn');
    await page.click('[data-page="booking"]');
    await expect(page.locator("#page-booking")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Prenota un Servizio")).toBeVisible();
  });
});
