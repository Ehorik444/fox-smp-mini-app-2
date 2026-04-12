const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ================= SAFETY =================
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED REJECTION:', e);
});

process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT EXCEPTION:', e);
});

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

// ================= STATE =================
const sessions = new Map();
const processed = new Map();

// ================= STEPS =================
const STEPS = [
  { key: 'age', label: 'Возраст' },
  { key: 'gender', label: 'Пол' },
  { key: 'nickname', label: 'Ник' },
  { key: 'friend', label: 'Пригласил' },
  { key: 'about', label: 'О себе' }
];

// ================= SAFE WRAPPER =================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
      data: {},
      messageId: null,
      chatId: null
    });
  }

  return sessions.get(id);
}

function reset(id) {
  sessions.set(String(id), {
    step: 0,
    data: {},
    messageId: null,
    chatId: null
  });
}

// ================= UI =================
function progress(step) {
  const total = STEPS.length;
  const percent = Math.round((step / total) * 100);
  const filled = Math.round((step / total) * 10);

  return {
    bar: '█'.repeat(filled) + '░'.repeat(10 - filled),
    percent
  };
}

function render(s) {
  const step = s.step;
  const d = s.data;
  const p = progress(step);

  if (step >= STEPS.length) {
    return {
      text: `💳 Заявка

[${p.bar}] ${p.percent}%

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}

Подтвердите отправку`,
      keyboard: [
        [{ text: 'Подтвердить', callback_data: 'submit' }],
        [{ text: 'Назад', callback_data: 'back' }]
      ]
    };
  }

  const cur = STEPS[step];

  return {
    text: `💳 Заполнение заявки

[${p.bar}] ${p.percent}%

${step + 1}. ${cur.label}

Введите значение:`,
    keyboard: [
      ...(step > 0 ? [[{ text: '← Назад', callback_data: 'back' }]] : []),
      [{ text: '↻ Сброс', callback_data: 'restart' }]
    ]
  };
}

// ================= SAFE UI =================
async function updateUI(chatId, s) {
  const ui = render(s);

  if (!s.messageId) {
    const msg = await safe(() =>
      bot.sendMessage(chatId, ui.text, {
        reply_markup: { inline_keyboard: ui.keyboard }
      })
    );

    if (msg) {
      s.messageId = msg.message_id;
      s.chatId = chatId;
    }

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

// ================= CALLBACKS =================
bot.on('callback_query', async (q) => {
  if (!q?.message?.chat) return;

  const id = String(q.from.id);
  const chatId = q.message.chat.id;
  const s = getSession(id);

  try {

    if (q.data === 'restart') {
      if (s.messageId) {
        await safe(() => bot.deleteMessage(chatId, s.messageId));
      }

      reset(id);

      const fresh = getSession(id);
      await updateUI(chatId, fresh);

      return safe(() => bot.answerCallbackQuery(q.id));
    }

    if (q.data === 'back') {
      s.step = Math.max(0, Number(s.step) || 0 - 1);
      await updateUI(chatId, s);
      return safe(() => bot.answerCallbackQuery(q.id));
    }

    if (q.data === 'submit') {
      const d = s.data;

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
                { text: 'Принять', callback_data: `accept_${id}` },
                { text: 'Отклонить', callback_data: `decline_${id}` }
              ]]
            }
          }
        )
      );

      reset(id);

      await safe(() => bot.sendMessage(chatId, 'Заявка отправлена'));
      return safe(() => bot.answerCallbackQuery(q.id));
    }

  } catch (e) {
    console.error('callback error:', e);
  }
});

// ================= FSM (STABLE) =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  const s = getSession(id);

  const safeStep = Number.isInteger(s.step) ? s.step : 0;

  if (safeStep < 0 || safeStep >= STEPS.length) {
    s.step = 0;
  }

  const step = STEPS[s.step];
  if (!step) return;

  const text = msg.text.trim();
  let valid = false;

  if (step.key === 'age') {
    if (/^\d+$/.test(text)) {
      s.data.age = text;
      valid = true;
    }
  }

  if (step.key === 'gender') {
    const v = text.toLowerCase();
    if (['мужской', 'женский'].includes(v)) {
      s.data.gender = v;
      valid = true;
    }
  }

  if (step.key === 'nickname') {
    s.data.nickname = text;
    valid = true;
  }

  if (step.key === 'friend') {
    s.data.friend = text;
    valid = true;
  }

  if (step.key === 'about') {
    if (text.length >= 24) {
      s.data.about = text;
      valid = true;
    }
  }

  if (!valid) return;

  s.step++;

  await updateUI(msg.chat.id, s);
});

console.log('🚀 STABLE BOT RUNNING');
