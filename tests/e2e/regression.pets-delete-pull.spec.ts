import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

/**
 * Regression: pets pull -> pet.delete
 *
 * This test is designed to be deterministic with ADA's SPA pages:
 * - It navigates via window.navigateToPage(...) so the target page is actually .active.
 * - It monkeypatches window.fetchApi to guarantee the pull payload is received by the app.
 *
 * Contract:
 * - after a pull that contains pet.delete for the current pet, the pet disappears from the selector
 * - current selection is cleared (or at least no longer equals the deleted id)
 */
test("Pets sync: pull pet.delete removes pet and clears selection", async ({ page }) => {
  await login(page);
  await page.waitForLoadState("networkidle");

  // Ensure SPA navigation exists
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).navigateToPage))
    .toBe("function");

  // Create a pet via the stable Add Pet page
  await page.evaluate(() => (window as any).navigateToPage("addpet"));
  await expect(page.locator("#page-addpet.active #newPetName")).toBeVisible();

  const petName = "RegDel-" + Math.random().toString(16).slice(2, 6);
  await page.fill("#page-addpet.active #newPetName", petName);
  await page.selectOption("#page-addpet.active #newPetSpecies", "Cane");
  await page.click('[data-testid="save-new-pet-button"]');

  // Go to Patient page where selector exists
  await page.evaluate(() => (window as any).navigateToPage("patient"));
  const selector = page.locator("#page-patient.active #petSelector");
  await expect(selector).toBeVisible();

  // Sanity: pet should be visible before delete
  await expect(selector).toContainText(petName);

  const petId = await page.evaluate(() => localStorage.getItem("ada_current_pet_id"));
  expect(petId).toBeTruthy();

  // Monkeypatch fetchApi so pull returns pet.delete for this pet
  await page.evaluate((id) => {
    const w: any = window as any;
    const orig = w.fetchApi;
    w.__pw_mock_del_pet_id = id;

    w.fetchApi = async function (path: any, options: any) {
      const p = String(path || "");
      if (p.includes("/api/sync/pets/pull")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              next_cursor: "999",
              device_id: "playwright",
              changes: [
                {
                  change_id: "999",
                  type: "pet.delete",
                  pet_id: w.__pw_mock_del_pet_id,
                  record: null,
                  version: 2,
                },
              ],
            };
          },
        };
      }
      return orig(path, options);
    };
  }, petId);

  // Force pull
  await page.evaluate(async () => {
    const w: any = window as any;
    if (w.ADA_PetsSync && typeof w.ADA_PetsSync.pullPetsIfOnline === "function") {
      await w.ADA_PetsSync.pullPetsIfOnline({ force: true });
    } else if (typeof w.pullPetsIfOnline === "function") {
      await w.pullPetsIfOnline({ force: true });
    }
  });

  // Assert: pet name disappears from selector options
  await expect
    .poll(
      () =>
        page.$$eval(
          "#page-patient.active #petSelector option",
          (opts) => opts.map((o) => (o.textContent || "")).join("\n")
        ),
      { timeout: 10_000 }
    )
    .not.toContain(petName);

  // Assert: selection cleared OR at least not pointing to deleted id
  const after = await page.evaluate(() => localStorage.getItem("ada_current_pet_id"));
  expect(after === null || after === "" || after !== petId).toBeTruthy();
});
