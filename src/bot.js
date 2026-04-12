const TelegramBot = require('node-telegram-bot-api');
const Redis = require('ioredis');
require('dotenv').config();

// ========= CONFIG =========
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const redis = new Redis(process.env.REDIS_URL); // например redis://127.0.0.1:6379

const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const SESSION_TTL = 600; // 10 минут

// ========= HELPERS =========
async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('TG ERROR:', e?.response?.body || e.message);
    return null;
  }
}

async function getSession(id) {
  const data = await redis.get(`session:${id}`);
  return data ? JSON.parse(data) : { step: 0, data: {} };
}

async function setSession(id, session) {
  await redis.set(
    `session:${id}`,
    JSON.stringify(session),
    'EX',
    SESSION_TTL
  );
}

async function resetSession(id) {
  await redis.del(`session:${id}`);
}

// ========= START =========
bot.onText(/\/start/, async (msg) => {
  const id = String(msg.from.id);

  await resetSession(id);

  await setSession(id, {
    step: 1,
    data: {}
  });

  bot.sendMessage(msg.chat.id, '👋 Введи возраст:');
});

// ========= FLOW =========
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  let s = await getSession(id);

  const text = msg.text.trim();

  switch (s.step) {
    case 1:
      s.data.age = text;
      s.step = 2;

      await setSession(id, s);

      return bot.sendMessage(msg.chat.id, 'Выбери пол:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Мужской', callback_data: 'gender_male' },
              { text: 'Женский', callback_data: 'gender_female' }
            ]
          ]
        }
      });

    case 3:
      s.data.nickname = text;
      s.step = 4;

      await setSession(id, s);

      return bot.sendMessage(msg.chat.id, 'Кто пригласил?');

    case 4:
      s.data.friend = text;
      s.step = 5;

      await setSession(id, s);

      return bot.sendMessage(msg.chat.id, 'О себе:');

    case 5:
      s.data.about = text;
      s.step = 6;

      await setSession(id, s);

      const d = s.data;

      return bot.sendMessage(
        msg.chat.id,
`📥 Проверь анкету:

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Отправить', callback_data: 'submit' }]
            ]
          }
        }
      );
  }
});

// ========= CALLBACK =========
bot.on('callback_query', async (q) => {
  const id = String(q.from.id);
  let s = await getSession(id);

  // ❌ если сессия умерла
  if (!s || !s.step) {
    return bot.answerCallbackQuery(q.id, {
      text: '❌ Сессия истекла. Напиши /start',
      show_alert: true
    });
  }

  // ========= GENDER =========
  if (q.data.startsWith('gender_')) {
    s.data.gender = q.data === 'gender_male' ? 'мужской' : 'женский';
    s.step = 3;

    await setSession(id, s);

    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id
      }
    );

    await bot.sendMessage(id, 'Введи ник:');

    return bot.answerCallbackQuery(q.id);
  }

  // ========= SUBMIT =========
  if (q.data === 'submit') {
    const d = {
      age: s.data.age || 'не указано',
      gender: s.data.gender || 'не указано',
      nickname: s.data.nickname || 'не указано',
      friend: s.data.friend || 'не указано',
      about: s.data.about || 'не указано'
    };

    await safe(() =>
      bot.sendMessage(
        ADMIN_CHAT_ID,
`📥 Новая заявка

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}`,
        {
          message_thread_id: ADMIN_THREAD_ID,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Принять', callback_data: `accept_${id}` },
                { text: '❌ Отклонить', callback_data: `decline_${id}` }
              ]
            ]
          }
        }
      )
    );

    await bot.sendMessage(id, '✅ Заявка отправлена!');

    // удаляем кнопку
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id
      }
    );

    await resetSession(id);

    return bot.answerCallbackQuery(q.id);
  }

  // ========= ADMIN =========
  if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {
    const target = q.data.split('_')[1];

    await safe(() =>
      bot.sendMessage(
        target,
        q.data.startsWith('accept_')
          ? '✅ Заявка принята'
          : '❌ Заявка отклонена'
      )
    );

    return bot.answerCallbackQuery(q.id);
  }
});

// ========= LOG =========
bot.getMe()
  .then(() => console.log('🚀 BOT RUNNING WITH REDIS'))
  .catch(console.error);
