const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const ADMIN_IDS = new Set(['5372937661']);
const COOLDOWN_MS = 60 * 60 * 1000;

// ================= RCON =================
const RCON_CONFIG = {
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT) || 25575,
  password: process.env.RCON_PASSWORD
};

// ================= SAFETY =================
process.on('unhandledRejection', (err) => console.error('UNHANDLED:', err));
process.on('uncaughtException', (err) => console.error('CRASH:', err));

// ================= STORAGE =================
const sessions = new Map();
const lastSubmission = new Map();
const processed = new Set();

// ================= FSM =================
const STEPS = ['age', 'gender', 'nickname', 'friend', 'about', 'confirm'];

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

// ================= RCON WHITELIST =================
async function addToWhitelist(nick) {
  let rcon;

  try {
    rcon = await Rcon.connect(RCON_CONFIG);

    const list = await rcon.send('whitelist list');

    if (list.includes(nick)) {
      console.log(`⚠️ Already in whitelist: ${nick}`);
      await rcon.end();
      return { ok: false, reason: 'exists' };
    }

    const res = await rcon.send(`whitelist add ${nick}`);

    console.log(`✅ Whitelisted: ${nick}`);
    console.log(`📡 RCON: ${res}`);

    await rcon.end();

    return { ok: true };

  } catch (e) {
    console.error(`❌ RCON ERROR (${nick}):`, e);

    try { if (rcon) await rcon.end(); } catch {}

    return { ok: false, reason: 'error' };
  }
}

// ================= UI =================
function render(session) {
  const step = STEPS[session.stepIndex];
  const d = session.data;

  if (step === 'confirm') {
    return {
      text:
`📥 ПРОВЕРКА ЗАЯВКИ

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}
О себе: ${d.about}

Отправить заявку?`,
      keyboard: [
        [{ text: '✅ Отправить', callback_data: 'submit' }],
        [{ text: '🔄 Заново', callback_data: 'restart' }]
      ]
    };
  }

  const texts = {
    age: '📋 Введите возраст',
    gender: '📋 Пол (мужской / женский)',
    nickname: '📋 Ник',
    friend: '📋 Кто пригласил?',
    about: '📋 О себе (24+ символа)'
  };

  const keyboard = [];
  if (session.stepIndex > 0) {
    keyboard.push([{ text: '⬅ Назад', callback_data: 'back' }]);
  }

  return { text: texts[step], keyboard };
}

// ================= UPDATE UI =================
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
  } catch (e) {
    console.error('UI ERROR:', e);
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
    const id = String(q.from.id);
    const chatId = q.message.chat.id;
    const session = getSession(id);

    if (q.data === 'back') {
      session.stepIndex = Math.max(0, session.stepIndex - 1);
      await updateUI(chatId, session);
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'restart') {
      reset(id);
      await updateUI(chatId, session);
      return bot.answerCallbackQuery(q.id);
    }

    // ================= SUBMIT =================
    if (q.data === 'submit') {

      const d = session.data;

      if (!d.age || !d.gender || !d.nickname || !d.friend || !d.about) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Заполните все поля',
          show_alert: true
        });
      }

      // cooldown (except admin)
      if (!ADMIN_IDS.has(id)) {
        const last = lastSubmission.get(id);
        const now = Date.now();

        if (last && now - last < COOLDOWN_MS) {
          return bot.answerCallbackQuery(q.id, {
            text: 'Подождите 1 час',
            show_alert: true
          });
        }

        lastSubmission.set(id, now);
      }

      const userTag = q.from.username ? `@${q.from.username}` : 'no_username';

      // ================= RCON =================
      const rconResult = await addToWhitelist(d.nickname);

      console.log('RCON RESULT:', rconResult);

      // ================= SEND TO ADMIN =================
      await bot.sendMessage(
        ADMIN_CHAT_ID,
`🟦━━━━━━━━━━━━━━🟦
📥 NEW APPLICATION
🟦━━━━━━━━━━━━━━🟦

👤 User: ${userTag}
🆔 ID: ${id}

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
              { text: '✅ Accept', callback_data: `accept_${id}` },
              { text: '❌ Decline', callback_data: `decline_${id}` }
            ]]
          }
        }
      );

      reset(id);

      await bot.sendMessage(chatId, '✅ Заявка отправлена');
      return bot.answerCallbackQuery(q.id);
    }

    // ================= ADMIN =================
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

  } catch (e) {
    console.error('CALLBACK ERROR:', e);
  }
});

// ================= FSM =================
bot.on('message', async (msg) => {
  try {
    if (!msg.text || msg.text.startsWith('/')) return;

    const id = String(msg.from.id);
    const session = getSession(id);

    const step = STEPS[session.stepIndex];

    if (step === 'age') {
      const age = Number(msg.text);
      if (!age) return;
      session.data.age = age;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

    if (step === 'gender') {
      if (!['мужской', 'женский'].includes(msg.text.toLowerCase())) return;
      session.data.gender = msg.text;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

    if (step === 'nickname') {
      session.data.nickname = msg.text.trim();
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

    if (step === 'friend') {
      session.data.friend = msg.text.trim();
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

    if (step === 'about') {
      if (msg.text.length < 24) return;
      session.data.about = msg.text;
      session.stepIndex++;
      return updateUI(msg.chat.id, session);
    }

  } catch (e) {
    console.error('FSM ERROR:', e);
  }
});

console.log('🚀 BOT ONLINE (FULL FIXED VERSION)');
