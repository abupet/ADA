/* outbox-coalescing.test.js
   Unit test for the REAL coalescing logic from pets-coalesce.js.
   This imports the production code, not a re-implementation.
*/
const assert = require("assert");
const path = require("path");

// Load the real production coalescing module
const { coalesceOutboxOp } = require(path.join(__dirname, "../../frontend/pets-coalesce.js"));

assert.strictEqual(typeof coalesceOutboxOp, "function", "coalesceOutboxOp must be exported");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — simulate an outbox as an array and apply coalesceOutboxOp
// ─────────────────────────────────────────────────────────────────────────────

let nextKey = 1;

/**
 * Apply the real coalesceOutboxOp to a simulated outbox array.
 * This mirrors what enqueueOutbox does in app-pets.js:
 *   1. Find existing entry for petId
 *   2. Call coalesceOutboxOp(existing, newOpType, newPayload, opUuid, petId)
 *   3. Perform the returned action (put/delete/add)
 */
function applyToOutbox(outbox, newOpType, newPayload, petId) {
  const opUuid = "op_" + nextKey++;
  const idx = outbox.findIndex((e) => e.payload && e.payload.id === petId);
  const existing = idx >= 0 ? outbox[idx] : null;

  const result = coalesceOutboxOp(existing, newOpType, newPayload, opUuid, petId);

  if (result.action === "put" && idx >= 0) {
    outbox[idx] = result.entry;
    return outbox;
  }
  if (result.action === "delete" && idx >= 0) {
    outbox.splice(idx, 1);
    return outbox;
  }
  if (result.action === "add") {
    outbox.push(result.entry);
    return outbox;
  }

  // Shouldn't reach here, but just in case
  outbox.push(result.entry || { op_type: newOpType, payload: newPayload });
  return outbox;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: null existing → add
// ─────────────────────────────────────────────────────────────────────────────

(function testNullExisting() {
  const result = coalesceOutboxOp(null, "create", { id: "p1" }, "uuid1", "p1");
  assert.strictEqual(result.action, "add");
  assert.strictEqual(result.entry.op_type, "create");
  assert.deepStrictEqual(result.entry.payload, { id: "p1" });
  console.log("  PASS: null existing -> add");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: create + update => put (merged create)
// ─────────────────────────────────────────────────────────────────────────────

(function testCreatePlusUpdate() {
  const existing = { op_type: "create", payload: { id: "p1", name: "Neve" }, op_uuid: "u1", pet_local_id: "p1" };
  const result = coalesceOutboxOp(existing, "update", { id: "p1", patch: { vitalsData: [{ w: 10 }] } }, "u2", "p1");

  assert.strictEqual(result.action, "put");
  assert.strictEqual(result.entry.op_type, "create", "Op type must remain 'create'");
  assert.strictEqual(result.entry.payload.name, "Neve", "Original name preserved via merge");
  assert.deepStrictEqual(result.entry.payload.patch.vitalsData, [{ w: 10 }], "Update data merged in");
  assert.strictEqual(result.entry.op_uuid, "u1", "Original op_uuid preserved");
  console.log("  PASS: create + update => put (merged create)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: update + update => put (last update wins)
// ─────────────────────────────────────────────────────────────────────────────

(function testUpdatePlusUpdate() {
  const existing = { op_type: "update", payload: { id: "p2", v: 1 }, op_uuid: "u1", pet_local_id: "p2" };
  const result = coalesceOutboxOp(existing, "update", { id: "p2", v: 2 }, "u2", "p2");

  assert.strictEqual(result.action, "put");
  assert.strictEqual(result.entry.op_type, "update");
  assert.strictEqual(result.entry.payload.v, 2, "Last update should win");
  assert.strictEqual(result.entry.op_uuid, "u1", "Original op_uuid preserved");
  console.log("  PASS: update + update => put (last update wins)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: create + delete => delete (cancel out)
// ─────────────────────────────────────────────────────────────────────────────

(function testCreatePlusDelete() {
  const existing = { op_type: "create", payload: { id: "p3", name: "Temp" }, op_uuid: "u1", pet_local_id: "p3" };
  const result = coalesceOutboxOp(existing, "delete", { id: "p3" }, "u2", "p3");

  assert.strictEqual(result.action, "delete", "create + delete should cancel");
  assert.strictEqual(result.entry, undefined, "No entry for delete action");
  console.log("  PASS: create + delete => delete (cancel out)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: update + delete => put (becomes delete)
// ─────────────────────────────────────────────────────────────────────────────

(function testUpdatePlusDelete() {
  const existing = { op_type: "update", payload: { id: "p4", name: "Updated" }, op_uuid: "u1", pet_local_id: "p4" };
  const result = coalesceOutboxOp(existing, "delete", { id: "p4" }, "u2", "p4");

  assert.strictEqual(result.action, "put");
  assert.strictEqual(result.entry.op_type, "delete", "Should become delete");
  assert.strictEqual(result.entry.op_uuid, "u1", "Original op_uuid preserved");
  console.log("  PASS: update + delete => put (becomes delete)");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: unknown combination (delete + update) => add
// ─────────────────────────────────────────────────────────────────────────────

(function testUnknownCombo() {
  const existing = { op_type: "delete", payload: { id: "p5" }, op_uuid: "u1", pet_local_id: "p5" };
  const result = coalesceOutboxOp(existing, "update", { id: "p5", v: 1 }, "u2", "p5");

  assert.strictEqual(result.action, "add", "Unknown combo should add");
  console.log("  PASS: unknown combo (delete + update) => add");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: op_uuid fallback — if existing has no op_uuid, new one is used
// ─────────────────────────────────────────────────────────────────────────────

(function testOpUuidFallback() {
  const existing = { op_type: "create", payload: { id: "p6" }, pet_local_id: "p6" };
  const result = coalesceOutboxOp(existing, "update", { id: "p6", v: 1 }, "new-uuid", "p6");

  assert.strictEqual(result.entry.op_uuid, "new-uuid", "Should use new uuid when existing has none");
  console.log("  PASS: op_uuid fallback when existing has none");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Integration: multi-pet outbox with real coalesceOutboxOp
// ─────────────────────────────────────────────────────────────────────────────

(function testMultiplePetsIntegration() {
  let outbox = [];

  outbox = applyToOutbox(outbox, "create", { id: "pet-A", name: "A" }, "pet-A");
  outbox = applyToOutbox(outbox, "create", { id: "pet-B", name: "B" }, "pet-B");
  assert.strictEqual(outbox.length, 2, "Two different pets");

  outbox = applyToOutbox(outbox, "update", { id: "pet-A", name: "A-updated" }, "pet-A");
  assert.strictEqual(outbox.length, 2, "Still 2 entries after coalesce");

  const petA = outbox.find((e) => e.payload.id === "pet-A");
  const petB = outbox.find((e) => e.payload.id === "pet-B");

  assert.strictEqual(petA.op_type, "create", "pet-A still create (merged)");
  assert.strictEqual(petA.payload.name, "A-updated", "pet-A name updated via merge");
  assert.strictEqual(petB.op_type, "create", "pet-B untouched");
  assert.strictEqual(petB.payload.name, "B");

  console.log("  PASS: multi-pet outbox integration");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Integration: create + multiple updates => single merged create
// ─────────────────────────────────────────────────────────────────────────────

(function testCreatePlusMultipleUpdates() {
  let outbox = [];
  const petId = "pet-5";

  outbox = applyToOutbox(outbox, "create", { id: petId, name: "Rex" }, petId);
  outbox = applyToOutbox(outbox, "update", { id: petId, patch: { vitalsData: [{ w: 10 }] } }, petId);
  outbox = applyToOutbox(outbox, "update", { id: petId, patch: { medications: [{ n: "Med" }] } }, petId);

  assert.strictEqual(outbox.length, 1, "Should be single entry");
  assert.strictEqual(outbox[0].op_type, "create", "Should remain create");
  assert.strictEqual(outbox[0].payload.name, "Rex", "Original name preserved");
  assert.ok(outbox[0].payload.patch, "Merged patch data present");

  console.log("  PASS: create + multiple updates => single merged create");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Integration: full lifecycle — create, update, delete => empty outbox
// ─────────────────────────────────────────────────────────────────────────────

(function testFullLifecycle() {
  let outbox = [];
  const petId = "pet-lifecycle";

  outbox = applyToOutbox(outbox, "create", { id: petId, name: "Temp" }, petId);
  assert.strictEqual(outbox.length, 1);

  outbox = applyToOutbox(outbox, "update", { id: petId, name: "TempUpdated" }, petId);
  assert.strictEqual(outbox.length, 1, "create+update coalesced");

  outbox = applyToOutbox(outbox, "delete", { id: petId }, petId);
  assert.strictEqual(outbox.length, 0, "create+update+delete => empty (pet never reached server)");

  console.log("  PASS: full lifecycle create+update+delete => empty outbox");
})();

console.log("OK outbox-coalescing.test.js");
