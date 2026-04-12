const bot = require('../bot');
const { add } = require('../services/storage');

bot.userState = bot.userState || {};

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = msg.from.id;
  const u = bot.userState[id];

  if (!u) return;

  const t = msg.text.trim();

  switch (u.step) {
    case 1:
      u.data.age = parseInt(t);
      u.step = 2;
      return bot.sendMessage(msg.chat.id, 'Пол?');

    case 2:
      u.data.gender = t;
      u.step = 3;
      return bot.sendMessage(msg.chat.id, 'Ник?');

    case 3:
      u.data.nickname = t;
      u.step = 4;
      return bot.sendMessage(msg.chat.id, 'Кто пригласил?');

    case 4:
      u.data.friend = t;
      u.step = 5;
      return bot.sendMessage(msg.chat.id, 'О себе:');

    case 5:
      u.data.about = t;
      u.step = 6;

      const d = u.data;

      return bot.sendMessage(
        msg.chat.id,
`📥 Проверь:

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Отправить', callback_data: 'submit' }]
            ]
          }
        }
      );
  }
});

bot.on('callback_query', (q) => {
  const id = q.from.id;
  const u = bot.userState[id];

  bot.answerCallbackQuery(q.id);

  if (q.data === 'submit') {
    const d = u.data;

    const app = {
      user_id: id,
      age: d.age,
      gender: d.gender,
      nickname: d.nickname,
      friend: d.friend,
      about: d.about,
      status: d.age >= 14 ? 'auto_accepted' : 'pending',
      created_at: new Date().toISOString()
    };

    add(app);

    bot.sendMessage(id, '✅ Заявка отправлена');

    delete bot.userState[id];
  }
});
