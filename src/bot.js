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

// ===== STATE =====
const users = {};          // анкеты
const pendingRejects = {}; // ожидание причины отказа
const appMessages = {};    // message_id заявок

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

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

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

  // ===== RESTART =====
  if (data === 'restart') {
    users[targetChatId] = {
      step: 1,
      username: query.from.username || "нет username"
    };

    await bot.sendMessage(targetChatId, "📝 Начинаем новую заявку!\nВведите возраст:");
    return bot.answerCallbackQuery(query.id);
  }

  // ===== ADMIN CHECK =====
  if (!ADMINS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Нет прав",
      show_alert: true
    });
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
`✅ ЗАЯВКА ПРИНЯТА

👤 Админ: @${query.from.username || "no_username"} (${userId})
🎮 Игрок: ${user.mcNick}
🕒 Время: ${getTime()}`
      );

      delete users[targetChatId];
      delete appMessages[targetChatId];

      return bot.answerCallbackQuery(query.id, { text: "Принято" });

    } catch (err) {
      console.error(err);
      return bot.answerCallbackQuery(query.id, { text: "RCON ошибка" });
    }
  }

  // ===== REJECT =====
  if (action === 'reject') {
    pendingRejects[userId] = targetChatId;

    await bot.sendMessage(userId, "❌ Введите причину отказа заявки:");
    return bot.answerCallbackQuery(query.id);
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

    if (!targetUser) {
      delete pendingRejects[msg.from.id];
      return;
    }

    const reason = text;

    await bot.sendMessage(targetChatId,
`❌ Ваша заявка отклонена

📌 Причина: ${reason}

📝 Нажмите ниже, чтобы подать снова`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📝 Новая заявка", callback_data: "restart" }]
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
`❌ ЗАЯВКА ОТКЛОНЕНА

👤 Админ: @${msg.from.username || "no_username"} (${msg.from.id})
🎮 Игрок: ${targetUser.mcNick}
📌 Причина: ${reason}
🕒 Время: ${getTime()}`
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
    return bot.sendMessage(chatId, "🎮 Введите ваш ник в Minecraft:");
  }

  // ===== STEP 2 =====
  if (user.step === 2) {
    user.mcNick = text;
    user.step = 3;
    return bot.sendMessage(chatId, "👥 Ник пригласившего друга:");
  }

  // ===== STEP 3 =====
  if (user.step === 3) {
    user.inviter = text;
    user.step = 4;
    return bot.sendMessage(chatId, "🧾 О себе (минимум 24 символа):");
  }

  // ===== STEP 4 =====
  if (user.step === 4) {
    if (text.length < 24) {
      return bot.sendMessage(chatId, "❌ Минимум 24 символа:");
    }

    user.about = text;
    user.step = 5;

    const application =
`📥 НОВАЯ ЗАЯВКА

👤 Username: @${user.username}
🎂 Возраст: ${user.age}
🎮 Minecraft: ${user.mcNick}
👥 Пригласил: ${user.inviter}

🧾 О себе:
${user.about}`;

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

    return bot.sendMessage(chatId, "✅ Заявка отправлена!");
  }
});

console.log("Bot started");
