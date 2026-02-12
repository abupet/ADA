import { Page } from "@playwright/test";
import { randomUUID } from "crypto";

/**
 * Generate a unique pet name with a timestamp-based suffix.
 */
export function testPetName(prefix = "Test") {
  return `${prefix}_${Date.now().toString(36)}`;
}

/**
 * Generate a random UUID (v4).
 */
export function testUUID() {
  return randomUUID();
}

/**
 * Delete a pet by selecting it from the dropdown and clicking delete.
 * No-op if the pet is not found.
 */
export async function deletePetByName(page: Page, name: string) {
  const optionValue = await page.evaluate((n: string) => {
    const sel = document.getElementById("petSelector") as HTMLSelectElement;
    if (!sel) return null;
    const option = Array.from(sel.options).find(o => o.text.includes(n));
    return option?.value ?? null;
  }, name);

  if (!optionValue) return;

  // Select the pet
  await page.locator("#petSelector").selectOption(optionValue);
  await page.waitForTimeout(300);

  // Handle confirmation dialog before clicking
  page.once("dialog", (dialog) => dialog.accept());

  const deleteBtn = page.locator('[data-testid="delete-pet-button"]');
  const visible = await deleteBtn.isVisible().catch(() => false);
  if (visible) {
    await deleteBtn.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Wait until the IndexedDB outbox is empty (sync completed).
 */
export async function waitForEmptyOutbox(page: Page, timeout = 10_000) {
  await page.waitForFunction(async () => {
    return await new Promise<boolean>((resolve) => {
      const req = indexedDB.open("ADA_Pets");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("outbox")) return resolve(true);
        const tx = db.transaction("outbox", "readonly");
        const store = tx.objectStore("outbox");
        const countReq = store.count();
        countReq.onsuccess = () => resolve((countReq.result || 0) === 0);
        countReq.onerror = () => resolve(true);
      };
      req.onerror = () => resolve(true);
    });
  }, { timeout });
}

/**
 * Count items in the IndexedDB outbox.
 */
export async function countOutbox(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    return await new Promise<number>((resolve) => {
      const req = indexedDB.open("ADA_Pets");
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
