const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('[ERROR] TELEGRAM_BOT_TOKEN не указан в .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// ID форума и темы
const FORUM_CHAT_ID = '-1003255144076';
const THREAD_ID = 3567;

// Хранение состояния пользователей
const userStates = {};

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Напиши /apply, чтобы подать заявку на сервер.');
});

bot.onText(/\/apply/, (msg) => {
    const chatId = msg.chat.id;
    userStates[chatId] = { step: 'age' };
    bot.sendMessage(chatId, 'Введите ваш возраст:');
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
            } else {
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

            // 🎯 Только юзернейм или имя — без ID
            const username = from.username ? `@${from.username}` : from.first_name;

            const applicationText = `
Новая заявка на сервер Fox SMP:
- От кого: ${username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
- Подано через бота
            `.trim();

            bot.sendMessage(
                FORUM_CHAT_ID,
                applicationText,
                { message_thread_id: THREAD_ID }
            )
            .then(() => {
                bot.sendMessage(chatId, '✅ Заявка отправлена в тему "Заявки"!', { reply_markup: { remove_keyboard: true } });
            })
            .catch(err => {
                console.error('Ошибка отправки:', err.message);
                bot.sendMessage(chatId, '❌ Ошибка отправки. Попробуйте ещё раз.');
            });

            delete userStates[chatId];
            break;
    }
});

console.log('🤖 Бот запущен. Ожидание команды /apply...');
