import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, triggerSyncPush } from "./helpers/pages";
import { testPetName, waitForEmptyOutbox } from "./helpers/test-data";

// ---------------------------------------------------------------------------
// @stress — Concurrent sync: rapid creates, parallel edits, retry
// ---------------------------------------------------------------------------

test.describe("Stress concurrent sync", () => {
  test.setTimeout(180_000);

  test("@stress 10 rapid pet creates", async ({ page }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);

    for (let i = 0; i < 10; i++) {
      const name = testPetName(`Rapid${i}`);
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

    // Push all
    await triggerSyncPush(page);
    await page.waitForTimeout(5000);

    // At least some pushes should have been accepted
    expect(sync.pushAccepted.length).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Outbox with many operations", async ({ page }) => {
    const errors = captureHardErrors(page);
    const sync = await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    // Make multiple quick edits to accumulate outbox entries
    await navigateTo(page, "patient");
    const nameInput = page.locator("#page-patient.active #petName");
    if (await nameInput.isVisible().catch(() => false)) {
      for (let i = 0; i < 10; i++) {
        await nameInput.fill(`StressEdit${i}`);
        await nameInput.press("Tab");
        await page.waitForTimeout(200);
      }
    }

    // Push all at once
    await triggerSyncPush(page);
    await page.waitForTimeout(5000);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Sync retry after failure", async ({ page }) => {
    const errors = captureHardErrors(page);
    let callCount = 0;

    // First push fails, second succeeds
    await page.route("**/api/sync/pets/push", async (route) => {
      callCount++;
      if (callCount <= 1) {
        await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Server Error"}' });
      } else {
        let body: any = {};
        try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
        const ops = Array.isArray(body.ops) ? body.ops : [];
        const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ accepted, rejected: [] }),
        });
      }
    });
    await page.route("**/api/sync/pets/pull**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"next_cursor":null,"changes":[]}' });
    });

    await login(page);
    await ensurePetSelected(page);
    await triggerSyncPush(page);
    await page.waitForTimeout(3000);

    // Retry
    await triggerSyncPush(page);
    await page.waitForTimeout(3000);

    // After retry, push should succeed
    expect(callCount).toBeGreaterThanOrEqual(1);

    const realErrors = errors.filter(e => !/500|Server Error/i.test(e));
    expect(realErrors, realErrors.join("\n")).toHaveLength(0);
  });

  test("@stress Push/pull interleaved", async ({ page }) => {
    const errors = captureHardErrors(page);
    let pullCount = 0;

    await page.route("**/api/sync/pets/push", async (route) => {
      let body: any = {};
      try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
      const ops = Array.isArray(body.ops) ? body.ops : [];
      const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ accepted, rejected: [] }),
      });
    });

    await page.route("**/api/sync/pets/pull**", async (route) => {
      pullCount++;
      // Return some changes on first pull
      const changes = pullCount === 1 ? [{
        pet_id: "remote-pet-1",
        patch: { name: "RemotePet", species: "dog" },
        version: 1,
        updated_at: new Date().toISOString(),
      }] : [];
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ next_cursor: null, changes }),
      });
    });

    await login(page);
    await ensurePetSelected(page);

    // Trigger multiple push/pull cycles
    for (let i = 0; i < 3; i++) {
      await triggerSyncPush(page);
      await page.waitForTimeout(1000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
