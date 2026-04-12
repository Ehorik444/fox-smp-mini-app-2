const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const ADMIN_IDS = new Set(['5372937661']); // строка обязательно

const COOLDOWN_MS = 60 * 60 * 1000;

// ================= STORAGE =================
const sessions = new Map();
const lastSubmission = new Map();
const processed = new Set();

// ================= STEPS =================
const STEPS = ['age', 'gender', 'nickname', 'friend', 'about', 'confirm'];

// ================= SESSION =================
function getSession(userId) {
  const id = String(userId);

  if (!sessions.has(id)) {
    sessions.set(id, {
      stepIndex: 0,
      data: {},
      messageId: null
    });
  }

  return sessions.get(id);
}

function reset(userId) {
  sessions.set(String(userId), {
    stepIndex: 0,
    data: {},
    messageId: null
  });
}

// ================= UI =================
function render(session) {
  const step = STEPS[session.stepIndex];
  const d = session.data;

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
        [{ text: '✅ Отправить', callback_data: 'submit' }],
        [{ text: '🔄 Начать заново', callback_data: 'restart' }]
      ]
    };
  }

  const map = {
    age: '📋 Шаг 1/5: Введите возраст',
    gender: '📋 Шаг 2/5: Пол (мужской / женский)',
    nickname: '📋 Шаг 3/5: Введите ник',
    friend: '📋 Шаг 4/5: Кто пригласил?',
    about: '📋 Шаг 5/5: О себе (24+ символа)'
  };

  const keyboard = [];
  if (session.stepIndex > 0) {
    keyboard.push([{ text: '⬅ Назад', callback_data: 'back' }]);
  }

  return {
    text: map[step],
    keyboard
  };
}

// ================= SEND / EDIT =================
async function updateUI(chatId, session) {
  const ui = render(session);

  try {
    if (session.messageId) {
      return await bot.editMessageText(ui.text, {
        chat_id: chatId,
        message_id: session.messageId,
        reply_markup: { inline_keyboard: ui.keyboard }
      });
    }

    const msg = await bot.sendMessage(chatId, ui.text, {
      reply_markup: { inline_keyboard: ui.keyboard }
    });

    session.messageId = msg.message_id;
    return msg;

  } catch (e) {
    const msg = await bot.sendMessage(chatId, ui.text, {
      reply_markup: { inline_keyboard: ui.keyboard }
    });

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
  try {
    if (!q?.message) return bot.answerCallbackQuery(q.id);

    const userId = String(q.from.id);
    const chatId = q.message.chat.id;
    const session = getSession(userId);

    // ================= BACK =================
    if (q.data === 'back') {
      session.stepIndex = Math.max(0, session.stepIndex - 1);
      return updateUI(chatId, session).finally(() => bot.answerCallbackQuery(q.id));
    }

    // ================= RESTART =================
    if (q.data === 'restart') {
      reset(userId);
      return updateUI(chatId, session).finally(() => bot.answerCallbackQuery(q.id));
    }

    // ================= START APPLY =================
    if (q.data === 'start_apply') {

      // 🔥 FIX: cooldown НЕ для админов
      if (!ADMIN_IDS.has(userId)) {
        const last = lastSubmission.get(userId);
        const now = Date.now();

        if (last && now - last < COOLDOWN_MS) {
          const mins = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);

          return bot.answerCallbackQuery(q.id, {
            text: `Подождите ${mins} мин`,
            show_alert: true
          });
        }
      }

      session.stepIndex = 0;
      session.data = {};

      await bot.editMessageText('Введите возраст:', {
        chat_id: chatId,
        message_id: q.message.message_id
      }).catch(() => {});

      return bot.answerCallbackQuery(q.id);
    }

    // ================= SUBMIT =================
    if (q.data === 'submit') {

      const d = session.data;

      // 🔥 FIX: cooldown только для не-админов
      if (!ADMIN_IDS.has(userId)) {
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
      }

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
      });

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

      const targetId = q.data.split('_')[1];

      if (processed.has(targetId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Уже обработано',
          show_alert: true
        });
      }

      processed.add(targetId);

      if (q.data.startsWith('accept_')) {
        await bot.sendMessage(targetId, '✅ Заявка принята');
      } else {
        await bot.sendMessage(targetId, '❌ Заявка отклонена');
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
    console.error('ERROR:', e);
  }
});

// ================= INPUT =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const userId = String(msg.from.id);
  const chatId = msg.chat.id;
  const session = getSession(userId);

  const step = STEPS[session.stepIndex];

  switch (step) {

    case 'age': {
      const age = Number(msg.text);
      if (!age || age < 10 || age > 100) return;
      session.data.age = age;
      session.stepIndex++;
      return updateUI(chatId, session);
    }

    case 'gender': {
      const g = msg.text.toLowerCase();
      if (!['мужской', 'женский'].includes(g)) return;
      session.data.gender = g;
      session.stepIndex++;
      return updateUI(chatId, session);
    }

    case 'nickname':
      session.data.nickname = msg.text;
      session.stepIndex++;
      return updateUI(chatId, session);

    case 'friend':
      session.data.friend = msg.text;
      session.stepIndex++;
      return updateUI(chatId, session);

    case 'about':
      if (msg.text.length < 24) return;
      session.data.about = msg.text;
      session.stepIndex++;
      return updateUI(chatId, session);
  }
});

console.log('🚀 BOT RUNNING (FIXED VERSION)');
