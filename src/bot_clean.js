const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const FILE = './applications.json';

// ========= STORAGE =========
function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function add(app) {
  const data = load();
  data.push(app);
  save(data);
}

function update(userId, status) {
  const data = load();

  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].user_id === userId) {
      data[i].status = status;
      break;
    }
  }

  save(data);
}

// ========= STATE =========
const users = new Map();

function get(id) {
  if (!users.has(id)) {
    users.set(id, { step: 0, data: {} });
  }
  return users.get(id);
}

// ========= START =========
bot.onText(/\/start/, (msg) => {
  const id = String(msg.from.id);
  users.set(id, { step: 1, data: {} });

  bot.sendMessage(msg.chat.id, '👋 Введи возраст:');
});

// ========= MESSAGES =========
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  const u = get(id);
  const t = msg.text.trim();

  switch (u.step) {
    case 1: {
      const age = parseInt(t);

      if (isNaN(age)) {
        return bot.sendMessage(msg.chat.id, '❌ Введи число');
      }

      u.data.age = age;
      u.step = 2;

      return bot.sendMessage(msg.chat.id, 'Пол? (м/ж)');
    }

    case 2:
      u.data.gender = t;
      u.step = 3;
      return bot.sendMessage(msg.chat.id, 'Ник?');

    case 3:
      u.data.nickname = t;
      u.step = 4;
      return bot.sendMessage(msg.chat.id, 'Кто пригласил?');

    case 4:
      u.data.friend = t;
      u.step = 5;
      return bot.sendMessage(msg.chat.id, 'О себе:');

    case 5: {
      u.data.about = t;
      u.step = 6;

      const d = u.data;

      return bot.sendMessage(
        msg.chat.id,
`📥 Проверка:

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Отправить', callback_data: 'submit' }]
            ]
          }
        }
      );
    }
  }
});

// ========= CALLBACK =========
bot.on('callback_query', (q) => {
  const id = String(q.from.id);
  const u = get(id);

  bot.answerCallbackQuery(q.id);

  if (q.data === 'submit') {
    const d = u.data;

    const age = parseInt(d.age);

    const app = {
      user_id: id,
      age: d.age,
      gender: d.gender,
      nickname: d.nickname,
      friend: d.friend,
      about: d.about,
      status: age >= 14 ? 'auto_accepted' : 'pending',
      created_at: new Date().toISOString()
    };

    add(app);

    if (age >= 14) {
      bot.sendMessage(id, '✅ Авто-принято!');

      bot.sendMessage(
        ADMIN_CHAT_ID,
        `🟢 Авто заявка

Возраст: ${d.age}
Ник: ${d.nickname}`,
        { message_thread_id: ADMIN_THREAD_ID }
      );
    } else {
      bot.sendMessage(id, '⏳ Отправлено на проверку');

      bot.sendMessage(
        ADMIN_CHAT_ID,
        `📥 Заявка

Возраст: ${d.age}
Ник: ${d.nickname}`,
        {
          message_thread_id: ADMIN_THREAD_ID,
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Принять', callback_data: `accept_${id}` },
                { text: 'Отклонить', callback_data: `decline_${id}` }
              ]
            ]
          }
        }
      );
    }

    users.delete(id);
  }

  if (q.data.startsWith('accept_')) {
    const target = q.data.split('_')[1];
    update(target, 'accepted');
    bot.sendMessage(target, '✅ Принято');
  }

  if (q.data.startsWith('decline_')) {
    const target = q.data.split('_')[1];
    update(target, 'declined');
    bot.sendMessage(target, '❌ Отклонено');
  }
});

// ========= START =========
console.log('🚀 BOT STARTED CLEAN VERSION');
