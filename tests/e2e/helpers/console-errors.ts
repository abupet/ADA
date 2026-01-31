import type { Page } from "@playwright/test";

function isAppRecording404(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes("app-recording.js") &&
    (text.includes("failed to load resource") ||
      text.includes("404") ||
      text.includes("not found"))
  );
}

export function captureFilteredConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", e => {
    const msg = String(e);
    if (!isAppRecording404(msg)) errors.push(msg);
  });
  page.on("console", msg => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isAppRecording404(text)) errors.push(text);
  });
  return errors;
}
