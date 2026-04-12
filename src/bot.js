require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const GROUP_LINK = process.env.GROUP_LINK;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(
    chatId,
    "⚠️ Бот временно не работает.\n\n" +
    "Пишите в поддержку:\n" +
    GROUP_LINK
  );
});

console.log("Bot started");
