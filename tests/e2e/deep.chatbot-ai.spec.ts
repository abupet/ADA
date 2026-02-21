import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";
import { navigateTo } from "./helpers/pages";

// ---------------------------------------------------------------------------
// @deep — Unified messaging: AI chatbot integrated into communication page
// ---------------------------------------------------------------------------

test.describe("Deep unified messaging (AI)", () => {

  test("@deep Communication page loads (owner)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "communication");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Communication: new conversation button visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "communication");

    const newBtn = page.getByTestId("comm-new-btn");
    await expect(newBtn).toBeVisible({ timeout: 5_000 });

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Communication: chatbot nav item no longer exists", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    // Chatbot nav should not exist at all anymore
    const chatbotNav = page.locator('.nav-item[data-page="chatbot"]');
    const visible = await chatbotNav.isVisible().catch(() => false);
    expect(visible).toBe(false);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Communication: vet sees Comunicazioni nav", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_VET_EMAIL });

    // Expand the SERVIZI group that contains communication
    await page.evaluate(() => {
      const group = document.querySelector('.nav-group[data-group="vet-services"]');
      if (group) group.classList.add('open');
    });
    const navItem = page.locator('#sidebar-vet .nav-item[data-page="communication"]');
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText("Comunicazioni");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Communication page: no hard errors on navigate", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "communication");
    await page.waitForTimeout(1000);

    // Navigate away and back
    await navigateTo(page, "patient");
    await navigateTo(page, "communication");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
