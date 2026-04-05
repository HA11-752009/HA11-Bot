// =============================================
// utils.js — دوال مساعدة
// =============================================
const os   = require('os');
const path = require('path');
const { AUTH_BASE_DIR } = require('./config');
const fs = require('fs');

if (!fs.existsSync(AUTH_BASE_DIR)) fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });

function getLocalIp() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

function getAuthDir(phone) {
    const dir = path.join(AUTH_BASE_DIR, `session_${phone}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}س ${m}د ${s}ث`;
}

function containsLink(text) {
    return /https?:\/\/\S+|wa\.me\/\S+|t\.me\/\S+/i.test(text);
}

async function isAdmin(groupJid, userJid) {
    const stateModule = require('./state');
    const s = stateModule.getPrimarySession();
    if (!s || !s.sock) return false;
    try {
        const meta = await s.sock.groupMetadata(groupJid);
        return meta.participants.some(p => p.id === userJid && (p.admin === 'admin' || p.admin === 'superadmin'));
    } catch { return false; }
}

async function isAdminInSession(session, groupJid, userJid) {
    if (!session || !session.sock) return false;
    try {
        const meta = await session.sock.groupMetadata(groupJid);
        return meta.participants.some(p => p.id === userJid && (p.admin === 'admin' || p.admin === 'superadmin'));
    } catch { return false; }
}

function getTargetJid(msg) {
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    return ctxInfo?.participant || null;
}

async function getParticipantName(sock, groupJid, participantJid) {
    try {
        const meta = await sock.groupMetadata(groupJid);
        const p    = meta.participants.find(p => p.id === participantJid);
        return p?.pushName || participantJid.split('@')[0];
    } catch { return participantJid.split('@')[0]; }
}

function getPhoneFromJid(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

function formatPhone(phone) {
    return phone.replace(/\D/g, '');
}

module.exports = {
    getLocalIp,
    getAuthDir,
    formatTime,
    containsLink,
    isAdmin,
    isAdminInSession,
    getTargetJid,
    getParticipantName,
    getPhoneFromJid,
    formatPhone,
};
