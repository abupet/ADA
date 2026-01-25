// regression.audio-upload-100s.spec.ts v2
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
    /Trascrizione (pronta|con riconoscimento parlanti)/i,
    { timeout: 20_000 }
  );

  // Nota: NON assertiamo input.value perché l'app può resettare l'input (value="") dopo l'upload.
  expect(errors, errors.join("\n")).toHaveLength(0);
});
