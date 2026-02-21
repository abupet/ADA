// backend/src/chatbot.routes.js v1
// Chatbot AI assistant API routes

const express = require("express");
const { getPool } = require("./db");
const { randomUUID } = require("crypto");
const { enrichSystemPrompt } = require("./rag.service");

// --- Constants ---
const SESSION_TIMEOUT_MINUTES = 30;
const MAX_MESSAGES_PER_SESSION = 50;
const MAX_HISTORY_MESSAGES = 50;

const CHATBOT_SYSTEM_PROMPT = [
  "Sei l\u2019Assistente ADA, un assistente veterinario digitale progettato per aiutare i proprietari di animali domestici a valutare i sintomi e decidere il livello di urgenza.",
  "",
  "REGOLE FONDAMENTALI:",
  "1. Rispondi SEMPRE in italiano.",
  "2. NON fare mai diagnosi. Sei un assistente di triage, non un veterinario.",
  "3. Sii empatico, chiaro e rassicurante.",
  "4. Fai domande mirate per raccogliere informazioni utili al triage.",
  "5. NON ripetere in ogni messaggio di consultare il veterinario. L'utente vede gi\u00e0 il disclaimer permanente che le informazioni non sostituiscono il parere del veterinario. Suggerisci la visita veterinaria SOLO quando rilevi sintomi sospetti o preoccupanti (triage GIALLO o ROSSO). Per triage VERDE, non menzionare il veterinario a meno che i sintomi non persistano.",
  "",
  "LIVELLI DI TRIAGE:",
  "- VERDE (green): Situazione da monitorare a casa. Nessuna urgenza immediata. Consigliare osservazione e visita di routine se i sintomi persistono.",
  "- GIALLO (yellow): Consigliata visita veterinaria programmata entro 24-48 ore. Sintomi che richiedono attenzione professionale ma non sono emergenze immediate.",
  "- ROSSO (red): EMERGENZA. Consigliare visita veterinaria IMMEDIATA o pronto soccorso veterinario. Sintomi potenzialmente pericolosi per la vita.",
  "",
  "DISCLAIMER (EU AI Act):",
  "- Questo sistema di intelligenza artificiale non sostituisce il parere di un medico veterinario.",
  "- Le informazioni fornite hanno esclusivamente scopo informativo e di orientamento.",
  "- In caso di dubbio, rivolgersi sempre al proprio veterinario di fiducia.",
  "- Conformemente al Regolamento UE sull\u2019Intelligenza Artificiale (AI Act), questo sistema \u00e8 classificato come applicazione a rischio limitato e fornisce informazioni di supporto, non decisioni cliniche.",
  "",
  "FORMATO RISPOSTA:",
  "Alla fine di OGNI tua risposta, aggiungi un commento nascosto con il triage strutturato nel seguente formato esatto:",
  "<!--TRIAGE:{\"level\":\"green|yellow|red\",\"action\":\"monitor|vet_appointment|emergency\",\"follow_up\":[\"domanda1\",\"domanda2\"]}-->",
  "",
  "Il campo \"action\" corrisponde al livello:",
  "- green \u2192 \"monitor\"",
  "- yellow \u2192 \"vet_appointment\"",
  "- red \u2192 \"emergency\"",
  "",
  "Il campo \"follow_up\" contiene 1-3 domande di approfondimento suggerite per continuare la conversazione."
].join("\n");

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// --- Helper Functions ---

/**
 * Build pet context string from pets table + pet_tags.
 * Returns a string truncated to 2000 chars.
 */
