// =============================================
// persistence.js — قراءة/كتابة الملفات
// =============================================
const fs   = require('fs');
const { COMMANDS_FILE, SETTINGS_FILE, HISTORY_FILE, DEFAULT_SETTINGS } = require('./config');

// ── Settings ──────────────────────────────
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE))
            return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    } catch {}
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
    const merged = { ...loadSettings(), ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
    return merged;
}

// ── Commands ──────────────────────────────
function loadCommands() {
    try {
        if (fs.existsSync(COMMANDS_FILE))
            return JSON.parse(fs.readFileSync(COMMANDS_FILE, 'utf8'));
    } catch {}
    return [];
}

function saveCommands(commands) {
    fs.writeFileSync(COMMANDS_FILE, JSON.stringify(commands, null, 2));
}

// ── History ───────────────────────────────
function addToHistory(item) {
    let history = [];
    try {
        if (fs.existsSync(HISTORY_FILE))
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {}
    history.unshift(item);
    if (history.length > 500) history.length = 500;
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE))
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {}
    return [];
}

module.exports = { loadSettings, saveSettings, loadCommands, saveCommands, addToHistory, loadHistory };
