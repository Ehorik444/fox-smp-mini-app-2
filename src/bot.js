require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const GROUP_LINK = process.env.GROUP_LINK;

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const text =
    "⚠️ Бот временно не работает.\n\n" +
    "Пишите в поддержку:\n" +
    GROUP_LINK;

  await bot.sendMessage(chatId, text);
});

// (пример обработки сообщений — если нужно)
bot.on('message', async (msg) => {
  // сюда можно добавить логику
});

console.log('Bot started...');
