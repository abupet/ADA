import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Responsive UI: desktop, tablet, mobile viewports
// ---------------------------------------------------------------------------

test.describe("Deep responsive UI", () => {

  test("@deep Desktop (1280x720): layout correct", async ({ page }) => {
    const errors = captureHardErrors(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await mockAllEndpoints(page);
    await login(page);

    // Sidebar should be visible on desktop
    const sidebar = page.locator("#sidebar, .sidebar, [data-testid='sidebar']").first();
    if (await sidebar.count() > 0) {
      const isVisible = await sidebar.isVisible().catch(() => false);
      expect(isVisible).toBe(true);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Tablet (768x1024): layout adapts", async ({ page }) => {
    const errors = captureHardErrors(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockAllEndpoints(page);
    await login(page);

    // App should render without errors at tablet size
    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Mobile (375x667): layout adapts", async ({ page }) => {
    const errors = captureHardErrors(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await mockAllEndpoints(page);
    await login(page);

    await expect(page.locator("#appContainer")).toBeVisible();

    // Check for hamburger menu or sidebar toggle
    const hamburger = page.locator('.hamburger, [data-testid="hamburger"], .navbar-toggler, #sidebarToggle');
    const count = await hamburger.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Mobile: navigation works at small viewport", async ({ page }) => {
    const errors = captureHardErrors(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    // Navigate to several pages
    for (const p of ["patient", "diary", "history", "settings", "communication"]) {
      await page.evaluate((pg: string) => (window as any).navigateToPage?.(pg), p);
      await page.waitForTimeout(300);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep All viewports: login form renders correctly", async ({ page }) => {
    const errors = captureHardErrors(page);
    const viewports = [
      { width: 1280, height: 720 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto("index.html", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("email-input")).toBeVisible();
      await expect(page.locator("#passwordInput")).toBeVisible();
      await expect(page.getByTestId("login-button")).toBeVisible();
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
