// =============================================
// bot.js — منطق الاتصال مع دعم Multi-Panel
// =============================================
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const QRCodeTerminal = require('qrcode-terminal');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');

const stateModule = require('./state');
const { broadcast, logToApp, broadcastSessionUpdate, broadcastCode } = require('./ws');
const { getAuthDir, containsLink, isAdminInSession, formatPhone } = require('./utils');
const { loadSettings, saveSettings, addToHistory } = require('./persistence');
const { handleCommand } = require('./handler');
const { QR_DIR } = require('./config');

if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });

function formatPairingCode(code) {
    if (!code) return code;
    const clean = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    return clean;
}

async function startBot(phone) {
    phone = formatPhone(phone);
    if (!phone) { logToApp('❌ رقم الهاتف مطلوب'); return; }

    const session = stateModule.getOrCreateSession(phone);
    if (session.isStarting) { logToApp(`⚠️ الرقم ${phone} بيشتغل بالفعل`, phone); return; }
    if (session.isConnected) { logToApp(`✅ الرقم ${phone} متصل بالفعل`, phone); return; }

    session.isStarting = true;
    session.startTime = Date.now();
    logToApp(`🔄 بدء تشغيل البوت للرقم ${phone}...`, phone);

    try {
        const authDir = getAuthDir(phone);
        const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        session.sock = makeWASocket({
            version,
            auth: authState,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 2000,
        });

        session.sock.ev.on('creds.update', saveCreds);

        session.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                session.lastQR = qr;
                try {
                    QRCodeTerminal.generate(qr, { small: true });
                    const base64 = await QRCode.toDataURL(qr);
                    session.lastQRBase64 = base64;
                    const qrFile = path.join(QR_DIR, `qr_${phone}.png`);
                    await QRCode.toFile(qrFile, qr);
                    broadcast(`QR:${phone}:${base64}`);
                    logToApp(`📱 QR Code جاهز للرقم ${phone}`, phone);
                } catch (e) { logToApp(`⚠️ فشل توليد QR: ${e.message}`, phone); }

                if (!authState.creds.registered && !session.lastPairingCode) {
                    try {
                        logToApp(`📱 طلب كود الاقتران للرقم ${phone}...`, phone);
                        const rawCode = await session.sock.requestPairingCode(phone);
                        const code = formatPairingCode(rawCode);
                        session.lastPairingCode = code;
                        logToApp(`🔑 كود الاقتران: ${code}`, phone);
                        broadcastCode(phone, code);
                    } catch (err) {
                        logToApp(`⚠️ تعذر الحصول على الكود — سيتم استخدام QR: ${err.message}`, phone);
                    }
                }
            }

            if (connection === 'open') {
                session.isConnected = true;
                session.isStarting = false;
                session.lastQR = null;
                session.lastQRBase64 = null;
                session.lastPairingCode = null;
                session.currentName = session.sock.user?.name || phone;
                session.currentPhone = phone;
                logToApp(`✅ الرقم ${phone} متصل بنجاح! 🎉`, phone);
                broadcast(`STATUS:connected:${phone}`);
                broadcastSessionUpdate();

                const s = loadSettings();
                if (!s.welcomeNumber) {
                    s.welcomeNumber = phone;
                    saveSettings(s);
                }
            }

            if (connection === 'close') {
                session.isConnected = false;
                session.isStarting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                logToApp(`🔴 انقطع اتصال ${phone} — كود: ${statusCode}`, phone);
                broadcast(`STATUS:disconnected:${phone}`);
                broadcastSessionUpdate();

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                                        statusCode !== 401 && statusCode !== 403;
                if (shouldReconnect) {
                    logToApp(`🔄 إعادة الاتصال للرقم ${phone} خلال 5 ثواني...`, phone);
                    setTimeout(() => startBot(phone), 5000);
                } else {
                    logToApp(`🚫 تم تسجيل الخروج للرقم ${phone}`, phone);
                    stateModule.removeSession(phone);
                }
            }
        });

        session.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (!msg.message || msg.key.fromMe) continue;

                const settings = loadSettings();
                const from = msg.key.remoteJid;
                if (!from) continue;

                const isGroup = from.endsWith('@g.us');
                const senderJid = isGroup
                    ? (msg.key.participant || msg.pushName)
                    : msg.key.remoteJid;

                const text = (
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    ''
                ).trim();

                session.messagesHandled++;
                stateModule.shared.messagesHandled++;

                // ── حذف الروابط التلقائي مع التحكم بحذف روابط المشرفين ──
                if (isGroup && settings.autoDeleteLinks && containsLink(text)) {
                    const isAdmin = await isAdminInSession(session, from, senderJid);
                    // إذا كان المشرف و deleteAdminLinks == false لا تحذف
                    if (!isAdmin || settings.deleteAdminLinks) {
                        try {
                            await session.sock.sendMessage(from, { delete: msg.key });
                            const warning = settings.linkDeleteWarning || '⛔ لا يُسمح بالروابط';
                            await session.sock.sendMessage(from, {
                                text: `@${senderJid?.split('@')[0]} — ${warning}`,
                                mentions: [senderJid]
                            });
                            logToApp(`🚫 تم حذف رابط من ${senderJid} في ${from}`, phone);
                        } catch (err) {
                            logToApp(`❌ فشل حذف الرابط: ${err.message}`, phone);
                        }
                        continue;
                    }
                }

                // ── مكافحة السبام ──────────────────────────
                if (settings.antiSpam) {
                    const key = `${from}:${senderJid}`;
                    const now = Date.now();
                    if (!session._spamMap) session._spamMap = new Map();
                    const entry = session._spamMap.get(key) || { count: 0, resetAt: now + 10000 };
                    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 10000; }
                    entry.count++;
                    session._spamMap.set(key, entry);
                    if (entry.count > (settings.antiSpamLimit || 5)) {
                        if (settings.antiSpamAction === 'kick' && isGroup) {
                            try { await session.sock.groupParticipantsUpdate(from, [senderJid], 'remove'); } catch {}
                        }
                        continue;
                    }
                }

                // ── معالجة الأوامر ─────────────────────────
                const prefix = settings.commandPrefix || '';
                if (!text.startsWith(prefix) && prefix !== '') continue;

                const commandWord = text.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
                if (!commandWord) continue;

                const senderIsAdmin = isGroup
                    ? await isAdminInSession(session, from, senderJid)
                    : true;

                await handleCommand(from, commandWord, msg, senderJid, senderIsAdmin, session);
            }
        });

        session.sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            const settings = loadSettings();
            for (const p of participants) {
                const participantJid = typeof p === 'string' ? p : (p.id || p.jid || p);
                if (!participantJid) continue;
                const name = participantJid.split('@')[0];
                if (action === 'add' && settings.welcomeEnabled) {
                    const welcomeMsg = (settings.welcomeMessage || 'أهلاً {name}! 🎉')
                        .replace('{name}', `@${name}`)
                        .replace('{group}', id);
                    try {
                        const msgObj = { text: welcomeMsg, mentions: [participantJid] };
                        if (settings.welcomeMediaUrl) {
                            msgObj.image = { url: settings.welcomeMediaUrl };
                            msgObj.caption = welcomeMsg;
                            delete msgObj.text;
                        }
                        await session.sock.sendMessage(id, msgObj);
                    } catch {}
                } else if (action === 'remove' && settings.goodbyeEnabled) {
                    const goodbyeMsg = (settings.goodbyeMessage || 'وداعاً {name} 👋')
                        .replace('{name}', `@${name}`);
                    try {
                        await session.sock.sendMessage(id, { text: goodbyeMsg, mentions: [participantJid] });
                    } catch {}
                }
            }
            logToApp(`👥 ${id}: ${action} — ${participants.map(p => typeof p === 'string' ? p : (p.id || p.jid || p)).join(', ')}`, phone);
        });

        session.sock.ev.on('group-join-request', async (req) => {
            const s = loadSettings();
            if (s.autoAcceptJoinRequests) {
                try {
                    await session.sock.groupRequestParticipantsUpdate(req.groupId, [req.jid], 'approve');
                    logToApp(`✅ قُبل طلب ${req.jid}`, phone);
                } catch (err) {
                    logToApp(`❌ فشل قبول الطلب: ${err.message}`, phone);
                }
            }
        });

    } catch (error) {
        session.isStarting = false;
        logToApp(`❌ فشل تشغيل البوت للرقم ${phone}: ${error.message}`, phone);
    }
}

