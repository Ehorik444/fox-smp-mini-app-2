console.log("=== PRO BOT (CLEAN FSM + FIXED ROUTER) ===");

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

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
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ================= CONFIG =================
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const LOG_TOPIC_ID = 28258;

const ADMINS = [5372937661, 2121418969];

// ================= FSM STATES =================
const STATES = {
  AGE: "AGE",
  MC_NICK: "MC_NICK",
  INVITER: "INVITER",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

// ================= ADMIN STATE =================
let rejectTarget = null;

// ================= HELPERS =================
function getUser(chatId) {
  if (!db[chatId]) {
    db[chatId] = {
      chat_id: chatId,
      status: 'draft',
      state: STATES.AGE,
      processing: false,
      app_count: 0
    };
    saveDB();
  }
  return db[chatId];
}

function updateUser(chatId, data) {
  db[chatId] = { ...getUser(chatId), ...data };
  saveDB();
}

// ================= ANTI-SPAM =================
const spamMap = new Map();

function isSpam(chatId) {
  const now = Date.now();
  const last = spamMap.get(chatId) || 0;

  if (now - last < 1200) return true;
  spamMap.set(chatId, now);
  return false;
}

// ================= RCON =================
async function addToWhitelist(nick) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: Number(process.env.RCON_PORT),
    password: process.env.RCON_PASSWORD
  });

  await rcon.send(`whitelist add ${nick}`);
  await rcon.end();
}

// ================= LOG =================
async function sendLog(text) {
  return bot.sendMessage(FORUM_CHAT_ID, text, {
    message_thread_id: LOG_TOPIC_ID
  });
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const username =
    msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || `id:${msg.from.id}`;

  updateUser(chatId, {
    username,
    status: 'draft',
    state: STATES.AGE,
    processing: false
  });

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// ================= SINGLE ROUTER (FIXED ARCHITECTURE) =================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // ❌ ignore empty + commands
  if (!text || text.startsWith('/')) return;

  const user = getUser(chatId);

  // ================= ADMIN FLOW FIRST =================
  if (ADMINS.includes(msg.from.id) && rejectTarget) {
    const target = rejectTarget;
    rejectTarget = null;

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

    await sendLog(`❌ ОТКЛОНЕНА ${app.username || "unknown"} | ${text}`);

    return;
  }

  // ================= USER FLOW =================
  if (isSpam(chatId)) return;
  if (user.status !== 'draft') return;
  if (user.processing) return;

  updateUser(chatId, { processing: true });

  try {
    const state = user.state;

    // ===== AGE =====
    if (state === STATES.AGE) {
      updateUser(chatId, {
        age: text,
        state: STATES.MC_NICK
      });

      return bot.sendMessage(chatId, "🎮 Ник Minecraft:");
    }

    // ===== MC NICK =====
    if (state === STATES.MC_NICK) {
      updateUser(chatId, {
        mc_nick: text,
        state: STATES.INVITER
      });

      return bot.sendMessage(chatId, "👥 Ник пригласившего:");
    }

    // ===== INVITER =====
    if (state === STATES.INVITER) {
      updateUser(chatId, {
        inviter: text,
        state: STATES.ABOUT
      });

      return bot.sendMessage(chatId, "🧾 О себе (24+ символа):");
    }

    // ===== ABOUT =====
    if (state === STATES.ABOUT) {
      if (text.length < 24)
        return bot.sendMessage(chatId, "❌ Минимум 24 символа");

      updateUser(chatId, {
        about: text,
        state: STATES.DONE
      });

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
        status: 'pending',
        app_count: (user.app_count || 0) + 1
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

  const app = getUser(chatId);

  if (!ADMINS.includes(adminId)) {
    return bot.answerCallbackQuery(q.id, {
      text: "Нет прав",
      show_alert: true
    });
  }

  if (!app) {
    return bot.answerCallbackQuery(q.id, { text: "Нет заявки" });
  }

  // ===== ACCEPT =====
  if (action === "accept") {
    await addToWhitelist(app.mc_nick);

    updateUser(chatId, { status: 'accepted' });

    await bot.sendMessage(chatId, "🎉 Вы приняты!");

    await bot.editMessageText("✅ ПРИНЯТА", {
      chat_id: FORUM_CHAT_ID,
      message_id: app.message_id
    });

    await sendLog(`✅ ПРИНЯТА ${app.username || "unknown"}`);

    return bot.answerCallbackQuery(q.id, { text: "OK" });
  }

  // ===== REJECT INIT =====
  if (action === "reject") {
    rejectTarget = chatId;

    await bot.sendMessage(adminId, "Введите причину отказа:");
    return bot.answerCallbackQuery(q.id);
  }
});

console.log("Bot started (CLEAN PRO FSM READY)");
