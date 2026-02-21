import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test.describe("B2B Referral @smoke", () => {
  test("@smoke new referral specialties are available in form", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: "vet_ext_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    // Navigate to communication
    await page.click('[data-page="communication"]');
    await expect(page.locator("#page-communication")).toBeVisible({ timeout: 10_000 });

    // Wait for the referral type select to be present (vet_ext only)
    await expect(page.locator("#comm-referral-type")).toBeVisible({ timeout: 10_000 });

    // Check new specialties exist in referral type select
    const options = await page.locator("#comm-referral-type option").allTextContents();
    expect(options.join("|")).toContain("Neurologia");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
