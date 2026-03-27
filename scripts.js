// scripts.js – полная логика приложения с авторизацией и оплатой

// ---- Telegram ----
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// ---- Константы ----
const STORAGE_KEY = 'fox_smp_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут
const MAX_CHAT_MSGS = 50;
const NICK = '_0_Egorik_0_';

// ---- Состояние пользователя (имитация авторизации) ----
const isAuthenticated = () => localStorage.getItem('ms_auth') === 'true';
const isPaid = () => localStorage.getItem('paid') === 'true';
const paymentExpiry = () => parseInt(localStorage.getItem('payment_expiry') || '0');

// ---- Редиректы в зависимости от состояния ----
function checkAccess() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'payment.html'];

    // Если пользователь не авторизован и страница не публичная → index.html
    if (!isAuthenticated() && !publicPages.includes(currentPage)) {
        window.location.href = 'index.html';
        return;
    }

    // Если авторизован, но не оплатил → payment.html (кроме самой payment и index)
    if (isAuthenticated() && !isPaid() && !['payment.html', 'index.html'].includes(currentPage)) {
        window.location.href = 'payment.html';
        return;
    }

    // Если авторизован и оплатил, но срок истёк → сбрасываем оплату и отправляем на payment
    if (isAuthenticated() && isPaid() && paymentExpiry() < Date.now()) {
        localStorage.removeItem('paid');
        localStorage.removeItem('payment_expiry');
        if (currentPage !== 'payment.html' && currentPage !== 'index.html') {
            window.location.href = 'payment.html';
        }
        return;
    }

    // Если авторизован и оплатил, но зачем-то на index или payment → home.html
    if (isAuthenticated() && isPaid() && ['index.html', 'payment.html'].includes(currentPage)) {
        window.location.href = 'home.html';
    }
}

// Выполняем проверку сразу
checkAccess();

// ---- Кеширование данных (для главной страницы) ----
let cache = {
    online: 12,
    blocks: 92000,
    mobs: 4920,
    playersKilled: 32,
    distance: 542,
    clanMembers: [],
    lastUpdate: 0
};

// Загружаем кеш
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.lastUpdate < CACHE_TTL) {
            cache = parsed;
        }
    }
} catch (e) {}

function saveCache() {
    cache.lastUpdate = Date.now();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {}
}

// ---- Кеширование DOM-элементов ----
const dom = {
    nick: document.getElementById('player-nick'),
    skin: document.getElementById('skin'),
    online: document.getElementById('server-online'),
    blocks: document.getElementById('blocks-mined'),
    mobs: document.getElementById('mobs-killed'),
    playersKilled: document.getElementById('players-killed'),
    distance: document.getElementById('distance'),
    statsLoader: document.getElementById('stats-loader'),
    clanMembers: document.getElementById('clan-members'),
    chatBox: document.getElementById('chat'),
    chatInput: document.getElementById('chatInput'),
    statsChart: document.getElementById('statsChart'),
    statsChartFull: document.getElementById('statsChartFull')
};

// ---- Установка ника и скина ----
if (dom.nick) dom.nick.textContent = NICK;
if (dom.skin) {
    const user = tg?.initDataUnsafe?.user;
    if (user?.photo_url) {
        dom.skin.src = user.photo_url;
    } else {
        dom.skin.src = `https://mc-heads.net/body/${NICK}`;
    }
}

// ---- Уведомления и хаптика ----
const showNotification = (msg) => {
    if (tg?.showAlert) tg.showAlert(msg);
    else alert(msg);
};

const haptic = (type = 'light') => tg?.HapticFeedback?.impactOccurred(type);

// ---- Хаптика для навигации ----
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => haptic('light'));
});

// ---- Microsoft Login (имитация) ----
function loginMicrosoft() {
    // Здесь должен быть реальный OAuth2. В демо просто ставим флаг
    localStorage.setItem('ms_auth', 'true');
    showNotification('Авторизация через Microsoft выполнена (демо)');
    haptic('success');
    window.location.href = 'payment.html';
}

