// =============================================
// handler.js — موزّع الأوامر + نظام الـ Plugins + تحذيرات تلقائية
// =============================================
const fs = require('fs');
const path = require('path');
const { PLUGINS_DIR } = require('./config');
const { logToApp } = require('./ws');
const { loadCommands, saveCommands, addToHistory, loadSettings } = require('./persistence');
const { getTargetJid, containsLink, getParticipantName } = require('./utils');

// ── محاولة تحميل نظام التحذيرات (اختياري) ──
let warningsModule;
try {
    warningsModule = require('./plugins/warnings');
    if (warningsModule && typeof warningsModule.addWarning === 'function') {
        logToApp('⚠️ تم تحميل نظام التحذيرات بنجاح');
    } else {
        warningsModule = null;
    }
} catch (e) {
    warningsModule = null;
    logToApp('⚠️ نظام التحذيرات غير موجود (plugins/warnings.js)');
}

const pluginMap = new Map();

// ── تحميل جميع الـ plugins من مجلد plugins ──
function loadPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
        return;
    }

    const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(PLUGINS_DIR, file))];
            const plugin = require(path.join(PLUGINS_DIR, file));
            const cmds = Array.isArray(plugin) ? plugin : [plugin];

            for (const cmd of cmds) {
                if (!cmd.trigger || typeof cmd.handler !== 'function') continue;
                pluginMap.set(cmd.trigger.toLowerCase(), cmd);
                logToApp(`🔌 Plugin loaded: ${cmd.trigger} (${file})`);
            }
        } catch (err) {
            logToApp(`❌ فشل تحميل plugin "${file}": ${err.message}`);
        }
    }
}

// مجموعة أوامر المجموعة التي تتطلب مشرفاً
const GROUP_ACTIONS = new Set([
    'promote', 'demote', 'kick', 'close_group', 'open_group',
    'delete_links', 'approve', 'reject_join'
]);

// ── المعالج الرئيسي للأوامر ─────────────────
async function handleCommand(from, command, originalMsg, senderJid, senderIsAdmin, session) {
    const settings = loadSettings();
    const prefix = settings.commandPrefix || '';
    const isGroup = from.endsWith('@g.us');
    const sock = session?.sock || require('./state').sock;
    if (!sock) return;

    const fullText = (
        originalMsg.message?.conversation ||
        originalMsg.message?.extendedTextMessage?.text || ''
    ).trim();
    const args = fullText.slice(prefix.length).trim().split(/\s+/).slice(1);

    const ctx = {
        sock, from, msg: originalMsg, senderJid, senderIsAdmin,
        settings, isGroup, fullText, args, prefix, session
    };

    // 1. الأوامر المباشرة من الـ plugins
    if (pluginMap.has(command)) {
        const plugin = pluginMap.get(command);
        if (plugin.adminOnly && !senderIsAdmin && isGroup) {
            await giveWarning(sock, from, senderJid, `محاولة استخدام أمر مشرف: ${command}`);
            await sock.sendMessage(from, {
                text: `❌ هذا الأمر للمشرفين فقط! تم تسجيل مخالفة.`,
                mentions: [senderJid]
            });
            return;
        }
        return await executePlugin(plugin, ctx, command);
    }

    // 2. الأوامر المخصصة من قاعدة البيانات
    const commands = loadCommands();
    const customCmd = commands.find(c => c.trigger.toLowerCase() === command && c.isEnabled);

    if (!customCmd) {
        logToApp(`⚠️ لا يوجد أمر: ${command}`);
        return;
    }

    // 3. أوامر plugins عبر DB
    if (customCmd.actionType === 'plugin' && customCmd.pluginTrigger) {
        const plugin = pluginMap.get(customCmd.pluginTrigger.toLowerCase());
        if (plugin) {
            if (plugin.adminOnly && !senderIsAdmin && isGroup) {
                await giveWarning(sock, from, senderJid, `محاولة استخدام أمر مشرف: ${command}`);
                await sock.sendMessage(from, {
                    text: `❌ هذا الأمر للمشرفين فقط! تم تسجيل مخالفة.`,
                    mentions: [senderJid]
                });
                return;
            }
            return await executePlugin(plugin, ctx, command);
        }
        await sock.sendMessage(from, { text: `❌ الـ plugin غير متوفر` });
        return;
    }

    // 4. أوامر المجموعة (GROUP_ACTIONS) تتطلب مشرفاً
    if (GROUP_ACTIONS.has(customCmd.actionType)) {
        if (!isGroup) {
            await sock.sendMessage(from, { text: '❌ هذا الأمر يعمل فقط في المجموعات' });
            return;
        }
        if (!senderIsAdmin) {
            await giveWarning(sock, from, senderJid, `محاولة استخدام أمر مشرف: ${command}`);
            await sock.sendMessage(from, {
                text: `❌ هذا الأمر للمشرفين فقط! تم تسجيل مخالفة.`,
                mentions: [senderJid]
            });
            return;
        }
    }

    await executeDbCommand(customCmd, ctx, commands);
}

