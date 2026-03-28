const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Адаптация под тему Telegram
document.body.style.backgroundColor = tg.themeParams.bg_color || '#ffffff';
document.body.style.color = tg.themeParams.text_color || '#000000';

// Данные пользователя
if (tg.initDataUnsafe.user) {
  console.log('👤 Пользователь:', tg.initDataUnsafe.user.first_name);
}

// Обновление статуса сервера (заглушка)
function updateServerStatus() {
  const statusEl = document.getElementById('status');
  const playersEl = document.getElementById('players-list');
  
  // Здесь будет запрос к вашему Minecraft серверу
  statusEl.textContent = 'Онлайн';
  statusEl.className = 'status online';
  playersEl.innerHTML = '🦊 Ehorik<br>🐺 Player2<br>🦊 Player3';
}

// Кнопка обновления
document.getElementById('refreshBtn').addEventListener('click', () => {
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  updateServerStatus();
});

// Инициализация
updateServerStatus();

// MainButton для быстрого действия
tg.MainButton.setText('Присоединиться');
tg.MainButton.show();
tg.MainButton.onClick(() => {
  tg.openTelegramLink('https://t.me/ваш_бот?start=join');
});
