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
const ADMIN_IDS = new Set([...ADMIN_CHAT_IDS]);

const userStates = {};

// Хранение отзывов
let reviews = [
    { user: '@player1', rating: 5, comment: 'Отличный сервер!' },
    { user: '@player2', rating: 4, comment: 'Хорошие админы.' }
];

// Команда /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `
Привет! Я бот сервера Fox SMP.
Доступные команды:
- /status — статус сервера
- /vote — оценить сервер
- /reviews — отзывы
- /apply — подать заявку на сервер
    `.trim());
});

// Команда /status
bot.onText(/\/status/, (msg) => {
    // В реальности можно подключить API сервера, RCON, etc.
    // Пока — фиктивные данные
    const serverStatus = {
        online: true,
        playersOnline: 15,
        maxPlayers: 50,
        tps: 19.98,
        ping: '120ms',
        uptime: '24 дня'
    };
    const statusText = `
📊 Статус сервера Fox SMP:
- Статус: ${serverStatus.online ? '🟢 Онлайн' : '🔴 Оффлайн'}
- Игроков онлайн: ${serverStatus.playersOnline}/${serverStatus.maxPlayers}
- TPS: ${serverStatus.tps.toFixed(2)}
- Пинг: ${serverStatus.ping}
- Аптайм: ${serverStatus.uptime}
    `.trim();

    bot.sendMessage(msg.chat.id, statusText);
});

// Команда /vote
bot.onText(/\/vote/, (msg) => {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '⭐', callback_ 'vote_1' },
                { text: '⭐⭐', callback_ 'vote_2' },
                { text: '⭐⭐⭐', callback_ 'vote_3' },
                { text: '⭐⭐⭐⭐', callback_ 'vote_4' },
                { text: '⭐⭐⭐⭐⭐', callback_ 'vote_5' }
            ]
        ]
    };

    bot.sendMessage(msg.chat.id, '⭐ Поставьте оценку серверу Fox SMP:', { reply_markup: keyboard });
});

// Команда /reviews
bot.onText(/\/reviews/, (msg) => {
    let reviewList = '📖 Отзывы о сервере:\n\n';
    reviews.forEach((rev, i) => {
        reviewList += `${i + 1}. ${rev.user} — ${rev.rating}⭐\n"${rev.comment}"\n\n`;
    });

    const keyboard = {
        inline_keyboard: [
            [{ text: '📝 Оставить отзыв', callback_ 'leave_review' }]
        ]
    };

    bot.sendMessage(msg.chat.id, reviewList || 'Пока нет отзывов.', { reply_markup: keyboard });
});

// Обработка голосования
bot.on('callback_query', (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const userId = query.from.id;    const username = query.from.username ? `@${query.from.username}` : query.from.first_name;

    if (data.startsWith('vote_')) {
        const rating = parseInt(data.split('_')[1]);
        reviews.push({ user: username, rating, comment: 'Без комментария' });
        bot.answerCallbackQuery(query.id, { text: `Спасибо за оценку: ${rating}⭐`, show_alert: true });
        bot.editMessageText(`✅ Вы поставили ${rating}⭐`, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    }

    if (data === 'leave_review') {
        userStates[userId] = { step: 'review_rating' };
        bot.sendMessage(chatId, 'Введите оценку (1-5):');
        bot.answerCallbackQuery(query.id);
    }

    // Обработка кнопок заявки — как раньше
    if (data === 'confirm_submit') {
        const state = userStates[chatId];
        if (!state) {
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: состояние утеряно.', show_alert: true });
            return;
        }

        const appText = `
Новая заявка на сервер Fox SMP:
- От кого: ${state.username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
        `.trim();

        bot.sendMessage(FORUM_CHAT_ID, appText, { message_thread_id: THREAD_ID })
            .then(sentMsg => {
                const msgId = sentMsg.message_id;
                const approvalButtons = {
                    inline_keyboard: [
                        [
                            { text: '✅ Принять', callback_ `approve_${chatId}` },
                            { text: '❌ Отклонить', callback_ `reject_${chatId}` }
                        ]
                    ]
                };

                bot.editMessageReplyMarkup(approvalButtons, {
                    chat_id: FORUM_CHAT_ID,
                    message_id: msgId                }).catch(() => {});

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
                console.error('Ошибка отправки заявки:', err.message);
                bot.answerCallbackQuery(query.id, { text: '❌ Ошибка. Попробуйте позже.', show_alert: true });
            });

        delete userStates[chatId];
        return;
    }

    if (data === 'restart_apply') {
        userStates[chatId] = { step: 'age' };
        bot.editMessageText('Введите возраст:', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        return;
    }

    const [action, targetUserIdStr] = data.split('_');
    const targetUserId = parseInt(targetUserIdStr);

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
                [{ text: '🔄 Подать снова', callback_ 'retry_apply' }]
            ]
        };
        bot.sendMessage(targetUserId, '❌ Ваша заявка отклонена. Если хотите — подайте снова.', {            reply_markup: keyboard
        });
        bot.answerCallbackQuery(query.id, { text: '❌ Отклонено', show_alert: true });
    }

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
    }).catch(() => {});
});

// Обработка отзывов
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;

    if (!userStates[userId]) return;
    const state = userStates[userId];

    if (state.step === 'review_rating') {
        const rating = parseInt(text);
        if (rating >= 1 && rating <= 5) {
            state.rating = rating;
            state.step = 'review_comment';
            bot.sendMessage(chatId, 'Теперь введите комментарий:');
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

// Кнопка "Подать снова"
bot.on('callback_query', (query) => {
    if (query.data === 'retry_apply') {
        userStates[query.from.id] = { step: 'age' };
        bot.sendMessage(query.from.id, 'Введите возраст:');
        bot.answerCallbackQuery(query.id);
    }
});
console.log('🤖 Бот запущен. Ожидание команд...');
