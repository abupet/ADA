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
 * No-op: offline sync/outbox removed in v8.15.x. Kept for API compatibility.
 */
export async function waitForEmptyOutbox(_page: Page, _timeout = 10_000) {
  // no-op — outbox no longer exists
}

/**
 * No-op: offline sync/outbox removed in v8.15.x. Always returns 0.
 */
export async function countOutbox(_page: Page): Promise<number> {
  return 0;
}

/**
 * Delete all pets owned by the currently logged-in user via the API.
 * Cleans up after tests that create pets so deployed environments stay clean.
 * Safe to call even if no pets exist or page is in a broken state.
 */
export async function deleteAllUserPets(page: Page) {
  try {
    await page.evaluate(async () => {
      const w = window as any;
      if (typeof w.fetchApi !== "function") return;
      try {
        const resp = await w.fetchApi("/api/pets", { method: "GET" });
        if (!resp || !resp.ok) return;
        const data = await resp.json();
        const pets = data.pets || [];
        for (const pet of pets) {
          try {
            await w.fetchApi("/api/pets/" + pet.pet_id, { method: "DELETE" });
          } catch (_) { /* ignore individual failures */ }
        }
      } catch (_) { /* ignore — API may be unavailable */ }
    });
  } catch (_) {
    // Page may have crashed or navigated away — cleanup skipped
  }
}
