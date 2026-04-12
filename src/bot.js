console.log("=== PRO BOT (ULTRA STABLE POLLING) ===");

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

// ================= GLOBAL PROTECTION =================
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('🔥 UNHANDLED:', err);
});

// ================= DB =================
const DB_FILE = path.join(__dirname, 'applications.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error("DB LOAD ERROR:", e);
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
    params: {
      timeout: 30 // 🔥 ключ к стабильности
    }
  }
});

// ================= POLLING CONTROL =================
async function startPollingSafe() {
  try {
    console.log("🚀 Starting polling...");
    await bot.startPolling();
  } catch (e) {
    console.error("Polling start error:", e.message);
    setTimeout(startPollingSafe, 5000);
  }
}

// авто восстановление
bot.on('polling_error', (err) => {
  console.error('⚠️ Polling error:', err.message);

  setTimeout(() => {
    console.log("🔄 Restart polling...");
    startPollingSafe();
  }, 5000);
});

// анти зависание (heartbeat)
setInterval(() => {
  console.log("💓 BOT ALIVE:", new Date().toISOString());
}, 60000);

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

// ================= SAFE METHODS =================
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

    console.log(`✅ ${nick} added to whitelist`);
  } catch (e) {
    console.error("RCON ERROR:", e.message);
  }
}

// ================= USERS =================
function getUser(chatId) {
  if (!db[chatId]) {
    db[chatId] = {
      chat_id: chatId,
      status: 'draft',
      state: STATES.AGE,
      processing: false,
      created_at: Date.now()
    };
    saveDB();
  }
  return db[chatId];
}

function updateUser(chatId, data) {
  db[chatId] = { ...getUser(chatId), ...data };
  saveDB();
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const username =
    msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || `id:${msg.from.id}`;

  updateUser(chatId, {
    username,
    status: 'draft',
    state: STATES.AGE
  });

  safeSend(chatId, "📝 Заявка начата!\nВведите возраст:");
});

// ================= MESSAGE =================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const user = getUser(chatId);

  // ADMIN REJECT
  if (rejectTargets[msg.from.id] && ADMINS.includes(msg.from.id)) {
    const target = rejectTargets[msg.from.id];
    delete rejectTargets[msg.from.id];

    const app = getUser(target);

    updateUser(target, {
      status: 'rejected',
      reason: text
    });

    await safeSend(target, `❌ Отклонено\n\nПричина: ${text}`);
    await safeEdit("❌ ОТКЛОНЕНА", app);
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

        const message = `
📥 ЗАЯВКА

👤 ${app.username}
🎂 ${app.age}
🎮 ${app.mc_nick}
👥 ${app.inviter}

🧾 ${app.about}
`;

        const sent = await safeSend(FORUM_CHAT_ID, message, {
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
          status: 'pending'
        });

        return safeSend(chatId, "✅ Заявка отправлена!");
    }

  } finally {
    updateUser(chatId, { processing: false });
  }
});

// ================= CALLBACK =================
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

  if (action === "accept") {
    await addToWhitelist(app.mc_nick);

    updateUser(chatId, { status: 'accepted' });

    await safeSend(chatId, "🎉 Вы приняты!");
    await safeEdit("✅ ПРИНЯТА", app);

    return bot.answerCallbackQuery(q.id, { text: "OK" });
  }

  if (action === "reject") {
    rejectTargets[adminId] = chatId;
    await safeSend(adminId, "Введите причину:");
    return bot.answerCallbackQuery(q.id);
  }
});

// ================= START =================
startPollingSafe();

console.log("✅ BOT STARTED (ULTRA STABLE)");
