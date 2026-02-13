import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test.describe("Role-based access control", () => {

  test("@smoke Vet: debug page shows toggle button, not dropdown", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    // v8.17.0: role toggle hidden for all except super_admin
    await expect(page.locator("#roleToggleLabelBlock")).not.toBeVisible();
    await expect(page.locator("#roleToggleContainer")).not.toBeVisible();

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

  test("@smoke Super admin: TEST & DEMO visible, debug shows checkboxes", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // super_admin defaults to veterinario+super_admin; ensure super_admin role is active
    await page.evaluate(() => {
      if (typeof (window as any).setActiveRoles === 'function') {
        (window as any).setActiveRoles(['veterinario', 'super_admin']);
      } else {
        (window as any).setActiveRole('super_admin');
      }
      (window as any).applyRoleUI('super_admin');
    });

    // TEST & DEMO should be visible after switching to super_admin role
    await expect(page.locator("#sidebar-test-demo")).toBeVisible({ timeout: 10_000 });

    // Navigate to debug
    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    // super_admin: checkboxes visible, toggle hidden (v8.17.2 — BUG 5)
    await expect(page.locator("#superAdminRoleSelector")).toBeVisible();
    await expect(page.locator("#roleToggleLabelBlock")).toBeHidden();
    await expect(page.locator("#roleToggleContainer")).toBeHidden();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
