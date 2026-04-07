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

// Список админов (ID пользователей, которым разрешено принимать/отклонять)
const ADMIN_IDS = new Set([
    5372937661, // ваш ID (из скриншота: @erx_777 → ID 5372937661)
    // добавьте другие ID через запятую
]);

// Хранение состояния пользователей
const userStates = {};

// /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Привет! Напиши /apply, чтобы подать заявку на сервер.');
});

// /apply
bot.onText(/\/apply/, (msg) => {
    userStates[msg.chat.id] = { step: 'age' };
    bot.sendMessage(msg.chat.id, 'Введите ваш возраст:');
});

// Обработка формы
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
                state.step = 'gender';                bot.sendMessage(chatId, 'Введите ваш пол (мужской/женский/другое):');
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

            // Формируем текст заявки (без ID)
            const username = from.username ? `@${from.username}` : from.first_name;
            const applicationText = `
Новая заявка на сервер Fox SMP:
- От кого: ${username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
            `.trim();

            // Кнопки: принять / отклонить
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Принять', callback_data: `approve_${from.id}` },
                        { text: '❌ Отклонить', callback_data: `reject_${from.id}` }
                    ]
                ]
            };

            // Отправляем в тему форума
            bot.sendMessage(
                FORUM_CHAT_ID,
                applicationText,                {
                    reply_markup: keyboard,
                    message_thread_id: THREAD_ID
                }
            ).then(() => {
                bot.sendMessage(chatId, '✅ Заявка отправлена. Администраторы скоро её рассмотрят.', {
                    reply_markup: { remove_keyboard: true }
                });
            }).catch(err => {
                console.error('Ошибка отправки:', err.message);
                bot.sendMessage(chatId, '❌ Ошибка. Попробуйте ещё раз.');
            });

            delete userStates[chatId];
            break;
    }
});

// Обработка нажатия на кнопки
bot.on('callback_query', (query) => {
    const data = query.data; // напр. "approve_5372937661"
    const chatId = query.message.chat.id;
    const userId = parseInt(query.from.id);
    const messageId = query.message.message_id;

    // Проверяем, админ ли нажал
    if (!ADMIN_IDS.has(userId)) {
        bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав для этого действия.', show_alert: true });
        return;
    }

    const [action, targetUserIdStr] = data.split('_');
    const targetUserId = parseInt(targetUserIdStr);

    if (isNaN(targetUserId)) {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Ошибка: некорректный ID.', show_alert: true });
        return;
    }

    if (action === 'approve') {
        bot.sendMessage(targetUserId, '🎉 Ваша заявка одобрена! Добро пожаловать на сервер Fox SMP!');
        bot.answerCallbackQuery(query.id, { text: '✅ Заявка одобрена.', show_alert: true });
    } else if (action === 'reject') {
        bot.sendMessage(targetUserId, '❌ Ваша заявка отклонена. Если хотите — подайте снова.');
        bot.answerCallbackQuery(query.id, { text: '❌ Заявка отклонена.', show_alert: true });
    }

    // Опционально: удалить кнопки после ответа
    bot.editMessageReplyMarkup(
        { inline_keyboard: [] },        { chat_id: chatId, message_id: messageId }
    ).catch(() => {}); // игнорируем ошибку, если сообщение уже изменено
});

console.log('🤖 Бот запущен. Ожидание команды /apply...');
