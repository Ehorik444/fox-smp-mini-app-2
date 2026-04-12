const bot = require('../bot');
const { update } = require('../services/storage');

const ADMIN_CHAT_ID = -1003255144076;

bot.on('callback_query', (q) => {
  bot.answerCallbackQuery(q.id);

  if (q.data.startsWith('accept_')) {
    const id = q.data.split('_')[1];

    update(id, 'accepted');
    bot.sendMessage(id, '✅ Принято');
  }

  if (q.data.startsWith('decline_')) {
    const id = q.data.split('_')[1];

    update(id, 'declined');
    bot.sendMessage(id, '❌ Отклонено');
  }
});
