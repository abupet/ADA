import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";

test.describe("B2B Phase 2 Milestones @smoke", () => {
  test("@smoke breeder can navigate to milestones page", async ({ page }) => {
    await login(page, { email: "breeder_test@adiuvet.it" });
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // Switch to breeder role and navigate
    await page.evaluate(() => {
      (window as any).setActiveRole("breeder");
      (window as any).applyRoleUI("breeder");
      (window as any).navigateToPage("breeder-milestones");
    });
    await expect(page.locator("#page-breeder-milestones")).toBeVisible({ timeout: 10_000 });
  });

  test("@smoke breeder sidebar shows shared-records nav", async ({ page }) => {
    await login(page, { email: "breeder_test@adiuvet.it" });
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      (window as any).setActiveRole("breeder");
      (window as any).applyRoleUI("breeder");
    });
    await expect(page.locator("#sidebar-breeder")).toBeVisible({ timeout: 10_000 });
    // Check that shared-records nav item exists in breeder sidebar
    await expect(page.locator('#sidebar-breeder [data-page="shared-records"]')).toBeVisible({ timeout: 5_000 });
  });
});
