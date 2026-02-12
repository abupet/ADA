import { Page } from "@playwright/test";

export interface PerfMeasurement {
  name: string;
  durationMs: number;
}

/**
 * Measure the wall-clock duration of an async action.
 */
export async function measure(name: string, fn: () => Promise<void>): Promise<PerfMeasurement> {
  const start = Date.now();
  await fn();
  return { name, durationMs: Date.now() - start };
}

/**
 * Measure the time to navigate to a page via navigateToPage().
 */
export async function measurePageLoad(page: Page, pageName: string): Promise<PerfMeasurement> {
  const start = Date.now();
  await page.evaluate((p: string) => (window as any).navigateToPage(p), pageName);
  await page.locator(`#page-${pageName}.active`).waitFor({ state: "visible", timeout: 10_000 });
  return { name: `pageLoad:${pageName}`, durationMs: Date.now() - start };
}
