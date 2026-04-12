const bot = require('../bot');

bot.onText(/\/start/, (msg) => {
  const id = msg.from.id;

  bot.sendMessage(msg.chat.id, '👋 Введи возраст:');
  bot.userState = bot.userState || {};
  bot.userState[id] = { step: 1, data: {} };
});
