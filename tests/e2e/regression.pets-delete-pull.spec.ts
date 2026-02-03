import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

test("Pets sync: pull pet.delete removes pet and clears selection", async ({ page }) => {
  const errors = captureHardErrors(page);

  // Default pull: no changes
  await page.route("**/api/sync/pets/pull**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ next_cursor: "1", changes: [] }),
    });
  });

  await login(page);
  await page.goto("/#/dati-pet");
  await page.waitForSelector("#petSelector");

  // Create pet via UI if available
  await page.click("#btnNewPet");
  await page.fill("#petName", "DeleteMe");
  await page.selectOption("#petSpecies", { label: "Cane" });
  await page.click("#btnSavePet");

  // Select it
  await page.waitForTimeout(300);
  await page.selectOption("#petSelector", { label: /DeleteMe/i });

  const selectedId = await page.$eval("#petSelector", (el: any) => el.value);
  expect(selectedId).toBeTruthy();

  // Next pull returns delete
  await page.unroute("**/api/sync/pets/pull**");
  await page.route("**/api/sync/pets/pull**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        next_cursor: "2",
        changes: [{ type: "pet.delete", pet_id: selectedId }],
      }),
    });
  });

  await page.click("#btnSyncPets");
  await page.waitForTimeout(600);

  const after = await page.$eval("#petSelector", (el: any) => ({
    value: el.value,
    options: Array.from(el.options).map((o: any) => o.textContent || ""),
  }));

  expect(after.value).toBe("");
  expect(after.options.join("\n")).not.toMatch(/DeleteMe/i);
  expect(errors.hardErrors).toEqual([]);
});
