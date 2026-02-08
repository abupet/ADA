import { expect, Page } from "@playwright/test";
import { gotoApp } from "./nav";

/**
 * Login V2 only (email + password). Email obbligatoria.
 *
 * Uso:
 *   await login(page);                                          // default: TEST_VET_EMAIL
 *   await login(page, { email: process.env.TEST_OWNER_EMAIL }); // ruolo specifico
 *   await login(page, { email: "custom@test.it", password: "xyz" });
 */
export async function login(
  page: Page,
  options?: { email?: string; password?: string; retries?: number }
) {
  const pwd =
    options?.password ||
    process.env.ADA_TEST_PASSWORD ||
    process.env.TEST_PASSWORD;
  if (!pwd) throw new Error("Missing ADA_TEST_PASSWORD or TEST_PASSWORD env var");

  const email =
    options?.email ||
    process.env.ADA_TEST_EMAIL ||
    process.env.TEST_VET_EMAIL ||
    "";
  if (!email)
    throw new Error(
      "Missing email for login. Set ADA_TEST_EMAIL, TEST_VET_EMAIL, or pass options.email"
    );

  const retries = options?.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await page.waitForTimeout(1000);
    }

    await gotoApp(page);

    await expect(page.getByTestId("email-input")).toBeVisible();
    await expect(page.locator("#passwordInput")).toBeVisible();
    await expect(page.getByTestId("login-button")).toBeVisible();

    await page.getByTestId("email-input").fill(email);
    await page.locator("#passwordInput").fill(pwd);
    await page.getByTestId("login-button").click();

    await page.waitForFunction(
      () => {
        const app = document.querySelector("#appContainer");
        const err = document.querySelector("#loginError");
        return (
          (app && app.classList.contains("active")) ||
          (err && getComputedStyle(err).display !== "none")
        );
      },
      { timeout: 15_000 }
    );

    const loginError = page.getByTestId("login-error");
    if (await loginError.isVisible()) {
      const txt = await loginError.textContent();
      if (attempt < retries) {
        console.warn(`Login attempt ${attempt + 1} failed (${txt}), retrying...`);
        continue;
      }
      throw new Error(`Login failed: ${txt || "(no message)"}`);
    }

    await expect(page.locator("#appContainer")).toBeVisible();
    return; // success
  }
}
