import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// @smoke Verifica che ogni ruolo test possa fare login e veda la UI corretta
// ---------------------------------------------------------------------------

test.describe("Login per ruolo", () => {

  test("@smoke Vet login → pagina recording visibile", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    // Vet: default page = recording
    await expect(page.locator("#page-recording")).toBeVisible({ timeout: 10_000 });
    // Sidebar vet section visible
    await expect(page.locator("#sidebar-vet")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Owner login → sidebar owner visibile", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    // Owner: sidebar-owner should be visible
    await expect(page.locator("#sidebar-owner")).toBeVisible({ timeout: 10_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Admin brand login → dashboard admin visibile", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_ADMIN_BRAND_EMAIL });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });
    // Admin brand: sidebar-admin should be visible
    await expect(page.locator("#sidebar-admin")).toBeVisible({ timeout: 10_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Super admin login → switch to super_admin role → sidebar admin + TEST DEMO visibili", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_SUPER_ADMIN_EMAIL });

    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // super_admin defaults to veterinario on first login; switch to super_admin role
    await page.evaluate(() => {
      (window as any).setActiveRole('super_admin');
      (window as any).applyRoleUI('super_admin');
    });

    // Super admin role: sidebar-admin and TEST & DEMO should be visible
    await expect(page.locator("#sidebar-admin")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#sidebar-test-demo")).toBeVisible({ timeout: 10_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
