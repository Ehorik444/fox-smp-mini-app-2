require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;

const users = {};

console.log("NEW BOT VERSION LOADED");

// ===== RCON =====
async function addToWhitelist(nick) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: process.env.RCON_PORT,
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

// ===== анкета =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text) return;

  // игнор команд кроме /start
  if (msg.text.startsWith('/') && msg.text !== '/start') return;

  const user = users[chatId];
  if (!user) return;

  // 1 возраст
  if (user.step === 1) {
    user.age = msg.text;
    user.step = 2;
    return bot.sendMessage(chatId, "🎮 Введите ваш ник в Minecraft:");
  }

  // 2 ник
  if (user.step === 2) {
    user.mcNick = msg.text;
    user.step = 3;
    return bot.sendMessage(chatId, "👥 Ник пригласившего друга:");
  }

  // 3 пригласивший
  if (user.step === 3) {
    user.inviter = msg.text;
    user.step = 4;
    return bot.sendMessage(chatId, "🧾 О себе (минимум 24 символа):");
  }

  // 4 описание
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

    // ===== 1 сообщение (заявка) =====
    await bot.sendMessage(
      FORUM_CHAT_ID,
      application,
      {
        message_thread_id: FORUM_TOPIC_ID
      }
    );

    // ===== 2 сообщение (кнопки) =====
    await bot.sendMessage(
      FORUM_CHAT_ID,
      "⚙️ Управление заявкой:",
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

    await bot.sendMessage(chatId, "✅ Заявка отправлена на рассмотрение!");
  }
});

// ===== CALLBACKS (ВСЁ В ОДНОМ) =====
bot.on('callback_query', async (query) => {
  const data = query.data;
  const [action, userIdStr] = data.split(':');
  const userId = Number(userIdStr);

  const user = users[userId];

  // ===== ACCEPT =====
  if (action === 'accept') {
    try {
      await addToWhitelist(user.mcNick);

      await bot.sendMessage(userId, "🎉 Ваша заявка принята! Вы добавлены в whitelist.");

      await bot.editMessageText("✅ ЗАЯВКА ПРИНЯТА", {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      });

      delete users[userId];
    } catch (err) {
      console.error(err);
      bot.answerCallbackQuery(query.id, { text: "Ошибка RCON" });
    }
  }

  // ===== REJECT =====
  if (action === 'reject') {
    await bot.sendMessage(
      userId,
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
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    });

    delete users[userId];
  }

  // ===== RESTART =====
  if (data === 'restart') {
    users[userId] = {
      step: 1,
      username: query.from.username || "нет username"
    };

    bot.sendMessage(userId, "📝 Начинаем новую заявку!\nВведите возраст:");
  }

  bot.answerCallbackQuery(query.id);
});

console.log("Bot started");
