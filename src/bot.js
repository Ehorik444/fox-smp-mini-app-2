require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

// ===== CONFIG =====
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const LOG_TOPIC_ID = 28258;

const ADMINS = [5372937661, 2121418969];

// ===== DB FILE =====
const DB_FILE = './db.json';

let db = {
  users: {},        // заявки
  pendingRejects: {},
  appMessages: {},
  rejected: {},     // причины отказа
  reviewed: {}      // пересмотренные заявки
};

// ===== LOAD DB =====
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error("DB LOAD ERROR:", e);
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== TIME =====
function getTime() {
  return new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow"
  });
}

// ===== LOG =====
async function sendLog(text) {
  await bot.sendMessage(FORUM_CHAT_ID, text, {
    message_thread_id: LOG_TOPIC_ID
  });
}

// ===== RCON =====
async function addToWhitelist(nick) {
  const rcon = await Rcon.connect({
    host: process.env.RCON_HOST,
    port: Number(process.env.RCON_PORT),
    password: process.env.RCON_PASSWORD
  });

  await rcon.send(`whitelist add ${nick}`);
  await rcon.end();
}

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  db.users[chatId] = {
    step: 1,
    username: msg.from.username || "нет username",
    applications: db.users[chatId]?.applications || 0,
    lastApp: db.users[chatId]?.lastApp || 0
  };

  saveDB();

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// ===== CALLBACKS =====
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;

  const [action, chatIdStr] = data.split(':');
  const targetChatId = Number(chatIdStr);

  const user = db.users[targetChatId];

  // ===== RESTART / REVIEW =====
  if (data.startsWith('review:')) {
    const chatId = Number(data.split(':')[1]);

    db.users[chatId] = db.users[chatId] || {};
    db.users[chatId].step = 1;
    db.users[chatId].reviewMode = true;

    saveDB();

    await bot.sendMessage(chatId,
      "🔁 Пересмотр заявки\nВведите ваш возраст:"
    );

    await bot.answerCallbackQuery(query.id);
    return;
  }

  // ===== ADMIN CHECK =====
  if (!ADMINS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⛔ Нет прав",
      show_alert: true
    });
  }

  if (!user) {
    return bot.answerCallbackQuery(query.id, {
      text: "Заявка уже обработана"
    });
  }

  // ===== ACCEPT =====
  if (action === 'accept') {
    try {
      await addToWhitelist(user.mcNick);

      db.reviewed[targetChatId] = false;

      await bot.sendMessage(targetChatId,
        "🎉 Ваша заявка принята! Вы добавлены в whitelist."
      );

      await bot.editMessageText("✅ ЗАЯВКА ПРИНЯТА", {
        chat_id: FORUM_CHAT_ID,
        message_id: query.message.message_id
      });

      await sendLog(
`✅ ПРИНЯТА

👤 Админ: @${query.from.username || "no_username"}
🎮 Игрок: ${user.mcNick}
🕒 ${getTime()}`
      );

      delete db.users[targetChatId];
      saveDB();

      return bot.answerCallbackQuery(query.id, { text: "Принято" });
    } catch (e) {
      console.error(e);
      return bot.answerCallbackQuery(query.id, { text: "RCON ошибка" });
    }
  }

  // ===== REJECT =====
  if (action === 'reject') {
    db.pendingRejects[userId] = targetChatId;
    saveDB();

    await bot.sendMessage(userId, "❌ Введите причину отказа:");
    return bot.answerCallbackQuery(query.id);
  }
});

// ===== REJECT REASON HANDLER =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  const user = db.users[chatId];

  // ===== REJECT FLOW =====
  if (db.pendingRejects[msg.from.id]) {
    const targetChatId = db.pendingRejects[msg.from.id];
    const target = db.users[targetChatId];

    const reason = text;

    if (target) {
      db.rejected[targetChatId] = reason;

      await bot.sendMessage(targetChatId,
`❌ Ваша заявка отклонена

📌 Причина: ${reason}

🔁 Вы можете пересмотреть решение`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔁 Пересмотреть решение", callback_data: `review:${targetChatId}` }]
          ]
        }
      });

      await bot.editMessageText("❌ ЗАЯВКА ОТКЛОНЕНА", {
        chat_id: FORUM_CHAT_ID,
        message_id: db.appMessages[targetChatId]
      });

      await sendLog(
`❌ ОТКЛОНЕНА

👤 Админ: @${msg.from.username || "no_username"}
🎮 ${target.mcNick}
📌 ${reason}
🕒 ${getTime()}`
      );

      delete db.users[targetChatId];
      saveDB();
    }

    delete db.pendingRejects[msg.from.id];
    saveDB();
    return;
  }

  if (!user) return;

  // ===== STEP FLOW =====
  if (user.step === 1) {
    user.age = text;
    user.step = 2;
    return bot.sendMessage(chatId, "🎮 Ник Minecraft:");
  }

  if (user.step === 2) {
    user.mcNick = text;
    user.step = 3;
    return bot.sendMessage(chatId, "👥 Ник пригласившего:");
  }

  if (user.step === 3) {
    user.inviter = text;
    user.step = 4;
    return bot.sendMessage(chatId, "🧾 О себе (24+ символа):");
  }

  if (user.step === 4) {
    if (text.length < 24) {
      return bot.sendMessage(chatId, "❌ Минимум 24 символа");
    }

    user.about = text;

    const isReview = user.reviewMode;

    const application =
(isReview ? "🔁 ПЕРЕСМОТР ЗАЯВКИ\n\n" : "📥 НОВАЯ ЗАЯВКА\n\n") +
`👤 @${user.username}
🎂 ${user.age}
🎮 ${user.mcNick}
👥 ${user.inviter}

🧾 ${user.about}`;

    const sent = await bot.sendMessage(
      FORUM_CHAT_ID,
      application,
      {
        message_thread_id: FORUM_TOPIC_ID,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Принять", callback_data: `accept:${chatId}` },
              { text: "❌ Отклонить", callback_data: `reject:${chatId}` }
            ]
          ]
        }
      }
    );

    db.appMessages[chatId] = sent.message_id;

    user.step = 5;
    user.reviewMode = false;

    saveDB();

    return bot.sendMessage(chatId,
      isReview ? "🔁 Заявка пересмотрена!" : "✅ Заявка отправлена!"
    );
  }
});

console.log("Bot started");
