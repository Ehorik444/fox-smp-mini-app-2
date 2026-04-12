require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567; // ← обновили ID темы

const users = {};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    step: 1,
    username: msg.from.username || "нет username"
  };

  await bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!users[chatId]) return;
  if (msg.text?.startsWith('/start')) return;

  const user = users[chatId];

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
    return bot.sendMessage(chatId, "🧾 Расскажите о себе (минимум 24 символа):");
  }

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

    await bot.sendMessage(
      FORUM_CHAT_ID,
      application,
      {
        message_thread_id: FORUM_TOPIC_ID
      }
    );

    await bot.sendMessage(chatId, "✅ Заявка отправлена!");
    delete users[chatId];
  }
});

console.log("Bot started");
