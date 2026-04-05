// =============================================
// ws.js — WebSocket Server (Multi-Panel Support)
// =============================================
const { WebSocketServer } = require('ws');
const { WS_PORT } = require('./config');
const stateModule = require('./state');

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

// ── بناء قائمة الجلسات الكاملة ──────────────
function buildSessionList() {
    const list = [];
    for (const [phone, s] of stateModule.sessions) {
        list.push({
            phone,
            connected: s.isConnected,
            name: s.currentName || phone,
            lastPairingCode: s.lastPairingCode || null,
            status: s.isConnected ? 'connected'
                  : s.lastPairingCode ? 'code_pending'
                  : s.lastQR ? 'qr_pending'
                  : s.isStarting ? 'starting'
                  : 'disconnected'
        });
    }
    return list;
}

// ── إرسال رسالة لجميع العملاء ──────────────
function broadcast(message) {
    clients.forEach((client) => {
        if (client.readyState === 1) client.send(message);
    });
}

// ── تسجيل رسالة في الكونسول وإرسالها ────────
function logToApp(message, phone = null) {
    const timestamp = new Date().toLocaleTimeString('ar-EG');
    const prefix = phone ? `[${phone}] ` : '';
    const logLine = `[${timestamp}] ${prefix}${message}`;
    console.log(logLine);
    broadcast(logLine);
}

// ── إرسال تحديث قائمة الجلسات ──────────────
function broadcastSessionUpdate() {
    const list = buildSessionList();
    broadcast(`SESSIONS:${JSON.stringify(list)}`);
}

// ── إرسال كود الاقتران ─────────────────────
function broadcastCode(phone, code) {
    const msg = `CODE:${phone}:${code}`;
    console.log(`📤 إرسال كود للبرنامج: ${msg}`);
    broadcast(msg);
    broadcastSessionUpdate();
}

// ── عند اتصال عميل جديد ────────────────────
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[WS] Client connected');

    // إرسال قائمة الجلسات الكاملة
    const allSessions = buildSessionList();
    if (allSessions.length) {
        ws.send(`SESSIONS:${JSON.stringify(allSessions)}`);
    }

    // إرسال الأكواد و QR للجلسات غير المتصلة
    for (const [phone, s] of stateModule.sessions) {
        if (s.lastPairingCode && !s.isConnected) {
            ws.send(`CODE:${phone}:${s.lastPairingCode}`);
        }
        if (s.lastQRBase64 && !s.isConnected) {
            ws.send(`QR:${phone}:${s.lastQRBase64}`);
        }
    }

    // ── معالجة الرسائل الواردة من العميل ────
    ws.on('message', (rawMessage) => {
        const msg = rawMessage.toString();
        if (msg.startsWith('REQUEST_CODE:')) {
            const phone = msg.split(':')[1];
            if (phone) {
                const session = stateModule.getSession(phone);
                if (session && session.lastPairingCode && !session.isConnected) {
                    ws.send(`CODE:${phone}:${session.lastPairingCode}`);
                    logToApp(`📨 تم إعادة إرسال الكود للرقم ${phone} بناءً على طلب العميل`);
                } else {
                    ws.send(`CODE_ERROR:${phone}:no_code`);
                }
            }
        }
    });

    ws.on('close', () => clients.delete(ws));
});

module.exports = {
    broadcast,
    logToApp,
    broadcastSessionUpdate,
    broadcastCode
};