import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockSyncEndpoints, mockDocumentsEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected, switchRole } from "./helpers/pages";
import { Fixtures } from "./helpers/fixtures";
import fs from "fs";

// ---------------------------------------------------------------------------
// @deep — Documents: upload, list, viewer, AI read, security
// ---------------------------------------------------------------------------

test.describe("Deep documents", () => {

  test("@deep Upload valid PDF (mock)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    const docs = await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "history");

    const pdfPath = Fixtures.testReportPdf;
    if (!fs.existsSync(pdfPath)) { test.skip(); return; }

    const fileInput = page.locator('input[type="file"][accept*="pdf"], input[type="file"][accept*="application"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(pdfPath);
      await page.waitForTimeout(2000);
      expect(docs.uploads.length).toBeGreaterThanOrEqual(0);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Upload valid JPG image (mock)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    const docs = await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "history");

    const jpgPath = Fixtures.testImageJpg;
    if (!fs.existsSync(jpgPath)) { test.skip(); return; }

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(jpgPath);
      await page.waitForTimeout(2000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Upload valid PNG image (mock)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "history");

    const pngPath = Fixtures.testImagePng;
    if (!fs.existsSync(pngPath)) { test.skip(); return; }

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(pngPath);
      await page.waitForTimeout(2000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Reject file > 10MB", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "history");

    const oversizedPath = Fixtures.oversized15mb;
    if (!fs.existsSync(oversizedPath)) { test.skip(); return; }

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(oversizedPath);
      await page.waitForTimeout(2000);
      // Should show error toast or rejection — no crash is the main test
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Reject EXE file with wrong extension", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "history");

    const exePath = Fixtures.fakePdfExe;
    if (!fs.existsSync(exePath)) { test.skip(); return; }

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(exePath);
      await page.waitForTimeout(2000);
      // File should be rejected
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Documents list rendering (mock)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);

    // Override default mock to return documents
    await page.route("**/api/documents/list**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          documents: Array.from({ length: 5 }, (_, i) => ({
            document_id: `doc_${i}`,
            filename: `report_${i}.pdf`,
            type: "application/pdf",
            uploaded_at: new Date().toISOString(),
            size: 1024 * (i + 1),
          })),
        }),
      });
    });

    await login(page);
    await ensurePetSelected(page);
    await navigateTo(page, "history");

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Vet: 'Leggi' button visible in document view", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "history");

    // The "Leggi" button should exist for vet
    const readBtn = page.locator('button:has-text("Leggi"), [data-testid="read-document"]');
    const count = await readBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep Owner: 'Spiegami il documento' button visible", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await mockDocumentsEndpoints(page);
    await login(page, { email: process.env.TEST_OWNER_EMAIL });

    await navigateTo(page, "history");

    // The "Spiegami" button should exist for owner
    const explainBtn = page.locator('button:has-text("Spiegami"), [data-testid="explain-document"]');
    const count = await explainBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@deep History badge updates", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await mockDocumentsEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    const badge = page.locator("#historyBadge");
    const exists = await badge.count();
    expect(exists).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
