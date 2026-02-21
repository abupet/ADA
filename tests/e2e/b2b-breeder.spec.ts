import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test.describe("B2B Breeder @smoke", () => {
  test("@smoke breeder can login and see dashboard", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: "breeder_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#page-breeder-dashboard")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Dashboard Allevamento")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke breeder sidebar is visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: "breeder_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#sidebar-breeder")).toBeVisible({ timeout: 10_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
