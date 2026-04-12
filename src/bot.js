console.log("=== PRO BOT (REDIS FSM PRODUCTION VERSION) ===");

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
const Redis = require('ioredis');

// ================= GLOBAL SAFETY =================
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

// ================= REDIS =================
const redis = new Redis(process.env.REDIS_URL);

const STATE_KEY = (id) => `user:${id}:state`;
const DATA_KEY  = (id) => `user:${id}:data`;
const LOCK_KEY  = (id) => `user:${id}:lock`;
const MSG_KEY   = (id) => `user:${id}:msg`;

// ================= BOT =================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
    params: { timeout: 30 }
  }
});

// ================= CONFIG =================
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const ADMINS = [5372937661, 2121418969];

// ================= STATES =================
const STATES = {
  AGE: "AGE",
  MC_NICK: "MC_NICK",
  INVITER: "INVITER",
  ABOUT: "ABOUT",
  DONE: "DONE"
};

// ================= HELPERS =================
function formatDate(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    console.error("SEND ERROR:", e.message);
  }
}

async function safeEdit(text, app) {
  try {
    const msgId = await redis.get(MSG_KEY(app.chat_id));
    if (!msgId) return;

    await bot.editMessageText(text, {
      chat_id: FORUM_CHAT_ID,
      message_id: msgId,
      message_thread_id: FORUM_TOPIC_ID
    });
  } catch (e) {
    console.error("EDIT ERROR:", e.message);
  }
}

// ================= REDIS FSM =================
async function getState(id) {
  return await redis.get(STATE_KEY(id));
}

async function setState(id, state) {
  await redis.set(STATE_KEY(id), state);
}

async function getData(id) {
  const raw = await redis.get(DATA_KEY(id));
  return raw ? JSON.parse(raw) : {};
}

async function updateData(id, newData) {
  const old = await getData(id);
  const merged = { ...old, ...newData };
  await redis.set(DATA_KEY(id), JSON.stringify(merged));
  return merged;
}

// ================= LOCK =================
async function lockUser(id) {
  return (await redis.set(LOCK_KEY(id), "1", "NX", "EX", 8)) === "OK";
}

async function unlockUser(id) {
  await redis.del(LOCK_KEY(id));
}

// ================= RCON =================
async function addToWhitelist(nick) {
  try {
    const rcon = await Rcon.connect({
      host: process.env.RCON_HOST,
      port: Number(process.env.RCON_PORT),
      password: process.env.RCON_PASSWORD,
      timeout: 5000
    });

    await rcon.send(`whitelist add ${nick}`);
    await rcon.end();

    console.log("WHITELIST:", nick);
  } catch (e) {
    console.error("RCON ERROR:", e.message);
  }
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const username = msg.from.username
    ? `@${msg.from.username}`
    : msg.from.first_name;

  await setState(chatId, STATES.AGE);
  await updateData(chatId, {
    username,
    status: "draft"
  });

  safeSend(chatId, "📝 Заявка начата!\nВведите возраст:");
});

// ================= MESSAGE HANDLER =================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const locked = await lockUser(chatId);
  if (!locked) return;

  try {
    let state = await getState(chatId);
    if (!state) {
      state = STATES.AGE;
      await setState(chatId, state);
    }

    let data = await getData(chatId);

    switch (state) {

      case STATES.AGE: {
        const age = Number(text);

        if (!Number.isInteger(age) || age < 10 || age > 99) {
          return safeSend(chatId, "❌ Введите возраст числом (10–99)");
        }

        await updateData(chatId, { age });
        await setState(chatId, STATES.MC_NICK);

        return safeSend(chatId, "🎮 Ник Minecraft:");
      }

      case STATES.MC_NICK:
        await updateData(chatId, { mc_nick: text });
        await setState(chatId, STATES.INVITER);
        return safeSend(chatId, "👥 Кто пригласил?");

      case STATES.INVITER:
        await updateData(chatId, { inviter: text });
        await setState(chatId, STATES.ABOUT);
        return safeSend(chatId, "🧾 О себе (24+ символа):");

      case STATES.ABOUT: {

        if (text.length < 24)
          return safeSend(chatId, "❌ Минимум 24 символа");

        const finalData = await updateData(chatId, { about: text });
        await setState(chatId, STATES.DONE);

        const sent = await safeSend(FORUM_CHAT_ID, `
📥 ЗАЯВКА

👤 ${data.username}
🎂 ${finalData.age}
🎮 ${finalData.mc_nick}
👥 ${finalData.inviter}

🧾 ${finalData.about}
`, {
          message_thread_id: FORUM_TOPIC_ID,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Принять", callback_data: `accept:${chatId}` },
              { text: "❌ Отклонить", callback_data: `reject:${chatId}` }
            ]]
          }
        });

        if (sent) {
          await redis.set(MSG_KEY(chatId), sent.message_id);
        }

        return safeSend(chatId, "✅ Заявка отправлена!");
      }
    }

  } finally {
    await unlockUser(chatId);
  }
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const adminId = q.from.id;
  const [action, chatIdStr] = q.data.split(':');
  const chatId = Number(chatIdStr);

  if (!ADMINS.includes(adminId)) {
    return bot.answerCallbackQuery(q.id, { text: "⛔ Нет прав" });
  }

  const locked = await lockUser(chatId);
  if (!locked) {
    return bot.answerCallbackQuery(q.id, { text: "Уже обрабатывается" });
  }

  try {
    let data = await getData(chatId);

    if (action === "accept") {

      await addToWhitelist(data.mc_nick);

      await updateData(chatId, {
        status: "accepted",
        accepted_at: Date.now(),
        accepted_by: adminId
      });

      const adminName = q.from.username
        ? `@${q.from.username}`
        : q.from.first_name;

      const logText = `
✅ ПРИНЯТА

👤 Админ: ${adminName}
🎮 ${data.mc_nick}
🕒 ${formatDate()}
`;

      await safeSend(chatId, "🎉 Вы приняты! IP: fox-smp.com");
      await safeEdit(logText, { chat_id: chatId });

      return bot.answerCallbackQuery(q.id, { text: "OK" });
    }

    if (action === "reject") {
      await updateData(chatId, {
        status: "rejected",
        rejected_at: Date.now()
      });

      await safeSend(chatId, "❌ Заявка отклонена");
      return bot.answerCallbackQuery(q.id);
    }

  } finally {
    await unlockUser(chatId);
  }
});

// ================= START =================
console.log("✅ BOT RUNNING (REDIS FSM PRODUCTION)");
