console.log("=== PRO BOT (WEBHOOK MODE) ===");

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

// ================= CONFIG =================
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // https://your-domain.com
const PORT = process.env.PORT || 3000;

const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;

const ADMINS = [5372937661, 2121418969];

// ================= APP =================
const app = express();
app.use(express.json());

// ================= BOT =================
const bot = new TelegramBot(TOKEN);

// ================= WEBHOOK SET =================
const webhookPath = `/bot${TOKEN}`;

bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`)
  .then(() => console.log("✅ Webhook установлен"))
  .catch(console.error);

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================= GLOBAL ERRORS =================
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

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
    console.error(e);
  }
}

let db = loadDB();

// ================= HELPERS =================
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
      password: process.env.RCON_PASSWORD
    });

    await rcon.send(`whitelist add ${nick}`);
    await rcon.end();

    console.log(`✅ ${nick} added`);
  } catch (e) {
    console.error("RCON ERROR:", e.message);
  }
}

// ================= FSM =================
const STATES = {
  AGE: "AGE",
  MC_NICK: "MC_NICK",
  INVITER: "INVITER",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

let rejectTargets = {};

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
      : msg.from.first_name;

  updateUser(chatId, {
    username,
    status: 'draft',
    state: STATES.AGE
  });

  safeSend(chatId, "📝 Начнем. Введите возраст:");
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

    updateUser(target, { status: 'rejected', reason: text });

    await safeSend(target, `❌ Отклонено\nПричина: ${text}`);
    await safeEdit("❌ ОТКЛОНЕНА", app);
    return;
  }

  if (user.status !== 'draft' || user.processing) return;

  updateUser(chatId, { processing: true });

  try {
    switch (user.state) {

      case STATES.AGE:
        updateUser(chatId, { age: text, state: STATES.MC_NICK });
        return safeSend(chatId, "Ник Minecraft:");

      case STATES.MC_NICK:
        updateUser(chatId, { mc_nick: text, state: STATES.INVITER });
        return safeSend(chatId, "Кто пригласил?");

      case STATES.INVITER:
        updateUser(chatId, { inviter: text, state: STATES.ABOUT });
        return safeSend(chatId, "О себе (24+):");

      case STATES.ABOUT:
        if (text.length < 24)
          return safeSend(chatId, "Минимум 24 символа");

        updateUser(chatId, { about: text, state: STATES.DONE });

        const appData = getUser(chatId);

        const sent = await safeSend(FORUM_CHAT_ID, `
📥 ЗАЯВКА

👤 ${appData.username}
🎂 ${appData.age}
🎮 ${appData.mc_nick}
👥 ${appData.inviter}

🧾 ${appData.about}
`, {
          message_thread_id: FORUM_TOPIC_ID,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅", callback_data: `accept:${chatId}` },
              { text: "❌", callback_data: `reject:${chatId}` }
            ]]
          }
        });

        if (!sent) return;

        updateUser(chatId, {
          message_id: sent.message_id,
          status: 'pending'
        });

        return safeSend(chatId, "Заявка отправлена!");
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
    return bot.answerCallbackQuery(q.id, { text: "Нет прав", show_alert: true });
  }

  const appData = getUser(chatId);

  if (!appData || appData.status !== 'pending') {
    return bot.answerCallbackQuery(q.id, { text: "Уже обработано" });
  }

  if (action === "accept") {
    await addToWhitelist(appData.mc_nick);

    updateUser(chatId, { status: 'accepted' });

    await safeSend(chatId, "🎉 Принят!");
    await safeEdit("✅ ПРИНЯТА", appData);

    return bot.answerCallbackQuery(q.id);
  }

  if (action === "reject") {
    rejectTargets[adminId] = chatId;
    await safeSend(adminId, "Причина отказа:");
    return bot.answerCallbackQuery(q.id);
  }
});

// ================= SERVER =================
app.get('/', (req, res) => {
  res.send("Bot is running ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
