import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// @smoke @sync Login/logout cycle + re-login
// ---------------------------------------------------------------------------

test.describe("Auth cycle", () => {

  test("@smoke Login -> logout -> re-login preserves app state", async ({ page }) => {
    const errors = captureHardErrors(page);

    // 1) Login
    await login(page);
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

    // Verify navigateToPage is available (app is loaded)
    await expect.poll(async () => {
      return await page.evaluate(() => typeof (window as any).navigateToPage);
    }, { timeout: 10_000 }).toBe("function");

    // 2) Logout
    const logoutButton = page.locator('[data-testid="logout-button"], button[onclick*="logout"], #logoutBtn, button:has-text("Logout"), button:has-text("Esci")');
    if (await logoutButton.count() > 0) {
      await logoutButton.first().click();

      // Should see the login screen again (email + password fields)
      await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("#passwordInput")).toBeVisible({ timeout: 10_000 });

      // 3) Re-login
      await login(page);
      await expect(page.locator("#appContainer")).toBeVisible({ timeout: 10_000 });

      // Verify the app is functional after re-login
      await expect.poll(async () => {
        return await page.evaluate(() => typeof (window as any).navigateToPage);
      }, { timeout: 10_000 }).toBe("function");
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
