const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "playwright-report", "test-results"].includes(entry.name)) continue;
      out.push(...walk(p));
    } else out.push(p);
  }
  return out;
}

const root = process.cwd();
const files = walk(root);

// -------------------- 1) Release notes policy --------------------
const forbiddenRN = files.filter(f => {
  const b = path.basename(f);
  return /RELEASE[_-]?NOTES/i.test(b) && b !== "RELEASE_NOTES.md";
});
if (forbiddenRN.length) {
  console.error("❌ Forbidden release notes files:\n" + forbiddenRN.join("\n"));
  process.exit(1);
}

// -------------------- 2) WebM/MP4 byte slicing policy --------------------
// You can opt-out per file by adding this comment anywhere in that file:
//   // POLICY-IGNORE:WEBM_BYTE_SLICE
const IGNORE_TAG = "POLICY-IGNORE:WEBM_BYTE_SLICE";

// Scan only app/runtime JS/TS (ignore tests)
const jsFiles = files.filter(f =>
  (f.endsWith(".js") || f.endsWith(".ts")) &&
  !f.includes(`${path.sep}tests${path.sep}`) &&
  !f.includes(`${path.sep}.github${path.sep}`)
);

// We want to detect byte slicing that targets recorded media.
// => Look for ".slice(" near webm/mp4 and near buffer/file-reader signals,
// within a limited window of lines (proximity = less false positives).

const windowLines = 25;        // how far we look around a suspicious line
const nearLines = 8;           // tighter window for webm/mp4 mentions

const sliceLine = (s) => /\.slice\s*\(/.test(s);
const blobSliceLine = (s) => /\b(blob|record(ed)?Blob|mediaBlob|audioBlob)\b.*\.slice\s*\(/i.test(s) || /\bBlob\b.*\.slice\s*\(/i.test(s);
const webmLine = (s) => /\.(webm|mp4)\b/i.test(s) || /audio\/webm|video\/mp4/i.test(s);
const bufferSignalLine = (s) =>
  /\b(FileReader|readAsArrayBuffer|ArrayBuffer|Uint8Array|DataView|Content-Range|Range:|startByte|endByte)\b/i.test(s);

// Return interesting lines around index
function extractContext(lines, idx, radius = 3) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(lines.length, idx + radius + 1);
  return lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4, " ")} | ${l}`)
    .join("\n");
}

const hits = [];

for (const f of jsFiles) {
  const content = fs.readFileSync(f, "utf8");
  if (content.includes(IGNORE_TAG)) continue; // explicit opt-out

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Gate 1: must be a slice line (prefer blob-ish slice, but keep generic slice too)
    if (!sliceLine(line)) continue;

    // Gate 2: within nearLines, must mention webm/mp4/mime (proximity)
    const startA = Math.max(0, i - nearLines);
    const endA = Math.min(lines.length - 1, i + nearLines);
    let hasWebmNearby = false;
    for (let j = startA; j <= endA; j++) {
      if (webmLine(lines[j])) { hasWebmNearby = true; break; }
    }
    if (!hasWebmNearby) continue;

    // Gate 3: within windowLines, must include a buffer/file-reader signal
    const startB = Math.max(0, i - windowLines);
    const endB = Math.min(lines.length - 1, i + windowLines);
    let hasBufferSignalNearby = false;
    for (let j = startB; j <= endB; j++) {
      if (bufferSignalLine(lines[j])) { hasBufferSignalNearby = true; break; }
    }
    if (!hasBufferSignalNearby) continue;

    // Stronger: if slice is on blob-ish objects, flag; otherwise still flag but mark "weak"
    const strength = blobSliceLine(line) ? "strong" : "weak";

    hits.push({
      file: f,
      line: i + 1,
      strength,
      context: extractContext(lines, i, 4)
    });
  }
}

if (hits.length) {
  console.error("❌ Potential WebM/MP4 BYTE slicing (contextual) detected:\n");
  for (const h of hits) {
    console.error(`- ${h.file}:${h.line} (${h.strength})`);
    console.error(h.context);
    console.error("");
  }
  console.error(`If this is a false positive for a specific file, add: // ${IGNORE_TAG}`);
  process.exit(1);
}

console.log("✅ Policy checks passed");
