const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в .env');

const bot = new TelegramBot(token, { polling: true });

console.log('Бот запущен. Ожидание команды /id...');

bot.onText(/\/id/, (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type;
    const chatTitle = msg.chat.title || '— без названия —';

    console.log(`[DEBUG] Получено /id в чате:`, {
        id: chatId,
        type: chatType,
        title: chatTitle,
        from: msg.from.username || msg.from.id
    });

    bot.sendMessage(
        msg.chat.id,
        `🔹 Тип чата: ${chatType}\n🔹 ID чата: \`${chatId}\`\n🔹 Название: ${chatTitle}`,
        { parse_mode: 'Markdown' }
    );
});
