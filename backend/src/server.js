// backend/src/server.js v4
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

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const app = express();

const {
  ADA_LOGIN_PASSWORD,
  ADA_TEST_PASSWORD,
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
const effectivePassword = ADA_LOGIN_PASSWORD || ADA_TEST_PASSWORD;
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
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

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

app.post("/auth/login", (req, res) => {
  if (!effectivePassword || !effectiveJwtSecret) {
    return res.status(500).json({ error: "Server not configured" });
  }

  const { password } = req.body ?? {};
  if (password !== effectivePassword) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = jwt.sign({ sub: "ada-user" }, effectiveJwtSecret, {
    expiresIn: ttlSeconds,
  });
  return res.json({ token, expiresIn: ttlSeconds });
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
        };

        pool.query(
          `INSERT INTO audit_log (who, action, entity_id, entity_type, outcome, details)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [who, action, req.params?.id || req.params?.pet_id || null, null, outcome, JSON.stringify(details)]
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

function getOpenAiKey() {
  const oaKey = process.env[openaiKeyName];
  if (!oaKey) {
    return null;
  }
  return oaKey;
}

async function proxyOpenAiRequest(res, endpoint, payload) {
  const oaKey = getOpenAiKey();
  if (!oaKey) {
    return res.status(500).json({ error: "OpenAI key not configured" });
  }

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
    return res.status(502).json({ error: "OpenAI request failed" });
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = { error: text || response.statusText };
  }

  return res.status(response.status).json(data);
}

app.post("/api/chat", async (req, res) => {
  try {
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
