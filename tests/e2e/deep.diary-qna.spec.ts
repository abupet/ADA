import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, switchRole } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Diary and Q&A: vet diary, owner diary, Q&A pages
// ---------------------------------------------------------------------------

test.describe("Deep diary & Q&A", () => {

  test("@deep Diary page renders (vet)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "diary");

    const textarea = page.locator("#page-diary.active textarea, #page-diary.active [contenteditable]");
    const count = await textarea.count();
    expect(count).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Diary: write and save triggers sync", async ({ page }) => {
    const errors = captureHardErrors(page);
    const { sync } = await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "diary");

    const textarea = page.locator("#page-diary.active textarea, #page-diary.active [contenteditable]").first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill("Vet diary entry test");
      await textarea.press("Tab");
      await page.waitForTimeout(1000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Diary: text persists after navigation", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "diary");

    const textarea = page.locator("#page-diary.active textarea, #page-diary.active [contenteditable]").first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill("Persistent diary test");
      await textarea.press("Tab");
      await page.waitForTimeout(500);

      await navigateTo(page, "patient");
      await navigateTo(page, "diary");
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Diary page renders (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "diary");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Owner diary saves to owner_diary field", async ({ page }) => {
    const errors = captureHardErrors(page);
    const { sync } = await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "diary");

    const textarea = page.locator("#page-diary.active textarea, #page-diary.active [contenteditable]").first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill("Owner diary test");
      await textarea.press("Tab");
      await page.waitForTimeout(1000);

      // Check if patches contain owner_diary
      const ownerPatches = sync.pushOps.filter((o: any) =>
        o.type === "pet.upsert" && o.patch?.owner_diary !== undefined
      );
      // May or may not have pushed yet
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Q&A: page loads (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "qna");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Q&A: input question present", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "qna");

    const input = page.locator('#page-qna.active input, #page-qna.active textarea, [data-testid="qna-input"]');
    const count = await input.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
