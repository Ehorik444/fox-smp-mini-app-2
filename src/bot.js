require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;

const users = {};

console.log("NEW BOT VERSION LOADED");

// /start — всегда запускает анкету заново
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    step: 1,
    username: msg.from.username || "нет username"
  };

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text) return;

  // игнорируем команды кроме анкеты
  if (msg.text.startsWith('/') && msg.text !== '/start') return;

  const user = users[chatId];

  if (!user) return;

  // 1. возраст
  if (user.step === 1) {
    user.age = msg.text;
    user.step = 2;

    return bot.sendMessage(chatId, "🎮 Введите ваш ник в Minecraft:");
  }

  // 2. Minecraft ник
  if (user.step === 2) {
    user.mcNick = msg.text;
    user.step = 3;

    return bot.sendMessage(chatId, "👥 Ник пригласившего друга:");
  }

  // 3. пригласивший
  if (user.step === 3) {
    user.inviter = msg.text;
    user.step = 4;

    return bot.sendMessage(chatId, "🧾 Расскажите о себе (минимум 24 символа):");
  }

  // 4. описание
  if (user.step === 4) {
    if (msg.text.length < 24) {
      return bot.sendMessage(chatId, "❌ Минимум 24 символа. Попробуйте ещё раз:");
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

    try {
      await bot.sendMessage(
        FORUM_CHAT_ID,
        application,
        {
          message_thread_id: FORUM_TOPIC_ID
        }
      );

      await bot.sendMessage(chatId, "✅ Заявка отправлена!");
    } catch (err) {
      console.error("Ошибка отправки заявки:", err);
      await bot.sendMessage(chatId, "❌ Ошибка отправки заявки. Попробуйте позже.");
    }

    delete users[chatId];
  }
});

console.log("Bot started");
