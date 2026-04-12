// ================= IMPORTS =================
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// ================= INIT =================
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

const bot = new TelegramBot(token, { polling: true });

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

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { state: STATES.IDLE, data: {} });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, { state: STATES.IDLE, data: {} });
}

// ================= DATA =================
const submitted = new Set();

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
    if (!q.message) {
      return bot.answerCallbackQuery(q.id);
    }

    const chatId = q.message.chat.id;

    if (q.data === 'start_apply') {
      if (submitted.has(userId)) {
        return bot.answerCallbackQuery(q.id, {
          text: 'Вы уже подавали заявку',
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

    if (q.data === 'confirm') {
      submitted.add(userId);

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: chatId,
          message_id: q.message.message_id
        }
      );

      await bot.sendMessage(chatId, 'Заявка отправлена ✅');

      resetSession(userId);
      return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'restart') {
      session.state = STATES.AGE;
      session.data = {};

      await bot.editMessageText('Введите возраст:', {
        chat_id: chatId,
        message_id: q.message.message_id
      });

      return bot.answerCallbackQuery(q.id);
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

  // перезапуск через /start
  if (text === '/start') {
    resetSession(userId);
    return bot.sendMessage(chatId, 'Начинаем заново', {
      reply_markup: mainMenu
    });
  }

  const session = getSession(userId);

  switch (session.state) {

    case STATES.AGE: {
      const age = parseInt(text);

      if (isNaN(age) || age < 10 || age > 100) {
        return bot.sendMessage(chatId, 'Введите корректный возраст (10–100)');
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
        return bot.sendMessage(chatId, 'Слишком коротко (минимум 24 символа)');
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

console.log('Bot started');
