const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const ADMIN_IDS = new Set(['5372937661']);
const COOLDOWN_MS = 60 * 60 * 1000;

// ================= SAFETY (FIX CRASHES) =================
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

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

  const texts = {
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
    text: texts[step],
    keyboard
  };
}

// ================= UI UPDATE =================
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

    if (q.data === 'back') {
      session.stepIndex = Math.max(0, session.stepIndex - 1);
      await updateUI(chatId, session);
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'restart') {
      reset(userId);
      await updateUI(chatId, session);
      return bot.answerCallbackQuery(q.id);
    }

    // ================= SUBMIT =================
    if (q.data === 'submit') {

      const d = session.data;

      // validation
      if (!d.age || !d.gender || !d.nickname || !d.friend || !d.about) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Заполните все поля',
          show_alert: true
        });
      }

      // cooldown (only non-admin)
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

      const userTag = q.from.username
        ? `@${q.from.username}`
        : 'no_username';

      // ================= SAFE DISCORD CARD (NO Markdown!) =================
      await bot.sendMessage(
        ADMIN_CHAT_ID,
`🟦━━━━━━━━━━━━━━🟦
📥 NEW APPLICATION
🟦━━━━━━━━━━━━━━🟦

👤 User: ${userTag}
🆔 ID: ${userId}

━━━━━━━━━━━━━━
📊 INFO
━━━━━━━━━━━━━━

🎂 Age: ${d.age}
⚧ Gender: ${d.gender}
🎮 Nickname: ${d.nickname}
👥 Invited by: ${d.friend}

📝 About:
${d.about}

🟦━━━━━━━━━━━━━━🟦`,
        {
          message_thread_id: ADMIN_THREAD_ID,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Accept', callback_data: `accept_${userId}` },
              { text: '❌ Decline', callback_data: `decline_${userId}` }
            ]]
          }
        }
      );

      reset(userId);

      await bot.sendMessage(chatId, '✅ Заявка отправлена');
      return bot.answerCallbackQuery(q.id);
    }

    // ================= ADMIN ACTIONS =================
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
        await bot.sendMessage(targetId, '✅ Ваша заявка принята');
      } else {
        await bot.sendMessage(targetId, '❌ Ваша заявка отклонена');
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

// ================= MESSAGE FSM =================
bot.on('message', async (msg) => {
  try {
    if (!msg.text || msg.text.startsWith('/')) return;

    const userId = String(msg.from.id);
    const chatId = msg.chat.id;
    const session = getSession(userId);

    const step = STEPS[session.stepIndex];
    if (!step) return;

    if (step === 'age') {
      const age = Number(msg.text);
      if (!age || age < 10 || age > 100) return;
      session.data.age = age;
      session.stepIndex++;
      return updateUI(chatId, session);
    }

    if (step === 'gender') {
      const g = msg.text.toLowerCase();
      if (!['мужской', 'женский'].includes(g)) return;
      session.data.gender = g;
      session.stepIndex++;
      return updateUI(chatId, session);
    }

    if (step === 'nickname') {
      session.data.nickname = msg.text.trim();
      session.stepIndex++;
      return updateUI(chatId, session);
    }

    if (step === 'friend') {
      session.data.friend = msg.text.trim();
      session.stepIndex++;
      return updateUI(chatId, session);
    }

    if (step === 'about') {
      if (msg.text.length < 24) return;
      session.data.about = msg.text;
      session.stepIndex++;
      return updateUI(chatId, session);
    }

  } catch (e) {
    console.error('FSM ERROR:', e);
  }
});

console.log('🚀 STABLE BOT RUNNING (NO CRASH VERSION)');
