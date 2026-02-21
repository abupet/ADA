import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test.describe("B2B Booking @smoke", () => {
  test("@smoke booking services catalog loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: "breeder_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    await page.click('[data-page="booking"]');
    await expect(page.locator("#page-booking")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Prenota un Servizio")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
