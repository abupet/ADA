import { test, expect } from "@playwright/test";
import { blockOpenAI } from "./helpers/block-openai";

test("@deployed Published app: carica + login + visita ok", async ({ page, context }) => {
  await blockOpenAI(page);

  // Evita stati sporchi su GitHub Pages
  await context.clearCookies();
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });

  // Raccogli errori console e page error per diagnosi
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const pwd = process.env.ADA_TEST_PASSWORD;
  if (!pwd) throw new Error("Missing ADA_TEST_PASSWORD env var");

  // IMPORTANT: baseURL is https://abupet.github.io/ada/ so we must NOT use "/"
  await page.goto("index.html", { waitUntil: "domcontentloaded" });

  // Login UI
  await expect(page.locator("#passwordInput")).toBeVisible();
  await expect(page.getByTestId("login-button")).toBeVisible();

  // Login
  await page.locator("#passwordInput").fill(pwd);
  await page.getByTestId("login-button").click();

  // Se compare login-error → password errata / mismatch
  const loginError = page.getByTestId("login-error");
  if (await loginError.isVisible().catch(() => false)) {
    const txt = await loginError.textContent();
    throw new Error(`Login failed (login-error visible): ${txt || ""}`);
  }

  // App sbloccata
  await expect(page.locator("#appContainer")).toBeVisible();

  // Pagina Visita (recording)
  await expect(page.locator("#page-recording")).toBeVisible();

  // Script critico caricato
  const scripts = await page.evaluate(() =>
    Array.from(document.scripts).map(s => s.src).filter(Boolean)
  );
  expect(scripts.join("\n")).toContain("app-recording.js");

  // Nessun errore console “hard”
  expect(errors, errors.join("\n")).toHaveLength(0);
});
