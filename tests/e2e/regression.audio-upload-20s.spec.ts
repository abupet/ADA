// regression.audio-upload-20s.spec.ts v6
import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { Fixtures } from "./helpers/fixtures";
import { captureHardErrors } from "./helpers/console";

test("Upload audio breve 20s (fixture) – regression", async ({ page }) => {
  // Audio upload requires MOCK backend (OpenAI transcription not available on deployed backends).
  test.skip(process.env.DEPLOYED === "1", "Audio upload requires MOCK backend");

  const errors = captureHardErrors(page);

  await login(page);

  const input = page.locator("#audioFileInput");
  await expect(input).toHaveCount(1);

  await input.setInputFiles(Fixtures.audio20s);

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
