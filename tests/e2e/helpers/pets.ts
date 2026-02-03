// helpers/pets.ts
// v1.0 - shared helpers for pets e2e tests (avoid flaky UI selectors)

import { expect, Page, BrowserContext } from "@playwright/test";

/** Navigate to the internal page by calling window.navigateToPage(name). */
export async function navigateToAppPage(page: Page, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate((name) => {
    // @ts-ignore
    (window as any).navigateToPage(name);
  }, pageName);
}

/** Create a pet using the stable "addpet" page (used by existing smoke test). */
export async function createPetOffline(
  page: Page,
  context: BrowserContext,
  name: string,
) {
  await navigateToAppPage(page, "addpet");
  await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#page-addpet.active #newPetName")).toBeVisible({ timeout: 10_000 });

  await context.setOffline(true);

  await page.locator("#page-addpet.active #newPetName").fill(name);
  await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
  await page.locator('button[onclick="saveNewPet()"]').click();

  // selected pet id is stored in localStorage
  const petId = await page.evaluate(() => localStorage.getItem("ada_current_pet_id") || "");
  expect(petId).toBeTruthy();

  return petId;
}

/** Dispatch online event (app uses it to trigger sync) */
export async function goOnlineAndTriggerSync(page: Page, context: BrowserContext) {
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

/** Force a pull, bypassing throttling, if pullPetsIfOnline exists. */
export async function forcePetsPull(page: Page) {
  await page.evaluate(async () => {
    // @ts-ignore
    if (typeof (window as any).pullPetsIfOnline === "function") {
      // @ts-ignore
      await (window as any).pullPetsIfOnline({ force: true });
    }
  });
}
