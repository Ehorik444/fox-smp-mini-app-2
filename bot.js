require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Открыть мониторинг сервера', web_app: { url: webAppUrl } }]
      ]
    }
  };
  bot.sendMessage(chatId, 'Добро пожаловать на Fox SMP!\nНажми кнопку ниже, чтобы посмотреть статус сервера.', options);
});

console.log('Bot started');
