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
const lastSubmit = new Map();
const processed = new Map(); // TTL storage

// ================= STEPS =================
const STEPS = [
  { key: 'age', label: 'Возраст' },
  { key: 'gender', label: 'Пол' },
  { key: 'nickname', label: 'Ник' },
  { key: 'friend', label: 'Пригласил' },
  { key: 'about', label: 'О себе' }
];

// ================= HELPERS =================
function safeNumber(v) {
  return /^\d+$/.test(v);
}

function sanitizeNick(nick) {
  return nick.replace(/[^a-zA-Z0-9_]/g, '');
}

function cleanupProcessed() {
  const now = Date.now();
  for (const [k, v] of processed.entries()) {
    if (now - v > 60 * 60 * 1000) processed.delete(k);
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

// ================= SAFE UPDATE UI =================
async function updateUI(chatId, s) {
  const ui = render(s);

  try {
    if (!s.messageId) {
      const msg = await bot.sendMessage(chatId, ui.text, {
        reply_markup: { inline_keyboard: ui.keyboard }
      });

      s.messageId = msg.message_id;
      s.chatId = chatId;
      return;
    }

    await bot.editMessageText(ui.text, {
      chat_id: chatId,
      message_id: s.messageId,
      reply_markup: { inline_keyboard: ui.keyboard }
    });

  } catch (e) {
    // message not modified / deleted / etc
    console.error('updateUI error:', e.message);
  }
}

// ================= SAFE ANIMATION =================
async function animate(chatId, s, fn) {
  const frames = ['⏳', '⏳.', '⏳..', '⏳...'];

  try {
    for (const f of frames) {
      if (!s.messageId) break;

      try {
        await bot.editMessageText(f, {
          chat_id: chatId,
          message_id: s.messageId,
          reply_markup: { inline_keyboard: [] }
        });
      } catch {}

      await new Promise(r => setTimeout(r, 80));
    }

    await fn?.();
    await updateUI(chatId, s);

  } catch (e) {
    console.error('animate error:', e.message);
  }
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const s = getSession(msg.from.id);
  reset(msg.from.id);

  const fresh = getSession(msg.from.id);
  await updateUI(msg.chat.id, fresh);
});

// ================= RCON SAFE =================
async function addToWhitelist(nick) {
  let rcon;

  try {
    const safeNick = sanitizeNick(nick);

    rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT) || 25575,
      password: process.env.RCON_PASSWORD
    });

    const list = await rcon.send('whitelist list');

    if (list.includes(safeNick)) return;

    await rcon.send(`whitelist add ${safeNick}`);

    console.log('WHITELISTED:', safeNick);

  } catch (e) {
    console.error('RCON ERROR:', e.message);
  } finally {
    try {
      if (rcon) await rcon.end();
    } catch {}
  }
}

// ================= CALLBACKS =================
bot.on('callback_query', async (q) => {
  if (!q.message) return;

  const id = String(q.from.id);
  const chatId = q.message.chat.id;
  const s = getSession(id);

  try {
    if (q.data === 'back') {
      s.step = Math.max(0, s.step - 1);
      await animate(chatId, s, () => {});
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'restart') {
      reset(id);
      const fresh = getSession(id);

      await animate(chatId, fresh, () => {});
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'submit') {

      const d = s.data;

      const now = Date.now();

      if (!ADMIN_IDS.has(id)) {
        const last = lastSubmit.get(id);

        if (last && now - last < COOLDOWN_MS) {
          return bot.answerCallbackQuery(q.id, {
            text: 'Подождите 1 час',
            show_alert: true
          });
        }

        lastSubmit.set(id, now);
      }

      const userTag = q.from.username ? `@${q.from.username}` : 'no_username';

      await addToWhitelist(d.nickname);

      await bot.sendMessage(
        ADMIN_CHAT_ID,
`📥 Заявка

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

      cleanupProcessed();

      if (processed.has(target)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Уже обработано',
          show_alert: true
        });
      }

      processed.set(target, Date.now());

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
    console.error('callback error:', e);
  }
});

// ================= FSM =================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  const s = getSession(id);

  const step = STEPS[s.step];
  if (!step) return;

  const key = step.key;

  if (key === 'age') {
    if (!safeNumber(msg.text)) return;
    s.data.age = msg.text;
  }

  if (key === 'gender') {
    const v = msg.text.toLowerCase().trim();
    if (!['мужской', 'женский'].includes(v)) return;
    s.data.gender = v;
  }

  if (key === 'nickname') {
    s.data.nickname = msg.text;
  }

  if (key === 'friend') {
    s.data.friend = msg.text;
  }

  if (key === 'about') {
    if (msg.text.length < 24) return;
    s.data.about = msg.text;
  }

  s.step++;

  return animate(msg.chat.id, s, () => {});
});

console.log('🚀 FIXED BOT RUNNING');
