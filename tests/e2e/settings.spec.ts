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

test("@smoke Impostazioni/Sistema: non-super_admin debug ON vede card read-only", async ({ page }) => {
  await login(page);

  // Default: debugLogEnabled = true (localStorage empty → defaults ON)
  await page.locator('.nav-item[data-page="settings"]').click();
  await expect(page.locator("#page-settings")).toBeVisible();

  // Sistema card should be visible (debug is ON)
  const systemCard = page.locator("#settingsSystemCard");
  await expect(systemCard).toBeVisible();

  // Debug checkbox should be visible but disabled (read-only for non-super_admin)
  const checkbox = page.locator("#debugLogEnabled");
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeDisabled();
});

test("@smoke Impostazioni/Sistema: non-super_admin debug OFF nasconde card", async ({ page }) => {
  // In deployed mode, the global debug setting is fetched from the server and may
  // override the local toggle (e.g., a super_admin has debug ON globally).
  // Skip this test in deployed mode where server state is unpredictable.
  test.skip(process.env.DEPLOYED === "1", "Server-side debug state unpredictable in deployed mode");

  await login(page);

  // Navigate to settings first and wait for system card to be visible,
  // confirming that async loadGlobalDebugMode() has completed (MOCK returns true)
  await page.locator('.nav-item[data-page="settings"]').click();
  await expect(page.locator("#page-settings")).toBeVisible();
  await expect(page.locator("#settingsSystemCard")).toBeVisible();

  // Now turn debug OFF — toggleDebugLog calls updateSettingsSystemVisibility synchronously
  await page.evaluate(() => {
    (window as any).toggleDebugLog(false);
  });

  // Sistema card should be hidden (debug is OFF and user is not super_admin)
  const systemCard = page.locator("#settingsSystemCard");
  await expect(systemCard).not.toBeVisible();
});
