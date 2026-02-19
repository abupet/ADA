// backend/src/communication.routes.js v2
// Communication system REST API: unified messaging (human + AI),
// AI settings, conversations, messages, unread counts, delivery status, reply, soft delete

const express = require("express");
const crypto = require("crypto");
const { getPool } = require("./db");
const { requireRole } = require("./rbac.middleware");

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// --- AI constants (migrated from chatbot.routes.js) ---
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
  "5. REGOLA CRITICA SUL VETERINARIO:",
  "   - L'utente vede GI\u00c0 un disclaimer permanente: 'le informazioni non sostituiscono il parere del veterinario'.",
  "   - NON ripetere MAI di consultare il veterinario se il triage \u00e8 VERDE.",
  "   - NON scrivere frasi come 'ti consiglio di consultare il veterinario', 'sarebbe opportuno far valutare', 'meglio sentire il veterinario', etc. quando la situazione \u00e8 verde.",
  "   - Suggerisci la visita veterinaria SOLO se rilevi sintomi sospetti o preoccupanti che giustificano un triage GIALLO o ROSSO.",
  "   - In caso di triage VERDE, concentrati su consigli pratici di monitoraggio casalingo SENZA menzionare il veterinario.",
  "   - Anche con triage GIALLO, menziona il veterinario UNA SOLA VOLTA, non ripeterlo in ogni messaggio.",
  "",
  "LIVELLI DI TRIAGE:",
  "- VERDE (green): Situazione da monitorare a casa. Nessuna urgenza. NON menzionare il veterinario.",
  "- GIALLO (yellow): Consigliata visita veterinaria programmata entro 24-48 ore. Menzionalo UNA volta.",
  "- ROSSO (red): EMERGENZA. Consigliare visita veterinaria IMMEDIATA.",
  "",
  "DISCLAIMER (EU AI Act):",
  "- Questo sistema di intelligenza artificiale non sostituisce il parere di un medico veterinario.",
  "",
  "FORMATO RISPOSTA:",
  "Alla fine di OGNI tua risposta, aggiungi un commento nascosto con il triage strutturato nel seguente formato esatto:",
  '<!--TRIAGE:{"level":"green|yellow|red","action":"monitor|vet_appointment|emergency","follow_up":["domanda1","domanda2"]}-->',
].join("\n");

const MOCK_ASSISTANT_RESPONSE = {
  content:
    "Capisco la tua preoccupazione. Da quello che descrivi, sembra una situazione tranquilla da monitorare. " +
    "Ti consiglio di osservare il comportamento del tuo animale nelle prossime ore e di annotare eventuali cambiamenti.\n\n" +
    '<!--TRIAGE:{"level":"green","action":"monitor","follow_up":["Da quanto tempo noti questi sintomi?","Il tuo animale mangia e beve regolarmente?"]}-->',
  triage: { level: "green", action: "monitor", follow_up: ["Da quanto tempo noti questi sintomi?", "Il tuo animale mangia e beve regolarmente?"] },
};

// --- AI helper functions (from chatbot.routes.js) ---

async function buildPetContext(pool, petId, userId) {
  try {
    const petResult = await pool.query(
      `SELECT name, species, breed, sex, birthdate, weight_kg, notes, extra_data FROM pets WHERE pet_id = $1 LIMIT 1`,
      [petId]
    );
    if (!petResult.rows[0]) return "";
    const pet = petResult.rows[0];
    const parts = [];
    if (pet.name) parts.push(`Nome: ${pet.name}`);
    if (pet.species) parts.push(`Specie: ${pet.species}`);
    if (pet.breed) parts.push(`Razza: ${pet.breed}`);
    if (pet.sex) parts.push(`Sesso: ${pet.sex}`);
    if (pet.birthdate) parts.push(`Data di nascita: ${pet.birthdate}`);
    if (pet.weight_kg) parts.push(`Peso: ${pet.weight_kg} kg`);
    if (pet.notes) parts.push(`Note: ${pet.notes}`);
    // PR4: Include lifestyle data from extra_data
    try {
      const extra = typeof pet.extra_data === "string" ? JSON.parse(pet.extra_data || "{}") : (pet.extra_data || {});
      const ls = extra.lifestyle || {};
      const lsParts = [];
      if (ls.lifestyle) lsParts.push(`ambiente: ${ls.lifestyle}`);
      if (ls.activityLevel) lsParts.push(`attività: ${ls.activityLevel}`);
      if (ls.dietType) lsParts.push(`dieta: ${ls.dietType}`);
      if (ls.knownConditions) lsParts.push(`patologie: ${ls.knownConditions}`);
      if (ls.currentMeds) lsParts.push(`farmaci: ${ls.currentMeds}`);
      if (ls.behaviorNotes) lsParts.push(`comportamento: ${ls.behaviorNotes}`);
      if (lsParts.length > 0) parts.push(`Stile di vita: ${lsParts.join(", ")}`);
    } catch (_) { /* extra_data parse error, skip */ }
    try {
      const tagsResult = await pool.query(`SELECT tag_key, tag_value FROM pet_tags WHERE pet_id = $1 ORDER BY tag_key`, [petId]);
      if (tagsResult.rows.length > 0) parts.push(`Tag: ${tagsResult.rows.map(t => `${t.tag_key}: ${t.tag_value}`).join(", ")}`);
    } catch (e) { if (e.code !== "42P01") console.warn("buildPetContext: pet_tags error", e.message); }
    return parts.join("\n").substring(0, 2000);
  } catch (e) { return ""; }
}

function parseTriageFromResponse(content) {
  if (!content || typeof content !== "string") return null;
  const match = content.match(/<!--TRIAGE:(.*?)-->/s);
  if (!match || !match[1]) return null;
  try {
    const triage = JSON.parse(match[1].trim());
    const validLevels = ["green", "yellow", "red"];
    const validActions = ["monitor", "vet_appointment", "emergency"];
    if (!triage.level || !validLevels.includes(triage.level) || !triage.action || !validActions.includes(triage.action)) return null;
    return { level: triage.level, action: triage.action, follow_up: Array.isArray(triage.follow_up) ? triage.follow_up : [] };
  } catch (e) { return null; }
}

