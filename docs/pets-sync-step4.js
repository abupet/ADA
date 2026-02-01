// pets-sync-step4.js v2
/**
 * pets-sync-step4.js v2
 * STEP 4 — Push Outbox + tmp_id mapping (minimal, smoke-safe)
 */

async function pushOutboxIfOnline() {
  if (!navigator.onLine) return;
  if (typeof getAuthToken !== "function" || !getAuthToken()) return;

  const db = await openPetsDB();
  const tx = db.transaction(["outbox"], "readwrite");
  const store = tx.objectStore("outbox");
  const ops = [];

  await new Promise(resolve => {
    store.openCursor().onsuccess = e => {
      const c = e.target.result;
      if (!c) return resolve();
      ops.push({ id: c.primaryKey, ...c.value });
      c.continue();
    };
  });

  if (!ops.length) return;

const mappedOps = ops.map(op => {
  const o = op.value || op;
  if (o.op_type === "create" && o.payload && o.payload.record) {
    return {
      op_id: `local-${op.id}`,
      type: "create",
      pet_id: o.payload.id,
      record: o.payload.record,
      client_ts: o.created_at || new Date().toISOString()
    };
  }
  return null; // ignore other op types in STEP4 minimal
}).filter(Boolean);

if (!mappedOps.length) return;

  let res;
  try {
    res = await fetchApi("/api/sync/pets/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: localStorage.getItem("device_id") || "debug",
        ops: mappedOps
      })
    });
  } catch {
    return;
  }

  if (!res || !res.ok) return;

  let data;
  try { data = await res.json(); } catch { return; }

  // remove accepted ops
  if (Array.isArray(data.accepted)) {
    for (const acc of data.accepted) {
      let key = null;

      // Back-compat if backend returns numeric id
      if (acc && acc.id != null) key = acc.id;

      // Preferred: parse local op_id like "local-10"
      if (key == null && acc && typeof acc.op_id === "string" && acc.op_id.startsWith("local-")) {
        const n = parseInt(acc.op_id.slice("local-".length), 10);
        if (!Number.isNaN(n)) key = n;
      }

      if (key != null) {
        try { store.delete(key); } catch {}
      }
    }
  }

  if (tx.done) await tx.done;
}

// expose
window.ADA_PetsSync = { pushOutboxIfOnline };
