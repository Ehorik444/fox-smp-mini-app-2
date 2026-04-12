const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// ================= CHECK =================
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// ================= BOT =================
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: {
    autoStart: true,
    params: { timeout: 10 }
  }
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
    console.error('ERROR:', e?.response?.body || e.message);
    return null;
  }
}

// ================= SESSION =================
function getSession(id) {
  id = String(id);

  if (!sessions.has(id)) {
    sessions.set(id, {
      step: 0,
      data: {
        age: '',
        gender: '',
        nickname: '',
        friend: '',
        about: ''
      },
      messageId: null
    });
  }

  return sessions.get(id);
}

function reset(id) {
  const s = getSession(id);
  s.step = 0;
  s.data = {
    age: '',
    gender: '',
    nickname: '',
    friend: '',
    about: ''
  };
  s.messageId = null;
}

// ================= RENDER =================
function render(s) {
  const d = s.data;

  if (s.step >= STEPS.length) {
    return {
      text: `📥 Заявка

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}`,
      keyboard: [
        [{ text: '✅ Отправить', callback_data: 'submit' }],
        [{ text: '↻ Сброс', callback_data: 'restart' }]
      ]
    };
  }

  const cur = STEPS[s.step];

  return {
    text: `💳 Шаг ${s.step + 1}: ${cur.label}

Введите значение:`,
    keyboard: []
  };
}

// ================= UPDATE =================
async function updateUI(chatId, s) {
  const ui = render(s);

  if (!s.messageId) {
    const msg = await safe(() =>
      bot.sendMessage(chatId, ui.text, {
        reply_markup: { inline_keyboard: ui.keyboard }
      })
    );

    if (msg) s.messageId = msg.message_id;

    return;
  }

  await safe(() =>
    bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: s.messageId,
      reply_markup: { inline_keyboard: ui.keyboard }
    })
  );
}

// ================= /START (CRITICAL FIX) =================
bot.onText(/\/start/, async (msg) => {
  try {
    const id = String(msg.from.id);

    reset(id);

    const s = getSession(id);

    const sent = await bot.sendMessage(msg.chat.id, '👋 Начнём анкету');
    s.messageId = sent.message_id;

    await updateUI(msg.chat.id, s);

  } catch (e) {
    console.error('START ERROR:', e);
  }
});

// ================= MESSAGE FSM =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  const s = getSession(id);

  const step = STEPS[s.step];
  if (!step) return;

  const text = msg.text.trim();
  let ok = false;

  switch (step.key) {
    case 'age':
      if (/^\d+$/.test(text)) {
        s.data.age = text;
        ok = true;
      }
      break;

    case 'gender':
      if (['мужской', 'женский'].includes(text.toLowerCase())) {
        s.data.gender = text;
        ok = true;
      }
      break;

    case 'nickname':
      s.data.nickname = text;
      ok = true;
      break;

    case 'friend':
      s.data.friend = text;
      ok = true;
      break;

    case 'about':
      if (text.length > 2) {
        s.data.about = text;
        ok = true;
      }
      break;
  }

  if (!ok) return;

  s.step++;
  await updateUI(msg.chat.id, s);
});

// ================= CALLBACKS =================
bot.on('callback_query', async (q) => {
  const id = String(q.from.id);
  const chatId = q.message?.chat?.id;
  const s = getSession(id);

  if (!chatId) return;

  if (q.data === 'restart') {
    reset(id);
    return updateUI(chatId, s);
  }

  if (q.data === 'submit') {
    const d = s.data;

    if (!d.age || !d.gender || !d.nickname || !d.friend || !d.about) {
      return bot.answerCallbackQuery(q.id, {
        text: 'Заполните все поля',
        show_alert: true
      });
    }

    await safe(() =>
      bot.sendMessage(
        ADMIN_CHAT_ID,
`📥 Заявка

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
  .then(() => console.log('🚀 BOT IS RUNNING'))
  .catch(err => {
    console.error('❌ BOT START FAILED:', err);
  });
