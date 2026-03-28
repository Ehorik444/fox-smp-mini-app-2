const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

document.body.style.backgroundColor = tg.themeParams.bg_color || '#ffffff';
document.body.style.color = tg.themeParams.text_color || '#000000';

const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const pageId = btn.dataset.page;
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    if (pageId === 'status') checkServerStatus();
  });
});

let isRefreshing = false;
const refreshBtn = document.getElementById('refresh-btn');
const statusEl = document.getElementById('server-status');
const playersCountEl = document.getElementById('players-count');
const playersListEl = document.getElementById('players-list');

async function checkServerStatus() {
  if (isRefreshing) return;
  isRefreshing = true;
  refreshBtn.disabled = true;
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  
  statusEl.className = 'status loading';
  statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Проверка...</span>';
  
  try {
    const response = await fetch('/api/server-status');
    const data = await response.json();
    
    if (data.online) {
      statusEl.className = 'status online';
      statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">ОНЛАЙН</span>';
      playersCountEl.textContent = `${data.players.online} / ${data.players.max}`;
      
      if (data.players.online > 0 && data.players.list?.length > 0) {
        playersListEl.innerHTML = data.players.list.map(player => 
          `<div class="player-item"><div class="player-icon">${player.charAt(0).toUpperCase()}</div><span>${player}</span></div>`
        ).join('');
      } else {
        playersListEl.innerHTML = '<p class="empty-text">Никого нет онлайн</p>';
      }
    } else {
      statusEl.className = 'status offline';
      statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">ОФЛАЙН</span>';
      playersCountEl.textContent = '0 / 20';
      playersListEl.innerHTML = '<p class="empty-text">Сервер выключен</p>';
    }
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

setInterval(checkServerStatus, 30000);
refreshBtn.addEventListener('click', checkServerStatus);

const reportForm = document.getElementById('report-form');
const descriptionInput = document.getElementById('description');
const charCountEl = document.getElementById('char-count');

descriptionInput.addEventListener('input', () => {
  charCountEl.textContent = descriptionInput.value.length;
});

reportForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  
  const submitBtn = reportForm.querySelector('.submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>📤 Отправка...</span>';
  
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
  tg.sendData(JSON.stringify(formData));
  
  tg.showPopup({
    title: '✅ Жалоба отправлена',
    message: 'Спасибо за вашу жалобу! Администрация рассмотрит её в ближайшее время.',
    buttons: [{ type: 'ok' }]
  });
  
  setTimeout(() => {
    reportForm.reset();
    charCountEl.textContent = '0';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>📤 Отправить жалобу</span>';
    document.querySelector('.nav-btn[data-page="status"]').click();
  }, 1000);
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('🦊 Fox SMP Mini App загружена');
  console.log('Пользователь:', tg.initDataUnsafe.user);
  console.log('Тема:', tg.colorScheme);
  checkServerStatus();
});
