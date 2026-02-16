// backend/src/db.js v2 — v8.21.0: SSL cert verification, pool monitoring, increased default pool
const { Pool } = require("pg");

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

  let ssl;
  if (process.env.PGSSLMODE === "disable" || isLocal) {
    ssl = false;
  } else if (process.env.PG_CA_CERT) {
    // Production: verify server certificate with provided CA
    ssl = { rejectUnauthorized: true, ca: process.env.PG_CA_CERT };
  } else {
    // Fallback: accept any cert (log warning)
    console.warn("[DB] PG_CA_CERT not set — SSL connections will NOT verify server certificate. Set PG_CA_CERT for production.");
    ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool({
    connectionString: url,
    ssl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Pool monitoring
  pool.on("error", (err) => {
    console.error("[DB] Idle client error:", err.message);
  });
  pool.on("connect", () => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DB] New client connected (total: ${pool.totalCount}, idle: ${pool.idleCount})`);
    }
  });

  return pool;
}

let _pool;
function getPool() {
  if (!_pool) _pool = makePool();
  return _pool;
}

module.exports = { getPool };
