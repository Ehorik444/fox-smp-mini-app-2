// FSM-based Telegram bot (clean + scalable) const TelegramBot = require('node-telegram-bot-api'); const { Rcon } = require('rcon-client'); require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

const bot = new TelegramBot(token, { polling: true });

// ================= FSM ================= const STATES = { IDLE: 'idle', AGE: 'age', GENDER: 'gender', NICKNAME: 'nickname', FRIEND: 'friend', ABOUT: 'about', CONFIRM: 'confirm' };

const sessions = new Map(); // userId -> session

function getSession(userId) { if (!sessions.has(userId)) { sessions.set(userId, { state: STATES.IDLE, data: {} }); } return sessions.get(userId); }

function resetSession(userId) { sessions.set(userId, { state: STATES.IDLE, data: {} }); }

// ================= CONFIG ================= const ADMIN_IDS = new Set([5372937661, 2121418969]); const submitted = new Set();

const RCON_CONFIG = { host: process.env.RCON_HOST, port: parseInt(process.env.RCON_PORT) || 25575, password: process.env.RCON_PASSWORD };

// ================= UI ================= const mainMenu = { inline_keyboard: [ [{ text: '📝 Подать заявку', callback_data: 'start_apply' }] ] };

// ================= START ================= bot.onText(//start/, (msg) => { bot.sendMessage(msg.chat.id, 'Добро пожаловать!', { reply_markup: mainMenu }); });

// ================= CALLBACK ================= bot.on('callback_query', async (q) => { const userId = q.from.id; const chatId = q.message.chat.id; const session = getSession(userId);

try { if (q.data === 'start_apply') { if (submitted.has(userId)) { return bot.answerCallbackQuery(q.id, { text: 'Вы уже подавали заявку', show_alert: true }); }

session.state = STATES.AGE;
  session.data = {};

  await bot.editMessageText('Введите возраст:', {
    chat_id: chatId,
    message_id: q.message.message_id
  });

  return bot.answerCallbackQuery(q.id);
}

if (q.data === 'confirm') {
  const data = session.data;
  submitted.add(userId);

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

} catch (e) { console.error(e); } });

// ================= MESSAGE FSM ================= bot.on('message', async (msg) => { const userId = msg.from.id; const chatId = msg.chat.id; const text = msg.text;

if (!text) return;

const session = getSession(userId);

switch (session.state) {

case STATES.AGE:
  if (!/^\d+$/.test(text)) {
    return bot.sendMessage(chatId, 'Введите число');
  }
  session.data.age = text;
  session.state = STATES.GENDER;
  return bot.sendMessage(chatId, 'Пол: мужской / женский');

case STATES.GENDER:
  if (!['мужской','женский'].includes(text.toLowerCase())) {
    return bot.sendMessage(chatId, 'Ошибка ввода');
  }
  session.data.gender = text;
  session.state = STATES.NICKNAME;
  return bot.sendMessage(chatId, 'Введите ник');

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

  return bot.sendMessage(chatId,
    `Проверь:\nВозраст: ${session.data.age}\nНик: ${session.data.nickname}`,
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

} });

console.log('FSM bot started');