async function buildPetContext(pool, petId, userId) {
  try {
    const petResult = await pool.query(
      `SELECT name, species, breed, sex, birthdate, weight_kg, notes
       FROM pets WHERE pet_id = $1 AND owner_user_id = $2 LIMIT 1`,
      [petId, userId]
    );

    if (!petResult.rows[0]) return "";

    const pet = petResult.rows[0];
    const parts = [];
    if (pet.name) parts.push(`Nome: ${pet.name}`);
    if (pet.species) parts.push(`Specie: ${pet.species}`);
    if (pet.breed) parts.push(`Razza: ${pet.breed}`);
    if (pet.sex) parts.push(`Sesso: ${pet.sex}`);
    if (pet.birthdate) {
      const age = _calculateAge(pet.birthdate);
      parts.push(`Data di nascita: ${pet.birthdate} (${age})`);
    }
    if (pet.weight_kg) parts.push(`Peso: ${pet.weight_kg} kg`);
    if (pet.notes) parts.push(`Note: ${pet.notes}`);

    // Fetch tags
    try {
      const tagsResult = await pool.query(
        `SELECT tag_key, tag_value FROM pet_tags WHERE pet_id = $1 ORDER BY tag_key`,
        [petId]
      );
      if (tagsResult.rows.length > 0) {
        const tagsStr = tagsResult.rows
          .map((t) => `${t.tag_key}: ${t.tag_value}`)
          .join(", ");
        parts.push(`Tag: ${tagsStr}`);
      }
    } catch (e) {
      // pet_tags table may not exist; skip silently
      if (e.code !== "42P01") {
        console.warn("buildPetContext: pet_tags query failed", e.message);
      }
    }

    const context = parts.join("\n");
    return context.substring(0, 2000);
  } catch (e) {
    if (e.code === "42P01") return "";
    console.warn("buildPetContext error", e.message);
    return "";
  }
}

/**
 * Calculate approximate age string from date of birth.
 */
function _calculateAge(dob) {
  const birth = new Date(dob);
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  if (years > 0) {
    return months < 0
      ? `circa ${years - 1} anni e ${12 + months} mesi`
      : `circa ${years} anni`;
  }
  const totalMonths = years * 12 + months;
  return totalMonths > 0 ? `circa ${totalMonths} mesi` : "meno di 1 mese";
}

/**
 * Parse triage JSON from <!--TRIAGE:{...}--> comment in response content.
 * Returns parsed object or null.
 */
function parseTriageFromResponse(content) {
  if (!content || typeof content !== "string") return null;
  const match = content.match(/<!--TRIAGE:(.*?)-->/s);
  if (!match || !match[1]) return null;
  try {
    const triage = JSON.parse(match[1].trim());
    const validLevels = ["green", "yellow", "red"];
    const validActions = ["monitor", "vet_appointment", "emergency"];
    if (
      !triage.level ||
      !validLevels.includes(triage.level) ||
      !triage.action ||
      !validActions.includes(triage.action)
    ) {
      return null;
    }
    return {
      level: triage.level,
      action: triage.action,
      follow_up: Array.isArray(triage.follow_up) ? triage.follow_up : [],
    };
  } catch (e) {
    return null;
  }
}

/**
 * Remove the <!--TRIAGE:{...}--> comment block from visible text.
 */
function cleanResponseContent(content) {
  if (!content || typeof content !== "string") return content || "";
  return content.replace(/<!--TRIAGE:.*?-->/gs, "").trim();
}

/**
 * Check if chatbot is enabled for the user via communication_settings.
 * Returns true if enabled, false otherwise.
 */
