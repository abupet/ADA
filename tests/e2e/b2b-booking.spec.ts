import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";

test.describe("B2B Booking @smoke", () => {
  test("@smoke booking page navigates for breeder", async ({ page }) => {
    await login(page, { email: "breeder_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    // Navigate to booking via sidebar
    await page.click('[data-page="booking"]');
    await expect(page.locator("#page-booking")).toBeVisible({ timeout: 10_000 });
  });
});
