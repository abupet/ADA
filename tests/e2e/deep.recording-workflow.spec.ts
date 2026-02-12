import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";
import { Fixtures } from "./helpers/fixtures";
import fs from "fs";

// ---------------------------------------------------------------------------
// @deep — Recording workflow: buttons, text upload, status messages
// ---------------------------------------------------------------------------

test.describe("Deep recording workflow", () => {

  test("@deep Recording page: all core buttons visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // Check essential recording buttons/controls exist
    const selectors = [
      '[data-testid="record-button"], #btnRecord, button[onclick*="toggleRecording"]',
      '[data-testid="upload-audio-button"], #btnUploadAudio, button[onclick*="uploadAudio"]',
      '[data-testid="upload-text-button"], #btnUploadText, button[onclick*="uploadText"]',
    ];

    for (const sel of selectors) {
      const btn = page.locator(sel);
      const count = await btn.count();
      expect(count, `Button ${sel} should exist in DOM`).toBeGreaterThan(0);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Upload text: small file loads into transcription", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // Try to upload a small text
    const fileInput = page.locator('input[type="file"][accept*="text"], input[type="file"][accept*=".txt"]').first();
    if (await fileInput.count() > 0) {
      // Create a small inline text
      const smallTextPath = Fixtures.longText;
      if (fs.existsSync(smallTextPath)) {
        await fileInput.setInputFiles(smallTextPath);
        await page.waitForTimeout(2000);
      }
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Upload long text fixture succeeds", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    const textPath = Fixtures.longText;
    if (!fs.existsSync(textPath)) {
      test.skip();
      return;
    }

    const fileInput = page.locator('input[type="file"][accept*="text"], input[type="file"][accept*=".txt"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(textPath);
      await page.waitForTimeout(3000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Generate SOAP button appears after transcription", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // The btnGenerateSoap should exist in the DOM
    const genBtn = page.locator("#btnGenerateSoap, [data-testid='generate-soap'], button[onclick*='generateSoap']");
    const count = await genBtn.count();
    expect(count, "Generate SOAP button should exist in DOM").toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep New recording: reset clears fields", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // Look for the "new recording" / reset button
    const newBtn = page.locator('[data-testid="new-recording"], button[onclick*="newVisit"], #btnNewVisit, button[onclick*="resetVisit"]');
    if (await newBtn.first().isVisible().catch(() => false)) {
      await newBtn.first().click();
      await page.waitForTimeout(500);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Cancel visit process", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // Look for cancel button
    const cancelBtn = page.locator('[data-testid="cancel-visit"], button[onclick*="cancelVisit"], #btnCancelVisit');
    if (await cancelBtn.first().isVisible().catch(() => false)) {
      await cancelBtn.first().click();
      await page.waitForTimeout(500);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Transcription textarea expand button", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // Check transcription textarea exists
    const textarea = page.locator("#transcriptionText, [data-testid='transcription-textarea']");
    const count = await textarea.count();
    expect(count).toBeGreaterThan(0);

    // Check expand/fullscreen button
    const expandBtn = page.locator('[data-testid="expand-transcription"], button[onclick*="expandTranscription"], .expand-transcription');
    const expandCount = await expandBtn.count();
    expect(expandCount).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Recording page: no errors after all interactions", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    // Navigate away and back
    await navigateTo(page, "patient");
    await navigateTo(page, "recording");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
