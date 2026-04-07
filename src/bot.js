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

const ADMIN_CHAT_IDS = [5372937661, 2121418969];
const ADMIN_IDS = new Set([...ADMIN_CHAT_IDS userStates = {};

// Хранение отзывов (временно в памяти)
let reviews = [
    { user: '@player1', rating: 5, comment: 'Отличный сервер!' },
    { user: '@player2', rating: 4, comment: 'Хорошие админы.' }
];

// Кнопки главного меню
const mainMenuKeyboard = {
    inline_keyboard: [
        [
            { text: '📝 Подать заявку', callback_data: 'apply_start' },
            { text: '⭐ Оценить сервер', callback_data: 'vote_start' }
        ],
        [
            { text: '📊 Статистика', callback_data: 'status_show' },
            { text: '📖 Отзывы', callback_data: 'reviews_show' }
        ],
        [
            { text: '📜 Правила сервера', url: 'https://docs.google.com/document/d/14Bonb5QdGe6vyxn6lqCneB8foplgdlK8yBwuvVV0kQY/edit?usp=sharing' }
        ]
    ]
};

// /start — показываем меню
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        '🦊 Fox SMP — официальный бот\nВыберите действие:',
        { reply_markup: mainMenuKeyboard }
    );
});

// Обработка кнопок менюbot.on('callback_query', (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const from = query.from;
    const username = from.username ? `@${from.username}` : from.first_name;

    switch (data) {
        case 'apply_start':
            userStates[chatId] = { step: 'age' };
            bot.sendMessage(chatId, 'Введите ваш возраст:');
            bot.answerCallbackQuery(query.id);
            break;

        case 'vote_start':
            const voteKeyboard = {
                inline_keyboard: [
                    [{ text: '⭐', callback_data: 'vote_1' }],
                    [{ text: '⭐⭐', callback_data: 'vote_2' }],
                    [{ text: '⭐⭐⭐', callback_data: 'vote_3' }],
                    [{ text: '⭐⭐⭐⭐', callback_data: 'vote_4' }],
                    [{ text: '⭐⭐⭐⭐⭐', callback_data: 'vote_5' }]
                ]
            };
            bot.sendMessage(chatId, '⭐ Поставьте оценку серверу Fox SMP:', { reply_markup: voteKeyboard });
            bot.answerCallbackQuery(query.id);
            break;

        case 'status_show':
            const statusText = `
📊 Статус сервера Fox SMP:
- Статус: 🟢 Онлайн
- Игроков онлайн: 15 / 50
- TPS: 19.98
- Пинг: 120 мс
- Аптайм: 24 дня
            `.trim();
            bot.sendMessage(chatId, statusText);
            bot.answerCallbackQuery(query.id);
            break;

        case 'reviews_show':
            let reviewList = '📖 Отзывы о сервере:\n\n';
            if (reviews.length === 0) {
                reviewList = 'Пока нет отзывов. Будьте первым!';
            } else {
                reviews.forEach((rev, i) => {
                    reviewList += `${i + 1}. ${rev.user} — ${rev.rating}⭐\n«${rev.comment}»\n\n`;
                });
            }
            const reviewKeyboard = {
                inline_keyboard: [
                    [{ text: '📝 Оставить отзыв', callback_data: 'leave_review' }]
                ]
            };

            bot.sendMessage(chatId, reviewList, { reply_markup: reviewKeyboard });
            bot.answerCallbackQuery(query.id);
            break;

        // Голосование
        case 'vote_1':
        case 'vote_2':
        case 'vote_3':
        case 'vote_4':
        case 'vote_5':
            const rating = parseInt(data.split('_')[1]);
            reviews.push({ user: username, rating, comment: 'Без комментария' });
            bot.answerCallbackQuery(query.id, { text: `Спасибо за оценку: ${rating}⭐`, show_alert: true });
            break;

        // Оставить отзыв
        case 'leave_review':
            userStates[userId] = { step: 'review_rating' };
            bot.sendMessage(chatId, 'Введите оценку (1–5):');
            bot.answerCallbackQuery(query.id);
            break;

        // Подтверждение заявки
        case 'confirm_submit':
            const state = userStates[chatId];
            if (!state) {
                bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: данные утеряны.', show_alert: true });
                return;
            }

            // 🔑 КРИТИЧЕСКИ ВАЖНО: username должен быть сохранён в state при заполнении
            if (!state.username) {
                bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: не удалось определить ваш ник. Попробуйте ещё раз.', show_alert: true });
                return;
            }

            const appText = `
Новая заявка на сервер Fox SMP:
- От кого: ${state.username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}            `.trim();

            bot.sendMessage(FORUM_CHAT_ID, appText, { message_thread_id: THREAD_ID })
                .then(sentMsg => {
                    const msgId = sentMsg.message_id;
                    const approvalButtons = {
                        inline_keyboard: [
                            [
                                { text: '✅ Принять', callback_data: `approve_${chatId}` },
                                { text: '❌ Отклонить', callback_data: `reject_${chatId}` }
                            ]
                        ]
                    };

                    bot.editMessageReplyMarkup(approvalButtons, {
                        chat_id: FORUM_CHAT_ID,
                        message_id: msgId
                    }).catch(() => {});

                    // Уведомляем админов
                    ADMIN_CHAT_IDS.forEach(adminId => {
                        bot.sendMessage(adminId, `🔔 Новая заявка от ${state.username} (ID: ${chatId})`, {
                            reply_to_message_id: msgId,
                            message_thread_id: THREAD_ID
                        }).catch(() => {});
                    });

                    bot.editMessageText('✅ Заявка отправлена. Админы скоро её рассмотрят.', {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    });
                })
                .catch(err => {
                    console.error('Ошибка отправки заявки:', err);
                    bot.answerCallbackQuery(query.id, { text: '❌ Ошибка. Попробуйте позже.', show_alert: true });
                });

            delete userStates[chatId];
            break;

        // Повторить заявку
        case 'restart_apply':
            userStates[chatId] = { step: 'age' };
            bot.editMessageText('Введите возраст:', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            bot.answerCallbackQuery(query.id);
            break;
        // Одобрение/отклонение
        default:
            if (data.startsWith('approve_') || data.startsWith('reject_')) {
                const [action, targetIdStr] = data.split('_');
                const targetUserId = parseInt(targetIdStr);

                if (!ADMIN_IDS.has(userId)) {
                    bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав.', show_alert: true });
                    return;
                }

                if (action === 'approve') {
                    bot.sendMessage(targetUserId, '🎉 Ваша заявка одобрена! Добро пожаловать на сервер Fox SMP!');
                    bot.answerCallbackQuery(query.id, { text: '✅ Принято', show_alert: true });
                } else if (action === 'reject') {
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: '🔄 Подать снова', callback_data: 'retry_apply' }]
                        ]
                    };
                    bot.sendMessage(targetUserId, '❌ Ваша заявка отклонена. Если хотите — подайте снова.', {
                        reply_markup: keyboard
                    });
                    bot.answerCallbackQuery(query.id, { text: '❌ Отклонено', show_alert: true });
                }

                // Убираем кнопки
                bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id
                }).catch(() => {});
            } else if (data === 'retry_apply') {
                userStates[userId] = { step: 'age' };
                bot.sendMessage(userId, 'Введите возраст:');
                bot.answerCallbackQuery(query.id);
            }
            break;
    }
});

