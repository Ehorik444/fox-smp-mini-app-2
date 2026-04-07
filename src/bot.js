const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('[ERROR] TELEGRAM_BOT_TOKEN не задан в .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Команда /id: показывает ID ЧАТА, где она вызвана
bot.onText(/\/id/, (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type;
    const title = msg.chat.title || '— личный чат —';

    bot.sendMessage(
        chatId,
        `📌 ID этого чата: \`${chatId}\`\n🔹 Тип: ${chatType}\n🔹 Название: ${title}`,
        { parse_mode: 'Markdown' }
    );
});

// Опционально: /start для теста
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Напишите /id, чтобы узнать ID текущего чата.');
});

console.log('✅ Бот запущен. Ожидание команды /id...');
