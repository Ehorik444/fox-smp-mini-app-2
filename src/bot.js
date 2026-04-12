const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// ================= BOT =================
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

// ================= STATE =================
const sessions = new Map();

// ================= STEPS =================
const STEPS = [
  { key: 'age', label: 'Возраст' },
  { key: 'gender', label: 'Пол' },
  { key: 'nickname', label: 'Ник' },
  { key: 'friend', label: 'Пригласил' },
  { key: 'about', label: 'О себе' }
];

// ================= SAFE =================
async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('TG ERROR:', e?.response?.body || e.message);
    return null;
  }
}

// ================= SESSION =================
function getSession(id) {
  id = String(id);

  if (!sessions.has(id)) {
    sessions.set(id, {
      step: 0,
      data: {}
    });
  }

  return sessions.get(id);
}

function reset(id) {
  sessions.set(String(id), {
    step: 0,
    data: {}
  });
}

// ================= /START (100% FIXED) =================
bot.onText(/\/start/, async (msg) => {
  try {
    const id = String(msg.from.id);

    reset(id);
    const s = getSession(id);

    await bot.sendMessage(
      msg.chat.id,
      '👋 Привет! Начинаем анкету. Напиши возраст:'
    );

    s.step = 1;
  } catch (e) {
    console.error('START ERROR:', e);
  }
});

// ================= MESSAGE FLOW =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  const s = getSession(id);

  const text = msg.text.trim();

  switch (s.step) {
    case 1:
      s.data.age = text;
      s.step = 2;
      return bot.sendMessage(msg.chat.id, 'Пол? (мужской / женский)');

    case 2:
      s.data.gender = text;
      s.step = 3;
      return bot.sendMessage(msg.chat.id, 'Ник?');

    case 3:
      s.data.nickname = text;
      s.step = 4;
      return bot.sendMessage(msg.chat.id, 'Кто пригласил?');

    case 4:
      s.data.friend = text;
      s.step = 5;
      return bot.sendMessage(msg.chat.id, 'Расскажи о себе');

    case 5:
      s.data.about = text;
      s.step = 6;

      return bot.sendMessage(
        msg.chat.id,
        `📥 Заявка готова

Возраст: ${s.data.age}
Пол: ${s.data.gender}
Ник: ${s.data.nickname}
Пригласил: ${s.data.friend}

О себе:
${s.data.about}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Отправить', callback_data: 'submit' }
            ]]
          }
        }
      );
  }
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const id = String(q.from.id);
  const s = getSession(id);

  if (q.data === 'submit') {
    const d = s.data;

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
            inline_keyboard: [[
              { text: '✅ Принять', callback_data: `accept_${id}` },
              { text: '❌ Отклонить', callback_data: `decline_${id}` }
            ]]
          }
        }
      )
    );

    reset(id);

    return bot.answerCallbackQuery(q.id);
  }

  if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {
    const target = q.data.split('_')[1];

    await safe(() =>
      bot.sendMessage(
        target,
        q.data.startsWith('accept_')
          ? 'Заявка принята ✅'
          : 'Заявка отклонена ❌'
      )
    );

    return bot.answerCallbackQuery(q.id);
  }
});

// ================= START LOG =================
bot.getMe()
  .then(() => console.log('🚀 BOT RUNNING OK'))
  .catch(err => {
    console.error('❌ BOT FAILED:', err);
  });
