// backend/src/websocket.js
// Socket.io server per comunicazione real-time
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

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
        socket.on("message_read", ({ messageId, conversationId }) => {
            socket.to(`conv:${conversationId}`).emit("messages_read", { messageIds: [messageId], readBy: userId });
        });

        // Call signaling placeholders (PR-G li implementa)
        socket.on("initiate_call", () => {});
        socket.on("accept_call", () => {});
        socket.on("reject_call", () => {});
        socket.on("webrtc_offer", () => {});
        socket.on("webrtc_answer", () => {});
        socket.on("webrtc_ice", () => {});
        socket.on("end_call", () => {});

        // Disconnect
        socket.on("disconnect", () => {
            const sockets = onlineUsers.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                    commNs.emit("user_offline", { userId });
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
