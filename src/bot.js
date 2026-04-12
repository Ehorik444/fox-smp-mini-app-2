console.log("=== PRO BOT (FINAL IMPROVED STABLE VERSION) ===");

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

// ================= GLOBAL SAFETY =================
process.on('uncaughtException', (e) => console.error('UNCAUGHT:', e));
process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e));

// ================= DB =================
const DB_FILE = path.join(__dirname, 'applications.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let db = loadDB();

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("DB SAVE ERROR:", e);
  }
}

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
    params: { timeout: 10 }
  }
});

// ================= CONFIG =================
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;

const ADMINS = [5372937661, 2121418969];

// ================= FSM STATES =================
const STATES = {
  AGE: "AGE",
  MC_NICK: "MC_NICK",
  INVITER: "INVITER",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

// ================= MEMORY =================
const locks = {};
const rateLimit = {};
const rejectTargets = {};
const processing = {};

// ================= HELPERS =================
function now() {
  const d = new Date();
  const p = (n) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function checkRateLimit(id, ms = 1200) {
  const t = Date.now();
  if (rateLimit[id] && t - rateLimit[id] < ms) return false;
  rateLimit[id] = t;
  return true;
}

function getUser(chatId) {
  if (!db[chatId]) {
    db[chatId] = {
      chat_id: chatId,
      status: 'draft',
      state: STATES.AGE,
      created_at: Date.now()
    };
  }
  return db[chatId];
}

function updateUser(chatId, data) {
  db[chatId] = { ...getUser(chatId), ...data };
  saveDB();
}

async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.error("SEND ERROR:", e.message);
  }
}

async function safeEdit(text, msgId) {
  try {
    await bot.editMessageText(text, {
      chat_id: FORUM_CHAT_ID,
      message_id: msgId,
      message_thread_id: FORUM_TOPIC_ID
    });
  } catch (e) {
    console.error("EDIT ERROR:", e.message);
  }
}

// ================= RCON =================
async function addToWhitelist(nick) {
  try {
    const rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD,
      timeout: 5000
    });

    await rcon.send(`whitelist add ${nick}`);
    await rcon.end();

    console.log("WHITELIST +", nick);
  } catch (e) {
    console.error("RCON ERROR:", e.message);
  }
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const username = msg.from.username
    ? `@${msg.from.username}`
    : msg.from.first_name;

  updateUser(chatId, {
    username,
    status: 'draft',
    state: STATES.AGE
  });

  safeSend(chatId, "📝 Заявка начата!\nВведите возраст:");
});

// ================= MESSAGE HANDLER =================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  // 🔥 anti spam
  if (!checkRateLimit(chatId)) return;

  // 🔥 lock per user
  if (locks[chatId]) return;
  locks[chatId] = true;

  try {
    const user = getUser(chatId);

    if (user.status !== 'draft') return;

    switch (user.state) {

      case STATES.AGE: {
        const age = Number(text);

        if (!Number.isInteger(age) || age < 10 || age > 100) {
          return safeSend(chatId, "❌ Введите корректный возраст (10–100)");
        }

        updateUser(chatId, { age, state: STATES.MC_NICK });
        return safeSend(chatId, "🎮 Ник Minecraft:");
      }

      case STATES.MC_NICK:
        updateUser(chatId, { mc_nick: text, state: STATES.INVITER });
        return safeSend(chatId, "👥 Кто пригласил?");

      case STATES.INVITER:
        updateUser(chatId, { inviter: text, state: STATES.ABOUT });
        return safeSend(chatId, "🧾 О себе (24+ символа):");

      case STATES.ABOUT: {
        if (text.length < 24)
          return safeSend(chatId, "❌ Минимум 24 символа");

        updateUser(chatId, { about: text, state: STATES.DONE });

        const app = getUser(chatId);

        const sent = await safeSend(FORUM_CHAT_ID, `
📥 ЗАЯВКА

👤 ${app.username}
🎂 ${app.age}
🎮 ${app.mc_nick}
👥 ${app.inviter}

🧾 ${app.about}
`, {
          message_thread_id: FORUM_TOPIC_ID,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Принять", callback_data: `accept:${chatId}` },
              { text: "❌ Отклонить", callback_data: `reject:${chatId}` }
            ]]
          }
        });

        if (sent) {
          updateUser(chatId, {
            message_id: sent.message_id,
            status: 'pending'
          });
        }

        return safeSend(chatId, "✅ Заявка отправлена!");
      }
    }

  } finally {
    locks[chatId] = false;
  }
});

// ================= CALLBACK HANDLER =================
bot.on('callback_query', async (q) => {
  const adminId = q.from.id;
  const [action, chatIdStr] = q.data.split(':');
  const chatId = Number(chatIdStr);

  if (!ADMINS.includes(adminId)) {
    return bot.answerCallbackQuery(q.id, {
      text: "⛔ Нет прав",
      show_alert: true
    });
  }

  const app = getUser(chatId);

  if (!app || app.status !== 'pending') {
    return bot.answerCallbackQuery(q.id, { text: "Уже обработано" });
  }

  // anti double click
  if (processing[chatId]) {
    return bot.answerCallbackQuery(q.id, { text: "Уже обрабатывается" });
  }

  processing[chatId] = true;

  try {

    if (action === "accept") {

      await addToWhitelist(app.mc_nick);

      updateUser(chatId, {
        status: 'accepted',
        accepted_by: adminId,
        accepted_at: Date.now()
      });

      const adminName = q.from.username
        ? `@${q.from.username}`
        : q.from.first_name;

      const log = `
✅ ПРИНЯТА

👤 Админ: ${adminName}
🎮 ${app.mc_nick}
🕒 ${now()}
`;

      await safeSend(chatId, "🎉 Вы приняты! IP: fox-smp.com");
      await safeEdit(log, app.message_id);

      return bot.answerCallbackQuery(q.id, { text: "OK" });
    }

    if (action === "reject") {
      rejectTargets[adminId] = chatId;
      return bot.answerCallbackQuery(q.id);
    }

  } finally {
    processing[chatId] = false;
  }
});

// ================= REJECT FLOW =================
bot.on('message', async (msg) => {
  const adminId = msg.from.id;
  const text = msg.text;

  if (!text || !rejectTargets[adminId]) return;
  if (!ADMINS.includes(adminId)) return;

  const chatId = rejectTargets[adminId];
  delete rejectTargets[adminId];

  const app = getUser(chatId);

  updateUser(chatId, {
    status: 'rejected',
    reason: text
  });

  const adminName = msg.from.username
    ? `@${msg.from.username}`
    : msg.from.first_name;

  const log = `
❌ ОТКЛОНЕНА

👤 Админ: ${adminName}
🎮 ${app.mc_nick}
📌 ${text}
🕒 ${now()}
`;

  await safeSend(chatId, `❌ Отклонено\nПричина: ${text}`);
  await safeEdit(log, app.message_id);
});

// ================= START =================
console.log("✅ BOT RUNNING (FINAL STABLE VERSION)");
