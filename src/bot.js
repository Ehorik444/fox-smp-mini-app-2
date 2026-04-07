const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('[ERROR] TELEGRAM_BOT_TOKEN не указан в .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const FORUM_CHAT_ID = '-1003255144076';
const THREAD_ID = 3567;

const userStates = {};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Привет! Напиши /apply, чтобы подать заявку на сервер.');
});

bot.onText(/\/apply/, (msg) => {
    userStates[msg.chat.id] = { step: 'age' };
    bot.sendMessage(msg.chat.id, 'Введите ваш возраст:');
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const from = msg.from;

    if (!userStates[chatId]) return;

    const state = userStates[chatId];

    switch (state.step) {
        case 'age':
            if (/^\d+$/.test(text) && parseInt(text) > 0) {
                state.age = text;
                state.step = 'gender';
                bot.sendMessage(chatId, 'Введите ваш пол (мужской/женский/другое):');
            } {
                bot.sendMessage(chatId, 'Пожалуйста, введите корректный возраст (число).');
            }
            break;

        case 'gender':
            if (['мужской', 'женский', 'другое'].includes(text.toLowerCase())) {
                state.gender = text;
                state.step = 'nickname';
                bot.sendMessage(chatId, 'Введите ваш никнейм в Minecraft:');
            } else {
                bot.sendMessage(chatId, 'Пожалуйста, введите "мужской", "женский" или "другое".');
            }
            break;

        case 'nickname':
            state.nickname = text;
            state.step = 'about';
            bot.sendMessage(chatId, 'Расскажите немного о себе:');
            break;

        case 'about':
            state.about = text;

            // 🔥 ТОЛЬКО юзернейм или имя — без ID!
            const username = from.username ? `@${from.username}` : from.first_name;

            const applicationText = `
Новая заявка:
- От кого: ${username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
            `.trim();

            bot.sendMessage(
                FORUM_CHAT_ID,
                applicationText,
                { message_thread_id: THREAD_ID }
            )
            .then(() => {
                bot.sendMessage(chatId, '✅ Заявка отправлена в тему "Заявки"!', { reply_markup: { remove_keyboard: true } });
            })
            .catch(() => {
                bot.sendMessage(chatId, '❌ Ошибка. Попробуйте ещё раз.');
            });

            delete userStates[chatId];
            break;
    }
});

console.log('🤖 Бот запущен.');
