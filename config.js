// =============================================
// config.js — ثوابت التطبيق
// =============================================
const path = require('path');

module.exports = {
    HTTP_PORT:      3000,
    WS_PORT:        3001,
    COMMANDS_FILE:  path.join(__dirname, 'commands.json'),
    SETTINGS_FILE:  path.join(__dirname, 'settings.json'),
    HISTORY_FILE:   path.join(__dirname, 'history.json'),
    QR_DIR:         path.join(__dirname, 'qr_codes'),
    PLUGINS_DIR:    path.join(__dirname, 'plugins'),
    AUTH_BASE_DIR:  path.join(__dirname, 'auth_sessions'),

    DEFAULT_SETTINGS: {
        // ── أساسي ──────────────────────────────────
        botName:                'HA11 Bot 🤖',
        botOwner:               '201150210055',           // رقم مالك البوت
        commandPrefix:          '',
        language:               'ar',

        // ── الاتصال (Multi-Panel) ─────────────────
        welcomeNumber:          '201150210055',
        extraPhones:            [],           // أرقام إضافية

        // ── رسائل الترحيب والوداع ─────────────────
        welcomeMessage:         'أهلاً {name} في المجموعة! 🎉',
        welcomeMediaUrl:        '',           // صورة ترحيبية (رابط)
        goodbyeMessage:         'وداعاً {name} 👋',
        welcomeEnabled:         true,
        goodbyeEnabled:         true,

        // ── الحماية ────────────────────────────────
        // ── حماية الروابط ─────────────────────────
        autoDeleteLinks:        true,      // تفعيل حذف الروابط تلقائياً
        linkDeleteWarning:      '⛔ لا يُسمح بالروابط',  // رسالة التحذير
        deleteAdminLinks:       false,      // هل يتم حذف روابط المشرفين أيضاً؟ (اختياري)
        antiSpam:               true,
        antiSpamLimit:          5,
        antiSpamAction:         'warn',       // warn | kick | ban
        antiFake:               false,
        autoAcceptJoinRequests: false,
        adminOnly:              false,
        maxWarnings:            3,
        warningAction:          'kick',       // kick | ban

        // ── الردود التلقائية ───────────────────────
        autoReplyEnabled:       true,
        autoReplyMessage:       'HA11 Bot',
        aiReplyEnabled:         false,

        // ── الألعاب ────────────────────────────────
        gamesEnabled:           true,

        // ── الموسيقى / التنزيل ────────────────────
        musicEnabled:           true,
        musicMaxSizeMB:         15,

        // ── الصور والمساعدات ──────────────────────
        helpImageUrl:           'vid/bng.jpg',           // رابط صورة المساعدة
        botAvatar:              'vid/bng.jpg',           // صورة البوت الشخصية
    }
};