import { expect, Page } from "@playwright/test";
import { gotoApp } from "./nav";

export async function login(page: Page, retries = 1) {
  const pwd = process.env.ADA_TEST_PASSWORD;
  if (!pwd) throw new Error("Missing ADA_TEST_PASSWORD env var");
  const email = process.env.ADA_TEST_EMAIL || "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Retry: reload and wait before trying again
      await page.waitForTimeout(1000);
    }

    await gotoApp(page);

    await expect(page.locator("#passwordInput")).toBeVisible();
    await expect(page.getByTestId("login-button")).toBeVisible();

    // Fill email if provided (v2 multi-user login)
    if (email) {
      await expect(page.getByTestId("email-input")).toBeVisible();
      await page.getByTestId("email-input").fill(email);
    }

    await page.locator("#passwordInput").fill(pwd);
    await page.getByTestId("login-button").click();

    // Wait for either login success (appContainer gets .active) or failure (loginError shown).
    // We use waitForFunction instead of locator.or() to avoid Playwright strict mode
    // violations — both elements always exist in the DOM, only their visibility changes.
    await page.waitForFunction(
      () => {
        const app = document.querySelector("#appContainer");
        const err = document.querySelector("#loginError");
        return (
          (app && app.classList.contains("active")) ||
          (err && getComputedStyle(err).display !== "none")
        );
      },
      { timeout: 15_000 },
    );

    const loginError = page.getByTestId("login-error");
    if (await loginError.isVisible()) {
      const txt = await loginError.textContent();
      if (attempt < retries) {
        console.warn(`Login attempt ${attempt + 1} failed (${txt}), retrying...`);
        continue;
      }
      throw new Error(`Login failed (login-error visible): ${txt || ""}`);
    }

    await expect(page.locator("#appContainer")).toBeVisible();
    return; // success
  }
}
