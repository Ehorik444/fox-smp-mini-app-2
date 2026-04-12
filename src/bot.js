console.log("=== PRO BOT (STABLE CLEAN VERSION) ===");

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

// ================= GLOBAL ERROR HANDLERS =================
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// ================= CLEAN ENV =================
process.removeAllListeners('warning');
process.env.NODE_DEBUG = '';
process.env.DEBUG = '';

// ================= FILE DB =================
const DB_FILE = path.join(__dirname, 'applications.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true
  }
});

// 🔥 FIX: авто-восстановление polling
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);

  setTimeout(() => {
    console.log("🔄 Перезапуск polling...");
    bot.startPolling();
  }, 3000);
});

// ================= CONFIG =================
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const LOG_TOPIC_ID = 28258;

const ADMINS = [5372937661, 2121418969];

// ================= FSM =================
const STATES = {
  AGE: "AGE",
  MC_NICK: "MC_NICK",
  INVITER: "INVITER",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

// 🔥 FIX: вместо одной переменной — словарь
let rejectTargets = {};

// ================= HELPERS =================
function getUser(chatId) {
  if (!db[chatId]) {
    db[chatId] = {
      chat_id: chatId,
      status: 'draft',
      state: STATES.AGE,
      processing: false
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

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// ================= MESSAGE ROUTER =================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const user = getUser(chatId);

  // ================= ADMIN REJECT FLOW =================
  if (rejectTargets[msg.from.id] && ADMINS.includes(msg.from.id)) {
    const target = rejectTargets[msg.from.id];
    delete rejectTargets[msg.from.id];

    const app = getUser(target);

    updateUser(target, {
      status: 'rejected',
      reason: text
    });

    await bot.sendMessage(target, `❌ Отклонено\n\n📌 Причина: ${text}`);

    await bot.editMessageText("❌ ОТКЛОНЕНА", {
      chat_id: FORUM_CHAT_ID,
      message_id: app.message_id
    });

    return;
  }

  // ================= USER GUARD =================
  if (user.status !== 'draft') return;
  if (user.processing) return;

  updateUser(chatId, { processing: true });

  try {
    const state = user.state;

    if (state === STATES.AGE) {
      updateUser(chatId, { age: text, state: STATES.MC_NICK });
      return bot.sendMessage(chatId, "🎮 Ник Minecraft:");
    }

    if (state === STATES.MC_NICK) {
      updateUser(chatId, { mc_nick: text, state: STATES.INVITER });
      return bot.sendMessage(chatId, "👥 Ник пригласившего:");
    }

    if (state === STATES.INVITER) {
      updateUser(chatId, { inviter: text, state: STATES.ABOUT });
      return bot.sendMessage(chatId, "🧾 О себе (24+ символа):");
    }

    if (state === STATES.ABOUT) {
      if (text.length < 24)
        return bot.sendMessage(chatId, "❌ Минимум 24 символа");

      updateUser(chatId, { about: text, state: STATES.DONE });

      const app = getUser(chatId);

      const message = `
📥 ЗАЯВКА

👤 ${app.username || "нет username"}
🎂 ${app.age}
🎮 ${app.mc_nick}
👥 ${app.inviter}

🧾 ${app.about}
`;

      const sent = await bot.sendMessage(FORUM_CHAT_ID, message, {
        message_thread_id: FORUM_TOPIC_ID,
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Принять", callback_data: `accept:${chatId}` },
            { text: "❌ Отклонить", callback_data: `reject:${chatId}` }
          ]]
        }
      });

      updateUser(chatId, {
        message_id: sent.message_id,
        status: 'pending'
      });

      return bot.sendMessage(chatId, "✅ Заявка отправлена!");
    }

  } finally {
    updateUser(chatId, { processing: false });
  }
});

// ================= CALLBACKS =================
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
  if (!app) return bot.answerCallbackQuery(q.id, { text: "Нет заявки" });

  if (action === "accept") {
    try {
      await addToWhitelist(app.mc_nick);
    } catch (e) {
      console.error("RCON ERROR:", e);
    }

    updateUser(chatId, { status: 'accepted' });

    await bot.sendMessage(chatId, "🎉 Вы приняты!");

    await bot.editMessageText("✅ ПРИНЯТА", {
      chat_id: FORUM_CHAT_ID,
      message_id: app.message_id
    });

    return bot.answerCallbackQuery(q.id, { text: "OK" });
  }

  if (action === "reject") {
    rejectTargets[adminId] = chatId;
    await bot.sendMessage(adminId, "Введите причину отказа:");
    return bot.answerCallbackQuery(q.id);
  }
});

console.log("Bot started (CLEAN STABLE VERSION)");
