require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;

const users = {};

// ===== RCON функция =====
async function addToWhitelist(nick) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: process.env.RCON_PORT,
    password: process.env.RCON_PASSWORD
  });

  await rcon.send(`whitelist add ${nick}`);
  await rcon.end();
}

// ===== /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    step: 1,
    username: msg.from.username || "нет username"
  };

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// ===== анкета =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text) return;
  if (msg.text.startsWith('/') && msg.text !== '/start') return;

  const user = users[chatId];
  if (!user) return;

  if (user.step === 1) {
    user.age = msg.text;
    user.step = 2;
    return bot.sendMessage(chatId, "🎮 Введите ваш ник в Minecraft:");
  }

  if (user.step === 2) {
    user.mcNick = msg.text;
    user.step = 3;
    return bot.sendMessage(chatId, "👥 Ник пригласившего друга:");
  }

  if (user.step === 3) {
    user.inviter = msg.text;
    user.step = 4;
    return bot.sendMessage(chatId, "🧾 О себе (минимум 24 символа):");
  }

  if (user.step === 4) {
    if (msg.text.length < 24) {
      return bot.sendMessage(chatId, "❌ Минимум 24 символа:");
    }

    user.about = msg.text;
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

    user.messageId = sent.message_id;

    await bot.sendMessage(chatId, "✅ Заявка отправлена на рассмотрение!");
  }
});

// ===== обработка кнопок =====
bot.on('callback_query', async (query) => {
  const [action, chatIdStr] = query.data.split(':');
  const chatId = Number(chatIdStr);

  const user = users[chatId];

  if (!user) {
    return bot.answerCallbackQuery(query.id, {
      text: "Заявка уже обработана"
    });
  }

  // ===== ПРИНЯТЬ =====
  if (action === 'accept') {
    try {
      await addToWhitelist(user.mcNick);

      await bot.sendMessage(chatId, "🎉 Ваша заявка принята! Вы добавлены в whitelist.");

      await bot.editMessageText("✅ ЗАЯВКА ПРИНЯТА", {
        chat_id: FORUM_CHAT_ID,
        message_id: query.message.message_id
      });

      delete users[chatId];

      bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error(err);
      bot.answerCallbackQuery(query.id, { text: "Ошибка RCON" });
    }
  }

  // ===== ОТКЛОНИТЬ =====
  if (action === 'reject') {
    await bot.sendMessage(chatId,
      "❌ Ваша заявка отклонена",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📝 Написать новую заявку", callback_data: "restart" }]
          ]
        }
      }
    );

    await bot.editMessageText("❌ ЗАЯВКА ОТКЛОНЕНА", {
      chat_id: FORUM_CHAT_ID,
      message_id: query.message.message_id
    });

    delete users[chatId];

    bot.answerCallbackQuery(query.id);
  }
});

// ===== повторная заявка =====
bot.on('callback_query', (query) => {
  if (query.data === 'restart') {
    const chatId = query.message.chat.id;

    users[chatId] = {
      step: 1,
      username: query.from.username || "нет username"
    };

    bot.sendMessage(chatId, "📝 Начинаем новую заявку!\nВведите возраст:");
    bot.answerCallbackQuery(query.id);
  }
});

console.log("Bot started");
