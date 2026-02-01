import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

async function countOutbox(page: any): Promise<number> {
  return await page.evaluate(async () => {
    const dbName = "ADA_Pets";
    const storeName = "outbox";
    function open(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
    }
    const db = await open();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  });
}

test("@smoke Pets sync: offline create -> online push clears outbox + migrates tmp_id", async ({ page, context }) => {
  const errors = captureHardErrors(page);

  // Mock backend push/pull endpoints so test is deterministic in local environment
  let lastAccepted: string[] = [];

  await page.route("**/api/sync/pets/push", async (route) => {
    const req = route.request();
    let body: any = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch {}
    const ops = Array.isArray(body.ops) ? body.ops : [];
    const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
    lastAccepted = accepted;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted, rejected: [] }),
    });
  });

  await page.route("**/api/sync/pets/pull**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ next_cursor: null, changes: [] }),
    });
  });

  await login(page);

  // Go to "Pets" page where new pet form exists
  // Use app navigation function if present; fallback to clicking the menu tab.
  await page.evaluate(() => {
    // @ts-ignore
    if (typeof (window as any).navigateToPage === "function") (window as any).navigateToPage("addpet");
  });

  await expect(page.locator("#page-addpet.active")).toBeVisible();

  await expect(page.locator("#newPetName")).toBeVisible();

  // Force offline to ensure outbox write path is used
  await context.setOffline(true);

  // Create a new pet (required fields)
  await page.locator("#newPetName").fill("SmokePet");
  await page.locator("#newPetSpecies").selectOption({ index: 1 }); // pick first available option
  await page.locator('button[onclick="saveNewPet()"]').click();

  // Outbox should have at least 1 item
  await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBeGreaterThan(0);

  // Back online -> trigger online event to run push
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // Wait until push accepted happened and outbox cleared
  await expect.poll(async () => await countOutbox(page), { timeout: 15_000 }).toBe(0);
  expect(lastAccepted.length).toBeGreaterThan(0);

  // Ensure tmp_id got migrated (selected pet id in localStorage should be a pure uuid, not tmp_)
  const currentId = await page.evaluate(() => localStorage.getItem("ada_current_pet_id") || "");
  expect(currentId.startsWith("tmp_")).toBeFalsy();

  expect(errors, errors.join("\n")).toHaveLength(0);
});