async function requireAiEnabled(pool, userId) {
  try {
    const result = await pool.query(
      `SELECT chatbot_enabled FROM communication_settings WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!result.rows[0]) {
      // No settings row means default: enabled
      return true;
    }
    return result.rows[0].chatbot_enabled === true;
  } catch (e) {
    if (e.code === "42P01") return true;
    console.warn("requireAiEnabled error", e.message);
    return true;
  }
}

// --- Mock response for test/CI environments ---
const MOCK_ASSISTANT_RESPONSE = {
  content:
    "Capisco la tua preoccupazione. Da quello che descrivi, sembra una situazione da monitorare con attenzione. " +
    "Ti consiglio di osservare il comportamento del tuo animale nelle prossime ore e, se i sintomi persistono o peggiorano, " +
    "di contattare il tuo veterinario per una visita di controllo.\n\n" +
    "Ricorda che sono un assistente digitale e non posso sostituire il parere di un medico veterinario. " +
    "In caso di dubbio, consulta sempre un professionista.\n\n" +
    '<!--TRIAGE:{"level":"green","action":"monitor","follow_up":["Da quanto tempo noti questi sintomi?","Il tuo animale mangia e beve regolarmente?","Hai notato altri cambiamenti nel comportamento?"]}-->',
  triage: {
    level: "green",
    action: "monitor",
    follow_up: [
      "Da quanto tempo noti questi sintomi?",
      "Il tuo animale mangia e beve regolarmente?",
      "Hai notato altri cambiamenti nel comportamento?",
    ],
  },
};

// --- Router Factory ---

function chatbotRouter({ requireAuth, getOpenAiKey, isMockEnv }) {
  const router = express.Router();
  const pool = getPool();

  // POST /api/chatbot/sessions -- create a new chat session
  router.post("/api/chatbot/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });

      // Check if chatbot is enabled for this user
      const enabled = await requireAiEnabled(pool, userId);
      if (!enabled) {
        return res.status(403).json({ error: "chatbot_disabled" });
      }

      const { pet_id } = req.body || {};
      if (pet_id && !isValidUuid(pet_id)) {
        return res.status(400).json({ error: "invalid_pet_id" });
      }

      const sessionId = randomUUID();
      const now = new Date().toISOString();

      await pool.query(
        `INSERT INTO chat_sessions (session_id, owner_user_id, pet_id, status, message_count, created_at)
         VALUES ($1, $2, $3, 'active', 0, $4)`,
        [sessionId, userId, pet_id || null, now]
      );

      res.status(201).json({
        session: {
          session_id: sessionId,
          owner_user_id: userId,
          pet_id: pet_id || null,
          status: "active",
          message_count: 0,
          created_at: now,
        },
      });
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(500).json({ error: "chat_sessions_table_not_found" });
      }
      console.error("POST /api/chatbot/sessions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/chatbot/sessions -- list user sessions
  router.get("/api/chatbot/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: "unauthorized" });

      const { rows } = await pool.query(
        `SELECT session_id, owner_user_id, pet_id, status, message_count, summary, triage_level, created_at, last_message_at
         FROM chat_sessions WHERE owner_user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );

      res.json({ sessions: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ sessions: [] });
      console.error("GET /api/chatbot/sessions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/chatbot/sessions/:id -- session detail with messages
  router.get("/api/chatbot/sessions/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_session_id" });

      const sessionResult = await pool.query(
        `SELECT session_id, owner_user_id, pet_id, status, message_count, summary, triage_level, created_at, last_message_at
         FROM chat_sessions WHERE session_id = $1 AND owner_user_id = $2 LIMIT 1`,
        [id, userId]
      );

      if (!sessionResult.rows[0]) {
        return res.status(404).json({ error: "session_not_found" });
      }

      // Fetch messages
      let messages = [];
      try {
        const msgResult = await pool.query(
          `SELECT message_id, session_id, role, content, triage_level, triage_action, follow_up_questions, created_at
           FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
          [id]
        );
        messages = msgResult.rows.map((m) => ({
          ...m,
          content: m.role === "assistant" ? cleanResponseContent(m.content) : m.content,
        }));
      } catch (e) {
        if (e.code !== "42P01") {
          console.warn("GET session messages error", e.message);
        }
      }

      res.json({
        session: sessionResult.rows[0],
        messages,
      });
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "session_not_found" });
      console.error("GET /api/chatbot/sessions/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/chatbot/sessions/:id/message -- send a message (THE CORE)
  router.post("/api/chatbot/sessions/:id/message", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_session_id" });

      const { content } = req.body || {};
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "content_required" });
      }

      // Check if chatbot is enabled
      const enabled = await requireAiEnabled(pool, userId);
      if (!enabled) {
        return res.status(403).json({ error: "chatbot_disabled" });
      }

      // Fetch session
      const sessionResult = await pool.query(
        `SELECT session_id, owner_user_id, pet_id, status, message_count, created_at, last_message_at
         FROM chat_sessions WHERE session_id = $1 AND owner_user_id = $2 LIMIT 1`,
        [id, userId]
      );

      if (!sessionResult.rows[0]) {
        return res.status(404).json({ error: "session_not_found" });
      }

      const session = sessionResult.rows[0];

      // Validate session is active
      if (session.status !== "active") {
        return res.status(400).json({ error: "session_closed" });
      }

      // Check session timeout
      const lastActive = new Date(session.last_message_at || session.created_at);
      const now = new Date();
      const minutesSinceUpdate = (now - lastActive) / (1000 * 60);
      if (minutesSinceUpdate > SESSION_TIMEOUT_MINUTES) {
        // Auto-close expired session
        await pool.query(
          `UPDATE chat_sessions SET status = 'expired', last_message_at = NOW() WHERE session_id = $1`,
          [id]
        );
        return res.status(400).json({ error: "session_expired" });
      }

      // Check message limit
      if (session.message_count >= MAX_MESSAGES_PER_SESSION) {
        return res.status(400).json({ error: "message_limit_reached", limit: MAX_MESSAGES_PER_SESSION });
      }

      // Save user message
      const userMsgId = randomUUID();
      await pool.query(
        `INSERT INTO chat_messages (message_id, session_id, role, content, created_at)
         VALUES ($1, $2, 'user', $3, NOW())`,
        [userMsgId, id, content.trim()]
      );

      // --- Build AI response ---
      let assistantContent;
      let triageData;

      if (isMockEnv) {
        // Mock mode: return static response without calling OpenAI
        assistantContent = MOCK_ASSISTANT_RESPONSE.content;
        triageData = MOCK_ASSISTANT_RESPONSE.triage;
      } else {
        // Build OpenAI payload
        const petContext = session.pet_id
          ? await buildPetContext(pool, session.pet_id, userId)
          : "";

        let systemContent = petContext
          ? `${CHATBOT_SYSTEM_PROMPT}\n\nINFORMAZIONI SULL'ANIMALE:\n${petContext}`
          : CHATBOT_SYSTEM_PROMPT;

        // RAG: enrich system prompt with veterinary knowledge base
        systemContent = await enrichSystemPrompt(pool, getOpenAiKey, systemContent, content || petContext || '', { sourceService: 'chatbot', petId: session.pet_id });

        // Fetch last N history messages for context
        const historyResult = await pool.query(
          `SELECT role, content FROM chat_messages
           WHERE session_id = $1
           ORDER BY created_at DESC LIMIT $2`,
          [id, MAX_HISTORY_MESSAGES]
        );
        // Reverse to get chronological order (the query returns newest first)
        const historyMessages = historyResult.rows.reverse().map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const openaiMessages = [
          { role: "system", content: systemContent },
          ...historyMessages,
        ];

        // First call with gpt-4o-mini (fast, cost-effective)
        const apiKey = getOpenAiKey();
        if (!apiKey) {
          return res.status(500).json({ error: "openai_key_not_configured" });
        }

        let model = "gpt-4o-mini";
        let aiResponse = await _callOpenAi(apiKey, model, openaiMessages);

        if (!aiResponse.ok) {
          console.error("OpenAI chatbot error", aiResponse.status, aiResponse.errorBody);
          return res.status(502).json({ error: "ai_request_failed" });
        }

        assistantContent = aiResponse.content;
        triageData = parseTriageFromResponse(assistantContent);

        // If triage is yellow or red, re-call with gpt-4o for higher quality
        if (triageData && (triageData.level === "yellow" || triageData.level === "red")) {
          model = "gpt-4o";
          const upgradeResponse = await _callOpenAi(apiKey, model, openaiMessages);
          if (upgradeResponse.ok) {
            assistantContent = upgradeResponse.content;
            const upgradedTriage = parseTriageFromResponse(assistantContent);
            if (upgradedTriage) {
              triageData = upgradedTriage;
            }
          }
          // If upgrade fails, keep the mini response
        }

        // Fallback triage if parsing failed
        if (!triageData) {
          triageData = { level: "green", action: "monitor", follow_up: [] };
        }
      }

      // Save assistant message
      const assistantMsgId = randomUUID();
      await pool.query(
        `INSERT INTO chat_messages (message_id, session_id, role, content, triage_level, triage_action, follow_up_questions, created_at)
         VALUES ($1, $2, 'assistant', $3, $4, $5, $6, NOW())`,
        [assistantMsgId, id, assistantContent, triageData.level, triageData.action, JSON.stringify(triageData.follow_up)]
      );

      // Update session stats
      await pool.query(
        `UPDATE chat_sessions
         SET message_count = message_count + 2,
             triage_level = $1,
             last_message_at = NOW()
         WHERE session_id = $2`,
        [triageData.level, id]
      );

      res.json({
        message: {
          message_id: assistantMsgId,
          session_id: id,
          role: "assistant",
          content: cleanResponseContent(assistantContent),
          triage_level: triageData.level,
          triage_data: triageData,
          created_at: new Date().toISOString(),
        },
        user_message_id: userMsgId,
      });
    } catch (e) {
      if (e.code === "42P01") {
        return res.status(500).json({ error: "chat_tables_not_found" });
      }
      console.error("POST /api/chatbot/sessions/:id/message error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/chatbot/sessions/:id/close -- close a session
  router.post("/api/chatbot/sessions/:id/close", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_session_id" });

      // Verify session belongs to user
      const sessionResult = await pool.query(
        `SELECT session_id, status FROM chat_sessions WHERE session_id = $1 AND owner_user_id = $2 LIMIT 1`,
        [id, userId]
      );

      if (!sessionResult.rows[0]) {
        return res.status(404).json({ error: "session_not_found" });
      }

      if (sessionResult.rows[0].status === "closed") {
        return res.json({ ok: true, already_closed: true });
      }

      // Generate summary from last few messages
      let summary = "";
      try {
        const msgResult = await pool.query(
          `SELECT role, content FROM chat_messages
           WHERE session_id = $1
           ORDER BY created_at DESC LIMIT 6`,
          [id]
        );
        if (msgResult.rows.length > 0) {
          const summaryParts = msgResult.rows.reverse().map((m) => {
            const cleanContent =
              m.role === "assistant" ? cleanResponseContent(m.content) : m.content;
            const prefix = m.role === "user" ? "Utente" : "Assistente";
            return `${prefix}: ${cleanContent.substring(0, 150)}`;
          });
          summary = summaryParts.join(" | ").substring(0, 500);
        }
      } catch (e) {
        // If messages table does not exist, leave summary empty
        if (e.code !== "42P01") {
          console.warn("close session: summary generation failed", e.message);
        }
      }

      await pool.query(
        `UPDATE chat_sessions SET status = 'closed', summary = $1, closed_at = NOW(), last_message_at = NOW() WHERE session_id = $2`,
        [summary || null, id]
      );

      res.json({ ok: true, summary: summary || null });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "chat_sessions_table_not_found" });
      console.error("POST /api/chatbot/sessions/:id/close error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // DELETE /api/chatbot/sessions/:id -- delete a session
  router.delete("/api/chatbot/sessions/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.sub;
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_session_id" });

      // Verify session belongs to user
      const sessionResult = await pool.query(
        `SELECT session_id FROM chat_sessions WHERE session_id = $1 AND owner_user_id = $2 LIMIT 1`,
        [id, userId]
      );

      if (!sessionResult.rows[0]) {
        return res.status(404).json({ error: "session_not_found" });
      }

      // chat_messages has ON DELETE CASCADE from chat_sessions, so just delete the session
      await pool.query(`DELETE FROM chat_sessions WHERE session_id = $1`, [id]);

      res.json({ ok: true, deleted: id });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "chat_sessions_table_not_found" });
      console.error("DELETE /api/chatbot/sessions/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

// --- Internal: call OpenAI chat completions ---
async function _callOpenAi(apiKey, model, messages) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, status: response.status, errorBody: errorText, content: null };
    }

    const data = await response.json();
    const content =
      data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;

    if (!content) {
      return { ok: false, status: 200, errorBody: "empty_response", content: null };
    }

    return { ok: true, status: 200, content };
  } catch (e) {
    return { ok: false, status: 0, errorBody: e.message, content: null };
  }
}

module.exports = { chatbotRouter };
