// regression.audio-upload-100s.spec.ts v4
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

  // After transcription the pipeline auto-generates SOAP; in CI (MOCK mode) the
  // backend returns a mock chat response, so the flow completes with "Referto generato".
  const status = page.locator("#recordingStatus");
  await expect(status).toContainText(
    /Trascrizione pronta|Referto generato|Sto generando/i,
    { timeout: 20_000 }
  );

  expect(errors, errors.join("\n")).toHaveLength(0);
});
