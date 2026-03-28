// В app.js, замените эндпоинт /api/server-status:
if (req.url === '/api/server-status' && req.method === 'GET') {
  // Используем бесплатный API для проверки статуса сервера
  const serverAddress = 'fox-smp.com:20073'; // Например: play.foxsmp.ru:25565
  
  // Вариант 1: Использовать внешний сервис (проще)
  require('https').get(
    `https://api.mcsrvstat.us/2/${serverAddress.split(':')[0]}`,
    (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    }
  ).on('error', () => {
    res.writeHead(500);
    res.end(JSON.stringify({ online: false, error: 'Не удалось проверить сервер' }));
  });
  
  return;
}
