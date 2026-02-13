import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, ALL_PAGES } from "./helpers/pages";
import { measure, measurePageLoad } from "./helpers/perf";
import { deleteAllUserPets } from "./helpers/test-data";

// ---------------------------------------------------------------------------
// @deep — Performance baselines: login time, navigation, DOM size
// ---------------------------------------------------------------------------

test.describe("Deep performance", () => {

  test.afterEach(async ({ page }) => { await deleteAllUserPets(page); });

  test("@deep Login time < 15s", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);

    const m = await measure("login", async () => {
      await login(page);
    });

    expect(m.durationMs).toBeLessThan(15_000);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Page navigation time < 5s per page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    for (const p of ALL_PAGES.vet) {
      const m = await measurePageLoad(page, p);
      expect(m.durationMs, `${p} should load in < 5s`).toBeLessThan(5_000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Pet creation time < 10s", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const m = await measure("pet-create", async () => {
      await navigateTo(page, "addpet");
      await page.locator("#page-addpet.active #newPetName").fill("PerfTestDog");
      await page.locator("#page-addpet.active #newPetSpecies").selectOption({ index: 1 });
      await page.locator('button[onclick="saveNewPet()"]').click();
      await expect.poll(async () => {
        return await page.evaluate(() => {
          const sel = document.getElementById("petSelector") as HTMLSelectElement | null;
          return sel && sel.value && sel.value !== "";
        });
      }, { timeout: 10_000 }).toBe(true);
    });

    expect(m.durationMs).toBeLessThan(10_000);
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep All scripts loaded without errors", async ({ page }) => {
    const scriptErrors: string[] = [];
    page.on("pageerror", e => scriptErrors.push(String(e)));

    await mockAllEndpoints(page);
    await login(page);

    const scriptCount = await page.evaluate(() => document.scripts.length);
    expect(scriptCount).toBeGreaterThan(5);
    expect(scriptErrors, scriptErrors.join("\n")).toHaveLength(0);
  });

  test("@deep DOM size is reasonable", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    const nodeCount = await page.evaluate(() => document.querySelectorAll("*").length);
    expect(nodeCount).toBeLessThan(10_000);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Memory: no obvious leak after 10 navigations", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    // Navigate 10 times
    const pages = ALL_PAGES.vet;
    for (let i = 0; i < 10; i++) {
      await navigateTo(page, pages[i % pages.length]);
    }

    // Check memory if available (Chromium Performance API)
    const memoryOk = await page.evaluate(() => {
      const perf = (performance as any);
      if (perf.memory) {
        // usedJSHeapSize should be < 200MB after 10 navigations
        return perf.memory.usedJSHeapSize < 200 * 1024 * 1024;
      }
      return true; // Can't measure, assume ok
    });
    expect(memoryOk).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