// ---- Оплата звёздами (реальная) ----
function processStarsPayment() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    if (!tg) {
        alert('Это приложение должно быть открыто в Telegram');
        return;
    }

    tg.openInvoice({
        title: 'Доступ на сервер Fox SMP',
        description: 'Проходка на 30 дней',
        payload: JSON.stringify({
            user_id: tg.initDataUnsafe?.user?.id || 'guest',
            product: 'pass_30d',
            timestamp: Date.now()
        }),
        currency: 'XTR',
        prices: [{ label: 'Проходка', amount: 100 }] // 100 звёзд
    }, (status, invoiceData) => {
        if (status === 'paid') {
            // Успешная оплата
            localStorage.setItem('paid', 'true');
            localStorage.setItem('payment_date', Date.now().toString());
            localStorage.setItem('payment_expiry', (Date.now() + 30*24*60*60*1000).toString());

            showNotification('Спасибо! Доступ активирован на 30 дней');
            haptic('success');
            window.location.href = 'home.html';
        } else if (status === 'cancelled') {
            showNotification('Покупка отменена');
        } else if (status === 'failed') {
            showNotification('Ошибка при оплате');
        }
    });
}

// ---- Оплата рублями (имитация с переходом на внешний сайт) ----
function processRubPayment() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // В реальном проекте здесь был бы запрос к бэкенду для получения ссылки на оплату.
    // Сейчас просто откроем демо-ссылку и после возврата пометим оплату как успешную.
    const fakePaymentUrl = 'https://example.com/pay?amount=189.99&description=Fox+SMP+pass';
    
    if (tg?.openLink) {
        tg.openLink(fakePaymentUrl);
    } else {
        window.open(fakePaymentUrl, '_blank');
    }

    // Имитация успешной оплаты через 5 секунд (для демо)
    showNotification('Демо: после возврата нажмите ОК для активации');
    setTimeout(() => {
        localStorage.setItem('paid', 'true');
        localStorage.setItem('payment_date', Date.now().toString());
        localStorage.setItem('payment_expiry', (Date.now() + 30*24*60*60*1000).toString());
        window.location.href = 'home.html';
    }, 5000);
}

// ---- Выход ----
function logout() {
    localStorage.removeItem('ms_auth');
    localStorage.removeItem('paid');
    localStorage.removeItem('payment_expiry');
    window.location.href = 'index.html';
}

// ---- Копирование IP ----
function copyIP() {
    const ip = 'fox-smp.com';
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = ip;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showNotification(`IP скопирован: ${ip}`);
            haptic('success');
        } catch {
            showNotification('Не удалось скопировать IP');
        }
        document.body.removeChild(ta);
    };

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(ip)
            .then(() => {
                showNotification(`IP скопирован: ${ip}`);
                haptic('success');
            })
            .catch(fallback);
    } else {
        fallback();
    }
}

// ---- Загрузка статистики (эмуляция) ----
async function fetchStats(force = false) {
    if (!force && Date.now() - cache.lastUpdate < CACHE_TTL) {
        updateStatsFromCache();
        return;
    }

    if (dom.statsLoader) dom.statsLoader.style.display = 'block';
    await new Promise(r => setTimeout(r, 800));

    cache.blocks = 92000 + Math.floor(Math.random() * 1000);
    cache.mobs = 4920 + Math.floor(Math.random() * 100);
    cache.playersKilled = 32 + Math.floor(Math.random() * 5);
    cache.distance = 542 + Math.floor(Math.random() * 20);
    cache.online = 12 + Math.floor(Math.random() * 8);
    cache.clanMembers = [
        'Steve — Лидер',
        'Alex — Офицер',
        'Player123 — Игрок',
        'DragonSlayer — Игрок'
    ];

    updateStatsFromCache();
    saveCache();

    if (dom.statsLoader) dom.statsLoader.style.display = 'none';
}

