const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ========= BOT =========
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const ADMIN_CHAT_ID = -1003255144076;
const ADMIN_THREAD_ID = 3567;

const SESSION_TTL = 10 * 60 * 1000;

// ========= FILE DB =========
const FILE_PATH = path.join(__dirname, 'applications.json');

// ========= QUEUE (анти-флуд) =========
const queue = [];
let sending = false;

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// ========= SAFE SEND (429 FIX) =========
async function safe(fn, retries = 3) {
  try {
    return await fn();
  } catch (e) {
    const err = e?.response?.body;

    if (err?.error_code === 429 && retries > 0) {
      const wait = (err.parameters?.retry_after || 1) * 1000;
      console.log(`⏳ Flood control: жду ${wait / 1000}s`);
      await sleep(wait);
      return safe(fn, retries - 1);
    }

    console.error('TG ERROR:', err || e.message);
    return null;
  }
}

// ========= QUEUE =========
async function enqueue(task) {
  queue.push(task);
  processQueue();
}

async function processQueue() {
  if (sending) return;
  sending = true;

  while (queue.length) {
    const task = queue.shift();
    await safe(task);
    await sleep(80);
  }

  sending = false;
}

// ========= FILE DB FUNCTIONS =========
function readApplications() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8') || '[]');
  } catch (e) {
    console.error('READ ERROR:', e.message);
    return [];
  }
}

function writeApplications(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('WRITE ERROR:', e.message);
  }
}

function saveApplication(userId, data, status) {
  const apps = readApplications();

  apps.push({
    id: Date.now(),
    user_id: String(userId),
    age: data.age,
    gender: data.gender,
    nickname: data.nickname,
    friend: data.friend,
    about: data.about,
    status,
    created_at: new Date().toISOString()
  });

  writeApplications(apps);
}

function updateLastApplication(userId, status) {
  const apps = readApplications();

  for (let i = apps.length - 1; i >= 0; i--) {
    if (String(apps[i].user_id) === String(userId)) {
      apps[i].status = status;
      break;
    }
  }

  writeApplications(apps);
}

// ========= SESSION =========
const sessions = new Map();

function getSession(id) {
  id = String(id);

  if (!sessions.has(id)) {
    sessions.set(id, {
      step: 0,
      data: {},
      expires: Date.now() + SESSION_TTL
    });
  }

  const s = sessions.get(id);

  if (Date.now() > s.expires) {
    sessions.delete(id);
    return { step: 0, data: {} };
  }

  return s;
}

function setSession(id, s) {
  sessions.set(String(id), {
    ...s,
    expires: Date.now() + SESSION_TTL
  });
}

function resetSession(id) {
  sessions.delete(String(id));
}

// cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now > s.expires) sessions.delete(id);
  }
}, 60000);

// ========= START =========
bot.onText(/\/start/, async (msg) => {
  const id = String(msg.from.id);

  resetSession(id);

  setSession(id, { step: 1, data: {} });

  enqueue(() => bot.sendMessage(msg.chat.id, '👋 Введи возраст:'));
});

// ========= FLOW =========
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const id = String(msg.from.id);
  let s = getSession(id);

  const text = msg.text.trim();

  switch (s.step) {
    case 1: {
      const age = parseInt(text);

      if (isNaN(age) || age < 10 || age > 100) {
        return enqueue(() =>
          bot.sendMessage(msg.chat.id, '❌ Введи нормальный возраст (например: 16)')
        );
      }

      s.data.age = age;
      s.step = 2;

      setSession(id, s);

      return enqueue(() =>
        bot.sendMessage(msg.chat.id, 'Выбери пол:', {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Мужской', callback_data: 'gender_male' },
              { text: 'Женский', callback_data: 'gender_female' }
            ]]
          }
        })
      );
    }

    case 3:
      s.data.nickname = text;
      s.step = 4;
      setSession(id, s);

      return enqueue(() => bot.sendMessage(msg.chat.id, 'Кто пригласил?'));

    case 4:
      s.data.friend = text;
      s.step = 5;
      setSession(id, s);

      return enqueue(() => bot.sendMessage(msg.chat.id, 'О себе:'));

    case 5:
      s.data.about = text;
      s.step = 6;
      setSession(id, s);

      const d = s.data;

      return enqueue(() =>
        bot.sendMessage(
          msg.chat.id,
`📥 Проверь анкету:

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
        )
      );
  }
});

// ========= CALLBACK =========
bot.on('callback_query', async (q) => {
  const id = String(q.from.id);
  let s = getSession(id);

  if (!s || !s.step) {
    return bot.answerCallbackQuery(q.id, {
      text: '❌ Сессия истекла. Напиши /start',
      show_alert: true
    });
  }

  // ========= GENDER =========
  if (q.data.startsWith('gender_')) {
    s.data.gender = q.data === 'gender_male' ? 'мужской' : 'женский';
    s.step = 3;

    setSession(id, s);

    enqueue(() =>
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      )
    );

    enqueue(() => bot.sendMessage(id, 'Введи ник:'));

    return bot.answerCallbackQuery(q.id);
  }

  // ========= SUBMIT =========
  if (q.data === 'submit') {
    const ageNum = parseInt(s.data.age);

    const d = {
      age: s.data.age || 'не указано',
      gender: s.data.gender || 'не указано',
      nickname: s.data.nickname || 'не указано',
      friend: s.data.friend || 'не указано',
      about: s.data.about || 'не указано'
    };

    if (!isNaN(ageNum) && ageNum >= 14) {
      saveApplication(id, d, 'auto_accepted');

      enqueue(() =>
        bot.sendMessage(ADMIN_CHAT_ID,
`🟢 Автопринятая заявка

Возраст: ${d.age}
Пол: ${d.gender}
Ник: ${d.nickname}
Пригласил: ${d.friend}

О себе:
${d.about}`,
        { message_thread_id: ADMIN_THREAD_ID })
      );

      enqueue(() => bot.sendMessage(id, '✅ Заявка автоматически принята!'));
    } else {
      saveApplication(id, d, 'pending');

      enqueue(() =>
        bot.sendMessage(ADMIN_CHAT_ID,
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
        })
      );

      enqueue(() => bot.sendMessage(id, '⏳ Заявка отправлена на рассмотрение'));
    }

    enqueue(() =>
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: q.message.chat.id,
          message_id: q.message.message_id
        }
      )
    );

    resetSession(id);

    return bot.answerCallbackQuery(q.id);
  }

  // ========= ADMIN =========
  if (q.data.startsWith('accept_') || q.data.startsWith('decline_')) {
    const target = q.data.split('_')[1];
    const status = q.data.startsWith('accept_') ? 'accepted' : 'declined';

    updateLastApplication(target, status);

    enqueue(() =>
      bot.sendMessage(
        target,
        status === 'accepted'
          ? '✅ Заявка принята'
          : '❌ Заявка отклонена'
      )
    );

    return bot.answerCallbackQuery(q.id);
  }
});

// ========= START =========
bot.getMe()
  .then(() => console.log('🚀 BOT RUNNING (FILE DB + STABLE)'))
  .catch(console.error);
