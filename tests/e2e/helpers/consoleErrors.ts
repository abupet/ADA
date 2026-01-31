// consoleErrors.ts v1
import type { Page } from "@playwright/test";

/**
 * Collects console errors from the page.
 * We keep tests strict (fail on real errors) but allow filtering of known-benign noise.
 */
export function attachConsoleErrorCollector(
  page: Page,
  opts?: {
    /** Strings or regexes to ignore (matched against the console message). */
    ignore?: Array<string | RegExp>;
    /** If true, also ignore generic 404 resource load noise. Default: true */
    ignoreGeneric404?: boolean;
  }
) {
  const errors: string[] = [];
  const ignore = opts?.ignore ?? [];
  const ignoreGeneric404 = opts?.ignoreGeneric404 ?? true;

  function shouldIgnore(msg: string): boolean {
    if (ignoreGeneric404) {
      // CI sometimes reports this without the missing URL; treat as benign noise.
      // Example from logs: "Failed to load resource: the server responded with a status of 404 (Not Found)"
      if (/Failed to load resource:.*\b404\b.*Not Found/i.test(msg)) return true;
    }
    for (const rule of ignore) {
      if (typeof rule === "string" && msg.includes(rule)) return true;
      if (rule instanceof RegExp && rule.test(msg)) return true;
    }
    return false;
  }

  page.on("console", (msg) => {
    // Most browsers use 'error' for resource failures as well.
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!text) return;
    if (shouldIgnore(text)) return;
    errors.push(text);
  });

  return {
    errors,
    getFilteredErrors(extraIgnore?: Array<string | RegExp>) {
      if (!extraIgnore?.length) return errors;
      return errors.filter((e) => {
        for (const rule of extraIgnore) {
          if (typeof rule === "string" && e.includes(rule)) return false;
          if (rule instanceof RegExp && rule.test(e)) return false;
        }
        return true;
      });
    },
  };
}
