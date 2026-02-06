// regression.audio-upload-100s.spec.ts v3
import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { Fixtures } from "./helpers/fixtures";
import { captureHardErrors } from "./helpers/console";

test("Upload audio medio 100s (fixture) – regression", async ({ page }) => {
  const errors = captureHardErrors(page);

  await login(page);

  const input = page.locator("#audioFileInput");
  await expect(input).toHaveCount(1);

  await input.setInputFiles(Fixtures.audio100s);

  // Assert su outcome stabile post-upload
  await expect(page.locator("#toast")).toContainText("File caricato", { timeout: 10_000 });

  const status = page.locator("#recordingStatus");
  await expect(status).toContainText(
    /Trascrizione pronta|Referto generato|Sto generando|Errore/i,
    { timeout: 20_000 }
  );

  // In CI there is no OpenAI key, so auto-SOAP generation fails with HTTP 500.
  // Filter out expected SOAP generation errors.
  const unexpected = errors.filter(
    (e) => !/OpenAI key not configured/i.test(e) && !/status of 500/i.test(e) && !/SOAP|GENERA REFERTO/i.test(e)
  );
  expect(unexpected, unexpected.join("\n")).toHaveLength(0);
});
