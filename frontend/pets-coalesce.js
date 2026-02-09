// pets-coalesce.js — Pure coalescing logic for the outbox
// Used by app-pets.js (enqueueOutbox) and tested directly by unit tests.
//
// Returns: { action, entry } where:
//   action = 'put'    → update the existing entry with `entry`
//   action = 'delete' → remove the existing entry (cancel create+delete)
//   action = 'add'    → no match; add a new entry with `entry`

(function (exports) {
  "use strict";

  /**
   * Decide what happens when a new op arrives for a pet that already has
   * a pending outbox entry.
   *
   * @param {object|null} existing - The existing outbox record (or null if none)
   *   { op_type, payload, op_uuid, pet_local_id, ... }
   * @param {string} newOpType - 'create' | 'update' | 'delete'
   * @param {object} newPayload - The payload for the new operation
   * @param {string} opUuid - UUID for the new operation
   * @param {string} petId - The pet ID
   * @returns {{ action: 'put'|'delete'|'add', entry?: object }}
   */
  function coalesceOutboxOp(existing, newOpType, newPayload, opUuid, petId) {
    if (!existing) {
      return {
        action: "add",
        entry: {
          op_type: newOpType,
          payload: newPayload,
          op_uuid: opUuid,
          pet_local_id: petId,
        },
      };
    }

    var prev = existing.op_type;

    if (prev === "create" && newOpType === "update") {
      // create + update => keep create, merge payload
      return {
        action: "put",
        entry: {
          ...existing,
          payload: { ...existing.payload, ...newPayload },
          op_uuid: existing.op_uuid || opUuid,
          pet_local_id: existing.pet_local_id || petId,
        },
      };
    }

    if (prev === "update" && newOpType === "update") {
      // update + update => keep last update
      return {
        action: "put",
        entry: {
          ...existing,
          payload: newPayload,
          op_uuid: existing.op_uuid || opUuid,
          pet_local_id: existing.pet_local_id || petId,
        },
      };
    }

    if (prev === "create" && newOpType === "delete") {
      // create + delete => remove both (pet never reached server)
      return { action: "delete" };
    }

    if (prev === "update" && newOpType === "delete") {
      // update + delete => convert to delete
      return {
        action: "put",
        entry: {
          ...existing,
          op_type: "delete",
          payload: newPayload,
          op_uuid: existing.op_uuid || opUuid,
          pet_local_id: existing.pet_local_id || petId,
        },
      };
    }

    // Unknown combination (e.g. delete + update) → add new entry
    return {
      action: "add",
      entry: {
        op_type: newOpType,
        payload: newPayload,
        op_uuid: opUuid,
        pet_local_id: petId,
      },
    };
  }

  exports.coalesceOutboxOp = coalesceOutboxOp;

  // Browser: expose on window
  if (typeof window !== "undefined") {
    window.PetsCoalesce = exports;
  }
})(typeof module !== "undefined" && module.exports ? module.exports : {});
