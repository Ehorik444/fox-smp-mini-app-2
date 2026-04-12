const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
require('dotenv').config();

// ================= INIT =================
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

const bot = new TelegramBot(token, { polling: true });
bot.deleteWebHook();

// ================= CONFIG =================
const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

// админы (кто может нажимать кнопки)
const ADMIN_IDS = new Set([
  5372937661,
  1111111111 // <-- сюда добавь остальных админов
]);

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

const sessions = new Map();
const lastSubmission = new Map();
const COOLDOWN_MS = 60 * 60 * 1000;

// ================= SESSION =================
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { state: STATES.IDLE, data: {} });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, { state: STATES.IDLE, data: {} });
}

// ================= RCON =================
async function addToWhitelist(nick) {
  try {
    const rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD
    });

    await rcon.send(`whitelist add ${nick}`);
    await rcon.end();

    console.log(`✅ Whitelist added: ${nick}`);
  } catch (e) {
    console.error('RCON error:', e);
  }
}

// ================= UI =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '📝 Подать заявку', callback_data: 'start_apply' }]
  ]
};

// ================= START =================
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  resetSession(userId);

  bot.sendMessage(msg.chat.id, 'Добро пожаловать!', {
    reply_markup: mainMenu
  });
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const userId = q.from.id;
  const session = getSession(userId);

  try {
    if (!q.message) return bot.answerCallbackQuery(q.id);

    const chatId = q.message.chat.id;

    // ================= START APPLY =================
    if (q.data === 'start_apply') {

      const lastTime = lastSubmission.get(userId);
      const now = Date.now();

      if (lastTime && now - lastTime < COOLDOWN_MS) {
        const mins = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 60000);

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
      });

      return bot.answerCallbackQuery(q.id);
    }

    // ================= CONFIRM =================
    if (q.data === 'confirm') {
      const data = session.data;

      lastSubmission.set(userId, Date.now());

      const text = `
📥 Новая заявка

👤 ID: ${userId}
Возраст: ${data.age}
Пол: ${data.gender}
Ник: ${data.nickname}
Пригласил: ${data.friend}
О себе: ${data.about}
`;

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
      );

      await bot.sendMessage(chatId, 'Заявка отправлена админам ✅');

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
      });

      return bot.answerCallbackQuery(q.id);
    }

    // ================= ADMIN ACTIONS =================
    if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {

      const requesterId = q.from.id;

      // ❌ только админы
      if (!ADMIN_IDS.has(requesterId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Нет доступа',
          show_alert: true
        });
      }

      const targetId = q.data.split('_')[1];

      // ❌ защита от повторов
      if (processedRequests.has(targetId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Уже обработано',
          show_alert: true
        });
      }

      processedRequests.add(targetId);

      const targetSession = getSession(targetId);
      const nick = targetSession?.data?.nickname;

      // ================= ACCEPT =================
      if (q.data.startsWith('accept_')) {

        if (nick) {
          await addToWhitelist(nick);
        }

        await bot.sendMessage(targetId, 'Ваша заявка принята ✅');
        await bot.answerCallbackQuery(q.id, { text: 'Принято' });
      }

      // ================= DECLINE =================
      if (q.data.startsWith('decline_')) {
        await bot.sendMessage(targetId, 'Ваша заявка отклонена ❌');
        await bot.answerCallbackQuery(q.id, { text: 'Отклонено' });
      }

      // убрать кнопки из форума
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          {
            chat_id: ADMIN_CHAT_ID,
            message_id: q.message.message_id
          }
        );
      } catch (e) {
        console.error('Failed to clear buttons:', e);
      }

      return;
    }

    return bot.answerCallbackQuery(q.id);

  } catch (e) {
    console.error(e);
    return bot.answerCallbackQuery(q.id, {
      text: 'Ошибка',
      show_alert: true
    });
  }
});

// ================= MESSAGE FSM =================
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;

  if (typeof text !== 'string') return;

  const session = getSession(userId);

  switch (session.state) {

    case STATES.AGE: {
      const age = parseInt(text);
      if (isNaN(age) || age < 10 || age > 100) {
        return bot.sendMessage(chatId, 'Возраст 10–100');
      }
      session.data.age = age;
      session.state = STATES.GENDER;
      return bot.sendMessage(chatId, 'Пол: мужской / женский');
    }

    case STATES.GENDER: {
      const gender = text.toLowerCase();
      if (!['мужской', 'женский'].includes(gender)) {
        return bot.sendMessage(chatId, 'Введите: мужской или женский');
      }
      session.data.gender = gender;
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
      return bot.sendMessage(chatId, 'О себе (мин 24 символа)');

    case STATES.ABOUT:
      if (text.length < 24) {
        return bot.sendMessage(chatId, 'Слишком коротко');
      }

      session.data.about = text;
      session.state = STATES.CONFIRM;

      return bot.sendMessage(
        chatId,
        `Проверь:

Возраст: ${session.data.age}
Пол: ${session.data.gender}
Ник: ${session.data.nickname}
Пригласил: ${session.data.friend}
О себе: ${session.data.about}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Да', callback_data: 'confirm' },
              { text: '❌ Заново', callback_data: 'restart' }
            ]]
          }
        }
      );

    default:
      return;
  }
});

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

console.log('Bot started');
