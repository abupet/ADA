const { spawnSync } = require("node:child_process");

const args = new Set(process.argv.slice(2));
const isNightly  = args.has("--nightly");
const includeLong = args.has("--long") || args.has("--weekly");
const onlyLong   = args.has("--long-only");
const skipPolicy = args.has("--skip-policy");

const steps = [];

// ── Base steps (unit + policy + smoke + regression) ──
if (!onlyLong && !skipPolicy) {
  steps.push({
    name: "Unit tests",
    command: "npm",
    args: ["run", "test:unit"],
  });

  steps.push({
    name: "Policy checks",
    command: "node",
    args: ["tests/policy/policy-checks.js"],
  });
}

if (!onlyLong) {
  steps.push({
    name: "Smoke tests",
    command: "npx",
    args: ["playwright", "test", "--grep", "@smoke"],
  });

  steps.push({
    name: "Regression tests",
    command: "npx",
    args: ["playwright", "test", "--grep-invert", "@smoke|@long|@deep|@stress|@deployed|@nightly"],
  });
}

// ── Nightly: deep tests tagged @nightly + stress ──
if (isNightly) {
  steps.push({
    name: "Nightly deep tests (@nightly)",
    command: "npx",
    args: ["playwright", "test", "--grep", "@nightly"],
  });

  steps.push({
    name: "Stress tests",
    command: "npx",
    args: ["playwright", "test", "--grep", "@stress"],
  });
}

// ── Long/Weekly: ALL deep + stress + long ──
if (onlyLong || includeLong) {
  steps.push({
    name: "Deep tests (all)",
    command: "npx",
    args: ["playwright", "test", "--grep", "@deep"],
  });

  steps.push({
    name: "Stress tests",
    command: "npx",
    args: ["playwright", "test", "--grep", "@stress"],
  });

  steps.push({
    name: "Long tests",
    command: "npx",
    args: ["playwright", "test", "--grep", "@long"],
  });
}

if (steps.length === 0) {
  console.error("No test steps selected. Use --nightly, --long, --long-only, --weekly, or remove --skip-policy.");
  process.exit(1);
}

let failed = false;
const results = [];

for (const step of steps) {
  console.log(`\n▶ ${step.name}`);
  const result = spawnSync(step.command, step.args, { stdio: "inherit" });

  if (result.error) {
    console.error(`Failed to run ${step.name}:`, result.error);
    results.push({ name: step.name, status: "error" });
    failed = true;
    continue; // Don't exit immediately — run all steps to get full picture
  }

  if (result.status !== 0) {
    results.push({ name: step.name, status: "failed" });
    failed = true;
  } else {
    results.push({ name: step.name, status: "passed" });
  }
}

// Write results summary to file for downstream consumption (auto-fix, notifications)
const fs = require("node:fs");
fs.writeFileSync("/tmp/test-results-summary.json", JSON.stringify(results, null, 2));

console.log("\n── Results ──");
for (const r of results) {
  const icon = r.status === "passed" ? "✅" : "❌";
  console.log(`${icon} ${r.name}: ${r.status}`);
}

if (failed) {
  process.exit(1);
}
