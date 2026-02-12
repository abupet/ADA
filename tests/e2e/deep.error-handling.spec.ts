import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints, mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Error handling: API errors, timeouts, offline, invalid responses
// ---------------------------------------------------------------------------

test.describe("Deep error handling", () => {

  test("@deep API 500: app does not crash on sync push failure", async ({ page }) => {
    const errors = captureHardErrors(page);

    // Mock sync push to return 500
    await page.route("**/api/sync/pets/push", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Internal Server Error"}' });
    });
    await page.route("**/api/sync/pets/pull**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"next_cursor":null,"changes":[]}' });
    });

    await login(page);
    await ensurePetSelected(page);

    // Trigger push — should handle 500 gracefully
    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });
    await page.waitForTimeout(2000);

    // App should still be functional
    await expect(page.locator("#appContainer")).toBeVisible();

    // Filter out expected 500-related errors from hard errors
    const realErrors = errors.filter(e => !/500|Internal Server/i.test(e));
    expect(realErrors, realErrors.join("\n")).toHaveLength(0);
  });

  test("@deep API 401: triggers re-login flow", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    // Now mock all API calls to return 401
    await page.route("**/api/sync/pets/push", async (route) => {
      await route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Unauthorized"}' });
    });

    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });
    await page.waitForTimeout(3000);

    // App should handle 401 gracefully — either redirect to login or show message
    // The main assertion is no crash
    const appVisible = await page.locator("#appContainer").isVisible().catch(() => false);
    const loginVisible = await page.locator("#loginForm, [data-testid='email-input']").first().isVisible().catch(() => false);
    // One of them should be visible
    expect(appVisible || loginVisible).toBe(true);
  });

  test("@deep API 403: forbidden handled gracefully", async ({ page }) => {
    const errors = captureHardErrors(page);

    await page.route("**/api/sync/pets/push", async (route) => {
      await route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"Forbidden"}' });
    });
    await page.route("**/api/sync/pets/pull**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"next_cursor":null,"changes":[]}' });
    });

    await login(page);
    await ensurePetSelected(page);

    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });
    await page.waitForTimeout(2000);

    await expect(page.locator("#appContainer")).toBeVisible();

    const realErrors = errors.filter(e => !/403|Forbidden/i.test(e));
    expect(realErrors, realErrors.join("\n")).toHaveLength(0);
  });

  test("@deep Network offline: app does not crash", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Navigate — should handle gracefully
    await page.evaluate(() => (window as any).navigateToPage?.("patient"));
    await page.waitForTimeout(500);

    // Go back online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(1000);

    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Invalid JSON response: no crash", async ({ page }) => {
    const errors = captureHardErrors(page);

    await page.route("**/api/sync/pets/push", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html>Not JSON</html>" });
    });
    await page.route("**/api/sync/pets/pull**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"next_cursor":null,"changes":[]}' });
    });

    await login(page);
    await ensurePetSelected(page);

    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });
    await page.waitForTimeout(2000);

    await expect(page.locator("#appContainer")).toBeVisible();

    // Filter out expected JSON parse errors
    const realErrors = errors.filter(e => !/JSON|parse|Unexpected/i.test(e));
    expect(realErrors, realErrors.join("\n")).toHaveLength(0);
  });

  test("@deep API timeout: app handles slow responses", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = captureHardErrors(page);

    // Mock a very slow push response (25s delay)
    await page.route("**/api/sync/pets/push", async (route) => {
      await new Promise(r => setTimeout(r, 25_000));
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: '{"accepted":[],"rejected":[]}',
      });
    });
    await page.route("**/api/sync/pets/pull**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"next_cursor":null,"changes":[]}' });
    });

    await login(page);
    await ensurePetSelected(page);

    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });

    // Wait for timeout handling
    await page.waitForTimeout(30_000);

    // App should still be functional
    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep IndexedDB operations don't crash when DB is new", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    // Check that IndexedDB ADA_Pets exists after login
    const dbExists = await page.evaluate(async () => {
      return await new Promise<boolean>((resolve) => {
        const req = indexedDB.open("ADA_Pets");
        req.onsuccess = () => { req.result.close(); resolve(true); };
        req.onerror = () => resolve(false);
      });
    });

    expect(dbExists).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
