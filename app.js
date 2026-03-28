const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MC_SERVER_ADDRESS = 'c11.play2go.cloud';
const MC_SERVER_PORT = 20073;
const API_TIMEOUT = 5000;
const CACHE_MAX_AGE = 3600;

const mimeTypes = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const server = http.createServer((req, res) => {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }
  
  if (req.url === '/api/server-status' && req.method === 'GET') {
    checkMinecraftServer(MC_SERVER_ADDRESS, MC_SERVER_PORT)
      .then((serverData) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          online: true,
          server: { address: `${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}`, version: serverData.version || 'Неизвестно' },
          players: { online: serverData.players?.online || 0, max: serverData.players?.max || 20, list: serverData.players?.list || [] },
          motd: serverData.motd?.clean || 'Fox SMP',
          icon: serverData.icon || null
        }));
      })
      .catch((error) => {
        console.error('❌ Ошибка проверки сервера:', error.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          online: false,
          error: 'Сервер недоступен',
          server: { address: `${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}` },
          players: { online: 0, max: 20, list: [] }
        }));
      });
    return;
  }
  
  const cleanUrl = req.url === '/' ? '' : (req.url.startsWith('/') ? req.url.substring(1) : req.url);
  const filePath = cleanUrl ? path.join(PUBLIC_DIR, cleanUrl) : path.join(PUBLIC_DIR, 'index.html');

  if (!filePath.startsWith(PUBLIC_DIR)) {
    console.log('🚫 Запрещённый путь:', req.url);
    res.writeHead(403);
    return res.end('Доступ запрещён');
  }

  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'text/plain';

  console.log(`📡 ${req.method} ${req.url}`);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.log(`❌ Файл не найден: ${filePath}`);
        if (!req.url.startsWith('/api/') && !/\.\w+$/.test(req.url)) {
          const indexPath = path.join(PUBLIC_DIR, 'index.html');
          fs.readFile(indexPath, (e, c) => {
            res.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html' });
            res.end(e ? 'Ошибка сервера' : c);
          });
        } else {
          res.writeHead(404);
          res.end('404 — Страница не найдена');
        }
      } else {
        console.error('❌ Ошибка чтения файла:', err);
        res.writeHead(500);
        res.end('500 — Ошибка сервера');
      }
    } else {
      if (extname !== '.html') res.setHeader('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Fox SMP Mini App запущено на порту ${PORT}`);
  console.log(`🎮 Сервер: ${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}`);
});

function checkMinecraftServer(address, port) {
  return new Promise((resolve, reject) => {
    const request = https.get(`https://api.mcsrvstat.us/2/${address}:${port}`, { timeout: API_TIMEOUT }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.debug?.ping === false) reject(new Error('Сервер не отвечает'));
          else resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Таймаут запроса'));
    });
  });
}
