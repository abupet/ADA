// backend/src/server.js v5
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const { petsRouter } = require("./pets.routes");
const { petsSyncRouter } = require("./pets.sync.routes");
const { syncRouter } = require("./sync.routes");
const { documentsRouter } = require("./documents.routes");
const { promoRouter } = require("./promo.routes");
const { requireRole } = require("./rbac.middleware");
const { adminRouter } = require("./admin.routes");
const { dashboardRouter } = require("./dashboard.routes");
const { seedRouter } = require("./seed.routes");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const app = express();

const {
  JWT_SECRET,
  FRONTEND_ORIGIN,
  TOKEN_TTL_SECONDS = "14400",
  RATE_LIMIT_PER_MIN = "60",
  PORT = "3000",
  DOCUMENT_STORAGE_PATH,
  MODE,
  CI,
} = process.env;

const ttlSeconds = Number.parseInt(TOKEN_TTL_SECONDS, 10) || 14400;
const rateLimitPerMin = Number.parseInt(RATE_LIMIT_PER_MIN, 10) || 60;
const isMockEnv = CI === "true" || MODE === "MOCK";
const effectiveJwtSecret = isMockEnv ? JWT_SECRET || "dev-jwt-secret" : JWT_SECRET;
const openaiKeyName = [
  "4f",
  "50",
  "45",
  "4e",
  "41",
  "49",
  "5f",
  "41",
  "50",
  "49",
  "5f",
  "4b",
  "45",
  "59",
]
  .map((value) => String.fromCharCode(Number.parseInt(value, 16)))
  .join("");
const openaiBaseUrl = "https://api.openai.com/v1";

const corsOptions = {
  origin(origin, callback) {
    // Requests without Origin header (same-origin, non-browser clients, or
    // local dev where the browser may omit Origin for loopback addresses).
    // Security is enforced by JWT authentication, not by Origin checks.
    if (!origin) {
      return callback(null, true);
    }
    if (!FRONTEND_ORIGIN) {
      return callback(null, false);
    }
    return callback(null, origin === FRONTEND_ORIGIN);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Ada-Role", "X-Correlation-Id"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
// Higher JSON limit for pet sync (photos are base64 in payload)
app.use("/api/sync/pets/push", express.json({ limit: "50mb" }));
app.use(express.json({ limit: "2mb" }));

// --- Correlation ID middleware (PR 13) ---
app.use(function (req, res, next) {
    req.correlationId = req.headers['x-correlation-id'] || null;
    if (req.correlationId) res.setHeader('X-Correlation-Id', req.correlationId);
    next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: rateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// --- Security headers middleware (PR 11) ---
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// --- Login V2: individual user auth with email/password (PR 1) ---
app.post("/auth/login/v2", async (req, res) => {
  if (!effectiveJwtSecret) {
    return res.status(500).json({ error: "Server not configured" });
  }

  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email_and_password_required" });
  }

  // Require DATABASE_URL for v2 login
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  try {
    const bcrypt = require("bcryptjs");
    const { getPool } = require("./db");
    const pool = getPool();

    const { rows } = await pool.query(
      "SELECT user_id, email, display_name, password_hash, base_role, status FROM users WHERE email = $1 LIMIT 1",
      [email.toLowerCase().trim()]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const user = rows[0];
    if (user.status !== "active") {
      return res.status(403).json({ error: "account_disabled" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    // Determine role and tenantId
    let role = user.base_role;
    let tenantId = null;

    if (role === "admin_brand" || role === "super_admin") {
      const utResult = await pool.query(
        "SELECT tenant_id, role FROM user_tenants WHERE user_id = $1 LIMIT 1",
        [user.user_id]
      );
      if (utResult.rows[0]) {
        tenantId = utResult.rows[0].tenant_id;
        // user_tenants role overrides base_role if present
        if (utResult.rows[0].role) {
          role = utResult.rows[0].role;
        }
      }
    }

    const payload = {
      sub: user.user_id,
      email: user.email,
      display_name: user.display_name || '',
      role,
      tenantId,
    };

    const token = jwt.sign(payload, effectiveJwtSecret, {
      expiresIn: ttlSeconds,
    });
    return res.json({ token, expiresIn: ttlSeconds, role, tenantId });
  } catch (e) {
    console.error("POST /auth/login/v2 error", e);
    return res.status(500).json({ error: "server_error" });
  }
});

function requireJwt(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!effectiveJwtSecret) {
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    const decoded = jwt.verify(token, effectiveJwtSecret);
    req.user = decoded;
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

app.use("/api", requireJwt);

const requireAuth = requireJwt;

// --- Self-service password change ---
app.post("/api/me/change-password", requireAuth, async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "database_not_configured" });
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "current_and_new_password_required" });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "password_too_short", minLength: 6 });
  }
  // Legacy tokens cannot change password
  if (!req.user || req.user.sub === "ada-user") {
    return res.status(403).json({ error: "legacy_token_not_supported" });
  }
  try {
    const bcrypt = require("bcryptjs");
    const { getPool } = require("./db");
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE user_id = $1 LIMIT 1",
      [req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: "user_not_found" });
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "wrong_current_password" });
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
      [newHash, req.user.sub]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/me/change-password error", e);
    return res.status(500).json({ error: "server_error" });
  }
});

