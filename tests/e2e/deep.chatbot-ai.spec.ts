import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Chatbot AI (ADA assistant): owner-only, messages, loading
// ---------------------------------------------------------------------------

test.describe("Deep chatbot AI", () => {

  test("@deep Chatbot page loads (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "chatbot");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Chatbot: message input visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "chatbot");

    const input = page.locator('#page-chatbot.active input, #page-chatbot.active textarea, [data-testid="chatbot-input"]');
    const count = await input.count();
    expect(count).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Chatbot: vet does NOT see chatbot nav item", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    // Chatbot nav should be in owner sidebar only
    const chatbotNav = page.locator('#sidebar-vet .nav-item[data-page="chatbot"]');
    const visible = await chatbotNav.isVisible().catch(() => false);
    expect(visible).toBe(false);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Chatbot: owner sees nav item 'La tua assistente ADA'", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    const navItem = page.locator('.nav-item[data-page="chatbot"]');
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText("La tua assistente ADA");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Chatbot page: no hard errors", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "chatbot");
    await page.waitForTimeout(1000);

    // Navigate away and back
    await navigateTo(page, "patient");
    await navigateTo(page, "chatbot");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
