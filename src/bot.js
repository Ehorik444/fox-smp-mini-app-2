require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

// ===== CONFIG =====
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const LOG_TOPIC_ID = 28258;

const ADMINS = [5372937661, 2121418969];

const COOLDOWN_MS = 60 * 60 * 1000;
const MAX_APPLICATIONS = 3;
const DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// ===== FILE STORAGE =====
const DATA_FILE = './data.json';

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { userStats: {}, applicationsMeta: {} };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error("LOAD ERROR:", e);
    return { userStats: {}, applicationsMeta: {} };
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      userStats,
      applicationsMeta
    }, null, 2));
  } catch (e) {
    console.error("SAVE ERROR:", e);
  }
}

const data = loadData();
const userStats = data.userStats || {};
const applicationsMeta = data.applicationsMeta || {};

// ===== MEMORY =====
const users = {};
const pendingRejects = {};
const appMessages = {};

// ===== TIME =====
function getTime() {
  return new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow"
  });
}

// ===== LOG =====
async function sendLog(text) {
  try {
    await bot.sendMessage(FORUM_CHAT_ID, text, {
      message_thread_id: LOG_TOPIC_ID
    });
  } catch (e) {
    console.error("LOG ERROR:", e);
  }
}

// ===== RCON =====
async function addToWhitelist(nick) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: Number(process.env.RCON_PORT),
    password: process.env.RCON_PASSWORD
  });

  await rcon.send(`whitelist add ${nick}`);
  await rcon.end();
}

// ===== CLEANUP OLD =====
setInterval(async () => {
  const now = Date.now();

  for (const chatId in applicationsMeta) {
    const app = applicationsMeta[chatId];

    if (now - app.time > DELETE_AFTER_MS) {
      try {
        await bot.deleteMessage(FORUM_CHAT_ID, app.messageId);
      } catch {}

      delete applicationsMeta[chatId];
      saveData();
    }
  }
}, 60 * 60 * 1000);

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!userStats[chatId]) {
    userStats[chatId] = { count: 0, lastTime: 0 };
  }

  const stats = userStats[chatId];
  const now = Date.now();

  if (!ADMINS.includes(chatId)) {
    if (stats.count >= MAX_APPLICATIONS) {
      return bot.sendMessage(chatId, "❌ Лимит 3 заявки исчерпан");
    }

    if (now - stats.lastTime < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - (now - stats.lastTime)) / 60000);
      return bot.sendMessage(chatId, `⏳ Подождите ${left} минут`);
    }
  }

  users[chatId] = {
    step: 1,
    username: msg.from.username || "нет username"
  };

  bot.sendMessage(chatId, "📝 Введите возраст:");
});

// ===== CALLBACKS =====
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;

  const [action, chatIdStr] = data.split(':');
  const targetChatId = Number(chatIdStr);

  const user = users[targetChatId];

  if (data === 'restart') {
    users[targetChatId] = {
      step: 1,
      username: query.from.username || "нет username"
    };

    return bot.sendMessage(targetChatId, "📝 Начинаем заново:\nВведите возраст:");
  }

  if (!ADMINS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Нет прав",
      show_alert: true
    });
  }

  if (!user) {
    return bot.answerCallbackQuery(query.id, {
      text: "Уже обработано"
    });
  }

  // ===== ACCEPT =====
  if (action === 'accept') {
    try {
      await addToWhitelist(user.mcNick);

      await bot.sendMessage(targetChatId,
        "🎉 Ваша заявка принята!"
      );

      await bot.editMessageText("✅ ПРИНЯТО", {
        chat_id: FORUM_CHAT_ID,
        message_id: query.message.message_id
      });

      userStats[targetChatId].count++;
      userStats[targetChatId].lastTime = Date.now();
      saveData();

      delete users[targetChatId];
      delete applicationsMeta[targetChatId];

      return bot.answerCallbackQuery(query.id);

    } catch (e) {
      console.error(e);
      return bot.answerCallbackQuery(query.id, { text: "RCON ошибка" });
    }
  }

  // ===== REJECT =====
  if (action === 'reject') {
    pendingRejects[userId] = targetChatId;

    return bot.sendMessage(
      FORUM_CHAT_ID,
      `✍️ Админ @${query.from.username || "no_username"} пишет причину отказа:`,
      { message_thread_id: LOG_TOPIC_ID }
    );
  }

  // ===== RECONSIDER =====
  if (action === 'reconsider') {
    users[targetChatId] = {
      ...users[targetChatId],
      step: 5
    };

    return bot.sendMessage(targetChatId,
      "🔁 Заявка отправлена на пересмотр"
    );
  }
});

// ===== MESSAGE FLOW =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;
  if (text.startsWith('/') && text !== '/start') return;

  const user = users[chatId];

  // ===== REJECT REASON =====
  if (pendingRejects[msg.from.id]) {
    const targetChatId = pendingRejects[msg.from.id];
    const targetUser = users[targetChatId];

    const reason = text;

    if (!targetUser) return;

    await bot.sendMessage(targetChatId,
`❌ Отклонено

📌 Причина: ${reason}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📝 Новая заявка", callback_data: "restart" }],
          [{ text: "🔁 Пересмотреть", callback_data: `reconsider:${targetChatId}` }]
        ]
      }
    });

    const msgId = appMessages[targetChatId];

    if (msgId) {
      await bot.editMessageText("❌ ОТКЛОНЕНО", {
        chat_id: FORUM_CHAT_ID,
        message_id: msgId
      });
    }

    await sendLog(
`❌ ОТКЛОНЕНО

👤 Админ: @${msg.from.username || "no_username"}
🎮 Игрок: ${targetUser.mcNick}
📌 ${reason}
🕒 ${getTime()}`
    );

    delete users[targetChatId];
    delete pendingRejects[msg.from.id];

    return;
  }

  if (!user) return;

  if (user.step === 1) {
    user.age = text;
    user.step = 2;
    return bot.sendMessage(chatId, "🎮 Ник Minecraft:");
  }

  if (user.step === 2) {
    user.mcNick = text;
    user.step = 3;
    return bot.sendMessage(chatId, "👥 Пригласивший:");
  }

  if (user.step === 3) {
    user.inviter = text;
    user.step = 4;
    return bot.sendMessage(chatId, "🧾 О себе (24+ символа):");
  }

  if (user.step === 4) {
    if (text.length < 24) {
      return bot.sendMessage(chatId, "❌ Минимум 24 символа");
    }

    user.about = text;
    user.step = 5;

    const application =
`📥 НОВАЯ ЗАЯВКА

👤 @${user.username}
🎂 ${user.age}
🎮 ${user.mcNick}
👥 ${user.inviter}

🧾 ${user.about}`;

    const sent = await bot.sendMessage(
      FORUM_CHAT_ID,
      application,
      {
        message_thread_id: FORUM_TOPIC_ID,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Принять", callback_data: `accept:${chatId}` },
              { text: "❌ Отклонить", callback_data: `reject:${chatId}` }
            ]
          ]
        }
      }
    );

    appMessages[chatId] = sent.message_id;

    applicationsMeta[chatId] = {
      time: Date.now(),
      messageId: sent.message_id
    };

    saveData();

    return bot.sendMessage(chatId, "✅ Отправлено!");
  }
});

console.log("Bot started");
