import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";

/**
 * Regression (Pets): apply pull pet.delete
 *
 * Why this test exists:
 * - UI in docs can hide controls (selector hidden, "new pet" button missing)
 * - So we DO NOT drive creation/deletion via #btnNewPet etc.
 * - We use the same stable flow as smoke.pets-sync: navigateToPage("addpet") + saveNewPet()
 * - And we assert the real contract: a pull change with type pet.delete removes from IndexedDB and clears selection.
 */

async function openDb(page: any): Promise<void> {
  await page.evaluate(async () => {
    const dbName = "ADA_Pets";
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
    });
  });
}

async function findPetIdByName(page: any, name: string): Promise<string> {
  return await page.evaluate(async (petName: string) => {
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
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const allReq = store.getAll();
      const all: any[] = await new Promise((resolve, reject) => {
        allReq.onerror = () => reject(allReq.error);
        allReq.onsuccess = () => resolve(allReq.result || []);
      });
      const match = all.find((p) => (p?.name || p?.patient?.petName) === petName);
      return match?.id || match?.pet_id || "";
    } finally {
      db.close();
    }
  }, name);
}

async function hasPetId(page: any, id: string): Promise<boolean> {
  return await page.evaluate(async (petId: string) => {
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
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const getReq = store.get(petId);
      const res: any = await new Promise((resolve, reject) => {
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => resolve(getReq.result);
      });
      return !!res;
    } finally {
      db.close();
    }
  }, id);
}

test("Pets sync: pull pet.delete removes pet and clears selection", async ({ page, context }) => {
  await login(page);
  await page.goto("/");

  // Ensure runtime functions exist (same as smoke)
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).pullPetsIfOnline);
  }, { timeout: 10_000 }).toBe("function");

  // Go to addpet page
  await page.evaluate(() => {
    // @ts-ignore
    (window as any).navigateToPage("addpet");
  });

  await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#page-addpet.active #newPetName")).toBeVisible({ timeout: 10_000 });

  // Create pet offline (forces local write + outbox path)
  const suffix = Math.random().toString(16).slice(2, 8);
  const petName = `RegDel-${suffix}`;

  await context.setOffline(true);
  await page.locator("#page-addpet.active #newPetName").fill(petName);
  await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
  await page.locator('button[onclick="saveNewPet()"]').click();

  // Back online -> push/online handler might run
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // Ensure DB is available and pet exists (by name, since id may be tmp then migrated)
  await openDb(page);

  const createdId = await expect.poll(async () => {
    const id = await findPetIdByName(page, petName);
    return id || "";
  }, { timeout: 15_000 }).toBeTruthy();

  const petId = await findPetIdByName(page, petName);
  await expect(petId).toBeTruthy();

  // Mock next pull to return a delete for that petId
  await page.route("**/api/sync/pets/pull**", async (route) => {
    const body = {
      next_cursor: "999",
      device_id: "playwright",
      changes: [
        {
          change_id: "999",
          type: "pet.delete",
          pet_id: petId,
          record: null,
          version: 2,
        },
      ],
    };
    // JSON cannot contain None in JS world; build with null
    (body["changes"][0] as any)["record"] = null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  // Force a pull (this must apply delete)
  await page.evaluate(async () => {
    // @ts-ignore
    await (window as any).pullPetsIfOnline({ force: true });
  });

  // Assert pet removed from DB
  await expect.poll(async () => !(await hasPetId(page, petId)), { timeout: 10_000 }).toBe(true);

  // Assert selection cleared (or not equal to deleted id)
  const current = await page.evaluate(() => localStorage.getItem("ada_current_pet_id"));
  expect(current === null || current === "" || current !== petId).toBeTruthy();
});
