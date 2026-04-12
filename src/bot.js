require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

// ===== CONFIG =====
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const LOG_TOPIC_ID = 28258;

const ADMINS = [5372937661, 2121418969];

// ===== RULES =====
const COOLDOWN_MS = 60 * 60 * 1000;        // 1 час
const MAX_APPLICATIONS = 3;
const DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

// ===== STATE =====
const users = {};
const pendingRejects = {};
const appMessages = {};

// история заявок
const userStats = {}; // { chatId: { count, lastTime } }

// заявки с датами
const applicationsMeta = {}; // { chatId: { time, messageId } }

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

// ===== CLEANUP OLD APPLICATIONS =====
setInterval(async () => {
  const now = Date.now();

  for (const chatId in applicationsMeta) {
    const app = applicationsMeta[chatId];

    if (now - app.time > DELETE_AFTER_MS) {
      try {
        await bot.deleteMessage(FORUM_CHAT_ID, app.messageId);
      } catch {}

      delete applicationsMeta[chatId];
      delete users[chatId];
      delete appMessages[chatId];
    }
  }
}, 60 * 60 * 1000); // каждый час

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!userStats[chatId]) {
    userStats[chatId] = {
      count: 0,
      lastTime: 0
    };
  }

  const stats = userStats[chatId];
  const now = Date.now();

  // админам без ограничений
  if (!ADMINS.includes(chatId)) {
    if (stats.count >= MAX_APPLICATIONS) {
      return bot.sendMessage(chatId, "❌ Лимит заявок исчерпан (3 заявки максимум)");
    }

    if (now - stats.lastTime < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - (now - stats.lastTime)) / 60000);
      return bot.sendMessage(chatId, `⏳ Подождите ${left} минут перед новой заявкой`);
    }
  }

  users[chatId] = {
    step: 1,
    username: msg.from.username || "нет username"
  };

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// ===== CALLBACKS =====
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;

  const [action, chatIdStr] = data.split(':');
  const targetChatId = Number(chatIdStr);

  const user = users[targetChatId];

  // ===== ADMIN CHECK =====
  if (!ADMINS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Нет прав",
      show_alert: true
    });
  }

  // ===== RESTART =====
  if (data === 'restart') {
    users[targetChatId] = {
      step: 1,
      username: query.from.username || "нет username"
    };

    return bot.sendMessage(targetChatId, "📝 Начинаем новую заявку!\nВведите возраст:");
  }

  if (!user) {
    return bot.answerCallbackQuery(query.id, {
      text: "Заявка уже обработана"
    });
  }

  // ===== ACCEPT =====
  if (action === 'accept') {
    try {
      await addToWhitelist(user.mcNick);

      await bot.sendMessage(targetChatId,
        "🎉 Ваша заявка принята! Вы добавлены в whitelist."
      );

      await bot.editMessageText("✅ ЗАЯВКА ПРИНЯТА", {
        chat_id: FORUM_CHAT_ID,
        message_id: query.message.message_id
      });

      await sendLog(
`✅ ПРИНЯТА

👤 Админ: @${query.from.username || "no_username"}
🎮 Игрок: ${user.mcNick}
🕒 ${getTime()}`
      );

      // статистика
      if (!userStats[targetChatId]) {
        userStats[targetChatId] = { count: 0, lastTime: 0 };
      }

      userStats[targetChatId].count++;
      userStats[targetChatId].lastTime = Date.now();

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
      `✍️ Админ @${query.from.username || "no_username"} отклоняет заявку.\nНапишите причину:`,
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
      "🔁 Заявка отправлена на повторное рассмотрение."
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

    if (!targetUser) return;

    const reason = text;

    await bot.sendMessage(targetChatId,
`❌ Ваша заявка отклонена

📌 Причина: ${reason}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📝 Новая заявка", callback_data: "restart" }],
          [{ text: "🔁 Пересмотреть решение", callback_data: `reconsider:${targetChatId}` }]
        ]
      }
    });

    const msgId = appMessages[targetChatId];

    if (msgId) {
      await bot.editMessageText("❌ ЗАЯВКА ОТКЛОНЕНА", {
        chat_id: FORUM_CHAT_ID,
        message_id: msgId
      });
    }

    await sendLog(
`❌ ОТКЛОНЕНА

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

  // ===== STEP 1 =====
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

    return bot.sendMessage(chatId, "✅ Отправлено!");
  }
});

console.log("Bot started");
