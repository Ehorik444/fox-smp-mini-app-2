const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// ================= CHECK TOKEN =================
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

// ================= SAFE WRAPPER =================
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
      data: {
        age: null,
        gender: null,
        nickname: null,
        friend: null,
        about: null
      },
      messageId: null
    });
  }

  return sessions.get(id);
}

function reset(id) {
  const s = getSession(id);

  s.step = 0;
  s.data.age = null;
  s.data.gender = null;
  s.data.nickname = null;
  s.data.friend = null;
  s.data.about = null;
  s.messageId = null;
}

// ================= UI =================
function render(s) {
  const d = s.data;

  const total = STEPS.length;
  const percent = Math.round((s.step / total) * 100);
  const bar = '█'.repeat(Math.round((s.step / total) * 10)) + '░'.repeat(10 - Math.round((s.step / total) * 10));

  if (s.step >= STEPS.length) {
    return {
      text: `📥 Заявка

[${bar}] ${percent}%

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}

Подтвердите отправку`,
      keyboard: [
        [{ text: '✅ Отправить', callback_data: 'submit' }],
        [{ text: '← Назад', callback_data: 'back' }]
      ]
    };
  }

  const cur = STEPS[s.step];

  return {
    text: `💳 Заполнение заявки

[${bar}] ${percent}%

${s.step + 1}. ${cur.label}

Введите значение:`,
    keyboard: [
      ...(s.step > 0 ? [[{ text: '← Назад', callback_data: 'back' }]] : []),
      [{ text: '↻ Сброс', callback_data: 'restart' }]
    ]
  };
}

// ================= UPDATE UI =================
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

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const id = String(msg.from.id);

  reset(id);

  const s = getSession(id);
  await updateUI(msg.chat.id, s);
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  if (!q?.message?.chat) return;

  const id = String(q.from.id);
  const chatId = q.message.chat.id;
  const s = getSession(id);

  try {

    // RESET
    if (q.data === 'restart') {
      reset(id);
      const fresh = getSession(id);

      await updateUI(chatId, fresh);
      return safe(() => bot.answerCallbackQuery(q.id));
    }

    // BACK
    if (q.data === 'back') {
      s.step = Math.max(0, s.step - 1);
      await updateUI(chatId, s);
      return safe(() => bot.answerCallbackQuery(q.id));
    }

    // SUBMIT
    if (q.data === 'submit') {
      const d = s.data;

      if (!d.age || !d.gender || !d.nickname || !d.friend || !d.about) {
        return safe(() =>
          bot.answerCallbackQuery(q.id, {
            text: 'Заполните все поля',
            show_alert: true
          })
        );
      }

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

      await safe(() => bot.sendMessage(chatId, 'Заявка отправлена'));
      return safe(() => bot.answerCallbackQuery(q.id));
    }

    // ADMIN ACTIONS
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

      return safe(() => bot.answerCallbackQuery(q.id));
    }

  } catch (e) {
    console.error(e);
  }
});

// ================= FSM =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  const s = getSession(id);

  const stepObj = STEPS[s.step];
  if (!stepObj) return;

  const text = msg.text.trim();
  const key = stepObj.key;

  let ok = false;

  if (key === 'age' && /^\d+$/.test(text)) {
    s.data.age = text;
    ok = true;
  }

  if (key === 'gender' && ['мужской', 'женский'].includes(text.toLowerCase())) {
    s.data.gender = text.toLowerCase();
    ok = true;
  }

  if (key === 'nickname' && text) {
    s.data.nickname = text;
    ok = true;
  }

  if (key === 'friend' && text) {
    s.data.friend = text;
    ok = true;
  }

  if (key === 'about' && text.length >= 5) {
    s.data.about = text;
    ok = true;
  }

  if (!ok) return;

  s.step++;
  await updateUI(msg.chat.id, s);
});

// ================= START LOG =================
bot.getMe()
  .then(() => console.log('🚀 BOT RUNNING'))
  .catch(err => {
    console.error('❌ BOT FAILED:', err?.response?.body || err.message);
    process.exit(1);
  });
