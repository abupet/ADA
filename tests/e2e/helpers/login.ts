import { expect, Page } from "@playwright/test";
import { gotoApp } from "./nav";

/**
 * In-memory token cache: email → JWT token.
 * Shared across tests within the same worker process.
 * Each Playwright worker gets its own module scope, so worst case
 * with N workers = N × (unique roles) API calls.
 */
const tokenCache = new Map<string, string>();

/**
 * Login V2 only (email + password). Email obbligatoria.
 *
 * Uses an in-memory token cache: the first call per email does a full
 * UI login and caches the JWT; subsequent calls inject the cached token
 * into localStorage via addInitScript (zero API calls).
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

  // --- Fast path: cached token (no API call) ---
  const cached = tokenCache.get(email);
  if (cached) {
    // The app's checkSession() requires both ada_auth_token AND ada_session
    // to auto-login on page load (see app-core.js checkSession).
    await page.addInitScript(
      (args: { token: string; session: string }) => {
        localStorage.setItem("ada_auth_token", args.token);
        localStorage.setItem("ada_session", args.session);
      },
      { token: cached, session: btoa(email + ":" + Date.now()) }
    );
    await gotoApp(page);
    await expect(page.locator("#appContainer")).toBeVisible({ timeout: 15_000 });
    return;
  }

  // --- Slow path: full UI login (first call per email) ---
  // Deployed backends have lower rate limits; allow more retries with backoff.
  const isDeployed = process.env.DEPLOYED === "1";
  const retries = options?.retries ?? (isDeployed ? 3 : 1);

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s — gives the rate limiter time to reset.
      await page.waitForTimeout(Math.min(2000 * Math.pow(2, attempt - 1), 10_000));
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

    // Cache the token for subsequent tests
    const token = await page.evaluate(() =>
      localStorage.getItem("ada_auth_token")
    );
    if (token) {
      tokenCache.set(email, token);
    }

    return; // success
  }
}
