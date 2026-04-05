// plugins/custom-manager.js
// أوامر مخصصة: اشطا، ايدت، انذار، ضيف فلوس، ابعت فلوس، ترحيب، اضافه لقب

const fs = require('fs');
const path = require('path');
const { isAdmin, getTargetJidFromMention, getParticipantName } = require('../utils');
const { logToApp } = require('../ws');

// =============== مسارات التخزين ===============
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const BALANCES_FILE = path.join(DATA_DIR, 'balances.json');
const TITLES_FILE   = path.join(DATA_DIR, 'titles.json');
const WARNINGS_FILE = path.join(DATA_DIR, 'warnings.json');   // نفس ملف القوانين

// =============== دوال مساعدة ===============
function loadBalances() {
    try {
        if (fs.existsSync(BALANCES_FILE))
            return JSON.parse(fs.readFileSync(BALANCES_FILE, 'utf-8'));
    } catch(e) {}
    return {}; // { "jid": number }
}

function saveBalances(balances) {
    fs.writeFileSync(BALANCES_FILE, JSON.stringify(balances, null, 2));
}

function loadTitles() {
    try {
        if (fs.existsSync(TITLES_FILE))
            return JSON.parse(fs.readFileSync(TITLES_FILE, 'utf-8'));
    } catch(e) {}
    return {}; // { "groupId|memberJid": "لقب" }
}

function saveTitles(titles) {
    fs.writeFileSync(TITLES_FILE, JSON.stringify(titles, null, 2));
}

// جلب أو إضافة رصيد
function getBalance(jid) {
    const bal = loadBalances();
    return bal[jid] || 0;
}

function setBalance(jid, amount) {
    const bal = loadBalances();
    bal[jid] = amount;
    saveBalances(bal);
}

function addBalance(jid, amount) {
    const bal = loadBalances();
    bal[jid] = (bal[jid] || 0) + amount;
    saveBalances(bal);
}

// إضافة إنذار (نفس نظام group-rules.js)
async function addWarning(groupId, memberId, memberName, reason, sock) {
    let warnings = {};
    try {
        if (fs.existsSync(WARNINGS_FILE))
            warnings = JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf-8'));
    } catch(e) {}
    
    const key = `${groupId}|${memberId}`;
    const now = Date.now();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    if (!warnings[key]) warnings[key] = [];
    // حذف القديم
    warnings[key] = warnings[key].filter(w => (now - w.timestamp) < THREE_DAYS);
    warnings[key].push({ reason, timestamp: now });
    fs.writeFileSync(WARNINGS_FILE, JSON.stringify(warnings, null, 2));
    
    const count = warnings[key].length;
    let msg = `⚠️ *إنذار ${count}* ⚠️\n@${memberName}\nالسبب: ${reason}`;
    if (count >= 6) {
        msg += `\n❗ بلغت 6 إنذارات → سيتم طردك مؤبداً (تطبيق يدوي)`;
    } else if (count >= 3) {
        msg += `\n⚠️ بلغت 3 إنذارات → سيتم طردك يومين (تطبيق يدوي)`;
    }
    await sock.sendMessage(groupId, { text: msg, mentions: [memberId] });
    logToApp(`إنذار للعضو ${memberName}: ${reason} (الإنذار ${count})`);
    return count;
}

