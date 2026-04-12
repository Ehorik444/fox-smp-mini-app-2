require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Rcon } = require('rcon-client');
const { Pool } = require('pg');

// 🔥 УБИВАЕМ любые SSL из окружения
delete process.env.PGSSLMODE;
delete process.env.DATABASE_URL;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== CONFIG =====
const FORUM_CHAT_ID = -1003255144076;
const FORUM_TOPIC_ID = 3567;
const LOG_TOPIC_ID = 28258;

const ADMINS = [5372937661, 2121418969];

// ===== DB (ЖЁСТКИЙ FIX SSL) =====
const pool = new Pool({
  connectionString: `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=disable`
});

// ===== ANTI-SPAM =====
const spamMap = new Map();

function isSpam(chatId) {
  const now = Date.now();
  const last = spamMap.get(chatId) || 0;

  if (now - last < 2000) return true;
  spamMap.set(chatId, now);
  return false;
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

// ===== LOG =====
async function sendLog(text) {
  return bot.sendMessage(FORUM_CHAT_ID, text, {
    message_thread_id: LOG_TOPIC_ID
  });
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const username =
    msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || `id:${msg.from.id}`;

  const user = await pool.query(
    "SELECT * FROM applications WHERE chat_id=$1",
    [chatId]
  );

  if (!user.rows[0]) {
    await pool.query(`
      INSERT INTO applications(chat_id, username, status, app_count, last_message)
      VALUES ($1,$2,'draft',0,NOW())
      ON CONFLICT (chat_id)
      DO UPDATE SET username=EXCLUDED.username
    `, [chatId, username]);
  }

  await pool.query(`
    UPDATE applications SET status='draft', last_message=NOW()
    WHERE chat_id=$1
  `, [chatId]);

  bot.sendMessage(chatId, "📝 Заявка начата!\nВведите ваш возраст:");
});

// ===== MESSAGE FLOW =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;
  if (isSpam(chatId)) return;

  const res = await pool.query(
    "SELECT * FROM applications WHERE chat_id=$1",
    [chatId]
  );

  const user = res.rows[0];
  if (!user || user.status !== 'draft') return;

  if (user.last_message) {
    const diff = Date.now() - new Date(user.last_message).getTime();
    if (diff < 3600000) {
      const mins = Math.ceil((3600000 - diff) / 60000);
      return bot.sendMessage(chatId, `⏳ Подождите ${mins} мин`);
    }
  }

  await pool.query(`
    UPDATE applications SET last_message=NOW()
    WHERE chat_id=$1
  `, [chatId]);

  if (!user.age) {
    await pool.query("UPDATE applications SET age=$1 WHERE chat_id=$2", [text, chatId]);
    return bot.sendMessage(chatId, "🎮 Ник Minecraft:");
  }

  if (!user.mc_nick) {
    await pool.query("UPDATE applications SET mc_nick=$1 WHERE chat_id=$2", [text, chatId]);
    return bot.sendMessage(chatId, "👥 Ник пригласившего:");
  }

  if (!user.inviter) {
    await pool.query("UPDATE applications SET inviter=$1 WHERE chat_id=$2", [text, chatId]);
    return bot.sendMessage(chatId, "🧾 О себе (24+ символа):");
  }

  if (!user.about) {
    if (text.length < 24)
      return bot.sendMessage(chatId, "❌ Минимум 24 символа");

    await pool.query(`
      UPDATE applications SET about=$1 WHERE chat_id=$2
    `, [text, chatId]);

    const app = (await pool.query(
      "SELECT * FROM applications WHERE chat_id=$1",
      [chatId]
    )).rows[0];

    const message = `
📥 ЗАЯВКА

👤 ${app.username || "нет username"}
🎂 ${app.age}
🎮 ${app.mc_nick}
👥 ${app.inviter}

🧾 ${app.about}
`;

    const sent = await bot.sendMessage(FORUM_CHAT_ID, message, {
      message_thread_id: FORUM_TOPIC_ID,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Принять", callback_data: `accept:${chatId}` },
          { text: "❌ Отклонить", callback_data: `reject:${chatId}` }
        ]]
      }
    });

    await pool.query(`
      UPDATE applications
      SET message_id=$1, status='pending', app_count=app_count+1
      WHERE chat_id=$2
    `, [sent.message_id, chatId]);

    return bot.sendMessage(chatId, "✅ Заявка отправлена!");
  }
});

// ===== CALLBACKS =====
bot.on('callback_query', async (q) => {
  const adminId = q.from.id;
  const data = q.data;

  const [action, chatIdStr] = data.split(':');
  const chatId = Number(chatIdStr);

  const app = (await pool.query(
    "SELECT * FROM applications WHERE chat_id=$1",
    [chatId]
  )).rows[0];

  if (!app) return bot.answerCallbackQuery(q.id, { text: "Нет заявки" });

  if (!ADMINS.includes(adminId)) {
    return bot.answerCallbackQuery(q.id, { text: "Нет прав", show_alert: true });
  }

  if (action === "accept") {
    await addToWhitelist(app.mc_nick);

    await pool.query(`
      UPDATE applications SET status='accepted'
      WHERE chat_id=$1
    `, [chatId]);

    await bot.sendMessage(chatId, "🎉 Вы приняты!");

    await bot.editMessageText("✅ ПРИНЯТА", {
      chat_id: FORUM_CHAT_ID,
      message_id: app.message_id
    });

    await sendLog(`✅ ПРИНЯТА @${app.username || "unknown"}`);

    return bot.answerCallbackQuery(q.id, { text: "OK" });
  }

  if (action === "reject") {
    bot.rejectTarget = chatId;
    await bot.sendMessage(adminId, "Введите причину отказа:");
    return bot.answerCallbackQuery(q.id);
  }
});

// ===== REJECT REASON =====
bot.on('message', async (msg) => {
  const text = msg.text;
  if (!text) return;

  const adminId = msg.from.id;

  if (!bot.rejectTarget || !ADMINS.includes(adminId)) return;

  const chatId = bot.rejectTarget;
  bot.rejectTarget = null;

  await pool.query(`
    UPDATE applications
    SET status='rejected', reason=$1
    WHERE chat_id=$2
  `, [text, chatId]);

  const app = (await pool.query(
    "SELECT * FROM applications WHERE chat_id=$1",
    [chatId]
  )).rows[0];

  await bot.sendMessage(chatId, `❌ Отклонено\n\n📌 Причина: ${text}`);

  await bot.editMessageText("❌ ОТКЛОНЕНА", {
    chat_id: FORUM_CHAT_ID,
    message_id: app.message_id
  });

  await sendLog(`❌ ОТКЛОНЕНА @${app.username || "unknown"} | ${text}`);
});

console.log("Bot started");
