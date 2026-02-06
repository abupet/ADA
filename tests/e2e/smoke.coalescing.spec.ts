import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// @smoke @sync Explicit coalescing test: create pet, save vitals,
// save medications -> verify a single coalesced push contains all data.
// ---------------------------------------------------------------------------

async function navigateTo(page: any, pageName: string) {
  await expect.poll(async () => {
    return await page.evaluate(() => typeof (window as any).navigateToPage);
  }, { timeout: 10_000 }).toBe("function");
  await page.evaluate((p: string) => (window as any).navigateToPage(p), pageName);
}

test.describe("Outbox coalescing", () => {

  test("@smoke @sync Create + multiple updates coalesce into single push with all data", async ({ page, context }) => {
    const errors = captureHardErrors(page);

    const pushPayloads: any[] = [];

    // Mock push — but delay responses to allow coalescing in outbox
    await page.route("**/api/sync/pets/push", async (route: any) => {
      const req = route.request();
      let body: any = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch {}
      const ops = Array.isArray(body.ops) ? body.ops : [];
      pushPayloads.push(...ops);
      const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
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

    await login(page);

    // Go offline to prevent push during operations — this lets outbox coalesce
    await context.setOffline(true);

    // 1) Create a pet
    await navigateTo(page, "addpet");
    await expect(page.locator("#page-addpet.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#page-addpet.active #newPetName").fill("CoalescePet");
    await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
    await page.locator('button[onclick="saveNewPet()"]').click();

    // Wait for pet to be created
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
        return sel && sel.value && sel.value !== "";
      });
    }, { timeout: 10_000 }).toBe(true);

    // 2) Record vitals
    await navigateTo(page, "vitals");
    await expect(page.locator("#page-vitals.active")).toBeVisible({ timeout: 10_000 });
    await page.locator("#vitalWeight").fill("30.0");
    await page.locator("#vitalTemp").fill("38.8");
    await page.getByTestId("record-vitals-button").click();
    await page.waitForTimeout(500);

    // 3) Add a medication
    await navigateTo(page, "medications");
    await expect(page.locator("#page-medications.active")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("add-medication-button").click();
    await expect(page.locator("#medicationModal")).toBeVisible({ timeout: 5_000 });
    await page.locator("#medName").fill("CoalesceMed");
    await page.locator("#medDosage").fill("500mg");
    await page.getByTestId("medication-modal-save-button").click();
    await page.waitForTimeout(500);

    // Go online and trigger push
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Wait for push
    await expect.poll(() => pushPayloads.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Thanks to coalescing (create + update => merged create), we should get
    // a SINGLE upsert op containing both vitals_data AND medications
    const upsertOps = pushPayloads.filter((o: any) => o.type === "pet.upsert");
    expect(upsertOps.length).toBeGreaterThanOrEqual(1);

    // The last (or only) upsert should contain both data types
    const lastPatch = upsertOps[upsertOps.length - 1]?.patch;
    expect(lastPatch).toBeDefined();

    // Verify vitals are present
    expect(lastPatch.vitals_data).toBeDefined();
    expect(Array.isArray(lastPatch.vitals_data)).toBe(true);
    expect(lastPatch.vitals_data.length).toBeGreaterThan(0);

    // Verify medications are present
    expect(lastPatch.medications).toBeDefined();
    expect(Array.isArray(lastPatch.medications)).toBe(true);
    expect(lastPatch.medications.length).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
