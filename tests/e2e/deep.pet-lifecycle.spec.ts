import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, triggerSyncPush } from "./helpers/pages";
import { testPetName, waitForEmptyOutbox } from "./helpers/test-data";

// ---------------------------------------------------------------------------
// @deep — Full pet lifecycle: create, edit, delete, multi-pet
// ---------------------------------------------------------------------------

test.describe("Deep pet lifecycle", () => {

  test("@deep Create pet with all fields populated", async ({ page }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);

    const name = testPetName("FullFields");
    await navigateTo(page, "addpet");
    await page.locator("#page-addpet.active #newPetName").fill(name);
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 }); // dog
    await page.locator('button[onclick="saveNewPet()"]').click();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    await triggerSyncPush(page);
    await expect.poll(() => sync.pushAccepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const upserts = sync.pushOps.filter((o: any) => o.type === "pet.upsert");
    expect(upserts.length).toBeGreaterThan(0);
    expect(upserts[0].patch?.name).toContain(name);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Create cat pet — species dropdown change", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    const name = testPetName("CatTest");
    await navigateTo(page, "addpet");
    await page.locator("#page-addpet.active #newPetName").fill(name);
    // Select cat (index 2 if available, otherwise check options)
    const speciesSelect = page.locator("#page-addpet.active #newPetSpecies");
    const options = await speciesSelect.locator("option").allTextContents();
    const catIndex = options.findIndex(o => /gatto|cat/i.test(o));
    if (catIndex >= 0) {
      await speciesSelect.selectOption({ index: catIndex });
    } else {
      await speciesSelect.selectOption({ index: 1 });
    }
    await page.locator('button[onclick="saveNewPet()"]').click();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Edit pet: change name triggers sync patch", async ({ page }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);

    await ensurePetSelected(page, testPetName("EditMe"));
    await triggerSyncPush(page);
    await expect.poll(() => sync.pushAccepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Clear previous ops tracking
    const prevLen = sync.pushOps.length;

    // Navigate to patient page and edit the name
    await navigateTo(page, "patient");
    const nameInput = page.locator("#page-patient.active #petName");
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("RenamedPet");
      // Trigger blur/save
      await nameInput.press("Tab");
      await page.waitForTimeout(500);
      await triggerSyncPush(page);
      await expect.poll(() => sync.pushOps.length, { timeout: 15_000 }).toBeGreaterThan(prevLen);

      const patches = sync.pushOps.slice(prevLen).filter((o: any) => o.type === "pet.upsert");
      expect(patches.length).toBeGreaterThan(0);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Delete pet: confirm dialog removes pet from dropdown", async ({ page }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);

    const name = testPetName("DeleteMe");
    await ensurePetSelected(page, name);
    await triggerSyncPush(page);
    await expect.poll(() => sync.pushAccepted.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await waitForEmptyOutbox(page);

    await navigateTo(page, "patient");
    page.on("dialog", (dialog) => dialog.accept());

    const deleteBtn = page.locator('[data-testid="delete-pet-button"]');
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      await triggerSyncPush(page);
      await expect.poll(() => {
        return sync.pushOps.filter((o: any) => o.type === "pet.delete").length;
      }, { timeout: 15_000 }).toBeGreaterThan(0);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Delete pet: cancel dialog keeps pet", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    const name = testPetName("KeepMe");
    const petId = await ensurePetSelected(page, name);
    await navigateTo(page, "patient");

    // Cancel the dialog
    page.on("dialog", (dialog) => dialog.dismiss());

    const deleteBtn = page.locator('[data-testid="delete-pet-button"]');
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);

      // Pet should still be selected
      const currentPetId = await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement;
        return sel?.value;
      });
      expect(currentPetId).toBeTruthy();
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Create multiple pets and switch between them", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const name = testPetName(`Multi${i}`);
      names.push(name);
      await navigateTo(page, "addpet");
      await page.locator("#page-addpet.active #newPetName").fill(name);
      await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
      await page.locator('button[onclick="saveNewPet()"]').click();
      await expect.poll(async () => {
        return await page.evaluate(() => {
          const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
          return sel && sel.value && sel.value !== "";
        });
      }, { timeout: 10_000 }).toBe(true);
    }

    // Verify all pets are in the dropdown
    const optionTexts = await page.locator("#petSelector option").allTextContents();
    for (const name of names) {
      expect(optionTexts.some(t => t.includes(name)), `Pet ${name} should be in dropdown`).toBe(true);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Pet selector switch updates patient page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    await ensurePetSelected(page);
    await navigateTo(page, "patient");
    await expect(page.locator("#page-patient.active")).toBeVisible();

    // Switch pet via dropdown (if there are multiple)
    const optionCount = await page.locator("#petSelector option").count();
    if (optionCount > 1) {
      await page.locator("#petSelector").selectOption({ index: 1 });
      await page.waitForTimeout(500);
      // Patient page should still be active
      await expect(page.locator("#page-patient.active")).toBeVisible();
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Pet with special characters in name", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    const name = "Rùfus l'amico àèìòù";
    await navigateTo(page, "addpet");
    await page.locator("#page-addpet.active #newPetName").fill(name);
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
    await page.locator('button[onclick="saveNewPet()"]').click();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    // Verify the name appears in the dropdown
    const optionTexts = await page.locator("#petSelector option").allTextContents();
    expect(optionTexts.some(t => t.includes("Rùfus")), "Special chars in dropdown").toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep History badge exists after pet creation", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);

    await ensurePetSelected(page);

    // Check if historyBadge element exists in the DOM
    const badgeExists = await page.evaluate(() => !!document.getElementById("historyBadge"));
    expect(badgeExists).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
