import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";

// ---------------------------------------------------------------------------
// @smoke Communication, Chatbot, and AI Settings
// ---------------------------------------------------------------------------

test.describe("Communication page", () => {

  test("@smoke Vet: communication page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await page.locator('#sidebar-vet .nav-item[data-page="communication"]').click();
    await expect(page.locator("#page-communication")).toBeVisible({ timeout: 5_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Owner: communication page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await page.locator('#sidebar-owner .nav-item[data-page="communication"]').click();
    await expect(page.locator("#page-communication")).toBeVisible({ timeout: 5_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Owner: chatbot page loads", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await page.locator('.nav-item[data-page="chatbot"]').click();
    await expect(page.locator("#page-chatbot")).toBeVisible({ timeout: 5_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});

test.describe("Communication nav items", () => {

  test("@smoke Vet: Messaggi nav item visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    const navItem = page.locator('#sidebar-vet .nav-item[data-page="communication"]');
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText("Messaggi");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Owner: Messaggi nav item visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    const navItem = page.locator('#sidebar-owner .nav-item[data-page="communication"]');
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText("Messaggi");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@smoke Owner: Assistente AI nav item visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    const navItem = page.locator('.nav-item[data-page="chatbot"]');
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText("Assistente AI");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});

test.describe("AI settings", () => {

  test("@smoke AI settings section renders in settings page", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    await page.locator('.nav-item[data-page="settings"]').click();
    await expect(page.locator("#page-settings")).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId("ai-settings-container")).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});

test.describe("Socket.io CDN", () => {

  test("@smoke Socket.io CDN loaded (window.io defined)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    const ioType = await page.evaluate(() => typeof (window as any).io);
    expect(ioType).toBe("function");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
