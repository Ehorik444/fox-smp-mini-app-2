const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const ADMIN_IDS = new Set(['5372937661']);
const COOLDOWN_MS = 60 * 60 * 1000;

// ================= SAFETY =================
process.on('unhandledRejection', e => console.error(e));
process.on('uncaughtException', e => console.error(e));

// ================= RCON =================
const RCON_CONFIG = {
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT) || 25575,
  password: process.env.RCON_PASSWORD
};

// ================= STORAGE =================
const sessions = new Map();
const lastSubmission = new Map();
const processed = new Set();

// ================= STEPS =================
const STEPS = ['age', 'gender', 'nickname', 'friend', 'about', 'confirm'];

// ================= PROGRESS BAR =================
function progress(i) {
  const total = 5;
  const cur = i + 1;
  return `Шаг ${cur}/${total}\n[${'█'.repeat(cur)}${'░'.repeat(total - cur)}]`;
}

// ================= SESSION =================
function getSession(id) {
  id = String(id);
  if (!sessions.has(id)) {
    sessions.set(id, { stepIndex: 0, data: {}, messageId: null });
  }
  return sessions.get(id);
}

function reset(id) {
  sessions.set(String(id), { stepIndex: 0, data: {}, messageId: null });
}

// ================= ANIMATION =================
async function animate(chatId, session, renderFn) {
  const frames = ['⏳', '⏳.', '⏳..', '⏳...'];

  try {
    for (const f of frames) {
      await bot.editMessageText(f, {
        chat_id: chatId,
        message_id: session.messageId,
        reply_markup: { inline_keyboard: [] }
      });

      await new Promise(r => setTimeout(r, 70));
    }

    const ui = renderFn();

    await bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: session.messageId,
      reply_markup: { inline_keyboard: ui.keyboard }
    });

  } catch (e) {
    console.error('ANIM ERROR:', e);
  }
}

// ================= UI =================
function render(session) {
  const step = STEPS[session.stepIndex];
  const d = session.data;

  const texts = {
    age: 'Введите возраст',
    gender: 'Пол (мужской / женский)',
    nickname: 'Введите ник',
    friend: 'Кто пригласил?',
    about: 'О себе (мин 24 символа)'
  };

  if (step === 'confirm') {
    return {
      text:
`${progress(session.stepIndex)}

Проверь данные:

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}
О себе: ${d.about}

Отправить заявку?`,
      keyboard: [
        [{ text: 'Отправить', callback_data: 'submit' }],
        [{ text: 'Начать заново', callback_data: 'restart' }]
      ]
    };
  }

  return {
    text: `${progress(session.stepIndex)}\n\n${texts[step]}`,
    keyboard: session.stepIndex > 0
      ? [[{ text: 'Назад', callback_data: 'back' }]]
      : []
  };
}

// ================= UI UPDATE =================
async function updateUI(chatId, session) {
  const ui = render(session);

  try {
    if (session.messageId) {
      await bot.editMessageText(ui.text, {
        chat_id: chatId,
        message_id: session.messageId,
        reply_markup: { inline_keyboard: ui.keyboard }
      });
      return;
    }

    const msg = await bot.sendMessage(chatId, ui.text, {
      reply_markup: { inline_keyboard: ui.keyboard }
    });

    session.messageId = msg.message_id;

  } catch (e) {
    console.error('UI ERROR:', e);
  }
}

// ================= RCON =================
async function addToWhitelist(nick) {
  let rcon;

  try {
    rcon = await Rcon.connect(RCON_CONFIG);

    const list = await rcon.send('whitelist list');

    if (list.includes(nick)) {
      console.log(`⚠️ already exists: ${nick}`);
      await rcon.end();
      return;
    }

    await rcon.send(`whitelist add ${nick}`);

    console.log(`✅ whitelisted: ${nick}`);

    await rcon.end();

  } catch (e) {
    console.error('RCON ERROR:', e);
    try { if (rcon) await rcon.end(); } catch {}
  }
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const s = getSession(msg.from.id);
  reset(msg.from.id);
  await updateUI(msg.chat.id, s);
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  try {
    const id = String(q.from.id);
    const chatId = q.message.chat.id;
    const s = getSession(id);

    if (q.data === 'back') {
      s.stepIndex = Math.max(0, s.stepIndex - 1);
      await animate(chatId, s, () => render(s));
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'restart') {
      reset(id);
      await animate(chatId, s, () => render(s));
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'submit') {

      const d = s.data;

      if (!d.age || !d.gender || !d.nickname || !d.friend || !d.about) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Заполните все поля',
          show_alert: true
        });
      }

      const userTag = q.from.username ? `@${q.from.username}` : 'no_username';

      await addToWhitelist(d.nickname);

      await bot.sendMessage(
        ADMIN_CHAT_ID,
`📥 Новая заявка

Пользователь: ${userTag}
ID: ${id}

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
      );

      reset(id);

      await bot.sendMessage(chatId, 'Заявка отправлена');
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {

      if (!ADMIN_IDS.has(id)) {
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

      await bot.sendMessage(
        target,
        q.data.startsWith('accept_')
          ? 'Заявка принята'
          : 'Заявка отклонена'
      );

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

  } catch (e) {
    console.error('CALLBACK ERROR:', e);
  }
});

// ================= FSM =================
bot.on('message', async (msg) => {
  try {
    if (!msg.text || msg.text.startsWith('/')) return;

    const id = String(msg.from.id);
    const s = getSession(id);

    const step = STEPS[s.stepIndex];

    if (step === 'age') {
      const v = Number(msg.text);
      if (!v) return;
      s.data.age = v;
      s.stepIndex++;
      return animate(msg.chat.id, s, () => render(s));
    }

    if (step === 'gender') {
      if (!['мужской', 'женский'].includes(msg.text.toLowerCase())) return;
      s.data.gender = msg.text;
      s.stepIndex++;
      return animate(msg.chat.id, s, () => render(s));
    }

    if (step === 'nickname') {
      s.data.nickname = msg.text.trim();
      s.stepIndex++;
      return animate(msg.chat.id, s, () => render(s));
    }

    if (step === 'friend') {
      s.data.friend = msg.text.trim();
      s.stepIndex++;
      return animate(msg.chat.id, s, () => render(s));
    }

    if (step === 'about') {
      if (msg.text.length < 24) return;
      s.data.about = msg.text;
      s.stepIndex++;
      return animate(msg.chat.id, s, () => render(s));
    }

  } catch (e) {
    console.error('FSM ERROR:', e);
  }
});

console.log('🚀 BOT READY (ANIMATED + PROGRESS + STABLE)');
