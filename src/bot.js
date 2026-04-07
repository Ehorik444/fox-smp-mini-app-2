const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN; // ← Вот так правильно
const bot = new TelegramBot(token, { polling: true });

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
            const applicationText = `
Новая заявка на сервер:
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
            `.trim();
            bot.sendMessage(chatId, 'Спасибо за заявку!', { reply_markup: { remove_keyboard: true } });
            bot.sendMessage(chatId, applicationText);
            delete userStates[chatId];
            break;
    }
});
