import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateTo(page: any, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");
  await page.evaluate((p: string) => (window as any).navigateToPage(p), pageName);
}

async function setupSyncMocks(page: any) {
  const capture = { ops: [] as any[], accepted: [] as string[] };

  await page.route("**/api/sync/pets/push", async (route: any) => {
    const req = route.request();
    let body: any = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch {}
    const ops = Array.isArray(body.ops) ? body.ops : [];
    capture.ops.push(...ops);
    const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
    capture.accepted.push(...accepted);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted, rejected: [] }),
    });
  });

  await page.route("**/api/sync/pets/pull**", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ next_cursor: null, changes: [] }),
    });
  });

  return capture;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Pet CRUD with sync", () => {

  test("@smoke @sync Creating a new pet enqueues a create op and pushes", async ({ page }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);

    // Navigate to add pet
    await navigateTo(page, "addpet");
    await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });

    // Fill required fields
    await page.locator("#page-addpet.active #newPetName").fill("CrudTestDog");
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
    await page.locator('button[onclick="saveNewPet()"]').click();

    // Wait for pet to be selected (saveNewPet completes)
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    // Trigger push explicitly (saveNewPet enqueues but bootstrap debounce may delay push)
    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });

    // Wait for push
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Verify the push payload contains the pet upsert
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThan(0);

    // The pet_id should be a valid UUID (not tmp_)
    const firstOp = upsertOps[0];
    expect(firstOp.pet_id).toBeDefined();
    // pet_id in the push should be normalized (UUID, not tmp_uuid)
    expect(firstOp.pet_id.startsWith("tmp_")).toBeFalsy();

    // The patch should contain the pet name
    expect(firstOp.patch?.name || "").toContain("CrudTestDog");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke @sync Deleting a pet enqueues a delete op and pushes", async ({ page }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);

    // First create a pet
    await navigateTo(page, "addpet");
    await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#page-addpet.active #newPetName").fill("ToDeletePet");
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
    await page.locator('button[onclick="saveNewPet()"]').click();

    // Wait for pet to be selected (saveNewPet completes)
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    // Trigger push explicitly (saveNewPet enqueues but bootstrap debounce may delay push)
    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });

    // Wait for the create push AND outbox to be fully cleared
    // (avoids race: if delete fires while create is still in outbox, coalescing cancels both)
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect.poll(async () => {
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
    }, { timeout: 10_000 }).toBe(0);

    // Navigate to pet data page (where delete button lives)
    await navigateTo(page, "datipet");
    await expect(page.locator("#page-datipet.active")).toBeVisible({ timeout: 10_000 });

    // Handle confirmation dialog BEFORE clicking
    page.on("dialog", (dialog) => dialog.accept());

    // Delete the pet
    const deleteBtn = page.locator('[data-testid="delete-pet-button"]');
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await expect(deleteBtn).toBeEnabled({ timeout: 5_000 });
    await deleteBtn.click();

    // Trigger push explicitly
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      if ((window as any).ADA_PetsSync?.pushOutboxIfOnline) {
        (window as any).ADA_PetsSync.pushOutboxIfOnline();
      }
    });

    // Wait for delete push
    await expect.poll(async () => {
      return capture.ops.filter((o: any) => o.type === "pet.delete").length;
    }, { timeout: 15_000 }).toBeGreaterThan(0);

    const deleteOps = capture.ops.filter((o: any) => o.type === "pet.delete");
    expect(deleteOps.length).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
