// Пример кода для бота (bot.js)
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot('YOUR_BOT_TOKEN', { polling: true });

const WEB_APP_URL = 'https://0-egorik-0.bothost.ru';

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, '🦊 Добро пожаловать на сервер Fox SMP!', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 Открыть сервер', web_app: { url: WEB_APP_URL } }],
        [{ text: '💬 Чат сервера', url: 'https://t.me/ваш_чат' }],
        [{ text: '📖 Правила', callback_data: 'rules' }]
      ]
    }
  });
});
