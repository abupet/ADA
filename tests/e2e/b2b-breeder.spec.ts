import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";

test.describe("B2B Breeder @smoke", () => {
  test("@smoke breeder can login and see dashboard page", async ({ page }) => {
    await login(page, { email: "breeder_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // Breeder JWT role: explicitly switch to breeder role and navigate
    await page.evaluate(() => {
      (window as any).setActiveRole("breeder");
      (window as any).applyRoleUI("breeder");
      (window as any).navigateToPage("breeder-dashboard");
    });

    await expect(page.locator("#page-breeder-dashboard")).toBeVisible({ timeout: 10_000 });
  });

  test("@smoke breeder sidebar is visible", async ({ page }) => {
    await login(page, { email: "breeder_test@adiuvet.it" });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // Breeder JWT role: explicitly switch to breeder role
    await page.evaluate(() => {
      (window as any).setActiveRole("breeder");
      (window as any).applyRoleUI("breeder");
    });

    await expect(page.locator("#sidebar-breeder")).toBeVisible({ timeout: 10_000 });
  });
});
