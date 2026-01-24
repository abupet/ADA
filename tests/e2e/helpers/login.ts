import { expect, Page } from "@playwright/test";

export async function login(page: Page) {
  const pwd = process.env.ADA_TEST_PASSWORD;
  if (!pwd) throw new Error("Missing ADA_TEST_PASSWORD env var");

  // ✅ IMPORTANT: use index.html relative to baseURL (never "/")
  await page.goto("index.html", { waitUntil: "domcontentloaded" });

  await page.locator("#passwordInput").fill(pwd);
  await page.getByTestId("login-button").click();

  // Dopo login ci aspettiamo che appContainer sia visibile
  await expect(page.locator("#appContainer")).toBeVisible();
}
