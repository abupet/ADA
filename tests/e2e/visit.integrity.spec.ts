import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";
import { blockOpenAI } from "./helpers/block-openai";

test("@smoke Visita: nessun errore console + app-recording.js caricato", async ({ page }) => {
  await blockOpenAI(page);

  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

  await login(page);

  // Pagina Visita (recording) esiste in DOM: #page-recording
  await expect(page.locator("#page-recording")).toBeVisible();

  // Verifica che lo script sia stato caricato
  const scripts = await page.evaluate(() =>
    Array.from(document.scripts).map(s => s.src).filter(Boolean)
  );
  expect(scripts.join("\n")).toContain("app-recording.js");

  expect(errors, errors.join("\n")).toHaveLength(0);
});
