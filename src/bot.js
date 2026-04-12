const { Telegraf, Markup, Scenes, session } = require("telegraf");
const fs = require("fs");
const { Rcon } = require("rcon-client");

// ================== CONFIG ==================
const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const ADMIN_CHAT_ID = -1001234567890; // чат админов

const RCON_CONFIG = {
    host: "127.0.0.1",
    port: 25575,
    password: "your_rcon_password",
};

// ================== STORAGE ==================
const DB_FILE = "./db.json";

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        return { applications: {}, cooldowns: {} };
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// ================== RCON ==================
async function addToWhitelist(nick) {
    try {
        const rcon = await Rcon.connect(RCON_CONFIG);
        const res = await rcon.send(`whitelist add ${nick}`);
        await rcon.send(`say Игрок ${nick} добавлен в вайтлист`);
        await rcon.end();
        console.log("RCON:", res);
    } catch (err) {
        console.error("RCON ERROR:", err);
    }
}

// ================== BOT ==================
const bot = new Telegraf(BOT_TOKEN);

// ================== FORM SCENE ==================
const applyScene = new Scenes.WizardScene(
    "apply-wizard",

    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.reply("Введите ваш ник в Minecraft:");
        return ctx.wizard.next();
    },

    async (ctx) => {
        ctx.wizard.state.data.nick = ctx.message.text;
        await ctx.reply("Ник друга, который вас пригласил:");
        return ctx.wizard.next();
    },

    async (ctx) => {
        ctx.wizard.state.data.friend = ctx.message.text;
        await ctx.reply("Ваш возраст:");
        return ctx.wizard.next();
    },

    async (ctx) => {
        ctx.wizard.state.data.age = ctx.message.text;
        await ctx.reply("Ваш пол:");
        return ctx.wizard.next();
    },

    async (ctx) => {
        ctx.wizard.state.data.gender = ctx.message.text;
        await ctx.reply("Расскажите о себе (минимум 24 символа):");
        return ctx.wizard.next();
    },

    async (ctx) => {
        const about = ctx.message.text;

        if (about.length < 24) {
            return ctx.reply("❌ Минимум 24 символа. Попробуйте снова.");
        }

        const userId = ctx.from.id;
        const username = ctx.from.username || "no_username";

        // cooldown check
        const last = db.cooldowns[userId] || 0;
        const now = Date.now();

        if (now - last < 3600 * 1000) {
            return ctx.reply("⏳ Вы можете подать заявку раз в 1 час.");
        }

        const id = Date.now().toString();

        const app = {
            id,
            userId,
            username,
            ...ctx.wizard.state.data,
            about,
            status: "pending",
            createdAt: now,
        };

        db.applications[id] = app;
        db.cooldowns[userId] = now;
        saveDB();

        const text =
`📥 НОВАЯ ЗАЯВКА

👤 Telegram: @${username}
🎮 Ник: ${app.nick}
👥 Друг: ${app.friend}
🎂 Возраст: ${app.age}
⚧ Пол: ${app.gender}
📝 О себе: ${app.about}`;

        await ctx.telegram.sendMessage(
            ADMIN_CHAT_ID,
            text,
            Markup.inlineKeyboard([
                Markup.button.callback("✅ Принять", `accept_${id}`),
                Markup.button.callback("❌ Отклонить", `reject_${id}`)
            ])
        );

        await ctx.reply("✅ Заявка отправлена на рассмотрение!");
        return ctx.scene.leave();
    }
);

// ================== SCENE MANAGER ==================
const stage = new Scenes.Stage([applyScene]);

bot.use(session());
bot.use(stage.middleware());

// ================== COMMANDS ==================
bot.start((ctx) => {
    ctx.reply("Напишите /apply чтобы подать заявку на сервер.");
});

bot.command("apply", async (ctx) => {
    ctx.scene.enter("apply-wizard");
});

// ================== CALLBACK HANDLERS ==================
bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (!data) return;

    const [action, id] = data.split("_");
    const app = db.applications[id];

    if (!app) {
        return ctx.reply("❌ Заявка не найдена (возможно уже обработана).");
    }

    if (app.status !== "pending") {
        return ctx.reply("⚠️ Эта заявка уже обработана.");
    }

    if (action === "accept") {
        app.status = "accepted";
        saveDB();

        await addToWhitelist(app.nick);

        await ctx.telegram.sendMessage(
            app.userId,
            "✅ Ваша заявка одобрена! Вы добавлены в whitelist сервера."
        );

        await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ ПРИНЯТА");
    }

    if (action === "reject") {
        app.status = "rejected";
        saveDB();

        await ctx.telegram.sendMessage(
            app.userId,
            "❌ Ваша заявка отклонена. Вы можете подать новую через 1 час."
        );

        await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ ОТКЛОНЕНА");
    }

    await ctx.answerCbQuery();
});

// ================== START BOT ==================
bot.launch();

console.log("Bot started...");

// graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
