import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";
import { blockOpenAI } from "./helpers/block-openai";

test("@smoke Visita: microfono e upload non sono inerti", async ({ page }) => {
  await blockOpenAI(page);
  await login(page);

  const recordBtn = page.getByTestId("record-button");
  const status = page.getByTestId("recording-status");
  const uploadAudio = page.getByTestId("upload-audio-button");
  const uploadText = page.getByTestId("upload-text-button");

  await expect(recordBtn).toBeVisible();
  await expect(status).toBeVisible();

  // Click microfono: almeno lo stato deve cambiare (anche se poi il browser blocca mic in CI)
  const before = await status.textContent();
  await recordBtn.click();
  await expect(status).not.toHaveText(before || "");

  // Upload audio: si apre file chooser (selettore affidabile)
  const [fc1] = await Promise.all([
    page.waitForEvent("filechooser"),
    uploadAudio.click()
  ]);
  expect(fc1).toBeTruthy();

  // Upload testo: file chooser
  const [fc2] = await Promise.all([
    page.waitForEvent("filechooser"),
    uploadText.click()
  ]);
  expect(fc2).toBeTruthy();
});
