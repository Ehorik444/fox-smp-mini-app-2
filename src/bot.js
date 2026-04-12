console.log("=== PRO BOT (FINAL NO-REDIS STABLE VERSION) ===");

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    autoStart: false,
    interval: 300,
    params: { timeout: 30 }
  }
});

// ================= CONFIG =================
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const ADMINS = [5372937661, 2121418969];

// ================= DB (FILE SAFE) =================
const DB_FILE = path.join(__dirname, "applications.json");

let db = loadDB();

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("DB SAVE ERROR:", e);
  }
}

// ================= FSM STATES =================
const STATES = {
  AGE: "AGE",
  MC: "MC",
  INV: "INV",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

// ================= MEMORY LOCKS =================
const locks = {};
const rejectQueue = {};

// ================= HELPERS =================
function now() {
  const d = new Date();
  const p = (n) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function getUser(id) {
  if (!db[id]) {
    db[id] = {
      state: STATES.AGE,
      status: "draft"
    };
  }
  return db[id];
}

function updateUser(id, data) {
  db[id] = { ...getUser(id), ...data };
  saveDB();
}

async function send(chat, text, opts = {}) {
  try {
    return await bot.sendMessage(chat, text, opts);
  } catch (e) {
    console.error("SEND ERROR:", e.message);
  }
}

// ================= START =================
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;

  const username = msg.from.username
    ? `@${msg.from.username}`
    : msg.from.first_name;

  updateUser(id, {
    username,
    state: STATES.AGE,
    status: "draft"
  });

  send(id, "📝 Заявка начата!\nВведите возраст:");
});

// ================= MESSAGE HANDLER =================
bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  if (locks[id]) return;
  locks[id] = true;

  try {
    const user = getUser(id);

    if (user.status !== "draft") return;

    switch (user.state) {

      case STATES.AGE:
        const age = Number(text);

        if (!age || age < 10 || age > 99) {
          return send(id, "❌ Введите корректный возраст (10-99)");
        }

        updateUser(id, { age, state: STATES.MC });
        return send(id, "🎮 Ник Minecraft:");

      case STATES.MC:
        updateUser(id, { mc: text, state: STATES.INV });
        return send(id, "👥 Кто пригласил?");

      case STATES.INV:
        updateUser(id, { inv: text, state: STATES.ABOUT });
        return send(id, "🧾 О себе (24+ символа):");

      case STATES.ABOUT:
        if (text.length < 24) {
          return send(id, "❌ Минимум 24 символа");
        }

        updateUser(id, { about: text, state: STATES.DONE, status: "pending" });

        const app = getUser(id);

        const sent = await send(FORUM_CHAT_ID, `
📥 ЗАЯВКА

👤 ${app.username}
🎂 ${app.age}
🎮 ${app.mc}
👥 ${app.inv}

🧾 ${app.about}
`, {
          message_thread_id: FORUM_TOPIC_ID,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Принять", callback_data: `acc:${id}` },
              { text: "❌ Отклонить", callback_data: `rej:${id}` }
            ]]
          }
        });

        updateUser(id, { message_id: sent?.message_id });

        return send(id, "✅ Заявка отправлена!");
    }

  } finally {
    locks[id] = false;
  }
});

// ================= CALLBACK =================
bot.on("callback_query", async (q) => {
  const admin = q.from.id;
  const [act, uid] = q.data.split(":");
  const id = Number(uid);

  if (!ADMINS.includes(admin)) {
    return bot.answerCallbackQuery(q.id, { text: "⛔ Нет прав" });
  }

  const app = getUser(id);

  if (!app || app.status !== "pending") {
    return bot.answerCallbackQuery(q.id, { text: "Уже обработано" });
  }

  if (act === "acc") {

    updateUser(id, { status: "accepted" });

    const log = `
✅ ПРИНЯТА

👤 Админ: ${q.from.username ? "@" + q.from.username : q.from.first_name}
🎮 ${app.mc}
🕒 ${now()}
`;

    await send(id, "🎉 Вы приняты! IP: fox-smp.com");

    await bot.editMessageText(log, {
      chat_id: FORUM_CHAT_ID,
      message_id: app.message_id,
      message_thread_id: FORUM_TOPIC_ID
    });

    return bot.answerCallbackQuery(q.id, { text: "OK" });
  }

  if (act === "rej") {
    rejectQueue[admin] = id;
    return send(admin, "Введите причину отказа:");
  }
});

// ================= REJECT FLOW =================
bot.on("message", async (msg) => {
  const admin = msg.from.id;

  if (!rejectQueue[admin]) return;
  if (!ADMINS.includes(admin)) return;

  const id = rejectQueue[admin];
  delete rejectQueue[admin];

  const reason = msg.text;
  const app = getUser(id);

  updateUser(id, { status: "rejected" });

  const log = `
❌ ОТКЛОНЕНА

👤 Админ: ${msg.from.username ? "@" + msg.from.username : msg.from.first_name}
🎮 ${app.mc}
📌 ${reason}
🕒 ${now()}
`;

  await send(id, `❌ Отклонено\nПричина: ${reason}`);

  await bot.editMessageText(log, {
    chat_id: FORUM_CHAT_ID,
    message_id: app.message_id,
    message_thread_id: FORUM_TOPIC_ID
  });
});

// ================= START =================
bot.startPolling();

console.log("✅ BOT RUNNING (NO REDIS FINAL)");
