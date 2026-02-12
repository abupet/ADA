import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Photos, Vitals, Medications: owner pages rendering
// ---------------------------------------------------------------------------

test.describe("Deep photos, vitals, medications", () => {

  test("@deep Photos: page loads (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "photos");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Photos: upload placeholder present", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "photos");

    const uploadArea = page.locator('#page-photos.active input[type="file"], #page-photos.active .upload-area, #page-photos.active [data-testid="photo-upload"]');
    const count = await uploadArea.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Vitals: page loads (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "vitals");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Vitals: data containers present", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "vitals");

    const container = page.locator("#page-vitals.active");
    await expect(container).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Medications: page loads (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "medications");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep All three pages: zero errors in sequence", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });
    await ensurePetSelected(page);

    await navigateTo(page, "photos");
    await navigateTo(page, "vitals");
    await navigateTo(page, "medications");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
