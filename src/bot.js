const TelegramBot = require('node-telegram-bot-api');
const Rcon = require('rcon-client').Rcon;
require('dotenv').config();

// 🔑 Добавим отладку токена
console.log('=== DEBUG START ===');
console.log('TELEGRAM_BOT_TOKEN =', process.env.TELEGRAM_BOT_TOKEN);
console.log('Token type =', typeof process.env.TELEGRAM_BOT_TOKEN);
console.log('Token length =', process.env.TELEGRAM_BOT_TOKEN?.length || 'undefined');
console.log('=====================');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('[ERROR] TELEGRAM_BOT_TOKEN не указан в .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// RCON настройки
const RCON_CONFIG = {
    host: process.env.RCON_HOST,
    port: parseInt(process.env.RCON_PORT) || 25575,
    password: process.env.RCON_PASSWORD
};

const FORUM_CHAT_ID = '-1003255144076';
const THREAD_ID = 3567;

const ADMIN_CHAT_IDS = [5372937661, 2121418969];
const ADMIN_IDS = new Set([...ADMIN_CHAT_IDS]);

const userStates = {};

// 🔑 Храним ID пользователей, которые уже подали заявку
const submittedApplicants = new Set();

// Кнопки главного меню (только подача заявки и правила)
const mainMenuKeyboard = {
    inline_keyboard: [
        [
            { text: '📝 Подать заявку', callback_data: 'apply_start' } // ✅ Исправлено
        ],
        [
            { text: '📜 Правила сервера', url: 'https://docs.google.com/document/d/14Bonb5QdGe6vyxn6lqCneB8foplgdlK8yBwuvVV0kQY/edit?usp=sharing' }
        ]
    ]
};

// /startbot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        '🦊 Fox SMP — официальный бот\nВыберите действие:',
        { reply_markup: mainMenuKeyboard }
    ).then(sent => {
        userStates[msg.chat.id] = { menuMessageId: sent.message_id };
    });
});

