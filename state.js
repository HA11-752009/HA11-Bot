// =============================================
// state.js — دعم multi-panel (أكثر من رقم)
// =============================================

/**
 * sessions: Map<phone, SessionState>
 * كل session تحتوي على بيانات رقم واحد
 */
const sessions = new Map();

function createSession(phone) {
    return {
        sock:            null,
        isConnected:     false,
        isStarting:      false,
        currentPhone:    phone,
        currentName:     '',
        messagesHandled: 0,
        startTime:       Date.now(),
        lastQR:          null,
        lastQRBase64:    null,
        lastPairingCode: null,
        pairingAttempts: 0,
        warnings:        new Map(), // JID → count
    };
}

function getSession(phone) {
    if (!phone) return null;
    return sessions.get(String(phone).replace(/\D/g, '')) || null;
}

function getOrCreateSession(phone) {
    const p = String(phone).replace(/\D/g, '');
    if (!sessions.has(p)) sessions.set(p, createSession(p));
    return sessions.get(p);
}

function removeSession(phone) {
    sessions.delete(String(phone).replace(/\D/g, ''));
}

// ── الجلسة الأولى المتصلة (للتوافق مع الكود القديم) ───────
function getPrimarySession() {
    for (const [, s] of sessions) {
        if (s.isConnected) return s;
    }
    return null;
}

// ── متغيرات مشتركة ─────────────────────────
const shared = {
    startTime:       Date.now(),
    messagesHandled: 0,
};

module.exports = {
    sessions,
    createSession,
    getSession,
    getOrCreateSession,
    removeSession,
    getPrimarySession,
    shared,

    // ── Legacy compat (single-session) ─────────────────
    get sock()          { const s = getPrimarySession(); return s ? s.sock : null; },
    get isConnected()   { return getPrimarySession()?.isConnected || false; },
    get currentPhone()  { return getPrimarySession()?.currentPhone || ''; },
    get currentName()   { return getPrimarySession()?.currentName || ''; },
};
