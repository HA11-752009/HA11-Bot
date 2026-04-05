// =============================================
// config.js — ثوابت التطبيق (مع دعم متغيرات البيئة)
// =============================================
const path = require('path');
require('dotenv').config();  // لقراءة ملف .env محلياً (اختياري)

// دالة لقراءة القيم الرقمية من البيئة
const getEnvNumber = (key, defaultValue) => {
    const val = process.env[key];
    return val ? parseInt(val, 10) : defaultValue;
};

// دالة لقراءة القيم المنطقية (true/false)
const getEnvBoolean = (key, defaultValue) => {
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
};

// دالة لقراءة المصفوفات (مفصولة بفواصل)
const getEnvArray = (key, defaultValue) => {
    const val = process.env[key];
    if (!val) return defaultValue;
    return val.split(',').map(s => s.trim()).filter(s => s);
};

module.exports = {
    // ========== المنافذ ==========
    HTTP_PORT: getEnvNumber('HTTP_PORT', process.env.PORT ? parseInt(process.env.PORT) : 3000),
    WS_PORT:   getEnvNumber('WS_PORT', 3001),

    // ========== المسارات ==========
    COMMANDS_FILE:  process.env.COMMANDS_FILE  || path.join(__dirname, 'commands.json'),
    SETTINGS_FILE:  process.env.SETTINGS_FILE  || path.join(__dirname, 'settings.json'),
    HISTORY_FILE:   process.env.HISTORY_FILE   || path.join(__dirname, 'history.json'),
    QR_DIR:         process.env.QR_DIR         || path.join(__dirname, 'qr_codes'),
    PLUGINS_DIR:    process.env.PLUGINS_DIR    || path.join(__dirname, 'plugins'),
    AUTH_BASE_DIR:  process.env.AUTH_BASE_DIR  || path.join(__dirname, 'auth_sessions'),

    // ========== الإعدادات الأساسية (يمكن تجاوزها بالكامل أو جزئياً) ==========
    DEFAULT_SETTINGS: {
        // أساسي
        botName:        process.env.BOT_NAME        || 'HA11 Bot 🤖',
        botOwner:       process.env.BOT_OWNER       || '201150210055',
        commandPrefix:  process.env.COMMAND_PREFIX  || '',
        language:       process.env.LANGUAGE        || 'ar',

        // الاتصال (Multi-Panel)
        welcomeNumber:  process.env.WELCOME_NUMBER  || '201150210055',
        extraPhones:    getEnvArray('EXTRA_PHONES', []),

        // رسائل الترحيب والوداع
        welcomeMessage:   process.env.WELCOME_MESSAGE   || 'أهلاً {name} في المجموعة! 🎉',
        welcomeMediaUrl:  process.env.WELCOME_MEDIA_URL || '',
        goodbyeMessage:   process.env.GOODBYE_MESSAGE   || 'وداعاً {name} 👋',
        welcomeEnabled:   getEnvBoolean('WELCOME_ENABLED', true),
        goodbyeEnabled:   getEnvBoolean('GOODBYE_ENABLED', true),

        // الحماية - الروابط
        autoDeleteLinks:  getEnvBoolean('AUTO_DELETE_LINKS', true),
        linkDeleteWarning: process.env.LINK_DELETE_WARNING || '⛔ لا يُسمح بالروابط',
        deleteAdminLinks: getEnvBoolean('DELETE_ADMIN_LINKS', false),

        // مكافحة السبام
        antiSpam:         getEnvBoolean('ANTI_SPAM', true),
        antiSpamLimit:    getEnvNumber('ANTI_SPAM_LIMIT', 5),
        antiSpamAction:   process.env.ANTI_SPAM_ACTION || 'warn',   // warn, kick, ban
        antiFake:         getEnvBoolean('ANTI_FAKE', false),
        autoAcceptJoinRequests: getEnvBoolean('AUTO_ACCEPT_JOIN', false),
        adminOnly:        getEnvBoolean('ADMIN_ONLY', false),
        maxWarnings:      getEnvNumber('MAX_WARNINGS', 3),
        warningAction:    process.env.WARNING_ACTION || 'kick',     // kick, ban

        // الردود التلقائية
        autoReplyEnabled: getEnvBoolean('AUTO_REPLY_ENABLED', true),
        autoReplyMessage: process.env.AUTO_REPLY_MESSAGE || 'HA11 Bot',
        aiReplyEnabled:   getEnvBoolean('AI_REPLY_ENABLED', false),

        // الألعاب
        gamesEnabled:     getEnvBoolean('GAMES_ENABLED', true),

        // الموسيقى / التنزيل
        musicEnabled:     getEnvBoolean('MUSIC_ENABLED', true),
        musicMaxSizeMB:   getEnvNumber('MUSIC_MAX_SIZE_MB', 15),

        // الصور والمساعدات
        helpImageUrl:     process.env.HELP_IMAGE_URL || 'vid/bng.jpg',
        botAvatar:        process.env.BOT_AVATAR    || 'vid/bng.jpg',
    }
};