// Обработка кнопок меню
bot.on('callback_query', (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const from = query.from;
    const username = from.username ? `@${from.username}` : from.first_name;

    switch (data) {
        case 'apply_start':
            // 🔑 Проверяем, подавал ли пользователь заявку раньше
            if (submittedApplicants.has(chatId)) {
                bot.answerCallbackQuery(query.id, { text: '❌ Вы уже подавали заявку ранее. Повторная подача запрещена.', show_alert: true });
                return;
            }

            const state = userStates[chatId];
            const menuMsgId = state?.menuMessageId;

            if (menuMsgId) {
                bot.editMessageText('Введите ваш возраст:', {
                    chat_id: chatId,
                    message_id: menuMsgId,
                    reply_markup: { inline_keyboard: [] }
                })
                .then(() => {
                    userStates[chatId] = { step: 'age' };
                })
                .catch(() => {
                    userStates[chatId] = { step: 'age' };
                    bot.sendMessage(chatId, 'Введите ваш возраст:');
                });
            } else {
                userStates[chatId] = { step: 'age' };
                bot.sendMessage(chatId, 'Введите ваш возраст:');
            }
            bot.answerCallbackQuery(query.id);
            break;

        // Подтверждение заявки        case 'confirm_submit':
            const stateSubmit = userStates[chatId];
            if (!stateSubmit) {
                bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: данные утеряны.', show_alert: true });
                return;
            }

            if (!stateSubmit.username) {
                bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: не удалось определить ваш ник. Попробуйте ещё раз.', show_alert: true });
                return;
            }

            // 🔑 Добавляем пользователя в список подавших заявку
            submittedApplicants.add(chatId);

            const appText = `
Новая заявка на сервер Fox SMP:
- От кого: ${stateSubmit.username}
- Возраст: ${stateSubmit.age}
- Пол: ${stateSubmit.gender}
- Ник: ${stateSubmit.nickname}
- Приглашен от: ${stateSubmit.friend_nickname || 'Не указан'}
- О себе: ${stateSubmit.about}
            `.trim();
            bot.sendMessage(FORUM_CHAT_ID, appText, { message_thread_id: THREAD_ID })
                .then(sentMsg => {
                    const msgId = sentMsg.message_id;
                    const approvalButtons = {
                        inline_keyboard: [
                            [
                                { text: '✅ Принять', callback_data: `approve_${chatId}_${stateSubmit.nickname}` },
                                { text: '❌ Отклонить', callback_data: `reject_${chatId}` }
                            ]
                        ]
                    };

                    bot.editMessageReplyMarkup(approvalButtons, {
                        chat_id: FORUM_CHAT_ID,
                        message_id: msgId
                    }).catch(() => {});

                    ADMIN_CHAT_IDS.forEach(adminId => {
                        bot.sendMessage(adminId, `🔔 Новая заявка от ${stateSubmit.username} (ID: ${chatId})`, {
                            reply_to_message_id: msgId,
                            message_thread_id: THREAD_ID
                        }).catch(() => {});
                    });

                    bot.editMessageText('✅ Заявка отправлена. Админы скоро её рассмотрят.', {
                        chat_id: chatId,                        message_id: query.message.message_id
                    });
                })
                .catch(err => {
                    console.error('Ошибка отправки заявки:', err);
                    // 🔑 Удаляем из списка, если ошибка
                    submittedApplicants.delete(chatId);
                    bot.answerCallbackQuery(query.id, { text: '❌ Ошибка. Попробуйте позже.', show_alert: true });
                });

            delete userStates[chatId];
            break;

        // Повторить заявку (только если пользователь ещё не подавал)
        case 'restart_apply':
            if (submittedApplicants.has(chatId)) {
                bot.answerCallbackQuery(query.id, { text: '❌ Вы уже подавали заявку ранее. Повторная подача запрещена.', show_alert: true });
                return;
            }
            userStates[chatId] = { step: 'age' };
            bot.editMessageText('Введите возраст:', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            bot.answerCallbackQuery(query.id);
            break;

        // Одобрение/отклонение
        default:
            if (data.startsWith('approve_')) {
                const parts = data.split('_');
                const action = parts[0]; // "approve"
                const targetIdStr = parts[1];
                const targetNickname = parts.slice(2).join('_'); // на случай, если ник содержит "_"

                const targetUserId = parseInt(targetIdStr);

                if (!ADMIN_IDS.has(userId)) {
                    bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав.', show_alert: true });
                    return;
                }

                if (!targetNickname) {
                    bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: ник игрока не найден.', show_alert: true });
                    return;
                }

                // 🔑 Отправляем RCON-команду
                const rcon = new Rcon(RCON_CONFIG);
                rcon.connect()
                    .then(() => {
                        console.log(`[RCON] Отправляем whitelist add ${targetNickname}`);
                        return rcon.send(`whitelist add ${targetNickname}`);
                    })
                    .then(response => {
                        console.log(`[RCON] Ответ: ${response}`);
                        // ✅ Выводим в консоль сообщение о добавлении в вайтлист
                        const adminUsername = from.username ? `@${from.username}` : from.first_name;
                        console.log(`[WHITELIST] Игрок ${targetNickname} добавлен в вайтлист пользователем ${adminUsername} (ID: ${userId})`);

                        // Уведомляем пользователя
                        bot.sendMessage(targetUserId, `🎉 Ваша заявка одобрена!\n✅ Ник \`${targetNickname}\` добавлен в вайтлист.\nЗаходите на сервер: \`fox-smp.com:20073\`\nПрисоединяйтесь к нашей группе: https://t.me/foxsmp_official`, { parse_mode: 'Markdown' });
                        bot.answerCallbackQuery(query.id, { text: `✅ Игрок ${targetNickname} добавлен в вайтлист.`, show_alert: true });
                    })
                    .catch(err => {
                        console.error('[RCON ERROR]:', err.message);
                        // Уведомляем админа об ошибке
                        bot.sendMessage(userId, `⚠️ Ошибка RCON: ${err.message}. Проверьте настройки.`);
                        bot.answerCallbackQuery(query.id, { text: `❌ Ошибка RCON: ${err.message}`, show_alert: true });
                    })
                    .finally(() => {
                        rcon.end(); // Закрываем соединение
                    });

            } else if (data.startsWith('reject_')) {
                const [_, targetIdStr] = data.split('_');
                const targetUserId = parseInt(targetIdStr);
                if (!ADMIN_IDS.has(userId)) {
                    bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав.', show_alert: true });
                    return;
                }

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
            break;
        case 'retry_apply':
            if (submittedApplicants.has(userId)) {
                bot.sendMessage(userId, '❌ Вы уже подавали заявку ранее. Повторная подача запрещена.');
                bot.answerCallbackQuery(query.id, { text: '❌ Повторная подача запрещена.', show_alert: true });
                return;
            }
            userStates[userId] = { step: 'age' };
            bot.sendMessage(userId, 'Введите возраст:');
            bot.answerCallbackQuery(query.id);
            break;
    }
});

// Обработка формы заявки
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
            state.step = 'friend_nickname';
            bot.sendMessage(chatId, 'Введите ник друга, который вас пригласил (или "-" если никто):');
            break;
        // 🔑 Новый шаг: ник друга
        case 'friend_nickname':
            state.friend_nickname = text.trim() === '-' ? 'Не указан' : text;
            state.step = 'about';
            bot.sendMessage(chatId, 'Расскажите о себе (минимум 24 символа):');
            break;

        case 'about':
            if (text.length < 24) {
                bot.sendMessage(chatId, '❌ Слишком короткое описание. Напишите минимум 24 символа.');
                return;
            }

            state.about = text;
            state.username = from.username ? `@${from.username}` : from.first_name;

            const preview = `
Вот ваша заявка:
- От кого: ${state.username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- Приглашен от: ${state.friend_nickname}
- О себе: ${state.about}

Всё верно? Нажмите ✅ Да или ❌ Изменить.
            `.trim();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да', callback_data: 'confirm_submit' },
                        { text: '❌ Изменить', callback_data: 'restart_apply' } // ✅ Исправлено
                    ]
                ]
            };

            bot.sendMessage(chatId, preview, { reply_markup: keyboard });
            break;
    }
});

console.log('🤖 Бот запущен. Ожидание команды /start...');
