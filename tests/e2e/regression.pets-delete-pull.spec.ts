import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test("Pets sync: pull pet.delete removes pet and clears selection", async ({ page, context }) => {
  const errors = captureHardErrors(page);

  let serverPetId: string | null = null;
  let serveUpsert = false;
  let serveDelete = false;
  let upsertServed = false;
  let deleteServed = false;

  // Mock backend push endpoint: accept ops and capture server-side pet_id (uuid) after tmp_ normalization.
  await page.route("**/api/sync/pets/push", async (route) => {
    const req = route.request();
    let body: any = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch {}
    const ops = Array.isArray(body.ops) ? body.ops : [];
    const accepted = ops.map((o: any) => o?.op_id).filter(Boolean);

    // Capture pet_id used on the wire (expected to be uuid, not tmp_)
    const firstUpsert = ops.find((o: any) => o?.type === "pet.upsert" && typeof o?.pet_id === "string");
    if (firstUpsert && !serverPetId) serverPetId = firstUpsert.pet_id;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted, rejected: [] }),
    });
  });

  // Mock pull endpoint: first (optional) upsert to trigger tmp_ -> uuid migration, then delete.
  await page.route("**/api/sync/pets/pull**", async (route) => {
    if (serveUpsert && serverPetId && !upsertServed) {
      upsertServed = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next_cursor: "1",
          changes: [
            {
              change_id: "1",
              type: "pet.upsert",
              pet_id: serverPetId,
              version: 1,
              record: {
                pet_id: serverPetId,
                owner_user_id: "ada-user",
                name: "RegDelPet",
                species: "Cane",
                version: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            },
          ],
        }),
      });
      return;
    }

    if (serveDelete && serverPetId && !deleteServed) {
      deleteServed = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next_cursor: "2",
          changes: [
            { change_id: "2", type: "pet.delete", pet_id: serverPetId },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ next_cursor: "0", changes: [] }),
    });
  });

  await login(page);

  // Ensure navigation helper exists, then go to Add Pet page explicitly.
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate(() => {
    (window as any).navigateToPage("addpet");
  });

  await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });

  // Force offline so outbox path is used (consistent with offline-first behavior).
  await context.setOffline(true);

  const petName = "RegDelPet";
  await page.locator("#page-addpet.active #newPetName").fill(petName);
  await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
  await page.locator('button[onclick="saveNewPet()"]').click();

  // After saving, app navigates to "patient" page.
  await expect(page.locator("#page-patient.active")).toBeVisible({ timeout: 10_000 });
  const selector = page.locator("#page-patient.active #petSelector");
  await expect(selector).toBeVisible({ timeout: 10_000 });

  // Selector should include the new pet.
  await expect(selector).toContainText(petName);

  // Back online -> trigger online event to run push then pull.
  await context.setOffline(false);
  serveUpsert = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // Wait until current pet id is migrated away from tmp_ (real-world behavior).
  await expect.poll(async () => {
    return await page.evaluate(() => localStorage.getItem("ada_current_pet_id") || "");
  }, { timeout: 15_000 }).not.toMatch(/^tmp_/);

  // Now simulate a remote delete arriving via pull.
  serveDelete = true;
  await page.evaluate(async () => {
    const api = (window as any).ADA_PetsSync;
    if (api && typeof api.pullPetsIfOnline === "function") {
      await api.pullPetsIfOnline({ force: true });
    }
  });

  // Pet must disappear from dropdown and selection must be cleared.
  await expect(selector).not.toContainText(petName);
  const cur = await page.evaluate(() => localStorage.getItem("ada_current_pet_id"));
  expect(cur).toBeNull();

  expect(errors, errors.join("\n")).toHaveLength(0);
});
