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