// ── دالة مساعدة لإعطاء تحذير (تستدعي نظام التحذيرات) ──
async function giveWarning(sock, groupId, userJid, reason) {
    if (warningsModule && typeof warningsModule.addWarning === 'function') {
        try {
            await warningsModule.addWarning(sock, groupId, userJid, reason);
        } catch (err) {
            logToApp(`❌ فشل إعطاء تحذير: ${err.message}`);
        }
    } else {
        logToApp(`⚠️ تحذير: ${reason} (نظام التحذيرات غير مفعل)`);
    }
}

async function executePlugin(plugin, ctx, command) {
    if (plugin.groupOnly && !ctx.isGroup) {
        await ctx.sock.sendMessage(ctx.from, { text: '❌ هذا الأمر يعمل فقط في المجموعات' });
        return;
    }
    try {
        await plugin.handler(ctx);
        logToApp(`✅ Plugin: ${ctx.prefix}${command}`);
    } catch (err) {
        logToApp(`❌ Plugin فشل "${command}": ${err.message}`);
        try { await ctx.sock.sendMessage(ctx.from, { text: `❌ خطأ: ${err.message}` }); } catch {}
    }
}

async function executeDbCommand(customCmd, ctx, commands) {
    const { sock, from, msg, senderJid, prefix } = ctx;
    const actionType = customCmd.actionType;
    const actionData = customCmd.actionData || customCmd.response || '';

    try {
        switch (actionType) {
            case 'text': {
                let response = actionData;
                response = response
                    .replace('{sender}', `@${senderJid?.split('@')[0]}`)
                    .replace('{prefix}', prefix);
                await sock.sendMessage(from, { text: response, mentions: [senderJid] });
                break;
            }
            case 'image': {
                const mediaUrl = customCmd.mediaUrl || actionData;
                const caption = customCmd.caption || actionData || '';
                if (mediaUrl) {
                    await sock.sendMessage(from, {
                        image: { url: mediaUrl },
                        caption: caption
                    });
                } else {
                    await sock.sendMessage(from, { text: '⚠️ رابط الصورة غير موجود' });
                }
                break;
            }
            case 'video': {
                const mediaUrl = customCmd.mediaUrl || actionData;
                const caption = customCmd.caption || actionData || '';
                if (mediaUrl) {
                    await sock.sendMessage(from, {
                        video: { url: mediaUrl },
                        caption: caption
                    });
                } else {
                    await sock.sendMessage(from, { text: '⚠️ رابط الفيديو غير موجود' });
                }
                break;
            }
            case 'promote': {
                const targetJid = getTargetJid(msg);
                if (!targetJid) {
                    await sock.sendMessage(from, { text: '⚠️ اقتبس رسالة العضو أو اذكر اسمه (@username)' });
                    break;
                }
                await sock.groupParticipantsUpdate(from, [targetJid], 'promote');
                const targetName = await getParticipantName(sock, from, targetJid);
                const msgText = actionData || `✅ تم ترقية ${targetName} إلى مشرف 🎉`;
                await sock.sendMessage(from, {
                    text: msgText,
                    mentions: [targetJid]
                });
                break;
            }
            case 'demote': {
                const targetJid = getTargetJid(msg);
                if (!targetJid) {
                    await sock.sendMessage(from, { text: '⚠️ اقتبس رسالة العضو أو اذكر اسمه (@username)' });
                    break;
                }
                await sock.groupParticipantsUpdate(from, [targetJid], 'demote');
                const targetName = await getParticipantName(sock, from, targetJid);
                const msgText = actionData || `✅ تم خفض ${targetName} إلى عضو عادي`;
                await sock.sendMessage(from, {
                    text: msgText,
                    mentions: [targetJid]
                });
                break;
            }
            case 'kick': {
                const targetJid = getTargetJid(msg);
                if (!targetJid) {
                    await sock.sendMessage(from, { text: '⚠️ اقتبس رسالة العضو أو اذكر اسمه (@username)' });
                    break;
                }
                const targetName = await getParticipantName(sock, from, targetJid);
                let goodbye = (customCmd.goodbyeMessage || 'وداعاً {name} 👋').replace('{name}', targetName);
                await sock.sendMessage(from, { text: goodbye, mentions: [targetJid] });
                if (customCmd.showProfilePic) {
                    try {
                        const picUrl = await sock.profilePictureUrl(targetJid, 'image');
                        await sock.sendMessage(from, { image: { url: picUrl }, caption: `🖼️ ${targetName}` });
                    } catch {}
                }
                await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
                break;
            }
            case 'close_group':
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: actionData || '🔒 تم قفل المجموعة' });
                break;
            case 'open_group':
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: actionData || '🔓 تم فتح المجموعة' });
                break;
            case 'delete_links': {
                const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
                if (ctxInfo?.quotedMessage) {
                    const quotedText = ctxInfo.quotedMessage.conversation || '';
                    if (containsLink(quotedText)) {
                        await sock.sendMessage(from, { delete: { ...msg.key, id: ctxInfo.stanzaId } });
                        await sock.sendMessage(from, { text: actionData || '🗑️ تم حذف الرابط' });
                    } else {
                        await sock.sendMessage(from, { text: '⚠️ الرسالة لا تحتوي رابط' });
                    }
                } else {
                    await sock.sendMessage(from, { text: '⚠️ اقتبس الرسالة التي تريد حذفها' });
                }
                break;
            }
            case 'approve': {
                const requests = await sock.groupRequestParticipantsList(from);
                if (!requests?.length) {
                    await sock.sendMessage(from, { text: '📭 لا توجد طلبات' });
                    break;
                }
                const jids = requests.map(r => r.jid);
                await sock.groupRequestParticipantsUpdate(from, jids, 'approve');
                await sock.sendMessage(from, { text: actionData || `✅ تم قبول ${jids.length} طلب` });
                break;
            }
            case 'reject_join': {
                const requests = await sock.groupRequestParticipantsList(from);
                if (!requests?.length) {
                    await sock.sendMessage(from, { text: '📭 لا توجد طلبات' });
                    break;
                }
                const jids = requests.map(r => r.jid);
                await sock.groupRequestParticipantsUpdate(from, jids, 'reject');
                await sock.sendMessage(from, { text: actionData || `❌ تم رفض ${jids.length} طلب` });
                break;
            }
            default:
                await sock.sendMessage(from, { text: `⚠️ نوع الأمر غير معروف: ${actionType}` });
        }

        customCmd.usageCount = (customCmd.usageCount || 0) + 1;
        saveCommands(commands);
        addToHistory({
            id: Date.now(), to: from, type: actionType, content: actionData,
            status: 'sent', timestamp: new Date().toISOString()
        });
        logToApp(`✅ أمر: ${ctx.prefix}${customCmd.trigger} (${actionType})`);
    } catch (err) {
        logToApp(`❌ فشل أمر ${customCmd.trigger}: ${err.message}`);
        try { await sock.sendMessage(from, { text: `❌ فشل: ${err.message}` }); } catch {}
    }
}

module.exports = { handleCommand, loadPlugins };