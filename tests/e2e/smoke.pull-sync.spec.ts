import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// @smoke @sync Pull sync: mock server data -> verify client updates
// ---------------------------------------------------------------------------

// SKIPPED: sync/IndexedDB removed in v8.15.1 (PR 2/6). Will be deleted/rewritten in PR 6.
test.describe.skip("Pull sync: server data flows to client", () => {

  test("@smoke @sync Pull with pet.upsert changes updates local IndexedDB", async ({ page }) => {
    const errors = captureHardErrors(page);

    const testPetId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const testRecord = {
      pet_id: testPetId,
      name: "PullTestDog",
      species: "Cane",
      breed: "Labrador",
      sex: "Maschio",
      weight_kg: "25.00",
      birthdate: "2022-06-15",
      version: 5,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
      owner_user_id: "ada-user",
      notes: "Test notes from server",
      extra_data: {
        vitals_data: [{ weight: 25, temp: 38.5, hr: 90, rr: 20, date: "2026-01-15" }],
        medications: [{ name: "TestMed", dosage: "100mg", frequency: "SID" }],
      },
    };

    // Mock pull to return a pet change
    await page.route("**/api/sync/pets/pull**", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next_cursor: 42,
          changes: [
            {
              change_id: 42,
              type: "pet.upsert",
              pet_id: testPetId,
              record: testRecord,
              version: 5,
            },
          ],
        }),
      });
    });

    // Mock push (no-op)
    await page.route("**/api/sync/pets/push", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accepted: [], rejected: [] }),
      });
    });

    await login(page);

    // Wait for navigation to be ready
    await expect.poll(async () => {
      return await page.evaluate(() => typeof (window as any).navigateToPage);
    }, { timeout: 10_000 }).toBe("function");

    // Trigger a pull explicitly
    const hasPull = await page.evaluate(() => {
      return !!(window as any).ADA_PetsSync && typeof (window as any).ADA_PetsSync.pullPetsIfOnline === "function";
    });

    if (hasPull) {
      await page.evaluate(() => {
        (window as any).ADA_PetsSync.pullPetsIfOnline({ force: true });
      });

      // Wait for the pet to appear in IndexedDB
      await expect.poll(async () => {
        return await page.evaluate((pid: string) => {
          return new Promise<boolean>((resolve) => {
            const req = indexedDB.open("ADA_Pets");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("pets")) return resolve(false);
              const tx = db.transaction("pets", "readonly");
              const store = tx.objectStore("pets");
              const getReq = store.get(pid);
              getReq.onsuccess = () => resolve(!!getReq.result);
              getReq.onerror = () => resolve(false);
            };
            req.onerror = () => resolve(false);
          });
        }, testPetId);
      }, { timeout: 15_000 }).toBe(true);

      // Verify the pet data was stored correctly
      const storedPet = await page.evaluate((pid: string) => {
        return new Promise<any>((resolve) => {
          const req = indexedDB.open("ADA_Pets");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("pets", "readonly");
            const store = tx.objectStore("pets");
            const getReq = store.get(pid);
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => resolve(null);
          };
          req.onerror = () => resolve(null);
        });
      }, testPetId);

      expect(storedPet).toBeDefined();
      expect(storedPet.name || storedPet.patient?.petName).toContain("PullTestDog");
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke @sync Pull with pet.delete removes pet from local IndexedDB", async ({ page }) => {
    const errors = captureHardErrors(page);

    const deletePetId = "11111111-2222-3333-4444-555555555555";

    // First inject a pet into IndexedDB so we can delete it
    await page.route("**/api/sync/pets/pull**", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ next_cursor: null, changes: [] }),
      });
    });
    await page.route("**/api/sync/pets/push", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accepted: [], rejected: [] }),
      });
    });

    await login(page);

    // Wait for app to be ready
    await expect.poll(async () => {
      return await page.evaluate(() => typeof (window as any).navigateToPage);
    }, { timeout: 10_000 }).toBe("function");

    // Inject a pet directly into IndexedDB
    await page.evaluate((pid: string) => {
      return new Promise<void>((resolve) => {
        const req = indexedDB.open("ADA_Pets");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("pets")) return resolve();
          const tx = db.transaction("pets", "readwrite");
          const store = tx.objectStore("pets");
          store.put({
            id: pid,
            name: "ToBeDeleted",
            species: "Cane",
            patient: { petName: "ToBeDeleted", petSpecies: "Cane" },
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      });
    }, deletePetId);

    // Now re-route pull to return a delete change
    await page.unroute("**/api/sync/pets/pull**");
    await page.route("**/api/sync/pets/pull**", async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next_cursor: 99,
          changes: [
            { change_id: 99, type: "pet.delete", pet_id: deletePetId },
          ],
        }),
      });
    });

    // Trigger pull
    const hasPull = await page.evaluate(() => {
      return !!(window as any).ADA_PetsSync && typeof (window as any).ADA_PetsSync.pullPetsIfOnline === "function";
    });

    if (hasPull) {
      await page.evaluate(() => {
        (window as any).ADA_PetsSync.pullPetsIfOnline({ force: true });
      });

      // Wait for the pet to be removed
      await expect.poll(async () => {
        return await page.evaluate((pid: string) => {
          return new Promise<boolean>((resolve) => {
            const req = indexedDB.open("ADA_Pets");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("pets")) return resolve(true);
              const tx = db.transaction("pets", "readonly");
              const store = tx.objectStore("pets");
              const getReq = store.get(pid);
              getReq.onsuccess = () => resolve(!getReq.result);
              getReq.onerror = () => resolve(false);
            };
            req.onerror = () => resolve(false);
          });
        }, deletePetId);
      }, { timeout: 15_000 }).toBe(true);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
