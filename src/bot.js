console.log("=== PRO BOT (FIXED STABLE VERSION) ===");

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

// ================= GLOBAL PROTECTION =================
process.on('uncaughtException', (err) => console.error('UNCAUGHT:', err));
process.on('unhandledRejection', (err) => console.error('UNHANDLED:', err));

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

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("DB SAVE ERROR:", e);
  }
}

let db = loadDB();

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    autoStart: false,
    interval: 300,
    params: { timeout: 30 }
  }
});

// ================= POLLING =================
async function startPollingSafe() {
  try {
    console.log("🚀 Polling started");
    await bot.startPolling();
  } catch (e) {
    console.error("Polling start error:", e.message);
    setTimeout(startPollingSafe, 5000);
  }
}

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
  setTimeout(startPollingSafe, 5000);
});

// ================= CONFIG =================
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;

const ADMINS = [5372937661, 2121418969];

// ================= FSM =================
const STATES = {
  AGE: "AGE",
  MC_NICK: "MC_NICK",
  INVITER: "INVITER",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

let rejectTargets = {};

// ================= HELPERS =================
function formatDate(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => n.toString().padStart(2, '0');

  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.error("SEND ERROR:", e.message);
  }
}

async function safeEdit(text, app) {
  try {
    await bot.editMessageText(text, {
      chat_id: FORUM_CHAT_ID,
      message_id: app.message_id,
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

    console.log(`✅ ${nick} added`);
  } catch (e) {
    console.error("RCON ERROR:", e.message);
  }
}

// ================= DB FIXED =================
function getUser(chatId) {
  if (!db[chatId]) {
    db[chatId] = {
      chat_id: chatId,
      status: 'draft',
      state: STATES.AGE,
      processing: false,
      locked: false,   // 🔥 FIX
      created_at: Date.now()
    };
  }
  return db[chatId];
}

// 🔥 FIXED SAFE UPDATE (no overwrite bug)
function updateUser(chatId, data) {
  db[chatId] = {
    ...db[chatId],
    ...data
  };
  saveDB();
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
    state: STATES.AGE,
    locked: false
  });

  safeSend(chatId, "📝 Заявка начата!\nВведите возраст:");
});

// ================= MESSAGE =================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const user = getUser(chatId);

  // ===== REJECT FLOW =====
  if (rejectTargets[msg.from.id] && ADMINS.includes(msg.from.id)) {
    const target = rejectTargets[msg.from.id];
    delete rejectTargets[msg.from.id];

    const app = getUser(target);

    updateUser(target, {
      status: 'rejected',
      reason: text,
      rejected_by: msg.from.id,
      rejected_at: Date.now(),
      locked: false
    });

    const adminName = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name;

    const logText = `
❌ ОТКЛОНЕНА

👤 Админ: ${adminName}
🎮 ${app.mc_nick}
📌 ${text}
🕒 ${formatDate()}
`;

    await safeSend(target, `❌ Отклонено\n\nПричина: ${text}`);
    await safeEdit(logText, app);

    return;
  }

  if (user.status !== 'draft' || user.processing) return;

  updateUser(chatId, { processing: true });

  try {
    switch (user.state) {

      case STATES.AGE:
        updateUser(chatId, { age: text, state: STATES.MC_NICK });
        return safeSend(chatId, "🎮 Ник Minecraft:");

      case STATES.MC_NICK:
        updateUser(chatId, { mc_nick: text, state: STATES.INVITER });
        return safeSend(chatId, "👥 Кто пригласил?");

      case STATES.INVITER:
        updateUser(chatId, { inviter: text, state: STATES.ABOUT });
        return safeSend(chatId, "🧾 О себе (24+ символа):");

      case STATES.ABOUT:
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

        if (!sent) return;

        updateUser(chatId, {
          message_id: sent.message_id,
          status: 'pending',
          locked: false
        });

        return safeSend(chatId, "✅ Заявка отправлена!");
    }

  } finally {
    updateUser(chatId, { processing: false });
  }
});

// ================= CALLBACK (FIXED CORE BUG) =================
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

  // 🔥 FIX: защита от дублей
  if (app.locked) {
    return bot.answerCallbackQuery(q.id, { text: "Уже обрабатывается" });
  }

  if (!app || app.status !== 'pending') {
    return bot.answerCallbackQuery(q.id, { text: "Уже обработано" });
  }

  if (action === "accept") {

    updateUser(chatId, { locked: true });

    try {
      await addToWhitelist(app.mc_nick);

      updateUser(chatId, {
        status: 'accepted',
        accepted_by: adminId,
        accepted_at: Date.now(),
        locked: false
      });

      const adminName = q.from.username
        ? `@${q.from.username}`
        : q.from.first_name;

      const logText = `
✅ ПРИНЯТА

👤 Админ: ${adminName}
🎮 ${app.mc_nick}
🕒 ${formatDate()}
`;

      await safeSend(chatId, "🎉 Вы приняты! вот айпи сервера: fox-smp.com");
      await safeEdit(logText, app);

      return bot.answerCallbackQuery(q.id, { text: "OK" });

    } catch (e) {
      updateUser(chatId, { locked: false });
      throw e;
    }
  }

  if (action === "reject") {
    rejectTargets[adminId] = chatId;
    return bot.answerCallbackQuery(q.id);
  }
});

// ================= START =================
startPollingSafe();

console.log("✅ BOT STARTED (FIXED)");
