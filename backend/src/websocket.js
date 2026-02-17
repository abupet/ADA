// backend/src/websocket.js
// Socket.io server per comunicazione real-time
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getPool } = require("./db");
const { sendPushToUser } = require("./push.routes");

const onlineUsers = new Map(); // userId → Set<socketId>

// Helper: transcribe audio chunk via OpenAI Whisper
async function transcribeAudioChunk(base64Audio, mimeType) {
    const isMock = (process.env.MODE || "").toUpperCase() === "MOCK";
    const keyName = ["4f","50","45","4e","41","49","5f","41","50","49","5f","4b","45","59"]
        .map(v => String.fromCharCode(Number.parseInt(v, 16))).join("");
    const openAiKey = process.env[keyName] || null;
    if (!openAiKey) {
        if (isMock) return "Trascrizione mock del chunk audio.";
        return null;
    }

    const buffer = Buffer.from(base64Audio, "base64");
    if (buffer.length < 100) return null; // too small, skip

    const ext = mimeType && mimeType.includes("webm") ? "webm" : (mimeType && mimeType.includes("ogg") ? "ogg" : "wav");
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", buffer, { filename: "chunk." + ext, contentType: mimeType || "audio/webm" });
    form.append("model", "whisper-1");
    form.append("language", "it");
    form.append("response_format", "text");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openAiKey, ...form.getHeaders() },
        body: form
    });

    if (!response.ok) {
        console.warn("[Whisper] Error:", response.status);
        return null;
    }

    return await response.text();
}

