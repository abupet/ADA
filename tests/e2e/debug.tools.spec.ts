import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";
import { blockOpenAI } from "./helpers/block-openai";

test("@smoke Debug tools: long audio/text test buttons non inerti", async ({ page }) => {
  await blockOpenAI(page);
  await login(page);

  // Vai impostazioni dal menu laterale (nav-item data-page="settings")
  await page.locator('.nav-item[data-page="settings"]').click();
  await expect(page.locator("#page-settings")).toBeVisible();

  // Abilita debug (checkbox #debugLogEnabled)
  await page.locator("#debugLogEnabled").check();

  // Ora il nav-debug dovrebbe comparire
  const navDebug = page.locator("#nav-debug");
  await expect(navDebug).toBeVisible();
  await navDebug.click();

  // Tool debug visibili
  await expect(page.getByTestId("long-audio-test-button")).toBeVisible();
  await expect(page.getByTestId("long-text-test-button")).toBeVisible();

  // Click -> deve aprire file chooser
  const [fc1] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("long-audio-test-button").click()
  ]);
  expect(fc1).toBeTruthy();

  const [fc2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("long-text-test-button").click()
  ]);
  expect(fc2).toBeTruthy();
});
