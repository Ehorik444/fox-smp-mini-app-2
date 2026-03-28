require('dotenv').config();
const express = require('express');
const path = require('path');
const getServerStatus = require('./api/status');

const app = express();
const PORT = process.env.PORT || 3000;

// Раздача статики из папки public
app.use(express.static(path.join(__dirname, 'public')));

// API эндпоинт для получения статуса сервера
app.get('/api/status', async (req, res) => {
  const status = await getServerStatus(process.env.MC_HOST, process.env.MC_PORT);
  res.json(status);
});

// Все остальные маршруты отдаём index.html (для поддержки SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Web app listening on port ${PORT}`);
});
