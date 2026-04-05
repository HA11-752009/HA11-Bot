// routes/messages.js
const express = require('express');
const router = express.Router();
const stateModule = require('../state');
const { addToHistory, loadHistory } = require('../persistence');
const { formatPhone } = require('../utils');

function getActiveSock(phone) {
    if (phone) {
        const s = stateModule.getSession(formatPhone(phone));
        return s?.isConnected ? s.sock : null;
    }
    return stateModule.sock;
}

// إرسال رسالة نصية (يدعم sessionPhone)
router.post('/send', async (req, res) => {
    const { to, message, isGroup, sessionPhone } = req.body;
    const sock = getActiveSock(sessionPhone);
    if (!sock) return res.json({ success: false, message: 'البوت غير متصل' });
    try {
        const jid = isGroup ? to : `${formatPhone(to)}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        addToHistory({ id: Date.now(), to: jid, type: 'text', content: message,
                       status: 'sent', timestamp: new Date().toISOString() });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// إرسال وسائط (يدعم sessionPhone)
router.post('/send-media', async (req, res) => {
    const { to, mediaType, mediaUrl, caption, isGroup, sessionPhone } = req.body;
    const sock = getActiveSock(sessionPhone);
    if (!sock) return res.json({ success: false, message: 'البوت غير متصل' });
    try {
        const jid = isGroup ? to : `${formatPhone(to)}@s.whatsapp.net`;
        if (mediaType === 'image') {
            await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: caption || '' });
        } else if (mediaType === 'video') {
            await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: caption || '' });
        } else if (mediaType === 'audio') {
            await sock.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: 'audio/mpeg' });
        } else if (mediaType === 'sticker') {
            await sock.sendMessage(jid, { sticker: { url: mediaUrl } });
        } else {
            return res.json({ success: false, message: 'نوع الوسائط غير معروف' });
        }
        addToHistory({ id: Date.now(), to: jid, type: mediaType, content: mediaUrl,
                       status: 'sent', timestamp: new Date().toISOString() });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// إرسال ملصق (يدعم sessionPhone)
router.post('/send-sticker', async (req, res) => {
    const { to, stickerUrl, isGroup, sessionPhone } = req.body;
    const sock = getActiveSock(sessionPhone);
    if (!sock) return res.json({ success: false, message: 'البوت غير متصل' });
    try {
        const jid = isGroup ? to : `${formatPhone(to)}@s.whatsapp.net`;
        await sock.sendMessage(jid, { sticker: { url: stickerUrl } });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// سجل الرسائل (لا يحتاج sessionPhone لأنه يعود من قاعدة البيانات)
router.get('/history', (req, res) => {
    const history = loadHistory();
    res.json({ messages: history, total: history.length });
});

module.exports = router;
