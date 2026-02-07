import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";

test("@smoke Impostazioni: account info visibile, debug attivo", async ({ page }) => {
  await login(page);

  await page.locator('.nav-item[data-page="settings"]').click();
  await expect(page.locator("#page-settings")).toBeVisible();

  // Account info card is visible to all users
  await expect(page.getByTestId("account-info-card")).toBeVisible();
  await expect(page.getByTestId("change-password-button")).toBeVisible();

  // Clinic logo card is super_admin-only, so hidden for regular users
  await expect(page.getByTestId("clinic-logo-preview")).not.toBeVisible();

  await page.locator('.nav-item[data-page="debug"]').click();
  await expect(page.locator("#page-debug")).toBeVisible();
  await expect(page.getByTestId("debug-system-tools")).toBeVisible();
});
