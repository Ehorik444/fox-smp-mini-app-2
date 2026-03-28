const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const REPORTS_CHAT_ID = process.env.REPORTS_CHAT_ID || '-1001234567890';

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 Бот запущен');

const REASONS = Object.freeze({
  'cheat': 'Читы/читерство',
  'grief': 'Гриферство',
  'toxic': 'Токсичное поведение',
  'spam': 'Спам/реклама',
  'other': 'Другое'
});

const getReasonText = (reason) => REASONS[reason] || reason;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
🦊 *Добро пожаловать на Fox SMP!*

🎮 *Сервер выживания для настоящих игроков*

Выберите действие:
`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Статус сервера', web_app: { url: process.env.APP_URL || 'https://ваш-домен.bothost.ru' } }],
        [{ text: '📝 Отправить жалобу', web_app: { url: process.env.APP_URL || 'https://ваш-домен.bothost.ru' } }],
        [{ text: '📖 Правила сервера', callback_data: 'rules' }],
        [{ text: '💬 Наш чат', url: process.env.CHAT_URL || 'https://t.me/ваш_чат' }]
      ]
    }
  });
});

bot.on('web_app_data', async (msg) => {
  try {
    const data = JSON.parse(msg.web_app_data.data);
    if (data.action === 'submit_report') await handleReport(msg.chat.id, data);
  } catch (error) {
    console.error('Ошибка обработки данных:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при обработке данных');
  }
});

async function handleReport(chatId, data) {
  try {
    const reportMessage = `
🚨 *НОВАЯ ЖАЛОБА*

👤 *Игрок:* ${data.player_name}
📝 *Причина:* ${getReasonText(data.reason)}
💬 *Описание:*
${data.description}

---
📱 *Отправитель:*
ID: ${data.user_id || 'Неизвестно'}
Имя: ${data.first_name || 'Неизвестно'}
Юзернейм: @${data.username || 'Неизвестно'}
🕐 *Время:* ${new Date(data.timestamp).toLocaleString('ru-RU')}
`;

    if (REPORTS_CHAT_ID) {
      await bot.sendMessage(REPORTS_CHAT_ID, reportMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Принять', callback_data: `accept_${data.user_id}` }],
            [{ text: '❌ Отклонить', callback_data: `reject_${data.user_id}` }]
          ]
        }
      });
    }
    console.log('✅ Жалоба получена:', data.player_name);
  } catch (error) {
    console.error('Ошибка отправки жалобы:', error);
    bot.sendMessage(chatId, '❌ Не удалось отправить жалобу. Попробуйте ещё раз.');
  }
}

bot.on('callback_query', (query) => {
  const data = query.data;
  
  if (data.startsWith('accept_')) {
    bot.answerCallbackQuery(query.id, { text: '✅ Жалоба принята к рассмотрению', show_alert: true });
  } else if (data.startsWith('reject_')) {
    bot.answerCallbackQuery(query.id, { text: '❌ Жалоба отклонена', show_alert: true });
  } else if (data === 'rules') {
    bot.sendMessage(query.message.chat.id, `
📖 *Правила сервера Fox SMP*

1. ❌ Запрещены читы и лаг-машины
2. ❌ Запрещено гриферство и кража
3. ❌ Запрещена реклама других серверов
4. ❌ Запрещено оскорбление игроков
5. ✅ Уважайте других игроков
6. ✅ Строите — защищайте

За нарушение правил — бан без предупреждения!

Хотите присоединиться?
`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🎮 Присоединиться', web_app: { url: process.env.APP_URL || 'https://ваш-домен.bothost.ru' } }]]
      }
    });
    bot.answerCallbackQuery(query.id);
  }
});

console.log('✅ Бот готов к работе');
