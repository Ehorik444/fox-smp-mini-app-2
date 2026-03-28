async function refreshData() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error('Ошибка запроса:', error);
        updateUI({ online: false, error: 'Ошибка соединения с сервером' });
    }
}

function updateUI(data) {
    const onlineDiv = document.getElementById('online-status');
    const playersCountDiv = document.getElementById('players-count');
    const motdDiv = document.getElementById('motd');
    const playersListDiv = document.getElementById('players-list');

    if (data.online) {
        onlineDiv.innerHTML = '<span class="online">✅ Сервер онлайн</span>';
        playersCountDiv.innerHTML = `👥 Игроков: ${data.players_online} / ${data.max_players}`;
        motdDiv.innerHTML = `📜 MOTD: ${data.motd || 'Нет'}`;
        if (data.players && data.players.length) {
            playersListDiv.innerHTML = data.players.map(p => `<div class="player">${p}</div>`).join('');
        } else {
            playersListDiv.innerHTML = '<div>Никого нет :(</div>';
        }
    } else {
        onlineDiv.innerHTML = '<span class="offline">❌ Сервер недоступен</span>';
        playersCountDiv.innerHTML = '';
        motdDiv.innerHTML = '';
        playersListDiv.innerHTML = '<div>Не удалось получить данные</div>';
        if (data.error) {
            playersListDiv.innerHTML += `<div style="color:#ff8888">Ошибка: ${data.error}</div>`;
        }
    }
}

refreshData();
setInterval(refreshData, 10000);