function cleanResponseContent(content) {
  if (!content || typeof content !== "string") return content || "";
  return content.replace(/<!--TRIAGE:.*?-->/gs, "").trim();
}

async function requireAiEnabled(pool, userId) {
  try {
    const result = await pool.query(`SELECT chatbot_enabled FROM communication_settings WHERE user_id = $1 LIMIT 1`, [userId]);
    if (!result.rows[0]) return true;
    return result.rows[0].chatbot_enabled === true;
  } catch (e) { return true; }
}

async function _callOpenAi(apiKey, model, messages) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 }),
    });
    if (!response.ok) { const errorText = await response.text(); return { ok: false, status: response.status, errorBody: errorText, content: null }; }
    const data = await response.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
    if (!content) return { ok: false, status: 200, errorBody: "empty_response", content: null };
    return { ok: true, status: 200, content };
  } catch (e) { return { ok: false, status: 0, errorBody: e.message, content: null }; }
}

/**
 * Communication router factory.
 * @param {{ requireAuth: Function, getOpenAiKey?: Function, isMockEnv?: boolean }} opts
 */
function communicationRouter({ requireAuth, getOpenAiKey, isMockEnv }) {
  const router = express.Router();
  const pool = getPool();

  // --- Helpers ---
  async function getConversationIfAllowed(conversationId, userId, role) {
    // Direct participant check (always works regardless of role)
    const { rows } = await pool.query(
      "SELECT * FROM conversations WHERE conversation_id = $1 AND (owner_user_id = $2 OR vet_user_id = $2) LIMIT 1",
      [conversationId, userId]
    );
    if (rows[0]) return rows[0];

    // Role-based pet access: if user has access to the pet, allow viewing conversation
    if (role) {
      const convRes = await pool.query("SELECT * FROM conversations WHERE conversation_id = $1 LIMIT 1", [conversationId]);
      const conv = convRes.rows[0];
      if (!conv || !conv.pet_id) return null;

      if (role === 'vet_int' || role === 'super_admin' || role === 'vet') {
        return conv; // global pet access
      }
      if (role === 'vet_ext') {
        const petRes = await pool.query("SELECT 1 FROM pets WHERE pet_id = $1 AND referring_vet_user_id = $2 LIMIT 1", [conv.pet_id, userId]);
        return petRes.rows[0] ? conv : null;
      }
      if (role === 'owner') {
        const petRes = await pool.query("SELECT 1 FROM pets WHERE pet_id = $1 AND owner_user_id = $2 LIMIT 1", [conv.pet_id, userId]);
        return petRes.rows[0] ? conv : null;
      }
    }
    return null;
  }

  // --- AI Settings ---
  router.get("/api/communication/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      await pool.query("INSERT INTO communication_settings (user_id, chatbot_enabled) VALUES ($1, true) ON CONFLICT (user_id) DO NOTHING", [userId]);
      const { rows } = await pool.query(
        "SELECT user_id, chatbot_enabled, auto_transcription_enabled, created_at, updated_at FROM communication_settings WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      res.json(rows[0] || { user_id: userId, chatbot_enabled: true, auto_transcription_enabled: false });
    } catch (e) {
      if (e.code === "42P01") return res.json({ user_id: req.user.sub, chatbot_enabled: true, auto_transcription_enabled: false });
      console.error("GET /api/communication/settings error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.patch("/api/communication/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { chatbot_enabled, auto_transcription_enabled } = req.body;
      const setClauses = []; const values = []; let paramIndex = 1;
      if (typeof chatbot_enabled === "boolean") { setClauses.push("chatbot_enabled = $" + paramIndex++); values.push(chatbot_enabled); }
      if (typeof auto_transcription_enabled === "boolean") { setClauses.push("auto_transcription_enabled = $" + paramIndex++); values.push(auto_transcription_enabled); }
      if (setClauses.length === 0) return res.status(400).json({ error: "no_valid_fields" });
      setClauses.push("updated_at = NOW()"); values.push(userId);
      const { rows } = await pool.query("UPDATE communication_settings SET " + setClauses.join(", ") + " WHERE user_id = $" + paramIndex + " RETURNING *", values);
      if (!rows[0]) return res.status(404).json({ error: "settings_not_found" });
      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "settings_not_found" });
      console.error("PATCH /api/communication/settings error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Users lookup ---
  router.get("/api/communication/users", requireAuth, async (req, res) => {
    try {
      const roleParam = req.query.role;
      // Map role param to DB roles
      let dbRoles;
      if (roleParam === "vet" || roleParam === "vet_int") {
        dbRoles = ["vet_int"];
      } else if (roleParam === "vet_ext") {
        dbRoles = ["vet_ext"];
      } else if (roleParam === "owner") {
        dbRoles = ["owner"];
      } else {
        return res.status(400).json({ error: "invalid_role" });
      }
      const { rows } = await pool.query(
        "SELECT user_id, email, display_name, base_role FROM users WHERE base_role = ANY($1) AND status = 'active' AND user_id != $2 ORDER BY display_name, email",
        [dbRoles, req.user.sub]
      );
      res.json({ users: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ users: [] });
      console.error("GET /api/communication/users error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/users/:id/presence
  router.get("/api/communication/users/:id/presence", requireAuth, async (req, res) => {
    try {
      const targetId = req.params.id;
      if (targetId === "ada-assistant") return res.json({ online: true, last_seen_at: null });
      const { isUserOnline } = require("./websocket");
      const online = isUserOnline(targetId);
      let lastSeen = null;
      try {
        const { rows } = await pool.query("SELECT last_seen_at FROM users WHERE user_id = $1 LIMIT 1", [targetId]);
        if (rows[0]) lastSeen = rows[0].last_seen_at;
      } catch (_) {}
      res.json({ online, last_seen_at: lastSeen });
    } catch (e) {
      res.json({ online: false, last_seen_at: null });
    }
  });

  // --- Owner / Vet-ext lookups (for pet data dropdowns) ---
  router.get("/api/communication/owners", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT user_id, display_name, email, base_role FROM users WHERE base_role = 'owner' AND status = 'active' ORDER BY display_name, email"
      );
      res.json({ users: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ users: [] });
      res.status(500).json({ error: "server_error" });
    }
  });

  router.get("/api/communication/vet-exts", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT user_id, display_name, email, base_role FROM users WHERE base_role = 'vet_ext' AND status = 'active' ORDER BY display_name, email"
      );
      res.json({ users: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ users: [] });
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Conversations ---

  // POST /api/communication/conversations/call — create call conversation
  router.post("/api/communication/conversations/call", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { parent_conversation_id, call_type, call_id } = req.body;

      if (!parent_conversation_id || !isValidUuid(parent_conversation_id)) {
        return res.status(400).json({ error: "invalid_parent_conversation_id" });
      }
      if (!call_type || !["voice_call", "video_call"].includes(call_type)) {
        return res.status(400).json({ error: "invalid_call_type" });
      }

      const parentQ = await pool.query(
        "SELECT conversation_id, pet_id, owner_user_id, vet_user_id, subject " +
        "FROM conversations WHERE conversation_id = $1 AND (owner_user_id = $2 OR vet_user_id = $2)",
        [parent_conversation_id, userId]
      );
      if (!parentQ.rows[0]) {
        return res.status(403).json({ error: "access_denied" });
      }
      const parent = parentQ.rows[0];

      const conversationId = crypto.randomUUID();
      const callLabel = call_type === "video_call" ? "Videochiamata" : "Chiamata vocale";
      const now = new Date();
      const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      const subject = callLabel + " \u2014 " + timeStr;

      const { rows } = await pool.query(
        "INSERT INTO conversations (conversation_id, pet_id, owner_user_id, vet_user_id, " +
        "type, status, subject, recipient_type, parent_conversation_id, call_id) " +
        "VALUES ($1, $2, $3, $4, $5, 'active', $6, 'human', $7, $8) RETURNING *",
        [conversationId, parent.pet_id, parent.owner_user_id, parent.vet_user_id,
         call_type, subject, parent_conversation_id, call_id || null]
      );

      // System message in parent chat
      const sysMsgId = crypto.randomUUID();
      const sysIcon = call_type === "video_call" ? "\uD83C\uDFA5" : "\uD83D\uDCDE";
      const sysContent = sysIcon + " " + callLabel + " iniziata alle " + timeStr;
      await pool.query(
        "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, delivery_status, metadata) " +
        "VALUES ($1, $2, 'system', 'system', $3, 'delivered', $4)",
        [sysMsgId, parent_conversation_id, sysContent,
         JSON.stringify({ call_conversation_id: conversationId, call_type: call_type })]
      );
      await pool.query(
        "UPDATE conversations SET message_count = message_count + 1, updated_at = NOW() WHERE conversation_id = $1",
        [parent_conversation_id]
      );

      // Emit system message via socket
      const commNs = req.app.get("commNs");
      if (commNs) {
        commNs.to("conv:" + parent_conversation_id).emit("new_message", {
          message_id: sysMsgId,
          conversation_id: parent_conversation_id,
          sender_id: "system",
          type: "system",
          content: sysContent,
          metadata: { call_conversation_id: conversationId, call_type: call_type },
          created_at: now.toISOString()
        });
      }

      res.status(201).json(rows[0]);
    } catch (e) {
      console.error("POST /api/communication/conversations/call error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/communication/conversations/:id/end-call — close call conversation
  router.post("/api/communication/conversations/:id/end-call", requireAuth, async (req, res) => {
    try {
      const conversationId = req.params.id;
      if (!isValidUuid(conversationId)) return res.status(400).json({ error: "invalid_id" });

      const userId = req.user.sub;
      const { duration_seconds } = req.body;

      const convQ = await pool.query(
        "SELECT conversation_id, parent_conversation_id, type, subject " +
        "FROM conversations WHERE conversation_id = $1 AND (owner_user_id = $2 OR vet_user_id = $2)",
        [conversationId, userId]
      );
      if (!convQ.rows[0]) return res.status(404).json({ error: "not_found" });
      const conv = convQ.rows[0];

      await pool.query(
        "UPDATE conversations SET status = 'closed', updated_at = NOW() WHERE conversation_id = $1",
        [conversationId]
      );

      // Update system message in parent conv with duration
      if (conv.parent_conversation_id && duration_seconds > 0) {
        const mins = Math.floor(duration_seconds / 60);
        const secs = duration_seconds % 60;
        const durStr = (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
        const callLabel = conv.type === "video_call" ? "Videochiamata" : "Chiamata vocale";
        const sysIcon = conv.type === "video_call" ? "\uD83C\uDFA5" : "\uD83D\uDCDE";

        await pool.query(
          "UPDATE comm_messages SET content = $1 " +
          "WHERE conversation_id = $2 AND type = 'system' AND metadata->>'call_conversation_id' = $3",
          [sysIcon + " " + callLabel + " \u2014 Durata: " + durStr, conv.parent_conversation_id, conversationId]
        );
      }

      res.json({ ok: true, duration_seconds: duration_seconds || 0 });
    } catch (e) {
      console.error("POST end-call error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/communication/conversations — create (supports both human and AI)
  router.post("/api/communication/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { pet_id, vet_user_id, owner_override_id, subject, recipient_type, referral_form, initial_message, type: convType } = req.body;
      const recipientType = recipient_type || "human";
      const callerRole = req.user.role;

      // pet_id optional
      if (pet_id && !isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });

      // Validate initial_message (required for human conversations)
      if (recipientType !== "ai" && (!initial_message || typeof initial_message !== "string" || !initial_message.trim())) {
        return res.status(400).json({ error: "initial_message_required" });
      }

      // vet_ext validation
      if (callerRole === "vet_ext" && recipientType !== "ai") {
        if (!referral_form || typeof referral_form !== "object") {
          return res.status(400).json({ error: "referral_form_required" });
        }
        if (pet_id) {
          const petCheck = await pool.query("SELECT referring_vet_user_id FROM pets WHERE pet_id = $1", [pet_id]);
          if (!petCheck.rows[0] || petCheck.rows[0].referring_vet_user_id !== userId) {
            return res.status(403).json({ error: "pet_not_assigned_to_you" });
          }
        }
      }

      const conversationId = crypto.randomUUID();
      let ownerUserId, vetUserId;

      if (recipientType === "ai") {
        // Verify AI enabled
        const aiEnabled = await requireAiEnabled(pool, userId);
        if (!aiEnabled) return res.status(403).json({ error: "chatbot_disabled" });
        ownerUserId = userId;
        vetUserId = "ada-assistant";
      } else {
        // Human conversation
        if (owner_override_id && typeof owner_override_id === "string" && owner_override_id.trim()) {
          vetUserId = userId;
          ownerUserId = owner_override_id;
        } else {
          ownerUserId = userId;
          vetUserId = vet_user_id || null;
        }
      }

      const validConvTypes = ['chat', 'voice_call', 'video_call'];
      const validatedType = validConvTypes.indexOf(convType) !== -1 ? convType : 'chat';

      const { rows } = await pool.query(
        "INSERT INTO conversations (conversation_id, pet_id, owner_user_id, vet_user_id, subject, status, recipient_type, referral_form, type) " +
        "VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8) RETURNING *",
        [conversationId, pet_id || null, ownerUserId, vetUserId, subject || null, recipientType, referral_form ? JSON.stringify(referral_form) : null, validatedType]
      );

      const conversation = rows[0];

      if (recipientType === "ai") {
        // AI welcome message
        const welcomeContent = pet_id
          ? "Ciao! Sono ADA, la tua assistente veterinaria digitale. Come posso aiutarti con il tuo animale?"
          : "Ciao! Sono ADA, la tua assistente veterinaria digitale. Come posso aiutarti?";
        const welcomeId = crypto.randomUUID();
        await pool.query(
          "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, ai_role, delivery_status) " +
          "VALUES ($1, $2, 'ada-assistant', 'text', $3, 'assistant', 'read')",
          [welcomeId, conversationId, welcomeContent]
        );
        await pool.query("UPDATE conversations SET message_count = 1, updated_at = NOW() WHERE conversation_id = $1", [conversationId]);

        // If there is an initial_message, insert it and generate AI response
        if (initial_message && initial_message.trim()) {
          const userMsgId = crypto.randomUUID();
          await pool.query(
            "INSERT INTO comm_messages (message_id, conversation_id, sender_id, content, type, ai_role, delivery_status) " +
            "VALUES ($1, $2, $3, $4, 'text', 'user', 'read')",
            [userMsgId, conversationId, userId, initial_message.trim()]
          );

          const petContext = pet_id ? await buildPetContext(pool, pet_id, userId) : "";
          const welcomeContent = pet_id
            ? "Ciao! Sono ADA, la tua assistente veterinaria digitale. Come posso aiutarti con il tuo animale?"
            : "Ciao! Sono ADA, la tua assistente veterinaria digitale. Come posso aiutarti?";
          const historyMessages = [
            { role: "assistant", content: welcomeContent },
            { role: "user", content: initial_message.trim() }
          ];
          let systemContent = CHATBOT_SYSTEM_PROMPT;
          if (subject) systemContent += `\n\nOggetto della conversazione: ${subject}`;
          if (petContext) systemContent += `\n\nINFORMAZIONI SULL'ANIMALE:\n${petContext}`;

          try {
            let assistantContent, triageData;
            if (isMockEnv) {
              assistantContent = MOCK_ASSISTANT_RESPONSE.content;
              triageData = MOCK_ASSISTANT_RESPONSE.triage;
            } else {
              const apiKey = typeof getOpenAiKey === "function" ? getOpenAiKey() : null;
              if (apiKey) {
                const openaiMessages = [{ role: "system", content: systemContent }, ...historyMessages];
                let aiResponse = await _callOpenAi(apiKey, "gpt-4o-mini", openaiMessages);
                if (aiResponse.ok) {
                  assistantContent = aiResponse.content;
                  triageData = parseTriageFromResponse(assistantContent);
                  if (triageData && (triageData.level === "yellow" || triageData.level === "red")) {
                    const upgradeResponse = await _callOpenAi(apiKey, "gpt-4o", openaiMessages);
                    if (upgradeResponse.ok) {
                      assistantContent = upgradeResponse.content;
                      const upgradedTriage = parseTriageFromResponse(assistantContent);
                      if (upgradedTriage) triageData = upgradedTriage;
                    }
                  }
                }
              }
            }

            if (assistantContent) {
              if (!triageData) triageData = { level: "green", action: "monitor", follow_up: [] };
              const aiMsgId = crypto.randomUUID();
              await pool.query(
                "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, ai_role, triage_level, triage_action, follow_up_questions, delivery_status) " +
                "VALUES ($1, $2, 'ada-assistant', 'text', $3, 'assistant', $4, $5, $6, 'read')",
                [aiMsgId, conversationId, assistantContent, triageData.level, triageData.action, JSON.stringify(triageData.follow_up)]
              );
              await pool.query("UPDATE conversations SET message_count = 3, triage_level = $1, updated_at = NOW() WHERE conversation_id = $2",
                [triageData.level, conversationId]);
            } else {
              await pool.query("UPDATE conversations SET message_count = 2, updated_at = NOW() WHERE conversation_id = $1", [conversationId]);
            }
          } catch (aiErr) {
            console.error("AI initial response error:", aiErr);
            await pool.query("UPDATE conversations SET message_count = 2, updated_at = NOW() WHERE conversation_id = $1", [conversationId]);
          }
        }
      } else if (initial_message && initial_message.trim()) {
        // Insert first message for human conversations
        const firstMsgId = crypto.randomUUID();
        await pool.query(
          "INSERT INTO comm_messages (message_id, conversation_id, sender_id, content, type, delivery_status) " +
          "VALUES ($1, $2, $3, $4, 'text', 'sent')",
          [firstMsgId, conversationId, userId, initial_message.trim()]
        );
        await pool.query("UPDATE conversations SET message_count = 1, updated_at = NOW() WHERE conversation_id = $1", [conversationId]);
      }

      res.status(201).json(conversation);
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_found" });
      console.error("POST /api/communication/conversations error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/conversations — list (unified: human + AI)
  router.get("/api/communication/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { pet_id, status } = req.query;

      let query = "SELECT c.*, " +
        "p.name AS pet_name, " +
        "p.species AS pet_species, " +
        "uOwner.display_name AS owner_display_name, " +
        "uVet.display_name AS vet_display_name, " +
        "uOwner.base_role AS owner_role, " +
        "uVet.base_role AS vet_role, " +
        "lm.content AS last_message_text, lm.sender_id AS last_message_sender, " +
        "lm.created_at AS last_message_at, " +
        "COALESCE(ur.cnt, 0)::int AS unread_count, " +
        "COALESCE(mc.msg_count, 0)::int AS total_messages " +
        "FROM conversations c " +
        "LEFT JOIN pets p ON p.pet_id = c.pet_id " +
        "LEFT JOIN users uOwner ON uOwner.user_id = c.owner_user_id " +
        "LEFT JOIN users uVet ON uVet.user_id = c.vet_user_id " +
        "LEFT JOIN LATERAL (" +
        "  SELECT content, sender_id, created_at FROM comm_messages " +
        "  WHERE conversation_id = c.conversation_id AND deleted_at IS NULL " +
        "  ORDER BY created_at DESC LIMIT 1" +
        ") lm ON true " +
        "LEFT JOIN LATERAL (" +
        "  SELECT COUNT(*) AS cnt FROM comm_messages " +
        "  WHERE conversation_id = c.conversation_id " +
        "  AND sender_id <> $1 AND is_read = false AND deleted_at IS NULL" +
        ") ur ON true " +
        "LEFT JOIN LATERAL (" +
        "  SELECT COUNT(*) AS msg_count FROM comm_messages " +
        "  WHERE conversation_id = c.conversation_id AND deleted_at IS NULL" +
        ") mc ON true " +
        "WHERE ";
      const values = [userId];
      let paramIndex = 2;
      const callerRole = req.user?.role || '';

      if (pet_id) {
        if (!isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });
        // Pet archive mode: show ALL conversations for this pet if user has access
        if (callerRole === 'vet_int' || callerRole === 'super_admin' || callerRole === 'vet') {
          // These roles have global pet access
          query += "c.pet_id = $" + paramIndex++;
          values.push(pet_id);
        } else if (callerRole === 'vet_ext') {
          // vet_ext: participant OR referring vet for this pet
          query += "c.pet_id = $" + paramIndex + " AND (" +
            "c.owner_user_id = $1 OR c.vet_user_id = $1 OR " +
            "EXISTS(SELECT 1 FROM pets WHERE pet_id = $" + paramIndex + " AND referring_vet_user_id = $1)" +
            ")";
          paramIndex++;
          values.push(pet_id);
        } else {
          // owner: participant OR pet owner
          query += "c.pet_id = $" + paramIndex + " AND (" +
            "c.owner_user_id = $1 OR c.vet_user_id = $1 OR " +
            "EXISTS(SELECT 1 FROM pets WHERE pet_id = $" + paramIndex + " AND owner_user_id = $1)" +
            ")";
          paramIndex++;
          values.push(pet_id);
        }
      } else {
        // No pet_id: standard list — only user's own conversations
        query += "(c.owner_user_id = $1 OR c.vet_user_id = $1)";
      }
      if (status) {
        const allowedStatuses = ["active", "closed", "archived"];
        if (!allowedStatuses.includes(status)) return res.status(400).json({ error: "invalid_status" });
        query += " AND c.status = $" + paramIndex++;
        values.push(status);
      }

      query += " ORDER BY COALESCE(lm.created_at, c.updated_at) DESC";

      const { rows } = await pool.query(query, values);
      res.json({ conversations: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ conversations: [] });
      console.error("GET /api/communication/conversations error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/communication/conversations/:id
  router.get("/api/communication/conversations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_conversation_id" });
      const conversation = await getConversationIfAllowed(id, req.user.sub, req.user.role);
      if (!conversation) return res.status(404).json({ error: "not_found" });
      res.json(conversation);
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "not_found" });
      console.error("GET /api/communication/conversations/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/communication/conversations/:id — close, archive, or reopen
  router.patch("/api/communication/conversations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_conversation_id" });
      const { status } = req.body;
      const allowedStatuses = ["active", "closed", "archived"];
      if (!status || !allowedStatuses.includes(status)) return res.status(400).json({ error: "invalid_status" });
      const conversation = await getConversationIfAllowed(id, req.user.sub, req.user.role);
      if (!conversation) return res.status(404).json({ error: "not_found" });
      const { rows } = await pool.query("UPDATE conversations SET status = $1, updated_at = NOW() WHERE conversation_id = $2 RETURNING *", [status, id]);
      const updated = rows[0];

      // Notify via WebSocket
      const commNs = req.app.get("commNs");
      if (commNs) {
        const statusPayload = { conversation_id: id, status: status, changed_by: req.user.sub };
        commNs.to("conv:" + id).emit("conversation_status_changed", statusPayload);
        const recipientUserId = (updated.owner_user_id === req.user.sub) ? updated.vet_user_id : updated.owner_user_id;
        if (recipientUserId) {
          commNs.to("user:" + recipientUserId).emit("conversation_status_changed", statusPayload);
        }
      }

      res.json(updated);
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "not_found" });
      console.error("PATCH /api/communication/conversations/:id error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Messages ---

  // GET /api/communication/conversations/:id/messages — paginated (cursor-based, excludes soft-deleted)
  router.get("/api/communication/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_conversation_id" });
      const conversation = await getConversationIfAllowed(id, req.user.sub, req.user.role);
      if (!conversation) return res.status(404).json({ error: "not_found" });

      const before = req.query.before;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
      let query, values;
      if (before && isValidUuid(before)) {
        query = "SELECT m.*, u.display_name AS sender_name, u.base_role AS sender_role FROM comm_messages m LEFT JOIN users u ON u.user_id = m.sender_id WHERE m.conversation_id = $1 AND m.deleted_at IS NULL AND m.created_at < (SELECT created_at FROM comm_messages WHERE message_id = $2) ORDER BY m.created_at DESC LIMIT $3";
        values = [id, before, limit];
      } else {
        query = "SELECT m.*, u.display_name AS sender_name, u.base_role AS sender_role FROM comm_messages m LEFT JOIN users u ON u.user_id = m.sender_id WHERE m.conversation_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT $2";
        values = [id, limit];
      }
      const { rows } = await pool.query(query, values);
      rows.reverse();

      // Clean AI triage comments from visible content
      for (const msg of rows) {
        if (msg.ai_role === "assistant" && msg.content) {
          msg.content = cleanResponseContent(msg.content);
        }
      }

      // Include conversation metadata (status, referral_form, subject, recipient_type)
      let petName = null;
      let petSpecies = null;
      if (conversation.pet_id) {
        const petRes = await pool.query("SELECT name, species FROM pets WHERE pet_id = $1 LIMIT 1", [conversation.pet_id]);
        if (petRes.rows[0]) {
          petName = petRes.rows[0].name;
          petSpecies = petRes.rows[0].species;
        }
      }
      let parsedReferralForm = null;
      if (conversation.referral_form) {
        try { parsedReferralForm = typeof conversation.referral_form === 'string' ? JSON.parse(conversation.referral_form) : conversation.referral_form; } catch (_) {}
      }
      res.json({
        messages: rows,
        status: conversation.status,
        subject: conversation.subject,
        recipient_type: conversation.recipient_type,
        type: conversation.type || 'chat',
        referral_form: parsedReferralForm,
        pet_name: petName,
        pet_species: petSpecies,
        triage_level: conversation.triage_level || null
      });
    } catch (e) {
      if (e.code === "42P01") return res.json({ messages: [] });
      console.error("GET /api/communication/conversations/:id/messages error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/communication/conversations/:id/messages — send a message (human or AI)
  router.post("/api/communication/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_conversation_id" });

      const conversation = await getConversationIfAllowed(id, req.user.sub, req.user.role);
      if (!conversation) return res.status(404).json({ error: "not_found" });

      // Block sending to closed conversations
      if (conversation.status === "closed" && conversation.recipient_type !== "ai") {
        return res.status(403).json({ error: "conversation_closed", message: "La conversazione è chiusa. Riaprila per inviare nuovi messaggi." });
      }

      const { content, type, reply_to_message_id } = req.body;
      if (!content || typeof content !== "string" || content.trim().length === 0) return res.status(400).json({ error: "content_required" });
      if (content.length > 5000) return res.status(400).json({ error: "content_too_long" });

      const messageType = type || "text";
      const messageId = crypto.randomUUID();
      const senderId = req.user.sub;

      // Validate reply_to if provided
      if (reply_to_message_id && !isValidUuid(reply_to_message_id)) return res.status(400).json({ error: "invalid_reply_to" });

      // --- AI conversation handling ---
      if (conversation.recipient_type === "ai") {
        // Check session limits
        if (conversation.status !== "active") return res.status(400).json({ error: "conversation_closed" });

        const msgCount = conversation.message_count || 0;
        if (msgCount >= MAX_MESSAGES_PER_SESSION) return res.status(400).json({ error: "session_limit_reached", limit: MAX_MESSAGES_PER_SESSION });

        // Check timeout
        const lastActive = new Date(conversation.updated_at || conversation.created_at);
        const minutesSince = (Date.now() - lastActive.getTime()) / (1000 * 60);
        if (minutesSince > SESSION_TIMEOUT_MINUTES) {
          await pool.query("UPDATE conversations SET status = 'closed', updated_at = NOW() WHERE conversation_id = $1", [id]);
          return res.status(400).json({ error: "session_expired" });
        }

        // Check AI enabled
        const aiEnabled = await requireAiEnabled(pool, senderId);
        if (!aiEnabled) return res.status(403).json({ error: "chatbot_disabled" });

        // Save user message
        await pool.query(
          "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, ai_role, delivery_status) VALUES ($1, $2, $3, $4, $5, 'user', 'read')",
          [messageId, id, senderId, messageType, content.trim()]
        );

        // Build AI response
        let assistantContent, triageData;
        if (isMockEnv) {
          assistantContent = MOCK_ASSISTANT_RESPONSE.content;
          triageData = MOCK_ASSISTANT_RESPONSE.triage;
        } else {
          const petContext = conversation.pet_id ? await buildPetContext(pool, conversation.pet_id, senderId) : "";
          let systemContent = CHATBOT_SYSTEM_PROMPT;
          if (conversation.subject) systemContent += `\n\nOggetto della conversazione: ${conversation.subject}`;
          if (petContext) systemContent += `\n\nINFORMAZIONI SULL'ANIMALE:\n${petContext}`;
          const historyResult = await pool.query(
            "SELECT ai_role AS role, content, media_url, media_type FROM comm_messages WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2",
            [id, MAX_HISTORY_MESSAGES]
          );
          let hasImageAttachment = false;
          const historyMessages = historyResult.rows.reverse().map(m => {
            const role = m.role || "user";
            let msgContent = m.content || "";
            if (m.media_url) {
              const ft = (m.media_type || "").toLowerCase();
              if (ft.startsWith("image/")) {
                hasImageAttachment = true;
                // Return multimodal content for vision
                return {
                  role,
                  content: [
                    { type: "text", text: msgContent || "(immagine allegata)" },
                    { type: "image_url", image_url: { url: m.media_url } }
                  ]
                };
              } else if (ft === "application/pdf") {
                msgContent += "\n[Allegato PDF — contenuto non disponibile per analisi]";
              } else {
                msgContent += "\n[Allegato — tipo non supportato per analisi]";
              }
            }
            return { role, content: msgContent };
          });
          const openaiMessages = [{ role: "system", content: systemContent }, ...historyMessages];

          const apiKey = typeof getOpenAiKey === "function" ? getOpenAiKey() : null;
          if (!apiKey) return res.status(500).json({ error: "openai_key_not_configured" });

          let model = hasImageAttachment ? "gpt-4o" : "gpt-4o-mini";
          let aiResponse = await _callOpenAi(apiKey, model, openaiMessages);
          if (!aiResponse.ok) return res.status(502).json({ error: "ai_request_failed" });

          assistantContent = aiResponse.content;
          triageData = parseTriageFromResponse(assistantContent);

          // Upgrade to gpt-4o for yellow/red triage
          if (triageData && (triageData.level === "yellow" || triageData.level === "red")) {
            const upgradeResponse = await _callOpenAi(apiKey, "gpt-4o", openaiMessages);
            if (upgradeResponse.ok) {
              assistantContent = upgradeResponse.content;
              const upgradedTriage = parseTriageFromResponse(assistantContent);
              if (upgradedTriage) triageData = upgradedTriage;
            }
          }
          if (!triageData) triageData = { level: "green", action: "monitor", follow_up: [] };
        }

        // Save assistant message
        const assistantMsgId = crypto.randomUUID();
        await pool.query(
          "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, ai_role, triage_level, triage_action, follow_up_questions, delivery_status) " +
          "VALUES ($1, $2, 'ada-assistant', 'text', $3, 'assistant', $4, $5, $6, 'read')",
          [assistantMsgId, id, assistantContent, triageData.level, triageData.action, JSON.stringify(triageData.follow_up)]
        );

        // Update conversation
        await pool.query(
          "UPDATE conversations SET message_count = message_count + 2, triage_level = $1, updated_at = NOW() WHERE conversation_id = $2",
          [triageData.level, id]
        );

        return res.status(201).json({
          user_message: { message_id: messageId, conversation_id: id, sender_id: senderId, content: content.trim(), ai_role: "user", created_at: new Date().toISOString() },
          assistant_message: {
            message_id: assistantMsgId, conversation_id: id, sender_id: "ada-assistant",
            content: cleanResponseContent(assistantContent),
            ai_role: "assistant", triage_level: triageData.level, triage_action: triageData.action,
            follow_up_questions: triageData.follow_up,
            created_at: new Date().toISOString(),
          },
          triage: triageData,
        });
      }

      // --- Human conversation ---
      const { rows } = await pool.query(
        "INSERT INTO comm_messages (message_id, conversation_id, sender_id, content, type, reply_to_message_id, delivery_status) " +
        "VALUES ($1, $2, $3, $4, $5, $6, 'sent') RETURNING *",
        [messageId, id, senderId, content.trim(), messageType, reply_to_message_id || null]
      );
      const newMessage = rows[0];
      // Enrich with sender info for Socket.io (not in DB RETURNING)
      newMessage.sender_name = req.user.display_name || req.user.email || "Utente";
      newMessage.sender_role = req.user.role || null;

      await pool.query("UPDATE conversations SET updated_at = NOW() WHERE conversation_id = $1", [id]);

      // Broadcast via Socket.io
      const commNs = req.app.get("commNs");
      if (commNs) commNs.to("conv:" + id).emit("new_message", newMessage);

      // Notify recipient's user room for badge update (reaches user on ANY page)
      const recipientUserId = (conversation.owner_user_id === senderId) ? conversation.vet_user_id : conversation.owner_user_id;
      if (commNs && recipientUserId) {
        commNs.to("user:" + recipientUserId).emit("new_message_notification", {
          conversation_id: id,
          sender_id: senderId,
          message_id: newMessage.message_id,
          preview: content.trim().substring(0, 100),
          created_at: newMessage.created_at
        });
      }

      // Push notification (fire-and-forget)
      try {
        const { sendPushToUser } = require("./push.routes");
        const { isUserOnline } = require("./websocket");
        const recipientId = (conversation.owner_user_id === senderId) ? conversation.vet_user_id : conversation.owner_user_id;
        if (recipientId && !isUserOnline(recipientId)) {
          const senderName = req.user.display_name || req.user.email || "Utente";
          sendPushToUser(recipientId, {
            title: senderName,
            body: content.substring(0, 100),
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            data: { type: "new_message", conversationId: id, messageId: newMessage.message_id },
            tag: "conv-" + id,
          });
        }
      } catch (_) {}

      res.status(201).json(newMessage);
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_found" });
      console.error("POST /api/communication/conversations/:id/messages error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/communication/messages/:id/read
  router.patch("/api/communication/messages/:id/read", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_message_id" });
      const msgCheck = await pool.query(
        "SELECT m.message_id, m.conversation_id FROM comm_messages m JOIN conversations c ON c.conversation_id = m.conversation_id WHERE m.message_id = $1 AND (c.owner_user_id = $2 OR c.vet_user_id = $2) LIMIT 1",
        [id, req.user.sub]
      );
      if (!msgCheck.rows[0]) return res.status(404).json({ error: "not_found" });
      const { rows } = await pool.query(
        "UPDATE comm_messages SET is_read = true, read_at = NOW(), delivery_status = 'read', delivered_at = COALESCE(delivered_at, NOW()) WHERE message_id = $1 RETURNING *",
        [id]
      );
      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "not_found" });
      console.error("PATCH /api/communication/messages/:id/read error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // POST /api/communication/conversations/:id/read — mark all messages in a conversation as read
  router.post("/api/communication/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_conversation_id" });
      const userId = req.user.sub;
      const conversation = await getConversationIfAllowed(id, userId, req.user.role);
      if (!conversation) return res.status(404).json({ error: "not_found" });
      await pool.query(
        "UPDATE comm_messages SET is_read = true, read_at = NOW(), delivery_status = 'read' WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false",
        [id, userId]
      );
      await pool.query(
        "INSERT INTO conversation_seen (conversation_id, user_id, last_seen_at) VALUES ($1, $2, NOW()) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_seen_at = NOW()",
        [id, userId]
      );
      res.json({ success: true });
    } catch (e) {
      if (e.code === "42P01") return res.json({ success: true });
      console.error("POST /api/communication/conversations/:id/read error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // PATCH /api/communication/messages/:id/delete — soft delete own message (human chats only)
  router.patch("/api/communication/messages/:id/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isValidUuid(id)) return res.status(400).json({ error: "invalid_message_id" });
      const userId = req.user.sub;
      const msgCheck = await pool.query(
        "SELECT m.message_id, m.sender_id, c.recipient_type FROM comm_messages m JOIN conversations c ON c.conversation_id = m.conversation_id WHERE m.message_id = $1 AND m.sender_id = $2 AND m.deleted_at IS NULL LIMIT 1",
        [id, userId]
      );
      if (!msgCheck.rows[0]) return res.status(404).json({ error: "not_found" });
      if (msgCheck.rows[0].recipient_type === "ai") return res.status(400).json({ error: "cannot_delete_ai_messages" });
      const { rows } = await pool.query(
        "UPDATE comm_messages SET deleted_at = NOW(), deleted_by = $1 WHERE message_id = $2 RETURNING message_id, deleted_at",
        [userId, id]
      );
      res.json(rows[0]);
    } catch (e) {
      if (e.code === "42P01") return res.status(404).json({ error: "not_found" });
      console.error("PATCH /api/communication/messages/:id/delete error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Unread Count ---
  router.get("/api/communication/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS unread_count FROM comm_messages m JOIN conversations c ON c.conversation_id = m.conversation_id WHERE (c.owner_user_id = $1 OR c.vet_user_id = $1) AND m.sender_id != $1 AND m.is_read = false AND m.deleted_at IS NULL",
        [userId]
      );
      res.json({ unread_count: rows[0]?.unread_count || 0 });
    } catch (e) {
      if (e.code === "42P01") return res.json({ unread_count: 0 });
      console.error("GET /api/communication/unread-count error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // --- Backward-compatible chatbot session endpoints (delegate to conversations) ---

  // POST /api/chatbot/sessions — create AI conversation (backward compat)
  router.post("/api/chatbot/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const enabled = await requireAiEnabled(pool, userId);
      if (!enabled) return res.status(403).json({ error: "chatbot_disabled" });
      const { pet_id } = req.body || {};
      if (pet_id && !isValidUuid(pet_id)) return res.status(400).json({ error: "invalid_pet_id" });
      const conversationId = crypto.randomUUID();
      await pool.query(
        "INSERT INTO conversations (conversation_id, pet_id, owner_user_id, vet_user_id, type, status, recipient_type) VALUES ($1, $2, $3, 'ada-assistant', 'chat', 'active', 'ai')",
        [conversationId, pet_id || null, userId]
      );
      // Welcome message
      const welcomeContent = pet_id
        ? "Ciao! Sono ADA, la tua assistente veterinaria digitale. Come posso aiutarti con il tuo animale?"
        : "Ciao! Sono ADA, la tua assistente veterinaria digitale. Come posso aiutarti?";
      await pool.query(
        "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, ai_role, delivery_status) VALUES ($1, $2, 'ada-assistant', 'text', $3, 'assistant', 'read')",
        [crypto.randomUUID(), conversationId, welcomeContent]
      );
      await pool.query("UPDATE conversations SET message_count = 1, updated_at = NOW() WHERE conversation_id = $1", [conversationId]);
      res.status(201).json({ session: { session_id: conversationId, owner_user_id: userId, pet_id: pet_id || null, status: "active", message_count: 1, created_at: new Date().toISOString() } });
    } catch (e) {
      if (e.code === "42P01") return res.status(500).json({ error: "table_not_found" });
      console.error("POST /api/chatbot/sessions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  // GET /api/chatbot/sessions — list AI conversations (backward compat)
  router.get("/api/chatbot/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { rows } = await pool.query(
        "SELECT conversation_id AS session_id, owner_user_id, pet_id, status, message_count, subject AS summary, triage_level, created_at, updated_at AS last_message_at " +
        "FROM conversations WHERE owner_user_id = $1 AND recipient_type = 'ai' ORDER BY updated_at DESC",
        [userId]
      );
      res.json({ sessions: rows });
    } catch (e) {
      if (e.code === "42P01") return res.json({ sessions: [] });
      console.error("GET /api/chatbot/sessions error", e);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}

module.exports = { communicationRouter };
