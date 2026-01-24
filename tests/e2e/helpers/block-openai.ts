import { Page } from "@playwright/test";

export async function blockOpenAI(page: Page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();

    if (url.includes("api.openai.com")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, mocked: true })
      });
    }
    return route.continue();
  });
}
