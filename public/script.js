// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Настройка темы
document.body.style.backgroundColor = tg.themeParams.bg_color || '#ffffff';
document.body.style.color = tg.themeParams.text_color || '#000000';

// ==================== НАВИГАЦИЯ ====================
const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const pageId = btn.dataset.page;
    
    // Снимаем активный класс с кнопок
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Скрываем все страницы, показываем нужную
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    
    // Обновляем статус при переходе
    if (pageId === 'status') {
      checkServerStatus();
    }
  });
});

// ==================== СТАТУС СЕРВЕРА ====================
let isRefreshing = false;
const refreshBtn = document.getElementById('refresh-btn');
const statusEl = document.getElementById('server-status');
const playersCountEl = document.getElementById('players-count');
const playersListEl = document.getElementById('players-list');

// Проверка статуса сервера
async function checkServerStatus() {
  if (isRefreshing) return;
  
  isRefreshing = true;
  refreshBtn.disabled = true;
  
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  
  statusEl.className = 'status loading';
  statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Проверка...</span>';
  
  try {
    // Здесь будет ваш реальный адрес сервера
    // Пока используем заглушку
    await simulateServerCheck();
    
  } catch (error) {
    console.error('Ошибка проверки сервера:', error);
    statusEl.className = 'status offline';
    statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Ошибка</span>';
    playersListEl.innerHTML = '<p class="empty-text">Не удалось проверить сервер</p>';
  } finally {
    isRefreshing = false;
    refreshBtn.disabled = false;
  }
}

// Имитация проверки сервера (замените на реальный API)
function simulateServerCheck() {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Случайный статус для демонстрации
      const isOnline = Math.random() > 0.3;
      
      if (isOnline) {
        // Сервер онлайн
        statusEl.className = 'status online';
        statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">ОНЛАЙН</span>';
        
        // Случайное количество игроков
        const maxPlayers = 20;
        const onlinePlayers = Math.floor(Math.random() * (maxPlayers + 1));
        playersCountEl.textContent = `${onlinePlayers} / ${maxPlayers}`;
        
        // Генерация списка игроков
        if (onlinePlayers > 0) {
          const players = generateRandomPlayers(onlinePlayers);
          playersListEl.innerHTML = players.map(p => `
            <div class="player-item">
              <div class="player-icon">${p.charAt(0)}</div>
              <span>${p}</span>
            </div>
          `).join('');
        } else {
          playersListEl.innerHTML = '<p class="empty-text">Никого нет онлайн</p>';
        }
      } else {
        // Сервер офлайн
        statusEl.className = 'status offline';
        statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">ОФЛАЙН</span>';
        playersCountEl.textContent = '0 / 20';
        playersListEl.innerHTML = '<p class="empty-text">Сервер выключен</p>';
      }
      
      resolve();
    }, 800);
  });
}

// Генерация случайных ников игроков
function generateRandomPlayers(count) {
  const prefixes = ['Fox', 'Wolf', 'Bear', 'Eagle', 'Tiger', 'Lion', 'Shark', 'Ghost', 'Ninja', 'Hunter'];
  const suffixes = ['_pro', '_gamer', '2024', '666', '_rus', '_live', '_x', '_yt', 'TV', 'GG'];
  
  const players = [];
  for (let i = 0; i < count; i++) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    players.push(prefix + suffix);
  }
  return players;
}

// Автообновление каждые 30 секунд
setInterval(checkServerStatus, 30000);

// Кнопка обновления
refreshBtn.addEventListener('click', checkServerStatus);

// ==================== ФОРМА ЖАЛОБЫ ====================
const reportForm = document.getElementById('report-form');
const descriptionInput = document.getElementById('description');
const charCountEl = document.getElementById('char-count');

// Счётчик символов
descriptionInput.addEventListener('input', () => {
  charCountEl.textContent = descriptionInput.value.length;
});

// Отправка формы
reportForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  
  const submitBtn = reportForm.querySelector('.submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>📤 Отправка...</span>';
  
  // Собираем данные
  const formData = {
    action: 'submit_report',
    timestamp: new Date().toISOString(),
    player_name: document.getElementById('player-name').value.trim(),
    reason: document.getElementById('reason').value,
    description: document.getElementById('description').value.trim(),
    user_id: tg.initDataUnsafe.user?.id || null,
    username: tg.initDataUnsafe.user?.username || null,
    first_name: tg.initDataUnsafe.user?.first_name || null
  };
  
  console.log('Отправка жалобы:', formData);
  
  // Отправляем данные в бота
  tg.sendData(JSON.stringify(formData));
  
  // Показываем уведомление
  tg.showPopup({
    title: '✅ Жалоба отправлена',
    message: 'Спасибо за вашу жалобу! Администрация рассмотрит её в ближайшее время.',
    buttons: [{ type: 'ok' }]
  });
  
  // Сбрасываем форму через 1 секунду
  setTimeout(() => {
    reportForm.reset();
    charCountEl.textContent = '0';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>📤 Отправить жалобу</span>';
    
    // Переходим на страницу статуса
    document.querySelector('.nav-btn[data-page="status"]').click();
  }, 1000);
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
// Проверяем статус при загрузке
window.addEventListener('DOMContentLoaded', () => {
  console.log('🦊 Fox SMP Mini App загружена');
  console.log('Пользователь:', tg.initDataUnsafe.user);
  console.log('Тема:', tg.colorScheme);
  
  // Проверяем статус сервера
  checkServerStatus();
});
