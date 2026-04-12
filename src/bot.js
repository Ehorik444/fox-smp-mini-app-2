const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const ADMIN_IDS = new Set(['5372937661']);

const COOLDOWN_MS = 60 * 60 * 1000;

// ================= STATE =================
const sessions = new Map();
const lastSubmission = new Map();
const processed = new Set();

// ================= STEPS =================
const STEPS = [
  'age',
  'gender',
  'nickname',
  'friend',
  'about',
  'confirm'
];

// ================= SESSION =================
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      stepIndex: 0,
      data: {},
      messageId: null
    });
  }
  return sessions.get(userId);
}

function reset(userId) {
  sessions.set(userId, { stepIndex: 0, data: {}, messageId: null });
}

// ================= UI BUILDER =================
function render(session) {
  const step = STEPS[session.stepIndex];
  const d = session.data;

  const map = {
    age: `📋 Шаг 1/5\n\nВведите возраст:`,
    gender: `📋 Шаг 2/5\n\nПол (мужской / женский)`,
    nickname: `📋 Шаг 3/5\n\nВведите ник`,
    friend: `📋 Шаг 4/5\n\nКто пригласил?`,
    about: `📋 Шаг 5/5\n\nО себе (24+ символа)`
  };

  if (step === 'confirm') {
    return {
      text:
`📥 Проверь заявку:

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}
О себе: ${d.about}

Отправить заявку?`,
      keyboard: [
        [
          { text: '✅ Отправить', callback_data: 'submit' }
        ],
        [
          { text: '🔄 Начать заново', callback_data: 'restart' }
        ]
      ]
    };
  }

  const keyboard = [];

  if (session.stepIndex > 0) {
    keyboard.push([{ text: '⬅ Назад', callback_data: 'back' }]);
  }

  return {
    text: map[step],
    keyboard
  };
}

// ================= SEND OR EDIT =================
async function updateUI(chatId, session) {
  const ui = render(session);

  const opts = {
    reply_markup: { inline_keyboard: ui.keyboard }
  };

  try {
    if (session.messageId) {
      return await bot.editMessageText(ui.text, {
        chat_id: chatId,
        message_id: session.messageId,
        ...opts
      });
    }

    const msg = await bot.sendMessage(chatId, ui.text, opts);
    session.messageId = msg.message_id;
    return msg;

  } catch (e) {
    const msg = await bot.sendMessage(chatId, ui.text, opts);
    session.messageId = msg.message_id;
    return msg;
  }
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const session = getSession(msg.from.id);
  reset(msg.from.id);

  await updateUI(msg.chat.id, session);
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const userId = String(q.from.id);
  const session = getSession(userId);

  try {
    const chatId = q.message.chat.id;

    // ================= BACK =================
    if (q.data === 'back') {
      session.stepIndex = Math.max(0, session.stepIndex - 1);
      return updateUI(chatId, session);
    }

    // ================= RESTART =================
    if (q.data === 'restart') {
      reset(userId);
      return updateUI(chatId, session);
    }

    // ================= SUBMIT =================
    if (q.data === 'submit') {

      const last = lastSubmission.get(userId);
      const now = Date.now();

      if (last && now - last < COOLDOWN_MS) {
        const mins = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);

        return bot.answerCallbackQuery(q.id, {
          text: `Подождите ${mins} мин`,
          show_alert: true
        });
      }

      lastSubmission.set(userId, now);

      const d = session.data;

      await bot.sendMessage(ADMIN_CHAT_ID,
`📥 Новая заявка

ID: ${userId}
Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}
О себе: ${d.about}`,
        {
          message_thread_id: ADMIN_THREAD_ID,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Принять', callback_data: `accept_${userId}` },
              { text: '❌ Отклонить', callback_data: `decline_${userId}` }
            ]]
          }
        }
      );

      reset(userId);
      await updateUI(chatId, session);

      return bot.answerCallbackQuery(q.id);
    }

    // ================= ADMIN =================
    if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {

      if (!ADMIN_IDS.has(userId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Нет доступа',
          show_alert: true
        });
      }

      const target = q.data.split('_')[1];

      if (processed.has(target)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Уже обработано',
          show_alert: true
        });
      }

      processed.add(target);

      if (q.data.startsWith('accept_')) {
        await bot.sendMessage(target, '✅ Заявка принята');
      } else {
        await bot.sendMessage(target, '❌ Заявка отклонена');
      }

      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          {
            chat_id: ADMIN_CHAT_ID,
            message_id: q.message.message_id
          }
        );
      } catch {}

      return bot.answerCallbackQuery(q.id);
    }

    return bot.answerCallbackQuery(q.id);

  } catch (e) {
    console.error(e);
  }
});

// ================= MESSAGE INPUT =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const userId = msg.from.id;
  const session = getSession(userId);

  const step = STEPS[session.stepIndex];

  switch (step) {

    case 'age': {
      const age = Number(msg.text);
      if (!age || age < 10 || age > 100) return;

      session.data.age = age;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

    case 'gender': {
      const g = msg.text.toLowerCase();
      if (!['мужской', 'женский'].includes(g)) return;

      session.data.gender = g;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

    case 'nickname':
      session.data.nickname = msg.text;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);

    case 'friend':
      session.data.friend = msg.text;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);

    case 'about':
      if (msg.text.length < 24) return;

      session.data.about = msg.text;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
  }
});

console.log('🚀 Telegram Form UI bot started');
