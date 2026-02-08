import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test.describe("Role-based access control", () => {

  test("@smoke Vet: debug page shows toggle button, not dropdown", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    // Vet: roleToggleLabelBlock and roleToggleContainer should be visible
    await expect(page.locator("#roleToggleLabelBlock")).toBeVisible();
    await expect(page.locator("#roleToggleContainer")).toBeVisible();

    // superAdminRoleSelector should be hidden for non-super_admin
    await expect(page.locator("#superAdminRoleSelector")).not.toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Vet: TEST & DEMO section hidden", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await expect(page.locator("#sidebar-test-demo")).not.toBeVisible();
    await expect(page.locator(".seed-nav-item")).not.toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Super admin: TEST & DEMO visible, debug shows dropdown", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // super_admin defaults to veterinario; switch to super_admin role
    await page.evaluate(() => {
      (window as any).setActiveRole('super_admin');
      (window as any).applyRoleUI('super_admin');
    });

    // TEST & DEMO should be visible after switching to super_admin role
    await expect(page.locator("#sidebar-test-demo")).toBeVisible({ timeout: 10_000 });

    // Navigate to debug
    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    // super_admin: dropdown visible, toggle hidden
    await expect(page.locator("#superAdminRoleSelector")).toBeVisible();
    await expect(page.locator("#roleToggleLabelBlock")).not.toBeVisible();
    await expect(page.locator("#roleToggleContainer")).not.toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
