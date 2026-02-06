import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateTo(page: any, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");

  await page.evaluate((p: string) => {
    (window as any).navigateToPage(p);
  }, pageName);
}

async function ensurePetSelected(page: any) {
  const hasPet = await page.evaluate(() => {
    const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
    return sel && sel.value && sel.value !== "";
  });

  if (hasPet) return;

  await navigateTo(page, "addpet");
  await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
  await page.locator("#page-addpet.active #newPetName").fill("RoleTestPet");
  await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
  await page.locator('button[onclick="saveNewPet()"]').click();

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
      return sel && sel.value && sel.value !== "";
    });
  }, { timeout: 10_000 }).toBe(true);
}

async function setupSyncMocks(page: any) {
  const capture = { ops: [] as any[], accepted: [] as string[] };

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

test.describe("Role switching: vet vs owner diary fields", () => {

  test("@smoke @sync Vet role saves diary to pet.diary (syncs as notes)", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page);

    // Verify default role is Veterinario
    const role = await page.evaluate(() => {
      return typeof (window as any).getActiveRole === "function"
        ? (window as any).getActiveRole()
        : "unknown";
    });
    expect(role).toBe("veterinario");

    // Navigate to diary page and write something
    await navigateTo(page, "diary");
    await expect(page.locator("#page-diary.active")).toBeVisible({ timeout: 10_000 });

    const diaryTextarea = page.locator("#diaryText");
    if (await diaryTextarea.isVisible()) {
      await diaryTextarea.fill("Vet diary entry test");

      // Save diary
      const saveBtn = page.locator('[data-testid="save-diary-button"], button[onclick*="saveDiary"], #saveDiaryBtn');
      if (await saveBtn.count() > 0) {
        await saveBtn.first().click();

        // Wait for sync push
        await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

        // Verify the push contains notes (vet diary -> notes field)
        const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
        expect(upsertOps.length).toBeGreaterThan(0);
        const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
        expect(lastPatch).toBeDefined();
        // Vet diary maps to notes in _petToPatch
        expect(lastPatch.notes).toBeDefined();
        expect(lastPatch.notes).toContain("Vet diary entry test");
      }
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke @sync Owner role saves diary to pet.ownerDiary (syncs as owner_diary)", async ({ page, context }) => {
    const errors = captureHardErrors(page);
    const capture = await setupSyncMocks(page);

    await login(page);
    await ensurePetSelected(page);

    // Switch to Proprietario role
    const toggleBtn = page.locator('[data-testid="role-toggle"], #roleToggle, button[onclick*="toggleRole"]');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.first().click();

      const newRole = await page.evaluate(() => {
        return typeof (window as any).getActiveRole === "function"
          ? (window as any).getActiveRole()
          : "unknown";
      });
      expect(newRole).toBe("proprietario");

      // Navigate to diary page
      await navigateTo(page, "diary");
      await expect(page.locator("#page-diary.active")).toBeVisible({ timeout: 10_000 });

      const diaryTextarea = page.locator("#diaryText");
      if (await diaryTextarea.isVisible()) {
        await diaryTextarea.fill("Owner diary entry test");

        const saveBtn = page.locator('[data-testid="save-diary-button"], button[onclick*="saveDiary"], #saveDiaryBtn');
        if (await saveBtn.count() > 0) {
          await saveBtn.first().click();

          await expect.poll(async () => capture.accepted.length, { timeout: 15_000 }).toBeGreaterThan(0);

          const upsertOps = capture.ops.filter((o: any) => o.type === "pet.upsert");
          expect(upsertOps.length).toBeGreaterThan(0);
          const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
          expect(lastPatch).toBeDefined();
          // Owner diary maps to owner_diary in _petToPatch
          expect(lastPatch.owner_diary).toBeDefined();
          expect(lastPatch.owner_diary).toContain("Owner diary entry test");
        }
      }
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
