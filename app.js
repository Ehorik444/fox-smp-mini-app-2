const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Настройки вашего сервера
const MC_SERVER_ADDRESS = 'c11.play2go.cloud';
const MC_SERVER_PORT = 20073;

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }
  
  // API для статуса сервера — реальный запрос к вашему серверу
  if (req.url === '/api/server-status' && req.method === 'GET') {
    checkMinecraftServer(MC_SERVER_ADDRESS, MC_SERVER_PORT)
      .then((serverData) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          online: true,
          server: {
            address: `${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}`,
            version: serverData.version || 'Неизвестно'
          },
          players: {
            online: serverData.players?.online || 0,
            max: serverData.players?.max || 20,
            list: serverData.players?.list || []
          },
          motd: serverData.motd?.clean || 'Fox SMP',
          icon: serverData.icon || null
        }));
      })
      .catch((error) => {
        console.error('❌ Ошибка проверки сервера:', error);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          online: false,
          error: 'Сервер недоступен',
          server: {
            address: `${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}`
          },
          players: {
            online: 0,
            max: 20,
            list: []
          }
        }));
      });
    
    return;
  }
  
  // Определяем путь к файлу
  let filePath = '';
  
  if (req.url === '/' || req.url === '') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else {
    const cleanUrl = req.url.startsWith('/') ? req.url.substring(1) : req.url;
    filePath = path.join(PUBLIC_DIR, cleanUrl);
  }
  
  // Защита от выхода за пределы папки public
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && !filePath.startsWith(PUBLIC_DIR + '/')) {
    console.log('🚫 Запрещённый путь:', req.url);
    res.writeHead(403);
    return res.end('Доступ запрещён');
  }
  
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'text/plain';
  
  // Логирование запросов
  console.log(`📡 ${req.method} ${req.url}`);
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.log(`❌ Файл не найден: ${filePath}`);
        
        // SPA fallback — возвращаем index.html для маршрутов без расширения
        if (!req.url.startsWith('/api/') && !req.url.match(/\.\w+$/)) {
          const indexPath = path.join(PUBLIC_DIR, 'index.html');
          fs.readFile(indexPath, (err, content) => {
            if (err) {
              res.writeHead(500);
              res.end('Ошибка сервера');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(content);
            }
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
      // Кэширование для статических файлов
      if (extname !== '.html') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Fox SMP Mini App запущено на порту ${PORT}`);
  console.log(`🎮 Сервер: ${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}`);
});

// Функция проверки статуса сервера
function checkMinecraftServer(address, port) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://api.mcsrvstat.us/2/${address}:${port}`;
    
    https.get(apiUrl, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.debug?.ping === false) {
            reject(new Error('Сервер не отвечает'));
            return;
          }
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    }).setTimeout(5000, () => {
      reject(new Error('Таймаут запроса'));
    });
  });
}
