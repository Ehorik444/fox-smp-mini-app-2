const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

const bot = new TelegramBot(token, { polling: true });

// ================= SAFE CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const ADMIN_IDS = new Set(['5372937661']); // string-safe
const COOLDOWN_MS = 60 * 60 * 1000;

// ================= STORAGE =================
const sessions = new Map();
const lastSubmission = new Map();
const processedRequests = new Set();

// ================= FSM =================
const STATES = {
  IDLE: 'idle',
  AGE: 'age',
  GENDER: 'gender',
  NICKNAME: 'nickname',
  FRIEND: 'friend',
  ABOUT: 'about',
  CONFIRM: 'confirm'
};

// ================= HELPERS =================
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { state: STATES.IDLE, data: {} });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, { state: STATES.IDLE, data: {} });
}

// ================= SAFE RCON (optional) =================
async function addToWhitelist(nick) {
  try {
    const { Rcon } = require('rcon-client');

    const rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    await rcon.send(`whitelist add ${nick}`);
    await rcon.end();

    console.log('✔ whitelist added:', nick);
  } catch (e) {
    console.error('RCON error (ignored):', e.message);
  }
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;

  resetSession(userId);

  bot.sendMessage(msg.chat.id, 'Добро пожаловать!', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Подать заявку', callback_data: 'start_apply' }]
      ]
    }
  });
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  try {
    if (!q?.message) return bot.answerCallbackQuery(q.id);

    const userId = String(q.from.id);
    const chatId = q.message.chat.id;
    const session = getSession(userId);

    // ================= APPLY =================
    if (q.data === 'start_apply') {
      const last = lastSubmission.get(userId);
      const now = Date.now();

      if (last && now - last < COOLDOWN_MS) {
        const mins = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);

        return bot.answerCallbackQuery(q.id, {
          text: `Подождите ${mins} мин`,
          show_alert: true
        });
      }

      session.state = STATES.AGE;
      session.data = {};

      await bot.editMessageText('Введите возраст:', {
        chat_id: chatId,
        message_id: q.message.message_id
      }).catch(() => {});

      return bot.answerCallbackQuery(q.id);
    }

    // ================= CONFIRM =================
    if (q.data === 'confirm') {
      const data = session.data;

      lastSubmission.set(userId, Date.now());

      const text =
`📥 Новая заявка

👤 ID: ${userId}
Возраст: ${data.age}
Пол: ${data.gender}
Ник: ${data.nickname}
Пригласил: ${data.friend}
О себе: ${data.about}`;

      await bot.sendMessage(ADMIN_CHAT_ID, text, {
        message_thread_id: ADMIN_THREAD_ID,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Принять', callback_data: `accept_${userId}` },
            { text: '❌ Отклонить', callback_data: `decline_${userId}` }
          ]]
        }
      });

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: chatId,
          message_id: q.message.message_id
        }
      ).catch(() => {}); // IMPORTANT FIX

      resetSession(userId);

      return bot.answerCallbackQuery(q.id);
    }

    // ================= RESTART =================
    if (q.data === 'restart') {
      session.state = STATES.AGE;
      session.data = {};

      await bot.editMessageText('Введите возраст:', {
        chat_id: chatId,
        message_id: q.message.message_id
      }).catch(() => {});

      return bot.answerCallbackQuery(q.id);
    }

    // ================= ADMIN ACTIONS =================
    if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {
      const requesterId = String(q.from.id);

      if (!ADMIN_IDS.has(requesterId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Нет доступа',
          show_alert: true
        });
      }

      const targetId = q.data.split('_')[1];

      if (processedRequests.has(targetId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Уже обработано',
          show_alert: true
        });
      }

      processedRequests.add(targetId);

      const targetSession = getSession(targetId);
      const nick = targetSession?.data?.nickname;

      if (q.data.startsWith('accept_')) {
        if (nick) await addToWhitelist(nick);
        await bot.sendMessage(targetId, 'Ваша заявка принята ✅');
      }

      if (q.data.startsWith('decline_')) {
        await bot.sendMessage(targetId, 'Ваша заявка отклонена ❌');
      }

      // remove buttons safely
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: ADMIN_CHAT_ID,
          message_id: q.message.message_id
        }
      ).catch(() => {});

      return bot.answerCallbackQuery(q.id);
    }

    return bot.answerCallbackQuery(q.id);

  } catch (e) {
    console.error('GLOBAL ERROR:', e);
  }
});

// ================= MESSAGE FSM =================
bot.on('message', (msg) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  const session = getSession(userId);

  try {
    switch (session.state) {

      case STATES.AGE: {
        const age = Number(text);
        if (!age || age < 10 || age > 100) {
          return bot.sendMessage(chatId, 'Возраст 10–100');
        }
        session.data.age = age;
        session.state = STATES.GENDER;
        return bot.sendMessage(chatId, 'Пол: мужской / женский');
      }

      case STATES.GENDER: {
        const g = text.toLowerCase();
        if (!['мужской', 'женский'].includes(g)) {
          return bot.sendMessage(chatId, 'Введите корректно');
        }
        session.data.gender = g;
        session.state = STATES.NICKNAME;
        return bot.sendMessage(chatId, 'Введите ник');
      }

      case STATES.NICKNAME:
        session.data.nickname = text;
        session.state = STATES.FRIEND;
        return bot.sendMessage(chatId, 'Кто пригласил?');

      case STATES.FRIEND:
        session.data.friend = text;
        session.state = STATES.ABOUT;
        return bot.sendMessage(chatId, 'О себе (24+ символа)');

      case STATES.ABOUT:
        if (text.length < 24) {
          return bot.sendMessage(chatId, 'Слишком коротко');
        }

        session.data.about = text;
        session.state = STATES.CONFIRM;

        return bot.sendMessage(chatId,
`Проверь:

Возраст: ${session.data.age}
Пол: ${session.data.gender}
Ник: ${session.data.nickname}
Пригласил: ${session.data.friend}
О себе: ${session.data.about}`, {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Да', callback_data: 'confirm' },
              { text: '❌ Заново', callback_data: 'restart' }
            ]]
          }
        });

      default:
        return;
    }
  } catch (e) {
    console.error('FSM ERROR:', e);
  }
});

console.log('BOT STARTED');
