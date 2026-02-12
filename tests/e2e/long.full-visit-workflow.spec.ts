import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, switchRole, triggerSyncPush } from "./helpers/pages";
import { testPetName } from "./helpers/test-data";

// ---------------------------------------------------------------------------
// @long — Full visit workflow: end-to-end simulation of a complete visit
// ---------------------------------------------------------------------------

test.describe("Long full visit workflow", () => {
  test.setTimeout(600_000); // 10 minutes

  test("@long Complete vet visit workflow E2E", async ({ page }) => {
    const errors = captureHardErrors(page);
    const { sync } = await mockAllEndpoints(page);

    // 1. Login as vet
    await login(page);

    // 2. Create new pet
    const petName = testPetName("WorkflowDog");
    await navigateTo(page, "addpet");
    await page.locator("#page-addpet.active #newPetName").fill(petName);
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
    await page.locator('button[onclick="saveNewPet()"]').click();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    // 3. Push pet creation
    await triggerSyncPush(page);
    await expect.poll(() => sync.pushAccepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // 4. Navigate to patient and verify data
    await navigateTo(page, "patient");
    await expect(page.locator("#page-patient.active")).toBeVisible();

    // 5. Navigate to recording
    await navigateTo(page, "recording");
    await expect(page.locator("#page-recording.active")).toBeVisible();

    // 6. Check transcription textarea exists
    const transcription = page.locator("#transcriptionText, [data-testid='transcription-textarea']");
    expect(await transcription.count()).toBeGreaterThan(0);

    // 7. Navigate to SOAP
    await navigateTo(page, "soap");
    await expect(page.locator("#page-soap.active")).toBeVisible();

    // 8. Fill SOAP fields
    for (const id of ["soapS", "soapO", "soapA", "soapP"]) {
      const textarea = page.locator(`#${id}`);
      if (await textarea.isVisible().catch(() => false)) {
        await textarea.fill(`Workflow content for ${id}`);
      }
    }

    // 9. Fill internal notes
    const notesToggle = page.locator('[data-testid="toggle-internal-notes"], [onclick*="internalNotes"], .internal-notes-toggle').first();
    if (await notesToggle.isVisible().catch(() => false)) {
      await notesToggle.click();
    }
    const internalNotes = page.locator("#soapInternalNotes, [data-testid='internal-notes-textarea']").first();
    if (await internalNotes.isVisible().catch(() => false)) {
      await internalNotes.fill("Internal workflow notes");
    }

    // 10. Navigate to history
    await navigateTo(page, "history");
    await expect(page.locator("#page-history.active")).toBeVisible();

    // 11. Navigate to diary as vet
    await navigateTo(page, "diary");
    const vetDiary = page.locator("#page-diary.active textarea, #page-diary.active [contenteditable]").first();
    if (await vetDiary.isVisible().catch(() => false)) {
      await vetDiary.fill("Vet diary entry for workflow");
      await vetDiary.press("Tab");
      await page.waitForTimeout(500);
    }

    // 12. Switch to owner
    await switchRole(page, "proprietario");
    await page.waitForTimeout(1000);

    // 13. Navigate to owner diary
    await navigateTo(page, "diary");
    const ownerDiary = page.locator("#page-diary.active textarea, #page-diary.active [contenteditable]").first();
    if (await ownerDiary.isVisible().catch(() => false)) {
      await ownerDiary.fill("Owner diary entry for workflow");
      await ownerDiary.press("Tab");
      await page.waitForTimeout(500);
    }

    // 14. Navigate to owner pages
    await navigateTo(page, "patient");
    await expect(page.locator("#page-patient.active")).toBeVisible();

    // 15. Switch back to vet
    await switchRole(page, "veterinario");
    await page.waitForTimeout(1000);

    // 16. Navigate to settings
    await navigateTo(page, "settings");
    await expect(page.locator("#page-settings.active")).toBeVisible();

    // 17. Navigate back to recording
    await navigateTo(page, "recording");
    await expect(page.locator("#page-recording.active")).toBeVisible();

    // 18. Delete pet
    await navigateTo(page, "patient");
    page.once("dialog", (dialog) => dialog.accept());
    const deleteBtn = page.locator('[data-testid="delete-pet-button"]');
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      await triggerSyncPush(page);
      await page.waitForTimeout(3000);
    }

    // 19. Verify no errors throughout the entire workflow
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
