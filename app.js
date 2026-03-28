const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  console.log(`📡 Запрос: ${req.method} ${req.url}`);
  
  // CORS headers для API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }
  
  // API эндпоинт для статуса сервера (если будете использовать)
  if (req.url === '/api/server-status' && req.method === 'GET') {
    // Здесь можно добавить реальную проверку сервера Minecraft
    // Пока возвращаем заглушку
    const statusData = {
      online: true,
      players: {
        online: Math.floor(Math.random() * 21),
        max: 20
      },
      version: '1.20.1'
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(statusData));
  }
  
  // Раздача статических файлов
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'text/plain';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 — Страница не найдена');
      } else {
        res.writeHead(500);
        res.end('500 — Ошибка сервера');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Fox SMP Mini App запущено на порту ${PORT}`);
});