// Обработка ввода отзыва
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;

    if (!userStates[userId]) return;
    const state = userStates[userId];

    if (state.step === 'review_rating') {        const rating = parseInt(text);
        if (rating >= 1 && rating <= 5) {
            state.rating = rating;
            state.step = 'review_comment';
            bot.sendMessage(chatId, 'Теперь напишите краткий комментарий:');
        } else {
            bot.sendMessage(chatId, 'Введите число от 1 до 5.');
        }
    } else if (state.step === 'review_comment') {
        const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        reviews.push({
            user: username,
            rating: state.rating,
            comment: text
        });
        bot.sendMessage(chatId, `✅ Спасибо за отзыв!\nВаша оценка: ${state.rating}⭐`);
        delete userStates[userId];
    }
});

// Обработка формы заявки (возраст → пол → ник → о себе)
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
                bot.sendMessage(chatId, 'Выберите пол: мужской / женский / другое');
            } else {
                bot.sendMessage(chatId, 'Введите возраст (число > 0):');
            }
            break;

        case 'gender':
            if (['мужской', 'женский', 'другое'].includes(text.toLowerCase())) {
                state.gender = text;
                state.step = 'nickname';
                bot.sendMessage(chatId, 'Введите ваш игровой ник в Minecraft:');
            } else {
                bot.sendMessage(chatId, 'Выберите: мужской / женский / другое');
            }
            break;
        case 'nickname':
            state.nickname = text;
            state.step = 'about';
            bot.sendMessage(chatId, 'Расскажите о себе (кратко):');
            break;

        case 'about':
            state.about = text;
            // 🔑 Сохраняем username здесь — критично!
            state.username = from.username ? `@${from.username}` : from.first_name;

            const preview = `
Вот ваша заявка:
- От кого: ${state.username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}

Всё верно? Нажмите ✅ Да или ❌ Изменить.
            `.trim();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да', callback_data: 'confirm_submit' },
                        { text: '❌ Изменить', callback_data: 'restart_apply' }
                    ]
                ]
            };

            bot.sendMessage(chatId, preview, { reply_markup: keyboard });
            break;
    }
});

console.log('🤖 Бот запущен. Ожидание команды /start...');