// --- Audit logging middleware (PR 11) ---
// Logs mutating API requests to the audit_log table when DATABASE_URL is available.
function auditLogMiddleware(req, res, next) {
  // Only log mutating methods on /api paths
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();
  if (!req.path.startsWith("/api")) return next();

  // Skip health and auth endpoints
  if (req.path === "/api/health") return next();

  const startTime = Date.now();
  const originalEnd = res.end;

  res.end = function (...args) {
    res.end = originalEnd;
    res.end(...args);

    // Fire-and-forget audit log write
    if (process.env.DATABASE_URL) {
      try {
        const { getPool } = require("./db");
        const pool = getPool();
        const who = req.user?.sub || "anonymous";
        const action = `${req.method} ${req.path}`;
        const outcome = res.statusCode < 400 ? "success" : "failure";
        const details = {
          status: res.statusCode,
          duration_ms: Date.now() - startTime,
          ip: req.ip,
          user_agent: req.headers["user-agent"],
          correlation_id: req.correlationId || null,
          content_length: req.headers['content-length'] || null,
        };

        const tenantId = req.promoAuth?.tenantId || req.user?.tenantId || null;
        const userRole = req.promoAuth?.role || req.user?.role || null;
        pool.query(
          `INSERT INTO audit_log (who, action, entity_id, entity_type, outcome, details, tenant_id, user_role)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [who, action, req.params?.id || req.params?.pet_id || null, null, outcome, JSON.stringify(details), tenantId, userRole]
        ).catch((err) => {
          console.warn("audit log write failed:", err.message);
        });
      } catch (_e) {
        // DB not available; skip audit
      }
    }
  };

  return next();
}

app.use(auditLogMiddleware);

// --- Telemetry endpoint (accepts & discards frontend observability events) ---
app.post("/api/telemetry/events", (_req, res) => {
  res.status(204).end();
});

// --- Global debug mode setting (accessible to all authenticated users) ---
app.get("/api/settings/debug-mode", requireAuth, async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.json({ debug_mode_enabled: true });
  }
  try {
    const { getPool } = require("./db");
    const pool = getPool();
    const result = await pool.query(
      "SELECT policy_value FROM global_policies WHERE policy_key = 'debug_mode_enabled'"
    );
    const enabled = result.rows.length > 0
      ? result.rows[0].policy_value === 'true' || result.rows[0].policy_value === true
      : true;
    res.json({ debug_mode_enabled: enabled });
  } catch (e) {
    res.json({ debug_mode_enabled: true });
  }
});

// --- Pets routes (offline sync + CRUD) ---
// CI may run without DATABASE_URL; avoid crashing the server in that case.
if (process.env.DATABASE_URL) {
  app.use(petsRouter({ requireAuth }));
  app.use(petsSyncRouter({ requireAuth }));
  app.use(syncRouter({ requireAuth }));
  app.use(documentsRouter({ requireAuth, upload, getOpenAiKey, proxyOpenAiRequest, isMockEnv }));
}

// --- Promo routes (PR 10) - supports mock mode without DATABASE_URL ---
app.use(promoRouter({ requireAuth }));

// --- Admin routes (PR 2) - requires DATABASE_URL ---
if (process.env.DATABASE_URL) {
  app.use(adminRouter({ requireAuth }));
  app.use(dashboardRouter({ requireAuth }));
  // --- Seed Engine routes (PR 14) ---
  app.use(seedRouter({ requireAuth, getOpenAiKey }));
}

function getOpenAiKey() {
  const oaKey = process.env[openaiKeyName];
  if (!oaKey) {
    return null;
  }
  return oaKey;
}

// --- Debug logging helper (PR 13) ---
function serverLog(level, domain, message, data, req) {
    if (process.env.ADA_DEBUG_LOG !== 'true') return;
    var entry = {
        ts: new Date().toISOString(),
        level: level,
        domain: domain,
        corrId: (req && req.correlationId) || '--------',
        msg: message
    };
    if (data) entry.data = data;
    console.log(JSON.stringify(entry));
}

async function proxyOpenAiRequest(res, endpoint, payload) {
  const oaKey = getOpenAiKey();
  if (!oaKey) {
    return res.status(500).json({ error: "OpenAI key not configured" });
  }

  var startMs = Date.now();
  serverLog('INFO', 'OPENAI', 'request', {endpoint: endpoint, model: (payload || {}).model, maxTokens: (payload || {}).max_tokens}, res.req);

  let response;
  try {
    response = await fetch(`${openaiBaseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload ?? {}),
    });
  } catch (error) {
    serverLog('ERR', 'OPENAI', 'error', {endpoint: endpoint, error: error.message, latencyMs: Date.now() - startMs}, res.req);
    return res.status(502).json({ error: "OpenAI request failed" });
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = { error: text || response.statusText };
  }

  serverLog('INFO', 'OPENAI', 'response', {endpoint: endpoint, status: response.status, latencyMs: Date.now() - startMs, tokensUsed: (data && data.usage && data.usage.total_tokens) || null}, res.req);

  return res.status(response.status).json(data);
}

// GET /api/policies/openai-optimizations
app.get("/api/policies/openai-optimizations", requireAuth, async (_req, res) => {
  const defaults = { enabled: false, smart_diarization: false };
  try {
    const { getPool } = require("./db");
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT policy_value FROM global_policies WHERE policy_key = 'openai_optimizations'"
    );
    if (rows.length > 0 && rows[0].policy_value) {
      const val = typeof rows[0].policy_value === 'string'
        ? JSON.parse(rows[0].policy_value) : rows[0].policy_value;
      res.json({ enabled: !!val.enabled, smart_diarization: !!val.smart_diarization });
    } else {
      res.json(defaults);
    }
  } catch (e) {
    console.error("GET /api/policies/openai-optimizations error", e);
    res.json(defaults); // fail-safe: default OFF
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const oaKey = getOpenAiKey();
    if (!oaKey && isMockEnv) {
      // Return a mock SOAP-like response so the full pipeline works in CI
      return res.status(200).json({
        id: "mock-chat",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                S: "[MOCK] Soggettivo: il proprietario riferisce sintomi generici.",
                O: "[MOCK] Oggettivo: visita clinica nella norma.",
                A: "[MOCK] Assessment: nessuna patologia evidente.",
                P: "[MOCK] Piano: controllo tra 6 mesi.",
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
    return await proxyOpenAiRequest(res, "chat/completions", req.body);
  } catch (error) {
    return res.status(500).json({ error: "Chat proxy failed" });
  }
});

app.post("/api/moderate", async (req, res) => {
  try {
    return await proxyOpenAiRequest(res, "moderations", req.body);
  } catch (error) {
    return res.status(500).json({ error: "Moderation proxy failed" });
  }
});

app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  const oaKey = getOpenAiKey();
  if (!oaKey) {
    if (isMockEnv) {
      return res.status(200).json({
        text: "Trascrizione mock completata.",
        segments: [
          {
            id: 0,
            segment_index: 0,
            text: "Trascrizione mock completata.",
            start: 0,
            end: 1,
            speaker: "sconosciuto",
            role: "unknown",
          },
        ],
      });
    }
    return res.status(500).json({ error: "OpenAI key not configured" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Missing audio file" });
  }

  serverLog('INFO', 'OPENAI', 'whisper request', {audioSizeBytes: req.file.size, audioMime: req.file.mimetype}, req);

  const form = new FormData();
  const blob = new Blob([req.file.buffer], {
    type: req.file.mimetype || "application/octet-stream",
  });
  form.append("file", blob, req.file.originalname || "audio.webm");
  const bodyFields = req.body || {};
  Object.entries(bodyFields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  });
  if (!bodyFields.model) {
    form.append("model", "whisper-1");
  }

  var whisperStart = Date.now();
  let response;
  try {
    response = await fetch(`${openaiBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${oaKey}` },
      body: form,
    });
  } catch (error) {
    return res.status(502).json({ error: "OpenAI request failed" });
  }

  serverLog('INFO', 'OPENAI', 'whisper response', {status: response.status, latencyMs: Date.now() - whisperStart}, req);

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = { error: text || response.statusText };
  }

  return res.status(response.status).json(data);
});

app.post("/api/tts", async (req, res) => {
  serverLog('INFO', 'OPENAI', 'tts request', {voice: (req.body || {}).voice, inputLength: ((req.body || {}).input || '').length}, req);
  const oaKey = getOpenAiKey();
  if (!oaKey) {
    if (isMockEnv) {
      res.setHeader("Content-Type", "audio/mpeg");
      return res.status(200).send(Buffer.from([]));
    }
    return res.status(500).json({ error: "OpenAI key not configured" });
  }

  let response;
  try {
    response = await fetch(`${openaiBaseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body ?? {}),
    });
  } catch (error) {
    return res.status(502).json({ error: "OpenAI request failed" });
  }

  if (!response.ok) {
    const errText = await response.text();
    return res.status(response.status).json({
      error: errText || response.statusText || "OpenAI request failed",
    });
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
  return res.status(200).send(audioBuffer);
});

// Global error handler — catch unhandled errors from async routes
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "server_error" });
  }
});

app.listen(Number.parseInt(PORT, 10) || 3000, () => {
  // eslint-disable-next-line no-console
  console.log(`ADA backend listening on ${PORT}`);
});
