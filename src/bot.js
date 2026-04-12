const TelegramBot = require('node-telegram-bot-api');
const Redis = require('ioredis');
require('dotenv').config();

// ========= CONFIG =========
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const redis = new Redis(process.env.REDIS_URL);

const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const SESSION_TTL = 600; // 10 минут

// ========= QUEUE (анти-флуд) =========
const queue = [];
let sending = false;

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function safe(fn, retries = 3) {
  try {
    return await fn();
  } catch (e) {
    const err = e?.response?.body;

    if (err?.error_code === 429 && retries > 0) {
      const wait = (err.parameters?.retry_after || 1) * 1000;

      console.log(`⏳ Flood control: жду ${wait / 1000}s`);
      await sleep(wait);

      return safe(fn, retries - 1);
    }

    console.error('TG ERROR:', err || e.message);
    return null;
  }
}

async function enqueue(task) {
  queue.push(task);
  processQueue();
}

async function processQueue() {
  if (sending) return;
  sending = true;

  while (queue.length) {
    const task = queue.shift();
    await safe(task);
    await sleep(80); // мягкий лимит
  }

  sending = false;
}

// ========= SESSION =========
async function getSession(id) {
  const data = await redis.get(`session:${id}`);
  return data ? JSON.parse(data) : { step: 0, data: {} };
}

async function setSession(id, session) {
  await redis.set(`session:${id}`, JSON.stringify(session), 'EX', SESSION_TTL);
}

async function resetSession(id) {
  await redis.del(`session:${id}`);
}

// ========= START =========
bot.onText(/\/start/, async (msg) => {
  const id = String(msg.from.id);

  await resetSession(id);

  await setSession(id, { step: 1, data: {} });

  enqueue(() => bot.sendMessage(msg.chat.id, '👋 Введи возраст:'));
});

// ========= FLOW =========
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  let s = await getSession(id);

  const text = msg.text.trim();

  switch (s.step) {
    case 1: {
      const age = parseInt(text);

      if (isNaN(age) || age < 10 || age > 100) {
        return enqueue(() =>
          bot.sendMessage(msg.chat.id, '❌ Введи нормальный возраст (например: 16)')
        );
      }

      s.data.age = age;
      s.step = 2;

      await setSession(id, s);

      return enqueue(() =>
        bot.sendMessage(msg.chat.id, 'Выбери пол:', {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Мужской', callback_data: 'gender_male' },
              { text: 'Женский', callback_data: 'gender_female' }
            ]]
          }
        })
      );
    }

    case 3:
      s.data.nickname = text;
      s.step = 4;

      await setSession(id, s);

      return enqueue(() =>
        bot.sendMessage(msg.chat.id, 'Кто пригласил?')
      );

    case 4:
      s.data.friend = text;
      s.step = 5;

      await setSession(id, s);

      return enqueue(() =>
        bot.sendMessage(msg.chat.id, 'О себе:')
      );

    case 5:
      s.data.about = text;
      s.step = 6;

      await setSession(id, s);

      const d = s.data;

      return enqueue(() =>
        bot.sendMessage(
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
        )
      );
  }
});

// ========= CALLBACK =========
bot.on('callback_query', async (q) => {
  const id = String(q.from.id);
  let s = await getSession(id);

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

    enqueue(() =>
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      )
    );

    enqueue(() =>
      bot.sendMessage(id, 'Введи ник:')
    );

    return bot.answerCallbackQuery(q.id);
  }

  // ========= SUBMIT =========
  if (q.data === 'submit') {
    const ageNum = parseInt(s.data.age);

    const d = {
      age: s.data.age || 'не указано',
      gender: s.data.gender || 'не указано',
      nickname: s.data.nickname || 'не указано',
      friend: s.data.friend || 'не указано',
      about: s.data.about || 'не указано'
    };

    // 🟢 авто-принятие
    if (!isNaN(ageNum) && ageNum >= 14) {
      enqueue(() =>
        bot.sendMessage(
          ADMIN_CHAT_ID,
`🟢 Автопринятая заявка

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}`,
          { message_thread_id: ADMIN_THREAD_ID }
        )
      );

      enqueue(() =>
        bot.sendMessage(id, '✅ Заявка автоматически принята!')
      );

    } else {
      // 🟡 ручная модерация
      enqueue(() =>
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
              inline_keyboard: [[
                { text: '✅ Принять', callback_data: `accept_${id}` },
                { text: '❌ Отклонить', callback_data: `decline_${id}` }
              ]]
            }
          }
        )
      );

      enqueue(() =>
        bot.sendMessage(id, '⏳ Заявка отправлена на рассмотрение')
      );
    }

    enqueue(() =>
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      )
    );

    await resetSession(id);

    return bot.answerCallbackQuery(q.id);
  }

  // ========= ADMIN =========
  if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {
    const target = q.data.split('_')[1];

    enqueue(() =>
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

// ========= START LOG =========
bot.getMe()
  .then(() => console.log('🚀 BOT RUNNING (ANTI-FLOOD + REDIS)'))
  .catch(console.error);
