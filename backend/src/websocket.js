// backend/src/websocket.js
// Socket.io server per comunicazione real-time
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getPool } = require("./db");

const onlineUsers = new Map(); // userId → Set<socketId>

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

    commNs.on("connection", (socket) => {
        const userId = socket.userId;

        // Presence
        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId).add(socket.id);
        commNs.emit("user_online", { userId });

        socket.join(`user:${userId}`);

        // Chat events
        socket.on("join_conversation", ({ conversationId }) => {
            if (conversationId) socket.join(`conv:${conversationId}`);
        });
        socket.on("leave_conversation", ({ conversationId }) => {
            if (conversationId) socket.leave(`conv:${conversationId}`);
        });
        socket.on("typing_start", ({ conversationId }) => {
            if (!checkRateLimit(socket.id)) return;
            socket.to(`conv:${conversationId}`).emit("user_typing", { userId, typing: true });
        });
        socket.on("typing_stop", ({ conversationId }) => {
            socket.to(`conv:${conversationId}`).emit("user_typing", { userId, typing: false });
        });
        // Delivery status: message_delivered — persist to DB then broadcast
        socket.on("message_delivered", async ({ messageId, conversationId }) => {
            if (!messageId) return;
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
            if (!conversationId) return;
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
            if (!messageId) return;
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

        // Call signaling (WebRTC)
        socket.on("initiate_call", ({ conversationId, callType, callId }) => {
            if (!conversationId || !callId) return;
            socket.to(`conv:${conversationId}`).emit("incoming_call", {
                conversationId, callType: callType || "voice_call", callId,
                callerId: userId, callerName: socket.displayName || socket.userEmail || userId
            });
        });
        socket.on("accept_call", ({ conversationId, callId }) => {
            if (!conversationId || !callId) return;
            socket.to(`conv:${conversationId}`).emit("call_accepted", { conversationId, callId, acceptedBy: userId });
        });
        socket.on("reject_call", ({ conversationId, callId, reason }) => {
            if (!conversationId || !callId) return;
            socket.to(`conv:${conversationId}`).emit("call_rejected", { conversationId, callId, reason: reason || "declined" });
        });
        socket.on("webrtc_offer", ({ conversationId, callId, offer }) => {
            if (!conversationId || !callId || !offer) return;
            socket.to(`conv:${conversationId}`).emit("webrtc_offer", { conversationId, callId, offer });
        });
        socket.on("webrtc_answer", ({ conversationId, callId, answer }) => {
            if (!conversationId || !callId || !answer) return;
            socket.to(`conv:${conversationId}`).emit("webrtc_answer", { conversationId, callId, answer });
        });
        socket.on("webrtc_ice", ({ conversationId, callId, candidate }) => {
            if (!conversationId || !callId || !candidate) return;
            socket.to(`conv:${conversationId}`).emit("webrtc_ice", { conversationId, callId, candidate });
        });
        socket.on("end_call", ({ conversationId, callId }) => {
            if (!conversationId) return;
            socket.to(`conv:${conversationId}`).emit("call_ended", { conversationId, callId, endedBy: userId });
        });
        socket.on("request_partner_status", ({ conversationId }) => {
            if (!conversationId) return;
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
