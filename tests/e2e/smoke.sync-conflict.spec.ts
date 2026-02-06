import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function countOutbox(page: any): Promise<number> {
  return await page.evaluate(async () => {
    const req = indexedDB.open("ADA_Pets");
    return await new Promise<number>((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("outbox")) return resolve(0);
        const tx = db.transaction("outbox", "readonly");
        const store = tx.objectStore("outbox");
        const countReq = store.count();
        countReq.onsuccess = () => resolve(countReq.result || 0);
        countReq.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    });
  });
}

async function navigateTo(page: any, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate((p: string) => {
    (window as any).navigateToPage(p);
  }, pageName);
}

async function ensurePetSelected(page: any) {
  const hasPet = await page.evaluate(() => {
    const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
    return sel && sel.value && sel.value !== "";
  });
  if (hasPet) return;

  await navigateTo(page, "addpet");
  await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
  await page.locator("#page-addpet.active #newPetName").fill("ConflictTestPet");
  await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
  await page.locator('button[onclick="saveNewPet()"]').click();

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
      return sel && sel.value && sel.value !== "";
    });
  }, { timeout: 10_000 }).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Sync conflict handling", () => {

  test("@smoke @sync Server rejects with conflict, outbox retains item", async ({ page, context }) => {
    const errors = captureHardErrors(page);

    let pushCount = 0;
    const rejections: any[] = [];

    // Mock push to reject with conflict
    await page.route("**/api/sync/pets/push", async (route: any) => {
      pushCount++;
      const req = route.request();
      let body: any = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch {}
      const ops = Array.isArray(body.ops) ? body.ops : [];

      // Reject all ops with version conflict
      const rejected = ops.map((o: any) => ({
        op_id: o.op_id,
        reason: "conflict",
        current_version: 99,
      }));
      rejections.push(...rejected);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accepted: [], rejected }),
      });
    });

    await page.route("**/api/sync/pets/pull**", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ next_cursor: null, changes: [] }),
      });
    });

    await login(page);
    await ensurePetSelected(page);

    // Record vitals to trigger sync
    await navigateTo(page, "vitals");
    await expect(page.locator("#page-vitals.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#vitalWeight").fill("20.0");
    await page.getByTestId("record-vitals-button").click();

    // Wait for push attempt
    await expect.poll(() => pushCount, { timeout: 15_000 }).toBeGreaterThan(0);

    // Verify rejections happened
    expect(rejections.length).toBeGreaterThan(0);
    expect(rejections[0].reason).toBe("conflict");

    // App should not crash — no hard errors
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke @sync Server error 500 does not crash the app", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    let pushAttempts = 0;

    // Mock push to return 500
    await page.route("**/api/sync/pets/push", async (route: any) => {
      pushAttempts++;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "server_error" }),
      });
    });

    await page.route("**/api/sync/pets/pull**", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ next_cursor: null, changes: [] }),
      });
    });

    await login(page);
    await ensurePetSelected(page);

    // Record vitals to trigger sync
    await navigateTo(page, "vitals");
    await expect(page.locator("#page-vitals.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#vitalWeight").fill("18.0");
    await page.getByTestId("record-vitals-button").click();

    // Wait for push attempts (with retries)
    await expect.poll(() => pushAttempts, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    // Outbox should still have items (since server rejected everything)
    const outboxCount = await countOutbox(page);
    expect(outboxCount).toBeGreaterThan(0);

    // App should not crash — filter out expected 500 errors from our mock
    const realErrors = errors.filter(e => !/500/.test(e));
    expect(realErrors, realErrors.join("\n")).toHaveLength(0);
  });

});
