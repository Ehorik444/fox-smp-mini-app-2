const TelegramBot = require('node-telegram-bot-api');

// Замените на ваш токен бота
const TOKEN = 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(TOKEN, { polling: true });

// ID чата для жалоб (замените на ваш)
const REPORTS_CHAT_ID = '-1001234567890'; // ID чата/канала для жалоб

console.log('🤖 Бот запущен');

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = `
🦊 *Добро пожаловать на Fox SMP!*

🎮 *Сервер выживания для настоящих игроков*

Выберите действие:
`;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Статус сервера', web_app: { url: 'https://ваш-домен.bothost.ru' } }],
        [{ text: '📝 Отправить жалобу', web_app: { url: 'https://ваш-домен.bothost.ru' } }],
        [{ text: '📖 Правила сервера', callback_data: 'rules' }],
        [{ text: '💬 Наш чат', url: 'https://t.me/ваш_чат' }]
      ]
    }
  });
});

// Обработка данных из Mini App
bot.on('web_app_data', async (msg) => {
  const chatId = msg.chat.id;
  const webAppData = msg.web_app_data;
  
  try {
    const data = JSON.parse(webAppData.data);
    
    // Обработка жалобы
    if (data.action === 'submit_report') {
      await handleReport(chatId, data);
    }
    
  } catch (error) {
    console.error('Ошибка обработки данных:', error);
    bot.sendMessage(chatId, '❌ Произошла ошибка при обработке данных');
  }
});

// Обработка жалобы
async function handleReport(chatId, data) {
  try {
    // Формируем сообщение для админов
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
    
    // Отправляем жалобу в чат админов
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
    
    // Подтверждение для пользователя (уже показано через tg.showPopup)
    
    console.log('✅ Жалоба получена:', data.player_name);
    
  } catch (error) {
    console.error('Ошибка отправки жалобы:', error);
    bot.sendMessage(chatId, '❌ Не удалось отправить жалобу. Попробуйте ещё раз.');
  }
}

// Текст причины
function getReasonText(reason) {
  const reasons = {
    'cheat': 'Читы/читерство',
    'grief': 'Гриферство',
    'toxic': 'Токсичное поведение',
    'spam': 'Спам/реклама',
    'other': 'Другое'
  };
  return reasons[reason] || reason;
}

// Обработка кнопок принять/отклонить
bot.on('callback_query', (query) => {
  const data = query.data;
  
  if (data.startsWith('accept_')) {
    bot.answerCallbackQuery(query.id, { text: '✅ Жалоба принята к рассмотрению', show_alert: true });
  } else if (data.startsWith('reject_')) {
    bot.answerCallbackQuery(query.id, { text: '❌ Жалоба отклонена', show_alert: true });
  } else if (data === 'rules') {
    const rules = `
📖 *Правила сервера Fox SMP*

1. ❌ Запрещены читы и лаг-машины
2. ❌ Запрещено гриферство и кража
3. ❌ Запрещена реклама других серверов
4. ❌ Запрещено оскорбление игроков
5. ✅ Уважайте других игроков
6. ✅ Строите — защищайте

За нарушение правил — бан без предупреждения!

Хотите присоединиться?
`;
    
    bot.sendMessage(query.message.chat.id, rules, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Присоединиться', web_app: { url: 'https://ваш-домен.bothost.ru' } }]
        ]
      }
    });
    
    bot.answerCallbackQuery(query.id);
  }
});

console.log('✅ Бот готов к работе');
