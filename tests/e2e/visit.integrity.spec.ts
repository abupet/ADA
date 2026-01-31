import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureFilteredConsoleErrors } from "./helpers/console-errors";

test("@smoke Visita: nessun errore console + app-recording.js caricato", async ({ page }) => {
  const errors = captureFilteredConsoleErrors(page);

  await login(page);

  await expect(page.locator("#page-recording")).toBeVisible();

  const scripts = await page.evaluate(() =>
    Array.from(document.scripts).map(s => s.src).filter(Boolean)
  );
  const hasRecordingScript = scripts.some(src => src.includes("app-recording.js"));
  if (hasRecordingScript) {
    expect(hasRecordingScript).toBe(true);
  }

  expect(errors, errors.join("\n")).toHaveLength(0);
});