function initWebSocket(httpServer, jwtSecret, corsOrigin) {
    const io = new Server(httpServer, {
        cors: {
            origin: corsOrigin || "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        path: "/ws",
        transports: ["websocket", "polling"]
    });

    const commNs = io.of("/communication");

    // Auth: verifica JWT v2 (o legacy) nel handshake
    commNs.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error("missing_token"));
        try {
            const decoded = jwt.verify(token, jwtSecret);
            socket.userId = decoded.sub;
            socket.userRole = decoded.role || null;
            socket.userEmail = decoded.email || null;
            socket.displayName = decoded.display_name || null;
            next();
        } catch (err) {
            next(new Error("invalid_token"));
        }
    });

    // Rate limiting
    const messageRates = new Map();
    function checkRateLimit(socketId) {
        const now = Date.now();
        const entry = messageRates.get(socketId) || { count: 0, resetAt: now + 60000 };
        if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
        entry.count++;
        messageRates.set(socketId, entry);
        return entry.count <= 30;
    }

    // Authorization: verify user is participant in conversation
    async function isConversationParticipant(userId, conversationId) {
        try {
            const pool = getPool();
            const { rows } = await pool.query(
                "SELECT 1 FROM conversations WHERE conversation_id = $1 AND (owner_user_id = $2 OR vet_user_id = $2) LIMIT 1",
                [conversationId, userId]
            );
            return rows.length > 0;
        } catch (e) {
            console.error("[WS] isConversationParticipant error:", e.message);
            return false;
        }
    }

    // Get the other participant in a conversation (for targeted call signaling)
    async function getConversationRecipient(userId, conversationId) {
        try {
            const pool = getPool();
            const { rows } = await pool.query(
                "SELECT owner_user_id, vet_user_id FROM conversations WHERE conversation_id = $1 LIMIT 1",
                [conversationId]
            );
            if (!rows[0]) return null;
            return rows[0].owner_user_id === userId ? rows[0].vet_user_id : rows[0].owner_user_id;
        } catch (e) {
            console.error("[WS] getConversationRecipient error:", e.message);
            return null;
        }
    }

    // Auto-join socket to conv room after verifying participant (for call signaling)
    async function autoJoinConvRoom(socket, conversationId) {
        if (socket.rooms.has(`conv:${conversationId}`)) return true;
        const allowed = await isConversationParticipant(socket.userId, conversationId);
        if (allowed) {
            socket.join(`conv:${conversationId}`);
            return true;
        }
        return false;
    }

    commNs.on("connection", (socket) => {
        const userId = socket.userId;

        // Presence
        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId).add(socket.id);
        commNs.emit("user_online", { userId });

        socket.join(`user:${userId}`);

        // Chat events — authorization check before joining room
        socket.on("join_conversation", async ({ conversationId }) => {
            if (!conversationId) return;
            const allowed = await isConversationParticipant(userId, conversationId);
            if (allowed) {
                socket.join(`conv:${conversationId}`);
            } else {
                socket.emit("error", { code: "forbidden", message: "Not a participant of this conversation" });
            }
        });
        socket.on("leave_conversation", ({ conversationId }) => {
            if (conversationId) socket.leave(`conv:${conversationId}`);
        });
        socket.on("typing_start", ({ conversationId }) => {
            if (!checkRateLimit(socket.id)) return;
            // Only emit if user is actually in the room (was authorized by join_conversation)
            if (!socket.rooms.has(`conv:${conversationId}`)) return;
            socket.to(`conv:${conversationId}`).emit("user_typing", { userId, typing: true });
        });
        socket.on("typing_stop", ({ conversationId }) => {
            if (!socket.rooms.has(`conv:${conversationId}`)) return;
            socket.to(`conv:${conversationId}`).emit("user_typing", { userId, typing: false });
        });
        // Delivery status: message_delivered — persist to DB then broadcast
        socket.on("message_delivered", async ({ messageId, conversationId }) => {
            if (!messageId || !socket.rooms.has(`conv:${conversationId}`)) return;
            try {
                const pool = getPool();
                await pool.query(
                    "UPDATE comm_messages SET delivery_status = 'delivered', delivered_at = NOW() " +
                    "WHERE message_id = $1 AND delivery_status = 'sent'",
                    [messageId]
                );
                socket.to(`conv:${conversationId}`).emit("delivery_update", { messageId, status: "delivered" });
            } catch (e) { console.error("[WS] message_delivered error:", e.message); }
        });

        // Delivery status: conversation_seen — mark all unread messages as read
        socket.on("conversation_seen", async ({ conversationId }) => {
            if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) return;
            try {
                const pool = getPool();
                // Upsert conversation_seen
                await pool.query(
                    "INSERT INTO conversation_seen (conversation_id, user_id, last_seen_at) " +
                    "VALUES ($1, $2, NOW()) " +
                    "ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_seen_at = NOW()",
                    [conversationId, userId]
                );
                // Mark all unread messages from OTHER senders as read
                await pool.query(
                    "UPDATE comm_messages SET delivery_status = 'read', is_read = true, read_at = NOW() " +
                    "WHERE conversation_id = $1 AND sender_id != $2 AND delivery_status != 'read'",
                    [conversationId, userId]
                );
                socket.to(`conv:${conversationId}`).emit("messages_read", { conversationId, readBy: userId });
            } catch (e) { console.error("[WS] conversation_seen error:", e.message); }
        });

        // Delivery status: message_read — persist single message read to DB
        socket.on("message_read", async ({ messageId, conversationId }) => {
            if (!messageId || !socket.rooms.has(`conv:${conversationId}`)) return;
            try {
                const pool = getPool();
                await pool.query(
                    "UPDATE comm_messages SET delivery_status = 'read', is_read = true, read_at = NOW() " +
                    "WHERE message_id = $1 AND delivery_status != 'read'",
                    [messageId]
                );
                socket.to(`conv:${conversationId}`).emit("messages_read", { messageIds: [messageId], readBy: userId });
            } catch (e) { console.error("[WS] message_read error:", e.message); }
        });

        // Call signaling (WebRTC) — auto-join conv room + emit to user room for reachability
        socket.on("initiate_call", async ({ conversationId, callType, callId }) => {
            if (!conversationId || !callId) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            const recipientId = await getConversationRecipient(userId, conversationId);
            const payload = {
                conversationId, callType: callType || "voice_call", callId,
                callerId: userId, callerName: socket.displayName || socket.userEmail || userId
            };
            // Emit to conv room (for participants already viewing the conversation)
            socket.to(`conv:${conversationId}`).emit("incoming_call", payload);
            // Emit to recipient's user room (so they receive it even if not in the conv room)
            if (recipientId) {
                commNs.to(`user:${recipientId}`).emit("incoming_call", payload);
                // Send push notification if recipient is offline
                if (!isUserOnline(recipientId)) {
                    sendPushToUser(recipientId, {
                        title: "Chiamata in arrivo",
                        body: (socket.displayName || socket.userEmail || "Utente") + " ti sta chiamando",
                        tag: "incoming-call-" + callId,
                        data: { conversationId, callId, callType: callType || "voice_call", type: "incoming_call" }
                    }, "push_incoming_call").catch(() => {});
                }
            }
        });
        socket.on("accept_call", async ({ conversationId, callId }) => {
            if (!conversationId || !callId) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            socket.to(`conv:${conversationId}`).emit("call_accepted", { conversationId, callId, acceptedBy: userId });
        });
        socket.on("reject_call", async ({ conversationId, callId, reason }) => {
            if (!conversationId || !callId) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            socket.to(`conv:${conversationId}`).emit("call_rejected", { conversationId, callId, reason: reason || "declined" });
        });
        socket.on("webrtc_offer", async ({ conversationId, callId, offer }) => {
            if (!conversationId || !callId || !offer) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            socket.to(`conv:${conversationId}`).emit("webrtc_offer", { conversationId, callId, offer });
        });
        socket.on("webrtc_answer", async ({ conversationId, callId, answer }) => {
            if (!conversationId || !callId || !answer) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            socket.to(`conv:${conversationId}`).emit("webrtc_answer", { conversationId, callId, answer });
        });
        socket.on("webrtc_ice", async ({ conversationId, callId, candidate }) => {
            if (!conversationId || !callId || !candidate) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            socket.to(`conv:${conversationId}`).emit("webrtc_ice", { conversationId, callId, candidate });
        });
        socket.on("end_call", async ({ conversationId, callId }) => {
            if (!conversationId) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;
            socket.to(`conv:${conversationId}`).emit("call_ended", { conversationId, callId, endedBy: userId });
            // Also emit to recipient's user room to dismiss pending incoming notification
            const recipientId = await getConversationRecipient(userId, conversationId);
            if (recipientId) {
                commNs.to(`user:${recipientId}`).emit("call_ended", { conversationId, callId, endedBy: userId });
            }
        });
        socket.on("request_partner_status", ({ conversationId }) => {
            if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) return;
            const room = commNs.adapter.rooms.get(`conv:${conversationId}`);
            if (!room) return;
            for (const sid of room) {
                const s = commNs.sockets.get(sid);
                if (s && s.userId !== userId) {
                    socket.emit("partner_status", { conversation_id: conversationId, user_id: s.userId, online: true });
                    return;
                }
            }
            socket.emit("partner_status", { conversation_id: conversationId, user_id: null, online: false });
        });

        // Call audio chunk transcription (server-side Whisper)
        socket.on("call_audio_chunk", async ({ conversationId, callId, source, audioData, mimeType, timestamp }) => {
            if (!conversationId || !audioData) return;
            if (!checkRateLimit(socket.id)) return;
            if (!(await autoJoinConvRoom(socket, conversationId))) return;

            try {
                const pool = getPool();
                // Determine speaker: 'local' = sender, 'remote' = other participant
                let speakerId = userId;
                if (source === "remote") {
                    const { rows } = await pool.query(
                        "SELECT owner_user_id, vet_user_id FROM conversations WHERE conversation_id = $1 LIMIT 1",
                        [conversationId]
                    );
                    if (rows[0]) {
                        speakerId = rows[0].owner_user_id === userId ? rows[0].vet_user_id : rows[0].owner_user_id;
                    }
                }

                const transcription = await transcribeAudioChunk(audioData, mimeType);
                if (!transcription || !transcription.trim()) return;

                // Check if we can merge with the last transcription message from same speaker
                const lastMsg = await pool.query(
                    "SELECT message_id, content, created_at FROM comm_messages " +
                    "WHERE conversation_id = $1 AND sender_id = $2 AND type = 'transcription' AND deleted_at IS NULL " +
                    "ORDER BY created_at DESC LIMIT 1",
                    [conversationId, speakerId]
                );

                if (lastMsg.rows[0] && (Date.now() - new Date(lastMsg.rows[0].created_at).getTime() < 30000)) {
                    // Append to existing message
                    await pool.query(
                        "UPDATE comm_messages SET content = content || ' ' || $1, updated_at = NOW() WHERE message_id = $2",
                        [transcription.trim(), lastMsg.rows[0].message_id]
                    );
                    commNs.to("conv:" + conversationId).emit("message_updated", {
                        message_id: lastMsg.rows[0].message_id,
                        conversation_id: conversationId,
                        sender_id: speakerId,
                        type: "transcription",
                        content: lastMsg.rows[0].content + " " + transcription.trim(),
                        updated_at: new Date().toISOString()
                    });
                } else {
                    // Create new message
                    const msgId = crypto.randomUUID();
                    await pool.query(
                        "INSERT INTO comm_messages (message_id, conversation_id, sender_id, type, content, delivery_status) " +
                        "VALUES ($1, $2, $3, 'transcription', $4, 'delivered')",
                        [msgId, conversationId, speakerId, transcription.trim()]
                    );
                    commNs.to("conv:" + conversationId).emit("new_message", {
                        message_id: msgId,
                        conversation_id: conversationId,
                        sender_id: speakerId,
                        type: "transcription",
                        content: transcription.trim(),
                        created_at: new Date().toISOString()
                    });
                }
            } catch (e) {
                console.warn("[WS] call_audio_chunk transcription error:", e.message);
            }
        });

        // Disconnect
        socket.on("disconnect", () => {
            const sockets = onlineUsers.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                    commNs.emit("user_offline", { userId });
                    // Update last_seen_at (fire-and-forget)
                    try {
                        const pool = getPool();
                        pool.query("UPDATE users SET last_seen_at = NOW() WHERE user_id = $1", [userId])
                            .catch(() => {});
                    } catch (_) {}
                }
            }
            messageRates.delete(socket.id);
        });
    });

    return { io, commNs, onlineUsers };
}

function isUserOnline(userId) {
    return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
}

module.exports = { initWebSocket, isUserOnline };
