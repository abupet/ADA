import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, switchToSuperAdmin, ALL_PAGES } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Super admin pages: tenants, users, policies, tags, audit, sources
// ---------------------------------------------------------------------------

test.describe("Deep super admin pages", () => {

  test("@deep Gestione Tenant: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-tenants");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Gestione Utenti: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-users");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Policies: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-policies");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Tag Dictionary: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-tags");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Audit Log: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-audit");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Fonti Tips: page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await navigateTo(page, "superadmin-sources");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep All admin pages: zero hard errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    for (const p of ALL_PAGES.superAdmin) {
      await navigateTo(page, p);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Admin nav items hidden for vet", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    const testDemo = page.locator("#sidebar-test-demo");
    const visible = await testDemo.isVisible().catch(() => false);
    expect(visible).toBe(false);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Super admin: role checkbox in debug page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    await page.locator('.nav-item[data-page="debug"]').click();
    await expect(page.locator("#page-debug")).toBeVisible();
    await expect(page.locator("#superAdminRoleSelector")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
