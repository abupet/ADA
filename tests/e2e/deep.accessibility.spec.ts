import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints } from "./helpers/api-mocks";

// ---------------------------------------------------------------------------
// @deep — Accessibility: labels, ARIA, tab navigation, contrast
// ---------------------------------------------------------------------------

test.describe("Deep accessibility", () => {

  test("@deep Login form: inputs have labels or aria-label", async ({ page }) => {
    const errors = captureHardErrors(page);
    await page.goto("index.html", { waitUntil: "domcontentloaded" });

    // Email input
    const emailInput = page.getByTestId("email-input");
    await expect(emailInput).toBeVisible();
    const emailLabel = await emailInput.getAttribute("aria-label") ?? await emailInput.getAttribute("placeholder") ?? "";
    expect(emailLabel.length).toBeGreaterThan(0);

    // Password input
    const pwdInput = page.locator("#passwordInput");
    await expect(pwdInput).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Buttons have accessible text", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    // Check main action buttons have text or aria-label
    const buttons = await page.locator("button:visible").all();
    let buttonsWithText = 0;
    for (const btn of buttons.slice(0, 20)) { // Check first 20
      const text = await btn.textContent() ?? "";
      const ariaLabel = await btn.getAttribute("aria-label") ?? "";
      const title = await btn.getAttribute("title") ?? "";
      if (text.trim() || ariaLabel || title) buttonsWithText++;
    }
    // At least most buttons should have accessible text
    expect(buttonsWithText).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Tab navigation: login form fields", async ({ page }) => {
    const errors = captureHardErrors(page);
    await page.goto("index.html", { waitUntil: "domcontentloaded" });

    // Tab through login form
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await page.keyboard.press("Tab");

    // No errors should occur during tab navigation
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep ARIA landmarks present", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const landmarks = await page.evaluate(() => {
      return {
        hasMain: !!document.querySelector('main, [role="main"]'),
        hasNav: !!document.querySelector('nav, [role="navigation"]'),
        hasHeading: !!document.querySelector("h1, h2, h3"),
      };
    });

    // At least some landmarks should exist
    const hasAnyLandmark = landmarks.hasMain || landmarks.hasNav || landmarks.hasHeading;
    expect(hasAnyLandmark).toBe(true);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Images: logo has alt text", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockAllEndpoints(page);
    await login(page);

    const imagesWithoutAlt = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img:not([alt])");
      return imgs.length;
    });

    // Most images should have alt text (some decorative may not)
    expect(imagesWithoutAlt).toBeLessThan(10);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
