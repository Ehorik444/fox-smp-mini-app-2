const TelegramBot = require('node-telegram-bot-api');

// Замените 'YOUR_BOT_TOKEN' на токен вашего бота от @BotFather
const token = 'YOUR_BOT_TOKEN';
const bot = new TelegramBot(token, {polling: true});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    // Опции для клавиатуры
    const keyboard = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    {text: ' fox-smp.com', callback_data: 'server_ip'},
                ]
            ]
        })
    };

    // Отправляем сообщение с кнопкой
    bot.sendMessage(chatId, `Добро пожаловать! Нажмите кнопку ниже, чтобы получить информацию о сервере:`, keyboard);
});

// Обработка нажатия на инлайн-кнопку
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const message_id = query.message.message_id;

    if (query.data === 'server_ip') {
        // Текст с информацией о сервере
        const serverInfo = `
*IP сервера:* fox-smp.com
*Основная версия сервера:* 1.21.11
*Поддерживаемые версии Minecraft:* 1.8 - 1.26.1
*Поддерживаемые моды:* 
- Plasmo Voice
- Emote Craft

[Правила сервера](https://docs.google.com/document/d/14Bonb5QdGe6vyxn6lqCneB8foplgdlK8yBwuvVV0kQY/edit?usp=sharing)
        `.trim();

        // Редактируем сообщение, добавляя информацию о сервере
        bot.editMessageText(serverInfo, {
            chat_id: chatId,
            message_id: message_id,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
    }
});
