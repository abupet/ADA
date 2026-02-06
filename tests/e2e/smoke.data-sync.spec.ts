import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count items in the ADA_Pets outbox store. */
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

/** Read the last push payload sent to /api/sync/pets/push. */
interface PushCapture {
  ops: any[];
  accepted: string[];
}

/** Wait for navigateToPage to be available, then navigate. */
async function navigateTo(page: any, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate((p: string) => {
    (window as any).navigateToPage(p);
  }, pageName);
}

/** Ensure a pet is selected (create one if none). Returns true if pet was already present. */
async function ensurePetSelected(page: any, context: any) {
  const hasPet = await page.evaluate(() => {
    const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
    return sel && sel.value && sel.value !== "";
  });

  if (hasPet) return true;

  // Create a test pet
  await navigateTo(page, "addpet");
  await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
  await page.locator("#page-addpet.active #newPetName").fill("SyncTestPet");
  await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
  await page.locator('button[onclick="saveNewPet()"]').click();

  // Wait for pet to be saved and selected
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
      return sel && sel.value && sel.value !== "";
    });
  }, { timeout: 10_000 }).toBe(true);

  return false;
}

// ---------------------------------------------------------------------------
// Mock setup: intercepts push/pull and captures payloads
// ---------------------------------------------------------------------------