// =============== الأوامر ===============
module.exports = [
    {
        trigger: 'اشطا',
        description: 'تأكيد ورد',
        handler: async (ctx) => {
            await ctx.sock.sendMessage(ctx.from, { text: '✅ اشطا ياباشا' });
        }
    },
    {
        trigger: 'ايدت',
        description: 'تعديل آخر رسالة للبوت (تجريبي)',
        handler: async (ctx) => {
            // هذا الأمر يحتاج لتخزين آخر رسالة أرسلها البوت في المجموعة
            // يمكن تبسيطه: يرد برسالة جديدة
            await ctx.sock.sendMessage(ctx.from, { text: '✏️ تم التعديل (تجريبي)' });
        }
    },
    {
        trigger: 'انذار',
        description: 'إعطاء إنذار لعضو (للمشرفين)',
        adminOnly: true,
        groupOnly: true,
        handler: async (ctx) => {
            const { sock, from, msg, senderJid, args, fullText } = ctx;
            // استخراج المنشن من الرسالة
            let targetJid = null;
            let reason = args.slice(1).join(' ') || 'مخالفة عامة';
            
            // محاولة استخراج المنشن من الرسالة
            const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (mention) {
                targetJid = mention;
            } else {
                // محاولة من النص
                const match = fullText.match(/@(\d+)/);
                if (match) targetJid = match[1] + '@s.whatsapp.net';
            }
            if (!targetJid) {
                await sock.sendMessage(from, { text: '❌ يجب منشن العضو المستهدف (@الرقم)' });
                return;
            }
            // الحصول على اسم العضو
            let memberName = targetJid.split('@')[0];
            try {
                const groupMeta = await sock.groupMetadata(from);
                const part = groupMeta.participants.find(p => p.id === targetJid);
                if (part && part.name) memberName = part.name;
                else if (part && part.notify) memberName = part.notify;
            } catch(e) {}
            await addWarning(from, targetJid, memberName, reason, sock);
        }
    },
    {
        trigger: 'ضيف',
        description: 'إضافة رصيد لعضو (للمشرفين)',
        adminOnly: true,
        handler: async (ctx) => {
            const { sock, from, msg, args, fullText } = ctx;
            // استخراج المنشن والمبلغ
            let targetJid = null;
            let amount = parseInt(args[0]);
            if (isNaN(amount)) {
                // المحاولة: المنشن أولاً ثم المبلغ
                const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (mention) {
                    targetJid = mention;
                    amount = parseInt(args[1]);
                } else {
                    const match = fullText.match(/@(\d+)/);
                    if (match) targetJid = match[1] + '@s.whatsapp.net';
                    amount = parseInt(args[0]);
                }
            } else {
                // المبلغ أولاً ثم منشن
                const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (mention) targetJid = mention;
                else {
                    const match = fullText.match(/@(\d+)/);
                    if (match) targetJid = match[1] + '@s.whatsapp.net';
                }
            }
            if (!targetJid || isNaN(amount) || amount <= 0) {
                await sock.sendMessage(from, { text: '❌ استخدم: ضيف فلوس <المبلغ> @منشن' });
                return;
            }
            addBalance(targetJid, amount);
            let name = targetJid.split('@')[0];
            try {
                const contact = await sock.getContact(targetJid);
                if (contact.name) name = contact.name;
            } catch(e) {}
            await sock.sendMessage(from, { text: `💰 تم إضافة ${amount} فلوس إلى @${name}`, mentions: [targetJid] });
        }
    },
    {
        trigger: 'ابعت',
        description: 'تحويل رصيد لعضو آخر',
        handler: async (ctx) => {
            const { sock, from, msg, senderJid, args, fullText } = ctx;
            let targetJid = null;
            let amount = parseInt(args[0]);
            if (isNaN(amount)) {
                const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (mention) {
                    targetJid = mention;
                    amount = parseInt(args[1]);
                } else {
                    const match = fullText.match(/@(\d+)/);
                    if (match) targetJid = match[1] + '@s.whatsapp.net';
                    amount = parseInt(args[0]);
                }
            } else {
                const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (mention) targetJid = mention;
                else {
                    const match = fullText.match(/@(\d+)/);
                    if (match) targetJid = match[1] + '@s.whatsapp.net';
                }
            }
            if (!targetJid || isNaN(amount) || amount <= 0) {
                await sock.sendMessage(from, { text: '❌ استخدم: ابعت فلوس <المبلغ> @منشن' });
                return;
            }
            const senderBalance = getBalance(senderJid);
            if (senderBalance < amount) {
                await sock.sendMessage(from, { text: `❌ رصيدك لا يكفي. رصيدك الحالي: ${senderBalance}` });
                return;
            }
            addBalance(senderJid, -amount);
            addBalance(targetJid, amount);
            let senderName = senderJid.split('@')[0];
            let targetName = targetJid.split('@')[0];
            try {
                const sContact = await sock.getContact(senderJid);
                if (sContact.name) senderName = sContact.name;
                const tContact = await sock.getContact(targetJid);
                if (tContact.name) targetName = tContact.name;
            } catch(e) {}
            await sock.sendMessage(from, { text: `💸 تم تحويل ${amount} فلوس من @${senderName} إلى @${targetName}`, mentions: [senderJid, targetJid] });
        }
    },
    {
        trigger: 'ترحيب',
        description: 'تعيين رسالة ترحيب للمجموعة (للمشرفين)',
        adminOnly: true,
        groupOnly: true,
        handler: async (ctx) => {
            const { sock, from, args, fullText } = ctx;
            let welcomeMsg = fullText.slice(fullText.indexOf(' ')).trim();
            if (!welcomeMsg) {
                await sock.sendMessage(from, { text: '❌ اكتب: ترحيب <النص>\nمثال: ترحيب أهلًا بك @user' });
                return;
            }
            // تخزين رسالة الترحيب في إعدادات المجموعة (يمكن استخدام persistence)
            const { loadSettings, saveSettings } = require('../persistence');
            const settings = loadSettings();
            if (!settings.groupWelcome) settings.groupWelcome = {};
            settings.groupWelcome[from] = welcomeMsg;
            saveSettings(settings);
            await sock.sendMessage(from, { text: `✅ تم تعيين رسالة الترحيب:\n${welcomeMsg}` });
        }
    },
    {
        trigger: 'اضافه',
        description: 'إضافة لقب لعضو (للمشرفين)',
        adminOnly: true,
        groupOnly: true,
        handler: async (ctx) => {
            const { sock, from, msg, args, fullText } = ctx;
            // صيغة: اضافه لقب @منشن اللقب
            let targetJid = null;
            let title = '';
            const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (mention) {
                targetJid = mention;
                // النص بعد المنشن
                const parts = fullText.split(' ').filter(p => p.trim());
                // بعد كلمة "اضافه" و "لقب" والمنشن
                let startIdx = 0;
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i].startsWith('@') || parts[i].includes(mention.split('@')[0])) {
                        startIdx = i + 1;
                        break;
                    }
                }
                title = parts.slice(startIdx).join(' ');
            } else {
                const match = fullText.match(/@(\d+)/);
                if (match) targetJid = match[1] + '@s.whatsapp.net';
                const parts = fullText.split(' ').filter(p => p.trim());
                // افتراض أن آخر كلمة بعد المنشن هي اللقب
                if (targetJid && parts.length > 2) {
                    title = parts.slice(2).join(' ');
                }
            }
            if (!targetJid || !title) {
                await sock.sendMessage(from, { text: '❌ استخدم: اضافه لقب @منشن اللقب' });
                return;
            }
            const titles = loadTitles();
            const key = `${from}|${targetJid}`;
            titles[key] = title;
            saveTitles(titles);
            let name = targetJid.split('@')[0];
            try {
                const contact = await sock.getContact(targetJid);
                if (contact.name) name = contact.name;
            } catch(e) {}
            await sock.sendMessage(from, { text: `🏷️ تم إضافة اللقب "${title}" للعضو @${name}`, mentions: [targetJid] });
        }
    }
];

// =============== تفعيل استقبال حدث الترحيب عند دخول عضو جديد ===============
// نضيف مستمع لحدث group-participants.update لإرسال رسالة الترحيب
const { loadSettings } = require('../persistence');
const state = require('../state');

function setupWelcomeListener(sock) {
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        if (action !== 'add') return;
        const settings = loadSettings();
        const welcomeMsg = settings.groupWelcome?.[id];
        if (!welcomeMsg) return;
        for (const jid of participants) {
            let msg = welcomeMsg.replace(/@user/gi, `@${jid.split('@')[0]}`);
            await sock.sendMessage(id, { text: msg, mentions: [jid] });
        }
    });
    logToApp('✅ تم تفعيل رسائل الترحيب التلقائية');
}

// إذا كان السوك جاهزاً حالياً
if (state.sock && state.isConnected) {
    setupWelcomeListener(state.sock);
} else {
    const interval = setInterval(() => {
        if (state.sock && state.isConnected) {
            clearInterval(interval);
            setupWelcomeListener(state.sock);
        }
    }, 1000);
}
