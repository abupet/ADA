import path from "path";

// in ambiente Playwright 1.58 il transform tende a CommonJS,
// quindi qui usiamo direttamente __dirname (che in CJS esiste).
// Se per qualche motivo __dirname non esistesse, fallback a process.cwd()
const here = typeof __dirname !== "undefined" ? __dirname : process.cwd();

// tests/e2e/helpers -> tests/fixtures
const fixturesRoot = path.resolve(here, "..", "..", "fixtures");

export const Fixtures = {
  // Audio
  audio20s: path.join(fixturesRoot, "audio", "Neve visita_epilessia 20s.webm"),
  audio100s: path.join(fixturesRoot, "audio", "Neve visita_epilessia 100s.webm"),
  audio40m: path.join(fixturesRoot, "audio", "Pet Anatomy 40m.webm"),
  // Text
  longText: path.join(fixturesRoot, "text", "Neve Visita molto lunga.txt"),
  soapSample: path.join(fixturesRoot, "text", "soap-sample.json"),
  largeTranscription: path.join(fixturesRoot, "text", "large-transcription-10k.txt"),
  // Documents
  testReportPdf: path.join(fixturesRoot, "documents", "test-report.pdf"),
  testImageJpg: path.join(fixturesRoot, "documents", "test-image.jpg"),
  testImagePng: path.join(fixturesRoot, "documents", "test-image.png"),
  fakePdfExe: path.join(fixturesRoot, "documents", "fake-pdf.exe"),
  oversized15mb: path.join(fixturesRoot, "documents", "oversized-15mb.pdf"),
  // CSV
  validProductsCsv: path.join(fixturesRoot, "csv", "valid-products.csv"),
  malformedProductsCsv: path.join(fixturesRoot, "csv", "malformed-products.csv"),
};
