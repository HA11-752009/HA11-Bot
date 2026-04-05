// routes/settings.js — إدارة الإعدادات والأرقام الإضافية (Multi-Panel)
const express = require('express');
const router = express.Router();
const stateModule = require('../state');
const { loadSettings, saveSettings } = require('../persistence');
const { formatPhone } = require('../utils');
const { startBot, stopBot } = require('../bot');

// ── الحصول على جميع الإعدادات ─────────────────
router.get('/', (req, res) => {
    const settings = loadSettings();
    res.json(settings);
});

// ── تحديث الإعدادات (بما فيها welcomeNumber و extraPhones) ──
router.put('/', (req, res) => {
    const newSettings = req.body;
    const current = loadSettings();
    const merged = { ...current, ...newSettings };
    
    // التحقق من welcomeNumber (تنسيقه)
    if (merged.welcomeNumber) {
        merged.welcomeNumber = formatPhone(merged.welcomeNumber);
    }
    // التحقق من extraPhones (تنسيق كل رقم)
    if (Array.isArray(merged.extraPhones)) {
        merged.extraPhones = merged.extraPhones.map(p => formatPhone(p)).filter(p => p);
    } else {
        merged.extraPhones = [];
    }
    
    saveSettings(merged);
    
    // تحديث الجلسة الأساسية في state (للتوافق مع الكود القديم)
    const primary = stateModule.getPrimarySession();
    if (primary) {
        primary.currentName = merged.botName;
    } else if (stateModule.sock) {
        // محاكاة للتوافق
        stateModule.currentName = merged.botName;
        stateModule.currentPhone = merged.welcomeNumber;
    }
    
    res.json({ success: true, settings: merged });
});

// ── إضافة رقم إضافي ─────────────────────────
router.post('/add-phone', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    }
    const cleaned = formatPhone(phone);
    if (cleaned.length < 10) {
        return res.status(400).json({ error: 'رقم غير صالح' });
    }
    
    const settings = loadSettings();
    if (!settings.extraPhones) settings.extraPhones = [];
    
    if (settings.welcomeNumber === cleaned) {
        return res.status(409).json({ error: 'الرقم موجود بالفعل كرقم رئيسي' });
    }
    if (settings.extraPhones.includes(cleaned)) {
        return res.status(409).json({ error: 'الرقم موجود بالفعل في القائمة' });
    }
    
    settings.extraPhones.push(cleaned);
    saveSettings(settings);
    
    // تشغيل الجلسة تلقائياً للرقم الجديد
    try {
        await startBot(cleaned);
    } catch (err) {
        console.error(`فشل تشغيل الرقم ${cleaned}:`, err);
    }
    
    res.json({ success: true, extraPhones: settings.extraPhones });
});

// ── حذف رقم إضافي ──────────────────────────
router.delete('/remove-phone', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    }
    const cleaned = formatPhone(phone);
    const settings = loadSettings();
    if (!settings.extraPhones) settings.extraPhones = [];
    
    if (!settings.extraPhones.includes(cleaned)) {
        return res.status(404).json({ error: 'الرقم غير موجود في القائمة' });
    }
    
    settings.extraPhones = settings.extraPhones.filter(p => p !== cleaned);
    saveSettings(settings);
    
    // إيقاف الجلسة إذا كانت نشطة
    try {
        await stopBot(cleaned);
    } catch (err) {
        console.error(`فشل إيقاف الرقم ${cleaned}:`, err);
    }
    
    res.json({ success: true, extraPhones: settings.extraPhones });
});

// ── الحصول على قائمة الأرقام الإضافية فقط ───
router.get('/phones', (req, res) => {
    const settings = loadSettings();
    res.json({
        welcomeNumber: settings.welcomeNumber || null,
        extraPhones: settings.extraPhones || []
    });
});

// ── تعيين الرقم الأساسي (welcomeNumber) ─────
router.post('/set-primary', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    }
    const cleaned = formatPhone(phone);
    if (cleaned.length < 10) {
        return res.status(400).json({ error: 'رقم غير صالح' });
    }
    
    const settings = loadSettings();
    const oldPrimary = settings.welcomeNumber;
    
    settings.welcomeNumber = cleaned;
    // إذا كان الرقم موجوداً في extraPhones، نزيله من هناك
    if (settings.extraPhones && settings.extraPhones.includes(cleaned)) {
        settings.extraPhones = settings.extraPhones.filter(p => p !== cleaned);
    }
    saveSettings(settings);
    
    // تشغيل الجلسة الجديدة (إذا لم تكن نشطة)
    try {
        await startBot(cleaned);
    } catch (err) {
        console.error(`فشل تشغيل الرقم الأساسي ${cleaned}:`, err);
    }
    
    // لا نوقف الجلسة القديمة تلقائياً، يمكن أن تبقى كجلسة إضافية إذا كانت في extraPhones سابقاً
    res.json({ success: true, welcomeNumber: cleaned });
});

module.exports = router;