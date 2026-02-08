import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test.describe("Role-based access control (v7.2.4)", () => {

  test("@smoke Debug page: non-super_admin sees toggle button and label", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page);

    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    // Non-super_admin: roleToggleLabelBlock and roleToggleContainer should be visible
    await expect(page.locator("#roleToggleLabelBlock")).toBeVisible();
    await expect(page.locator("#roleToggleContainer")).toBeVisible();

    // superAdminRoleSelector should be hidden for non-super_admin
    await expect(page.locator("#superAdminRoleSelector")).not.toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Sidebar: TEST & DEMO section hidden for non-super_admin", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page);

    // TEST & DEMO section should not be visible for regular users
    const testDemoSection = page.locator("#sidebar-test-demo");
    await expect(testDemoSection).not.toBeVisible();

    // Seed Engine nav item should not be visible
    const seedItem = page.locator('.seed-nav-item');
    await expect(seedItem).not.toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Sidebar: TEST & DEMO visible only for super_admin active role", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page);

    // Simulate super_admin context and set active role to super_admin
    const visible = await page.evaluate(() => {
      const w = window as any;
      // Mock isSuperAdmin to return true
      w._origIsSuperAdmin = w.isSuperAdmin;
      w.isSuperAdmin = () => true;

      // Set active role to super_admin
      w.setActiveRole('super_admin');
      w.applyRoleUI('super_admin');

      const section = document.getElementById('sidebar-test-demo');
      return section ? section.style.display !== 'none' : false;
    });

    expect(visible).toBe(true);

    // Now switch to veterinario — TEST & DEMO should hide
    const hiddenForVet = await page.evaluate(() => {
      const w = window as any;
      w.setActiveRole('veterinario');
      w.applyRoleUI('veterinario');

      const section = document.getElementById('sidebar-test-demo');
      return section ? section.style.display === 'none' : true;
    });

    expect(hiddenForVet).toBe(true);

    // Cleanup mock
    await page.evaluate(() => {
      const w = window as any;
      if (w._origIsSuperAdmin) {
        w.isSuperAdmin = w._origIsSuperAdmin;
        delete w._origIsSuperAdmin;
      }
      // Reset to default role
      w.setActiveRole('veterinario');
      w.applyRoleUI('veterinario');
    });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Debug page: super_admin sees dropdown, not toggle button", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page);

    // Simulate super_admin and navigate to debug
    await page.evaluate(() => {
      const w = window as any;
      w._origIsSuperAdmin = w.isSuperAdmin;
      w.isSuperAdmin = () => true;
      w.setActiveRole('super_admin');
      w.applyRoleUI('super_admin');
    });

    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();

    // super_admin: roleToggleLabelBlock and roleToggleContainer should be hidden
    await expect(page.locator("#roleToggleLabelBlock")).not.toBeVisible();
    await expect(page.locator("#roleToggleContainer")).not.toBeVisible();

    // superAdminRoleSelector should be visible
    await expect(page.locator("#superAdminRoleSelector")).toBeVisible();

    // Cleanup
    await page.evaluate(() => {
      const w = window as any;
      if (w._origIsSuperAdmin) {
        w.isSuperAdmin = w._origIsSuperAdmin;
        delete w._origIsSuperAdmin;
      }
      w.setActiveRole('veterinario');
      w.applyRoleUI('veterinario');
    });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
