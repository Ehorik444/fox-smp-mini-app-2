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

const ADMIN_IDS = new Set([5372937661]); // ваш ID

const userStates = {};

bot.onText(/\/apply/, (msg) => {
    userStates[msg.chat.id] = { step: 'age' };
    bot.sendMessage(msg.chat.id, 'Введите возраст:');
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const from = msg.from;

    if (!userStates[chatId]) return;
    const state = userStates[chatId];

    switch (state.step) {
        // ... (остальные шаги без изменений) ...
        case 'about':
            state.about = text;
            const username = from.username ? `@${from.username}` : from.first_name;
            const appText = `
Новая заявка на сервер Fox SMP:
- От кого: ${username}
- Возраст: ${state.age}
- Пол: ${state.gender}
- Ник: ${state.nickname}
- О себе: ${state.about}
            `.trim();

            // 🚨 Ключевое: отправляем СНАЧАЛА сообщение БЕЗ кнопок, получаем message_id
            bot.sendMessage(FORUM_CHAT_ID, appText, { message_thread_id: THREAD_ID })
                .then(sentMsg => {
                    const msgId = sentMsg.message_id;
                    // Теперь редактируем это сообщение — добавляем кнопки
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '✅ Принять', callback_data: `approve_${from.id}` },
                                { text: '❌ Отклонить', callback_data: `reject_${from.id}` }
                            ]
                        ]
                    };

                    bot.editMessageReplyMarkup(
                        keyboard,
                        { chat_id: FORUM_CHAT_ID, message_id: msgId, message_thread_id: THREAD_ID }
                    ).catch(err => {
                        console.error('Ошибка editMessageReplyMarkup:', err.message);
                        // Если не удалось — отправим кнопки отдельным сообщением (резерв)
                        bot.sendMessage(FORUM_CHAT_ID, '⚠️ Кнопки не загрузились. Админ может написать /accept или /reject.', {
                            reply_to_message_id: msgId,
                            message_thread_id: THREAD_ID
                        });
                    });

                    bot.sendMessage(chatId, '✅ Заявка отправлена. Админы скоро её рассмотрят.');
                })
                .catch(err => {
                    console.error('Ошибка отправки заявки:', err.message);
                    bot.sendMessage(chatId, '❌ Ошибка. Попробуйте ещё раз.');
                });

            delete userStates[chatId];
            break;
    }
});

// Обработка кнопок — как раньше
bot.on('callback_query', (query) => {
    const [action, targetIdStr] = query.data.split('_');
    const adminId = query.from.id;
    const targetId = parseInt(targetIdStr);

    if (!ADMIN_IDS.has(adminId)) {
        bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав.', show_alert: true });
        return;
    }

    if (action === 'approve') {
        bot.sendMessage(targetId, '🎉 Ваша заявка одобрена! Добро пожаловать на сервер Fox SMP!');
        bot.answerCallbackQuery(query.id, { text: '✅ Принято', show_alert: true });
    } else if (action === 'reject') {
        bot.sendMessage(targetId, '❌ Заявка отклонена. Подайте снова, если хотите.');        bot.answerCallbackQuery(query.id, { text: '❌ Отклонено', show_alert: true });
    }

    // Удаляем кнопки
    bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
    ).catch(() => {});
});

console.log('🤖 Бот запущен.');
