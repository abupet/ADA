import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, switchRole, switchToSuperAdmin, ALL_PAGES } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep @nightly — Complete navigation across all pages and roles
// ---------------------------------------------------------------------------

test.describe("Deep navigation — all pages", () => {

  test("@deep @nightly Vet: all vet pages navigable without errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    for (const p of ALL_PAGES.vet) {
      await navigateTo(page, p);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Owner: all owner pages navigable without errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    for (const p of ALL_PAGES.owner) {
      await navigateTo(page, p);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Super admin: all admin pages navigable without errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });
    await switchToSuperAdmin(page);

    for (const p of ALL_PAGES.superAdmin) {
      await navigateTo(page, p);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Route guard: vet cannot access owner-only pages", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const ownerOnly = ["qna", "photos", "vitals", "medications"];
    for (const p of ownerOnly) {
      await page.evaluate((pg: string) => (window as any).navigateToPage(pg), p);
      // Should NOT land on the page — either redirected or page not active
      const isActive = await page.locator(`#page-${p}.active`).isVisible().catch(() => false);
      expect(isActive, `Vet should NOT access ${p}`).toBe(false);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Route guard: owner cannot access vet-only pages", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    const vetOnly = ["recording", "soap"];
    for (const p of vetOnly) {
      await page.evaluate((pg: string) => (window as any).navigateToPage(pg), p);
      const isActive = await page.locator(`#page-${p}.active`).isVisible().catch(() => false);
      expect(isActive, `Owner should NOT access ${p}`).toBe(false);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Route guard: non-super_admin cannot access admin pages", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const adminPages = ["seed", "admin-dashboard", "admin-catalog", "superadmin-tenants"];
    for (const p of adminPages) {
      await page.evaluate((pg: string) => (window as any).navigateToPage(pg), p);
      const isActive = await page.locator(`#page-${p}.active`).isVisible().catch(() => false);
      expect(isActive, `Vet should NOT access admin page ${p}`).toBe(false);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Sidebar nav items match active role (vet)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    // Vet sidebar should be visible
    await expect(page.locator("#sidebar-vet")).toBeVisible();
    // Owner sidebar should NOT be visible
    const ownerSidebar = await page.locator("#sidebar-owner").isVisible().catch(() => false);
    expect(ownerSidebar).toBe(false);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep @nightly Rapid navigation: 20 random vet page switches", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const pages = ALL_PAGES.vet;
    for (let i = 0; i < 20; i++) {
      const p = pages[i % pages.length];
      await page.evaluate((pg: string) => (window as any).navigateToPage(pg), p);
      await page.waitForTimeout(200);
    }

    // After rapid nav, at least the last page should be visible
    const lastPage = pages[19 % pages.length];
    await expect(page.locator(`#page-${lastPage}.active`)).toBeVisible({ timeout: 10_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
