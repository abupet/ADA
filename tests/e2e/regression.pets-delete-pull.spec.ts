import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { createPetOffline, goOnlineAndTriggerSync, forcePetsPull } from "./helpers/pets";

test("Pets sync: pull pet.delete removes pet and clears selection", async ({ page, context }) => {
  const errors = captureHardErrors(page);

  // Deterministic routing:
  // - push accepts everything
  // - pull returns a delete for the created pet
  let lastAccepted: string[] = [];
  let deletePetId = "";

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
    // Before we know the pet id, return empty changes.
    if (!deletePetId) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ next_cursor: null, changes: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        next_cursor: "1",
        device_id: "test-device",
        changes: [
          {
            change_id: "1",
            type: "pet.delete",
            pet_id: deletePetId,
            record: null,
            version: 2
          }
        ],
      }),
    });
  });

  await login(page);

  // Create pet offline (stable path)
  deletePetId = await createPetOffline(page, context, "DeleteMe");

  // Back online -> push should run and clear outbox
  await goOnlineAndTriggerSync(page, context);
  await expect.poll(() => lastAccepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

  // Force pull which returns pet.delete
  await forcePetsPull(page);

  // Verify selected pet cleared
  const currentId = await page.evaluate(() => localStorage.getItem("ada_current_pet_id") || "");
  expect(currentId === "" || currentId === null).toBeTruthy();

  // Verify pet removed from DB
  const stillThere = await page.evaluate(async (id) => {
    const dbName = "ADA_Pets";
    const storeName = "pets";
    function open(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
    }
    const db = await open();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  }, deletePetId);
  expect(stillThere).toBeFalsy();

  expect(errors, errors.join("\n")).toHaveLength(0);
});
