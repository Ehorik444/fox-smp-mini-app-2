const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
require('dotenv').config();

// Импортируем функцию получения статуса Minecraft
const getServerStatus = require('./api/status');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  console.log(`Запрос: ${req.method} ${req.url}`);
  
  const parsedUrl = url.parse(req.url, true);
  
  // API эндпоинт для получения статуса сервера
  if (parsedUrl.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    const status = await getServerStatus(process.env.MC_HOST, process.env.MC_PORT);
    res.end(JSON.stringify(status));
    return;
  }
  
  // Раздача статических файлов из public
  let filePath = parsedUrl.pathname;
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }
  
  const fullPath = path.join(__dirname, 'public', filePath);
  const extname = path.extname(fullPath);
  const contentType = mimeTypes[extname] || 'text/plain';
  
  fs.readFile(fullPath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Файл не найден');
      } else {
        res.writeHead(500);
        res.end(`Ошибка сервера: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