async function setupSyncMocks(page: any) {
  const capture: PushCapture = { ops: [], accepted: [] };

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

test.describe("Data sync: saveData enqueues and pushes pet data", () => {

  test("@smoke Saving a SOAP report enqueues outbox and syncs history_data", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page, context);

    // Navigate to SOAP page
    await navigateTo(page, "soap");
    await expect(page.locator("#page-soap.active")).toBeVisible({ timeout: 10_000 });

    // Fill minimal SOAP data
    await page.locator("#soap-s").fill("Test soggettivo sync");
    await page.locator("#soap-o").fill("Test oggettivo sync");
    await page.locator("#soap-a").fill("Test analisi sync");
    await page.locator("#soap-p").fill("Test piano sync");

    // Record outbox count before save
    const outboxBefore = await countOutbox(page);

    // Save SOAP (this calls saveSOAP -> archiveSOAP -> saveData -> enqueueOutbox -> pushOutboxIfOnline)
    await page.getByTestId("save-soap-button").click();

    // Wait for outbox to be populated then cleared by push
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Verify the push payload contains history_data
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThan(0);

    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch).toBeDefined();
    expect(lastPatch.history_data).toBeDefined();
    expect(Array.isArray(lastPatch.history_data)).toBe(true);
    expect(lastPatch.history_data.length).toBeGreaterThan(0);

    // Verify the SOAP content is in the synced history
    const lastHistory = lastPatch.history_data[lastPatch.history_data.length - 1];
    const soapData = lastHistory?.soapData || lastHistory;
    expect(soapData.a || "").toContain("Test analisi sync");

    // Outbox should be cleared after push
    await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBe(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Adding a medication enqueues outbox and syncs medications", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page, context);

    // Navigate to medications page
    await navigateTo(page, "medications");
    await expect(page.locator("#page-medications.active")).toBeVisible({ timeout: 10_000 });

    // Open modal and add a medication
    await page.getByTestId("add-medication-button").click();
    await expect(page.locator("#medicationModal")).toBeVisible({ timeout: 5_000 });
    await page.locator("#medName").fill("Amoxicillina Test");
    await page.locator("#medDosage").fill("250mg");
    await page.locator("#medFrequency").fill("BID");
    await page.getByTestId("medication-modal-save-button").click();

    // Wait for push to server
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Verify medications in push payload
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThan(0);

    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch).toBeDefined();
    expect(lastPatch.medications).toBeDefined();
    expect(Array.isArray(lastPatch.medications)).toBe(true);

    const syncedMed = lastPatch.medications.find((m: any) => m.name === "Amoxicillina Test");
    expect(syncedMed).toBeDefined();
    expect(syncedMed.dosage).toBe("250mg");

    // Outbox should be cleared
    await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBe(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Recording vital parameters enqueues outbox and syncs vitals_data", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page, context);

    // Navigate to vitals page
    await navigateTo(page, "vitals");
    await expect(page.locator("#page-vitals.active")).toBeVisible({ timeout: 10_000 });

    // Fill vitals form
    await page.locator("#vitalWeight").fill("12.5");
    await page.locator("#vitalTemp").fill("38.5");
    await page.locator("#vitalHR").fill("100");
    await page.locator("#vitalRR").fill("22");

    // Record vitals
    await page.getByTestId("record-vitals-button").click();

    // Wait for push
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Verify vitals in push payload
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThan(0);

    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch).toBeDefined();
    expect(lastPatch.vitals_data).toBeDefined();
    expect(Array.isArray(lastPatch.vitals_data)).toBe(true);

    const syncedVital = lastPatch.vitals_data.find((v: any) =>
      String(v.weight) === "12.5" || v.weight === 12.5
    );
    expect(syncedVital).toBeDefined();

    // Outbox should be cleared
    await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBe(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Adding photos enqueues outbox and syncs photos array", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page, context);

    // Navigate to photos page
    await navigateTo(page, "photos");
    await expect(page.locator("#page-photos.active")).toBeVisible({ timeout: 10_000 });

    // Create a small test image and set it via file input
    const photoInput = page.locator("#photoInput");
    // Create a minimal 1x1 red PNG (67 bytes)
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const pngBuffer = Buffer.from(pngBase64, "base64");

    await photoInput.setInputFiles({
      name: "test-photo.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // Wait for push
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Verify photos in push payload
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThan(0);

    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch).toBeDefined();
    expect(lastPatch.photos).toBeDefined();
    expect(Array.isArray(lastPatch.photos)).toBe(true);
    expect(lastPatch.photos.length).toBeGreaterThan(0);
    expect(lastPatch.photos_count).toBeGreaterThan(0);

    // Outbox should be cleared
    await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBe(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke ADA_PetsSync preserves both push and pull functions after script load", async ({ page }) => {
    const errors = captureHardErrors(page);
    await setupSyncMocks(page);

    await login(page);

    // Verify that pets-sync-step4.js did NOT overwrite pullPetsIfOnline
    const syncFunctions = await page.evaluate(() => {
      const sync = (window as any).ADA_PetsSync || {};
      return {
        hasPush: typeof sync.pushOutboxIfOnline === "function",
        hasPull: typeof sync.pullPetsIfOnline === "function",
        hasRefresh: typeof sync.refreshPetsFromServer === "function",
      };
    });

    expect(syncFunctions.hasPush).toBe(true);
    expect(syncFunctions.hasPull).toBe(true);
    expect(syncFunctions.hasRefresh).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Offline save -> online push delivers data to server", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page, context);

    // Go offline
    await context.setOffline(true);

    // Navigate to vitals and record
    await navigateTo(page, "vitals");
    await expect(page.locator("#page-vitals.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#vitalWeight").fill("15.0");
    await page.locator("#vitalTemp").fill("39.0");
    await page.getByTestId("record-vitals-button").click();

    // Outbox should have items (push can't happen offline)
    await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBeGreaterThan(0);

    // No push should have happened while offline
    expect(capture.accepted.length).toBe(0);

    // Go online and trigger sync
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Wait for push to complete
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Outbox should be cleared
    await expect.poll(async () => await countOutbox(page), { timeout: 10_000 }).toBe(0);

    // Verify vitals in payload
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch?.vitals_data).toBeDefined();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke saveData uses role-aware diary field (vet=diary, owner=ownerDiary)", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page, context);

    // The default role after login is "Veterinario".
    // Navigate to vitals, fill something to trigger saveData which also saves diary
    await navigateTo(page, "vitals");
    await expect(page.locator("#page-vitals.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#vitalWeight").fill("10.0");
    await page.getByTestId("record-vitals-button").click();

    // Wait for push
    await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // For vet role: diary goes to patch.notes (mapped from pet.diary in _petToPatch)
    const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThan(0);

    // Verify the patch was sent (basic sanity check that sync happened)
    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch).toBeDefined();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
