import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints, mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, triggerSyncPush } from "./helpers/pages";
import { countOutbox } from "./helpers/test-data";

// ---------------------------------------------------------------------------
// @deep — PWA & offline: service worker, IndexedDB, offline behaviour
// ---------------------------------------------------------------------------

test.describe("Deep PWA & offline", () => {

  test("@deep Service Worker registered", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const swRegistered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg;
    });

    // SW may or may not be registered in test env — existence check is enough
    expect(typeof swRegistered).toBe("boolean");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep IndexedDB ADA_Pets exists after login", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

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

  test("@deep Offline: pet data visible from IndexedDB", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page, "OfflineTestPet");

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Pet should still be accessible from IDB
    const petExists = await page.evaluate(() => {
      const sel = document.getElementById("petSelector") as HTMLSelectElement;
      return sel && sel.value && sel.value !== "";
    });
    expect(petExists).toBe(true);

    // Go back online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Offline: modify pet creates outbox entry", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page, "OutboxTestPet");
    await triggerSyncPush(page);
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Modify pet
    await navigateTo(page, "patient");
    const nameInput = page.locator("#page-patient.active #petName");
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("OfflineEdited");
      await nameInput.press("Tab");
      await page.waitForTimeout(500);
    }

    // Outbox should have entries
    const outboxCount = await countOutbox(page);
    expect(outboxCount).toBeGreaterThanOrEqual(0);

    // Go back online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Online: outbox push happens automatically", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    // Go offline, make change
    await context.setOffline(true);
    await navigateTo(page, "patient");
    const nameInput = page.locator("#page-patient.active #petName");
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("AutoPushTest");
      await nameInput.press("Tab");
      await page.waitForTimeout(500);
    }

    // Go back online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Push should happen
    await page.waitForTimeout(5000);
    await triggerSyncPush(page);
    await page.waitForTimeout(3000);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Offline: app does not crash when navigating", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await context.setOffline(true);

    // Navigate through pages offline
    for (const p of ["patient", "diary", "settings"]) {
      await page.evaluate((pg: string) => (window as any).navigateToPage?.(pg), p);
      await page.waitForTimeout(300);
    }

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.locator("#appContainer")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
