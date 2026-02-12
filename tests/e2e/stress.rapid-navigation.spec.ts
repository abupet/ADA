import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { ensurePetSelected, switchRole, ALL_PAGES } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @stress — Rapid navigation: 50 page switches, role toggles, double-clicks
// ---------------------------------------------------------------------------

test.describe("Stress rapid navigation", () => {
  test.setTimeout(180_000);

  test("@stress 50 rapid page navigations", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    const pages = ALL_PAGES.vet;
    for (let i = 0; i < 50; i++) {
      const p = pages[i % pages.length];
      await page.evaluate((pg: string) => (window as any).navigateToPage?.(pg), p);
      await page.waitForTimeout(100);
    }

    // App should still be alive
    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress 10 rapid role toggles", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    for (let i = 0; i < 10; i++) {
      const role = i % 2 === 0 ? "proprietario" : "veterinario";
      await switchRole(page, role as any);
      await page.waitForTimeout(200);
    }

    // Final role should be veterinario (last iteration is odd → veterinario)
    const finalRole = await page.evaluate(() => (window as any).getActiveRole?.());
    expect(finalRole).toBeTruthy();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Double-click on nav items", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    // Double-click on each nav item
    const navItems = page.locator('#sidebar-vet .nav-item');
    const count = await navItems.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await navItems.nth(i).dblclick();
      await page.waitForTimeout(300);
    }

    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Rapid navigation across owner pages", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    const pages = ALL_PAGES.owner;
    for (let i = 0; i < 30; i++) {
      const p = pages[i % pages.length];
      await page.evaluate((pg: string) => (window as any).navigateToPage?.(pg), p);
      await page.waitForTimeout(100);
    }

    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
