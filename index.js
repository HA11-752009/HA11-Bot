// =============================================
// index.js — نقطة البداية (Multi-Panel Support + Auto-restart)
// =============================================
const express = require('express');
const cors    = require('cors');
const stateModule  = require('./state');
const { HTTP_PORT } = require('./config');
const { getLocalIp, formatTime } = require('./utils');
const { logToApp }  = require('./ws');
const { loadPlugins } = require('./handler');
const { loadSettings, saveSettings } = require('./persistence');
const { startBot } = require('./bot');

// ── تحميل الـ plugins ────────────────────
loadPlugins();

// ── Express ─────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Routes ───────────────────────────────
app.use('/api/bot',      require('./routes/bot'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/groups',   require('./routes/groups'));
app.use('/api/commands', require('./routes/commands'));
app.use('/api/settings', require('./routes/settings'));

// ── Contacts ─────────────────────────────
app.get('/api/contacts', (req, res) => {
    const session = req.query.phone
        ? stateModule.getSession(req.query.phone)
        : stateModule.getPrimarySession();
    if (!session?.isConnected) return res.json({ contacts: [], total: 0 });
    try {
        const contacts = session.sock.contacts
            ? Object.values(session.sock.contacts).map(c => ({
                id:     c.id,
                name:   c.name || c.notify || c.id.split('@')[0],
                number: c.id.split('@')[0]
              }))
            : [];
        res.json({ contacts, total: contacts.length });
    } catch { res.json({ contacts: [], total: 0 }); }
});

// ── Chats ────────────────────────────────
app.get('/api/chats', async (req, res) => {
    const session = req.query.phone
        ? stateModule.getSession(req.query.phone)
        : stateModule.getPrimarySession();
    if (!session?.isConnected) return res.json({ chats: [], total: 0 });
    try {
        const chats = await session.sock.getChats?.() || [];
        const list  = chats.map(c => ({
            id:          c.id,
            name:        c.name,
            isGroup:     c.id?.endsWith('@g.us'),
            unreadCount: c.unreadCount,
            lastMessage: c.messages?.[0]?.message?.conversation || ''
        }));
        res.json({ chats: list, total: list.length });
    } catch { res.json({ chats: [], total: 0 }); }
});

// ── Profile Picture ───────────────────────
app.get('/api/profile/pic', async (req, res) => {
    const phone = req.query.phone;
    const session = phone
        ? stateModule.getSession(phone)
        : stateModule.getPrimarySession();
    if (!session?.isConnected) return res.json({ url: null });
    try {
        const url = await session.sock.profilePictureUrl(
            `${session.currentPhone}@s.whatsapp.net`, 'image'
        );
        res.json({ url });
    } catch { res.json({ url: null }); }
});

// ── Dashboard ─────────────────────────────
const LOCAL_IP = getLocalIp();

app.get('/', (req, res) => {
    const sessions = [];
    for (const [phone, s] of stateModule.sessions) {
        sessions.push({
            phone, name: s.currentName || phone,
            connected: s.isConnected,
            messages: s.messagesHandled,
            uptime: formatTime(Math.floor((Date.now() - s.startTime) / 1000))
        });
    }

    const totalConnected = sessions.filter(s => s.connected).length;

    const sessionRows = sessions.map(s => `
        <tr style="border-bottom:1px solid #333">
          <td style="padding:8px">${s.phone}</td>
          <td style="padding:8px">${s.name}</td>
          <td style="padding:8px;color:${s.connected ? 'lime' : 'red'}">${s.connected ? '✅ متصل' : '🔴 منقطع'}</td>
          <td style="padding:8px">${s.messages}</td>
          <td style="padding:8px">${s.uptime}</td>
        </tr>
    `).join('');

    res.send(`
        <html><body style="background:#0a0a1a;color:#0f0;font-family:monospace;padding:20px;">
        <h1 style="text-align:center">🤖 WhatsApp Bot Manager — Multi-Panel</h1>
        <p style="text-align:center">إجمالي الجلسات: ${sessions.length} | متصل: ${totalConnected}</p>
        <p style="text-align:center">API: http://${LOCAL_IP}:${HTTP_PORT}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:20px">
          <tr style="background:#1a1a3a">
            <th style="padding:8px">الرقم</th>
            <th style="padding:8px">الاسم</th>
            <th style="padding:8px">الحالة</th>
            <th style="padding:8px">الرسائل</th>
            <th style="padding:8px">وقت التشغيل</th>
          </tr>
          ${sessionRows || '<tr><td colspan="5" style="text-align:center;padding:20px">لا توجد جلسات نشطة</td></tr>'}
        </table>
        <p style="text-align:center;margin-top:20px;color:#888">الإصدار v3.0 — Multi-Panel WhatsApp Bot</p>
        </body></html>
    `);
});

// ── تشغيل الجلسات المحفوظة تلقائياً ──────
async function startAllSessions() {
    const settings = loadSettings();
    const phones = new Set();
    
    if (settings.welcomeNumber) phones.add(settings.welcomeNumber);
    if (Array.isArray(settings.extraPhones)) {
        settings.extraPhones.forEach(p => phones.add(p));
    }
    
    if (phones.size === 0) {
        logToApp('ℹ️ لا توجد جلسات محفوظة لبدء تشغيلها.');
        return;
    }
    
    logToApp(`🔄 جاري تشغيل ${phones.size} جلسة محفوظة...`);
    for (const phone of phones) {
        if (phone && phone.trim()) {
            logToApp(`🔄 بدء الجلسة المحفوظة: ${phone}`);
            try {
                await startBot(phone);
            } catch (err) {
                logToApp(`❌ فشل بدء الجلسة ${phone}: ${err.message}`);
            }
        }
    }
}

// ── Start Server ─────────────────────────
app.listen(HTTP_PORT, '0.0.0.0', () => {
    logToApp(`🌐 API Server: http://${LOCAL_IP}:${HTTP_PORT}`);
    logToApp(`🖥️  IP: ${LOCAL_IP}`);
    logToApp(`📡 Multi-Panel Mode: نشط ✅`);
    
    // تشغيل الجلسات المحفوظة بعد بدء الخادم
    startAllSessions().catch(console.error);
});