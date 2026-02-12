import { test, expect } from "./helpers/test-base";
import { login } from "./helpers/login";
import { captureHardErrors } from "./helpers/console";
import { mockAllEndpoints, mockSyncEndpoints } from "./helpers/api-mocks";
import { navigateTo, ensurePetSelected } from "./helpers/pages";
import { Fixtures } from "./helpers/fixtures";
import fs from "fs";

// ---------------------------------------------------------------------------
// @stress — Large data: big text, many pets, long notes, many documents
// ---------------------------------------------------------------------------

test.describe("Stress large data", () => {
  test.setTimeout(180_000);

  test("@stress Large transcription (10k words)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "recording");

    const textPath = Fixtures.largeTranscription;
    if (!fs.existsSync(textPath)) { test.skip(); return; }

    const fileInput = page.locator('input[type="file"][accept*="text"], input[type="file"][accept*=".txt"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(textPath);
      await page.waitForTimeout(5000);
    }

    // No crash is the main assertion
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Pet with very long notes (5000 chars)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "patient");

    const notesField = page.locator("#page-patient.active #petNotes, #page-patient.active textarea[name='notes']").first();
    if (await notesField.isVisible().catch(() => false)) {
      const longText = "A".repeat(5000);
      await notesField.fill(longText);
      await notesField.press("Tab");
      await page.waitForTimeout(1000);
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Dropdown with many pets (mock pull 20 pets)", async ({ page }) => {
    const errors = captureHardErrors(page);

    // Mock pull to return 20 pets
    await page.route("**/api/sync/pets/push", async (route) => {
      let body: any = {};
      try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
      const ops = Array.isArray(body.ops) ? body.ops : [];
      const accepted = ops.map((o: any) => o.op_id).filter(Boolean);
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ accepted, rejected: [] }),
      });
    });

    await page.route("**/api/sync/pets/pull**", async (route) => {
      const pets = Array.from({ length: 20 }, (_, i) => ({
        pet_id: `stress-pet-${i}`,
        patch: { name: `StressPet${i}`, species: i % 2 === 0 ? "dog" : "cat" },
        version: 1,
        updated_at: new Date().toISOString(),
      }));
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ next_cursor: null, changes: pets }),
      });
    });

    await login(page);
    await page.waitForTimeout(3000);

    // Dropdown should exist and not crash
    const selector = page.locator("#petSelector");
    await expect(selector).toBeAttached();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress Document list with 50 items (mock)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);

    await page.route("**/api/documents/list**", async (route) => {
      const docs = Array.from({ length: 50 }, (_, i) => ({
        document_id: `doc_stress_${i}`,
        filename: `report_${i}.pdf`,
        type: "application/pdf",
        uploaded_at: new Date().toISOString(),
        size: 1024 * (i + 1),
      }));
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ documents: docs }),
      });
    });

    await login(page);
    await ensurePetSelected(page);
    await navigateTo(page, "history");
    await page.waitForTimeout(2000);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("@stress SOAP with all fields filled (1000 chars each)", async ({ page }) => {
    const errors = captureHardErrors(page);
    await mockSyncEndpoints(page);
    await login(page);
    await ensurePetSelected(page);

    await navigateTo(page, "soap");

    const longContent = "B".repeat(1000);
    for (const id of ["soapS", "soapO", "soapA", "soapP"]) {
      const textarea = page.locator(`#${id}`);
      if (await textarea.isVisible().catch(() => false)) {
        await textarea.fill(longContent);
      }
    }

    // No crash with large content
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

});
