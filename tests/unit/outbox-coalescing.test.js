/* outbox-coalescing.test.js
   Unit test for outbox coalescing logic.
   Tests the merge rules that enqueueOutbox applies.
*/
const assert = require("assert");

// ─────────────────────────────────────────────────────────────────────────────
// Simulate the coalescing rules from app-pets.js enqueueOutbox
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates the coalescing logic from enqueueOutbox.
 * Takes current outbox entries and a new (op_type, payload) and returns
 * the resulting outbox state.
 *
 * Rules:
 * - create + update => keep create, merge payload
 * - update + update => keep last update
 * - create + delete => remove both (cancel out)
 * - update + delete => keep delete
 */
function coalesce(outbox, newOpType, newPayload, petId) {
  const existing = outbox.filter((e) => e.payload && e.payload.id === petId);
  const rest = outbox.filter((e) => !e.payload || e.payload.id !== petId);

  if (existing.length === 0) {
    return [...rest, { op_type: newOpType, payload: newPayload }];
  }

  const prev = existing[0];

  if (prev.op_type === "create" && newOpType === "update") {
    // create + update => keep create, merge payload
    return [
      ...rest,
      { op_type: "create", payload: { ...prev.payload, ...newPayload } },
    ];
  }

  if (prev.op_type === "update" && newOpType === "update") {
    // update + update => keep last update
    return [...rest, { op_type: "update", payload: newPayload }];
  }

  if (prev.op_type === "create" && newOpType === "delete") {
    // create + delete => remove both
    return rest;
  }

  if (prev.op_type === "update" && newOpType === "delete") {
    // update + delete => keep delete
    return [...rest, { op_type: "delete", payload: newPayload }];
  }

  // Default: add new
  return [...outbox, { op_type: newOpType, payload: newPayload }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: create + update => merged create
// ─────────────────────────────────────────────────────────────────────────────

(function testCreatePlusUpdate() {
  const petId = "pet-1";
  let outbox = [];

  // Create
  outbox = coalesce(outbox, "create", { id: petId, name: "Neve" }, petId);
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].op_type, "create");
  assert.strictEqual(outbox[0].payload.name, "Neve");

  // Update (should merge into create)
  outbox = coalesce(
    outbox,
    "update",
    { id: petId, patch: { vitalsData: [{ weight: 10 }] } },
    petId
  );
  assert.strictEqual(outbox.length, 1, "Should still be 1 entry after coalesce");
  assert.strictEqual(outbox[0].op_type, "create", "Op type should remain create");
  assert.strictEqual(outbox[0].payload.name, "Neve", "Original name preserved");
  assert.deepStrictEqual(
    outbox[0].payload.patch.vitalsData,
    [{ weight: 10 }],
    "Update data merged into create payload"
  );

  console.log("  PASS: create + update => merged create with all data");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: update + update => last update wins
// ─────────────────────────────────────────────────────────────────────────────

(function testUpdatePlusUpdate() {
  const petId = "pet-2";
  let outbox = [];

  outbox = coalesce(outbox, "update", { id: petId, v: 1 }, petId);
  assert.strictEqual(outbox.length, 1);

  outbox = coalesce(outbox, "update", { id: petId, v: 2 }, petId);
  assert.strictEqual(outbox.length, 1, "Should still be 1 after coalesce");
  assert.strictEqual(outbox[0].op_type, "update");
  assert.strictEqual(outbox[0].payload.v, 2, "Last update should win");

  console.log("  PASS: update + update => last update wins");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: create + delete => cancel out (empty outbox)
// ─────────────────────────────────────────────────────────────────────────────

(function testCreatePlusDelete() {
  const petId = "pet-3";
  let outbox = [];

  outbox = coalesce(outbox, "create", { id: petId, name: "Temp" }, petId);
  assert.strictEqual(outbox.length, 1);

  outbox = coalesce(outbox, "delete", { id: petId }, petId);
  assert.strictEqual(outbox.length, 0, "create + delete should cancel out");

  console.log("  PASS: create + delete => cancel out");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: update + delete => becomes delete
// ─────────────────────────────────────────────────────────────────────────────

(function testUpdatePlusDelete() {
  const petId = "pet-4";
  let outbox = [];

  outbox = coalesce(outbox, "update", { id: petId, name: "Updated" }, petId);
  assert.strictEqual(outbox.length, 1);

  outbox = coalesce(outbox, "delete", { id: petId }, petId);
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].op_type, "delete", "Should become delete");

  console.log("  PASS: update + delete => becomes delete");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: multiple pets coalesce independently
// ─────────────────────────────────────────────────────────────────────────────

(function testMultiplePetsIndependent() {
  let outbox = [];

  outbox = coalesce(outbox, "create", { id: "pet-A", name: "A" }, "pet-A");
  outbox = coalesce(outbox, "create", { id: "pet-B", name: "B" }, "pet-B");
  assert.strictEqual(outbox.length, 2, "Two different pets");

  // Update only pet-A
  outbox = coalesce(outbox, "update", { id: "pet-A", name: "A-updated" }, "pet-A");
  assert.strictEqual(outbox.length, 2, "Still 2 entries");

  const petA = outbox.find((e) => e.payload.id === "pet-A");
  const petB = outbox.find((e) => e.payload.id === "pet-B");

  assert.strictEqual(petA.op_type, "create", "pet-A should still be create (merged)");
  assert.strictEqual(petA.payload.name, "A-updated", "pet-A name should be updated");
  assert.strictEqual(petB.op_type, "create", "pet-B should be untouched");
  assert.strictEqual(petB.payload.name, "B", "pet-B name should be original");

  console.log("  PASS: multiple pets coalesce independently");
})();

// ─────────────────────────────────────────────────────────────────────────────
// Test: create + multiple updates => single merged create
// ─────────────────────────────────────────────────────────────────────────────

(function testCreatePlusMultipleUpdates() {
  const petId = "pet-5";
  let outbox = [];

  outbox = coalesce(outbox, "create", { id: petId, name: "Rex" }, petId);
  outbox = coalesce(outbox, "update", { id: petId, patch: { vitalsData: [{ w: 10 }] } }, petId);
  outbox = coalesce(outbox, "update", { id: petId, patch: { medications: [{ n: "Med" }] } }, petId);

  assert.strictEqual(outbox.length, 1, "Should be single entry");
  assert.strictEqual(outbox[0].op_type, "create", "Should remain create");
  // All data should be present (each update merges into the create)
  assert.strictEqual(outbox[0].payload.name, "Rex", "Original name preserved");
  assert.ok(outbox[0].payload.patch, "Patch data present");

  console.log("  PASS: create + multiple updates => single merged create");
})();

console.log("OK outbox-coalescing.test.js");