async function stopBot(phone) {
    phone = formatPhone(phone);
    const session = stateModule.getSession(phone);
    if (!session) { logToApp(`⚠️ لا توجد جلسة للرقم ${phone}`); return; }

    session.isStarting = false;
    if (session.sock) {
        try { await session.sock.logout(); } catch {}
        session.sock = null;
    }
    session.isConnected = false;
    stateModule.removeSession(phone);
    broadcast(`STATUS:disconnected:${phone}`);
    broadcastSessionUpdate();
    logToApp(`🔴 البوت متوقف للرقم ${phone}`, phone);
}

async function generatePairingCodeForNumber(phone) {
    phone = formatPhone(phone);
    if (phone.length < 10) throw new Error('رقم الهاتف قصير جداً');

    const authDir = getAuthDir(phone);
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const pairSock = makeWASocket({
        version,
        auth: authState,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 20000
    });

    pairSock.ev.on('creds.update', saveCreds);

    return new Promise((resolve, reject) => {
        let codeGiven = false;
        const codeTimeout = setTimeout(() => {
            if (!codeGiven) {
                try { pairSock.end(new Error('timeout')); } catch {}
                reject(new Error('انتهت المهلة — تأكد إن الرقم صح أو أعد المحاولة'));
            }
        }, 25000);

        const autoCleanup = setTimeout(() => {
            try { pairSock.end(new Error('auto-cleanup')); } catch {}
            logToApp(`🧹 pairing session انتهت للرقم ${phone}`, phone);
        }, 3 * 60 * 1000);

        pairSock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
            if (qr && !codeGiven) {
                try {
                    logToApp(`📱 طلب كود الاقتران للرقم ${phone}...`, phone);
                    const rawCode = await pairSock.requestPairingCode(phone);
                    const formatted = formatPairingCode(rawCode);
                    codeGiven = true;
                    clearTimeout(codeTimeout);

                    const session = stateModule.getOrCreateSession(phone);
                    session.lastPairingCode = formatted;
                    session.lastQR = null;
                    session.lastQRBase64 = null;

                    broadcastCode(phone, formatted);
                    setTimeout(() => {
                        const s = stateModule.getSession(phone);
                        if (s && s.lastPairingCode === formatted && !s.isConnected) {
                            broadcastCode(phone, formatted);
                            logToApp(`🔄 إعادة إرسال الكود للرقم ${phone} (تأكيد)`, phone);
                        }
                    }, 1000);

                    logToApp(`🔑 كود جاهز للرقم ${phone}: ${formatted}`, phone);
                    resolve(formatted);
                } catch (err) {
                    clearTimeout(codeTimeout);
                    clearTimeout(autoCleanup);
                    try { pairSock.end(new Error('error')); } catch {}
                    reject(new Error(`فشل طلب الكود: ${err.message}`));
                }
                return;
            }

            if (connection === 'open') {
                clearTimeout(autoCleanup);
                logToApp(`✅ تم ربط ${phone} بنجاح عبر الكود`, phone);
                setTimeout(() => { try { pairSock.end(new Error('done')); } catch {} }, 2000);
                setTimeout(() => startBot(phone), 3000);
            }

            if (connection === 'close') {
                clearTimeout(autoCleanup);
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 515 || statusCode === 401) {
                    logToApp(`🔄 بدء البوت للرقم ${phone} بعد الاقتران`, phone);
                    setTimeout(() => startBot(phone), 2000);
                }
            }
        });
    });
}

module.exports = { startBot, stopBot, generatePairingCodeForNumber };