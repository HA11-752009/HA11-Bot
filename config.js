// =============================================
// config.js — ثوابت التطبيق (مع دعم .env)
// =============================================
const path = require('path');
require('dotenv').config();

const getEnv = (key, defaultValue) => process.env[key] || defaultValue;
const getEnvNumber = (key, defaultValue) => {
    const val = process.env[key];
    return val ? parseInt(val, 10) : defaultValue;
};
const getEnvBoolean = (key, defaultValue) => {
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
};
const getEnvArray = (key, defaultValue) => {
    const val = process.env[key];
    if (!val) return defaultValue;
    return val.split(',').map(s => s.trim()).filter(s => s);
};

module.exports = {
    // المنافذ
    HTTP_PORT: getEnvNumber('HTTP_PORT', process.env.PORT ? parseInt(process.env.PORT) : 3000),
    WS_PORT:   getEnvNumber('WS_PORT', 3001),

    // المسارات
    COMMANDS_FILE:  getEnv('COMMANDS_FILE', path.join(__dirname, 'commands.json')),
    SETTINGS_FILE:  getEnv('SETTINGS_FILE', path.join(__dirname, 'settings.json')),
    HISTORY_FILE:   getEnv('HISTORY_FILE', path.join(__dirname, 'history.json')),
    QR_DIR:         getEnv('QR_DIR', path.join(__dirname, 'qr_codes')),
    PLUGINS_DIR:    getEnv('PLUGINS_DIR', path.join(__dirname, 'plugins')),
    AUTH_BASE_DIR:  getEnv('AUTH_BASE_DIR', path.join(__dirname, 'auth_sessions')),

    // الإعدادات الافتراضية (تقرأ من .env)
    DEFAULT_SETTINGS: {
        botName:        getEnv('BOT_NAME', 'HA11 Bot 🤖'),
        botOwner:       getEnv('BOT_OWNER', '201150210055'),
        commandPrefix:  getEnv('COMMAND_PREFIX', ''),
        language:       getEnv('LANGUAGE', 'ar'),

        welcomeNumber:  getEnv('WELCOME_NUMBER', '201150210055'),
        extraPhones:    getEnvArray('EXTRA_PHONES', []),

        welcomeMessage:   getEnv('WELCOME_MESSAGE', 'أهلاً {name} في المجموعة! 🎉'),
        welcomeMediaUrl:  getEnv('WELCOME_MEDIA_URL', ''),
        goodbyeMessage:   getEnv('GOODBYE_MESSAGE', 'وداعاً {name} 👋'),
        welcomeEnabled:   getEnvBoolean('WELCOME_ENABLED', true),
        goodbyeEnabled:   getEnvBoolean('GOODBYE_ENABLED', true),

        autoDeleteLinks:  getEnvBoolean('AUTO_DELETE_LINKS', true),
        linkDeleteWarning: getEnv('LINK_DELETE_WARNING', '⛔ لا يُسمح بالروابط'),
        deleteAdminLinks: getEnvBoolean('DELETE_ADMIN_LINKS', false),

        antiSpam:         getEnvBoolean('ANTI_SPAM', true),
        antiSpamLimit:    getEnvNumber('ANTI_SPAM_LIMIT', 5),
        antiSpamAction:   getEnv('ANTI_SPAM_ACTION', 'warn'),
        antiFake:         getEnvBoolean('ANTI_FAKE', false),
        autoAcceptJoinRequests: getEnvBoolean('AUTO_ACCEPT_JOIN', false),
        adminOnly:        getEnvBoolean('ADMIN_ONLY', false),
        maxWarnings:      getEnvNumber('MAX_WARNINGS', 3),
        warningAction:    getEnv('WARNING_ACTION', 'kick'),

        autoReplyEnabled: getEnvBoolean('AUTO_REPLY_ENABLED', true),
        autoReplyMessage: getEnv('AUTO_REPLY_MESSAGE', 'HA11 Bot'),
        aiReplyEnabled:   getEnvBoolean('AI_REPLY_ENABLED', false),

        gamesEnabled:     getEnvBoolean('GAMES_ENABLED', true),
        musicEnabled:     getEnvBoolean('MUSIC_ENABLED', true),
        musicMaxSizeMB:   getEnvNumber('MUSIC_MAX_SIZE_MB', 15),

        helpImageUrl:     getEnv('HELP_IMAGE_URL', 'vid/bng.jpg'),
        botAvatar:        getEnv('BOT_AVATAR', 'vid/bng.jpg'),
    }
};
