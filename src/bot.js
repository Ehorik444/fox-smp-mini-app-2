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

// ID админов, которым будут приходить уведомления
const ADMIN_CHAT_IDS = [5372937661, 2121418969];

// Список админов, которые могут одобрять/отклонять
const ADMIN_IDS = new Set([...ADMIN_CHAT_IDS]);

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
            state.username = from.username ? `@${from.username}` : from.first_name;

            // Показываем предварительный просмотр
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
                        { text: '✅ Да', callback_data: 'confirm_submit' },      // ✅ ПРАВИЛЬНО
                        { text: '❌ Изменить', callback_data: 'restart_apply' } // ✅ ПРАВИЛЬНО
                    ]
                ]
            };

            bot.sendMessage(chatId, preview, { reply_markup: keyboard });
            break;
    }
});

// Обработка кнопок подтверждения
bot.on('callback_query', (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;    const userId = query.from.id;

    // Подтверждение отправки
    if (data === 'confirm_submit') {
        const state = userStates[chatId];

        if (!state) {
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: состояние утеряно.', show_alert: true });
            return;
        }

        const appText = `
Новая заявка:
- От кого: ${state.username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
        `.trim();

        // Отправляем заявку в тему
        bot.sendMessage(FORUM_CHAT_ID, appText, { message_thread_id: THREAD_ID })
            .then(sentMsg => {
                const msgId = sentMsg.message_id;

                // Добавляем кнопки одобрения/отклонения
                const approvalButtons = {
                    inline_keyboard: [
                        [
                            { text: '✅ Принять', callback_data: `approve_${chatId}` },      // ✅
                            { text: '❌ Отклонить', callback_data: `reject_${chatId}` }     // ✅
                        ]
                    ]
                };

                bot.editMessageReplyMarkup(approvalButtons, {
                    chat_id: FORUM_CHAT_ID,
                    message_id: msgId
                }).catch(() => {});

                // Уведомляем ВСЕХ админов
                ADMIN_CHAT_IDS.forEach(adminId => {
                    bot.sendMessage(adminId, `🔔 Новая заявка от ${state.username} (ID: ${chatId})`, {
                        reply_to_message_id: msgId,
                        message_thread_id: THREAD_ID
                    }).catch(() => {}); // игнорируем, если админ заблокировал бота
                });

                // Уведомляем пользователя
                bot.editMessageText('✅ Заявка отправлена. Админы скоро её рассмотрят.', {                    chat_id: chatId,
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

    // Пользователь хочет повторить
    if (data === 'restart_apply') {
        userStates[chatId] = { step: 'age' };
        bot.editMessageText('Введите возраст:', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        return;
    }

    // Обработка кнопок одобрения/отклонения
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
                [{ text: '🔄 Подать снова', callback_data: 'retry_apply' }] // ✅
            ]
        };
        bot.sendMessage(targetUserId, '❌ Ваша заявка отклонена. Если хотите — подайте снова.', {
            reply_markup: keyboard
        });
        bot.answerCallbackQuery(query.id, { text: '❌ Отклонено', show_alert: true });
    }

    // Убираем кнопки
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id,        message_id: query.message.message_id
    }).catch(() => {});
});

// Обработка кнопки "Подать снова"
bot.on('callback_query', (query) => {
    if (query.data === 'retry_apply') {
        userStates[query.from.id] = { step: 'age' };
        bot.sendMessage(query.from.id, 'Введите возраст:');
        bot.answerCallbackQuery(query.id);
    }
});

console.log('🤖 Бот запущен. Ожидание команды /apply...');