function updateStatsFromCache() {
    if (dom.blocks) dom.blocks.textContent = cache.blocks;
    if (dom.mobs) dom.mobs.textContent = cache.mobs;
    if (dom.playersKilled) dom.playersKilled.textContent = cache.playersKilled;
    if (dom.distance) dom.distance.textContent = cache.distance;
    if (dom.online) dom.online.innerHTML = `🟢 Онлайн: ${cache.online} игроков`;
    if (dom.clanMembers) {
        dom.clanMembers.innerHTML = cache.clanMembers.map(m => `<div>${m}</div>`).join('');
    }
}

setInterval(() => fetchStats(true), 30000);

// ---- Чат ----
if (dom.chatBox) {
    setInterval(() => {
        if (Math.random() > 0.8) {
            const names = ['Alex', 'Creeper', 'Dragon', 'Steve', 'Notch'];
            const msgs = ['Привет!', 'Как дела?', 'Идём на ферму', 'Кто пойдет на босса?', 'лол'];
            addChatMessage(
                names[Math.floor(Math.random() * names.length)],
                msgs[Math.floor(Math.random() * msgs.length)]
            );
        }
    }, 15000);
}

function addChatMessage(sender, text) {
    if (!dom.chatBox) return;
    const div = document.createElement('div');
    div.textContent = `${sender}: ${text}`;
    dom.chatBox.appendChild(div);
    while (dom.chatBox.children.length > MAX_CHAT_MSGS) {
        dom.chatBox.removeChild(dom.chatBox.firstChild);
    }
    dom.chatBox.scrollTop = dom.chatBox.scrollHeight;
}

function sendMessage() {
    if (!dom.chatInput || !dom.chatBox) return;
    const text = dom.chatInput.value.trim();
    if (!text) return;

    addChatMessage('Вы', text);
    dom.chatInput.value = '';
    setTimeout(() => addChatMessage('Система', 'Сообщение доставлено'), 500);
    haptic('light');
}

// ---- Внешние действия ----
function openMapFull() {
    const url = 'https://fox-smp.com/map';
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank');
}

function manageClan() {
    showNotification('Открывается управление кланом...');
}

// ---- Графики ----
let charts = { stats: null, statsFull: null };

function initCharts() {
    if (dom.statsChart) {
        if (charts.stats) charts.stats.destroy();
        dom.statsChart.width = dom.statsChart.clientWidth || 300;
        dom.statsChart.height = 200;
        try {
            charts.stats = new Chart(dom.statsChart, {
                type: 'line',
                data: {
                    labels: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
                    datasets: [{
                        label: 'Часы игры',
                        data: [3,4,2,6,5,7,4],
                        borderColor: '#ff6a00',
                        backgroundColor: 'rgba(255,106,0,0.2)',
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        } catch (e) { console.warn('Chart error (stats):', e); }
    }

    if (dom.statsChartFull) {
        if (charts.statsFull) charts.statsFull.destroy();
        dom.statsChartFull.width = dom.statsChartFull.clientWidth || 300;
        dom.statsChartFull.height = 200;
        try {
            charts.statsFull = new Chart(dom.statsChartFull, {
                type: 'bar',
                data: {
                    labels: ['Блоки','Мобы','Игроки','Смерти'],
                    datasets: [{
                        label: 'Количество',
                        data: [124500,8732,47,129],
                        backgroundColor: '#ff6a00',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } }
                    }
                }
            });
        } catch (e) { console.warn('Chart error (full):', e); }
    }
}

// ---- Resize handler ----
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (charts.stats) charts.stats.update();
        if (charts.statsFull) charts.statsFull.update();
    }, 200);
});

// ---- Запуск при загрузке страницы ----
window.addEventListener('load', () => {
    initCharts();
    fetchStats();
    if (dom.chatBox) {
        setTimeout(() => addChatMessage('Система', 'Добро пожаловать в чат Fox SMP!'), 1000);
    }
});