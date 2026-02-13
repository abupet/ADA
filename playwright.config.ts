import { defineConfig } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config();

const isDeployed = process.env.DEPLOYED === "1";

/**
 * IMPORTANT:
 * baseURL must be a DIRECTORY (ending with /), not ".../index.html".
 * Tests should use page.goto("index.html") (never page.goto("/")).
 */
const baseURL = isDeployed
  ? (process.env.DEPLOY_URL || "https://abupet.github.io/ada/")
  : "http://localhost:4173/";

export default defineConfig({
  testDir: "tests/e2e",

  // GitHub Pages can be slower; keep deployed timeouts higher.
  timeout: isDeployed ? 120_000 : 60_000,
  expect: { timeout: isDeployed ? 20_000 : 10_000 },

  // Deployed: 2 retries to recover from Chromium segfaults on CI runners.
  retries: isDeployed ? 2 : (process.env.CI ? 1 : 0),
  // Deployed mode: 1 worker to avoid rate-limiting on deployed backends (60 req/min default).
  // Local CI: 2 workers for speed (backend has RATE_LIMIT_PER_MIN=600).
  workers: isDeployed ? 1 : (process.env.CI ? 2 : undefined),

  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },

  reporter: [["html", { open: "never" }], ["list"]],

  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "chromium-deep",
      use: { browserName: "chromium" },
      grep: /@deep|@stress/,
      timeout: 180_000,
    },
  ]
});
