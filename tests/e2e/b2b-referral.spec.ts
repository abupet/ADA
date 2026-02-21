import { test, expect } from "@playwright/test";

test.describe("B2B Referral @smoke", () => {
  test("new referral specialties are available in form", async ({ page }) => {
    await page.goto("/");
    await page.fill('[data-testid="email-input"], #loginEmail', "vet_ext_test@adiuvet.it");
    await page.fill('[data-testid="password-input"], #loginPassword', process.env.TEST_PASSWORD || "AltriUtentiPerTest72&");
    await page.click('[data-testid="login-button"], #loginBtn');
    // Navigate to communication
    await page.click('[data-page="communication"]');
    // Check new specialties exist in referral type select
    const options = await page.locator("#comm-referral-type option").allTextContents();
    expect(options.join("|")).toContain("Neurologia");
  });
});
