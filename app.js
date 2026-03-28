const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MC_SERVER_ADDRESS = 'c11.play2go.cloud';
const MC_SERVER_PORT = 20073;
const API_TIMEOUT = 5000;
const CACHE_MAX_AGE = 3600;

// Microsoft OAuth настройки (замените на свои)
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'YOUR_CLIENT_ID';
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'https://yourdomain.com/auth/callback';

// Сессии для хранения токенов (в памяти, для продакшена используйте Redis/БД)
const authSessions = new Map();

// Пути для тихого игнорирования (сканеры уязвимостей)
const IGNORED_PATHS = ['/wp-login.php', '/wp-admin/', '/administrator/', '/phpmyadmin/', '/.env', '/config.php'];

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
        const playerList = Array.isArray(serverData.players?.list) 
          ? serverData.players.list.map(p => typeof p === 'object' ? p.name : p)
          : [];
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          online: true,
          server: { address: `${MC_SERVER_ADDRESS}:${MC_SERVER_PORT}`, version: serverData.version?.name || serverData.version || 'Неизвестно' },
          players: { online: serverData.players?.online || 0, max: serverData.players?.max || 50, list: playerList },
          motd: Array.isArray(serverData.motd?.clean) ? serverData.motd.clean.join(' ') : (serverData.motd?.clean || 'Fox SMP'),
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
  
  // Авторизация через Microsoft - начало OAuth потока
  if (req.url === '/api/auth/microsoft' && req.method === 'GET') {
    const state = crypto.randomBytes(32).toString('hex');
    authSessions.set(state, { timestamp: Date.now() });
    
    const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(MICROSOFT_REDIRECT_URI)}&scope=XboxLive.signin%20offline_access&state=${state}`;
    
    res.writeHead(302, { 'Location': authUrl });
    return res.end();
  }
  
  // Callback от Microsoft
  if (req.url.startsWith('/api/auth/callback') && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code || !state || !authSessions.has(state)) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      return res.end('<h1>Ошибка авторизации</h1><p>Неверный код или состояние сессии.</p>');
    }
    
    authSessions.delete(state);
    
    // Обмен кода на токен
    exchangeMicrosoftToken(code)
      .then((tokenData) => {
        // Получение XBL токена
        return getXBLToken(tokenData.access_token);
      })
      .then((xblData) => {
        // Получение XSTS токена
        return getXSTSToken(xblData.Token);
      })
      .then((xstsData) => {
        // Проверка лицензии Minecraft
        return checkMinecraftLicense(xstsData);
      })
      .then((licenseData) => {
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Авторизация завершена</title>
            <script>
              window.onload = function() {
                const result = ${JSON.stringify(licenseData)};
                if (window.opener) {
                  window.opener.postMessage({ type: 'auth-result', data: result }, '*');
                  window.close();
                } else {
                  document.body.innerHTML = '<h1>' + (result.hasLicense ? '✅ Успешно!' : '❌ Ошибка') + '</h1><p>' + result.message + '</p>';
                }
              };
            </script>
          </head>
          <body>
            <p>Обработка результата...</p>
          </body>
          </html>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(htmlResponse);
      })
      .catch((error) => {
        console.error('❌ Ошибка авторизации:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        return res.end(`<h1>Ошибка авторизации</h1><p>${error.message}</p>`);
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

  // Тихое игнорирование запросов от сканеров уязвимостей
  if (IGNORED_PATHS.some(p => req.url.startsWith(p) || req.url === p)) {
    res.writeHead(404);
    return res.end();
  }

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
    const options = {
      timeout: API_TIMEOUT,
      headers: {
        'User-Agent': 'FoxSMP-MiniApp/1.0'
      }
    };
    // Java Edition сервер - используем стандартный эндпоинт
    const request = https.get(`https://api.mcsrvstat.us/3/${address}:${port}`, options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          // Проверяем, что ответ не пустой и начинается с {
          if (!data || !data.trim().startsWith('{')) {
            console.error('❌ Некорректный ответ API (не JSON):', data.substring(0, 100));
            reject(new Error('Сервер вернул некорректный ответ'));
            return;
          }
          const result = JSON.parse(data);
          if (result.online === false || result.debug?.ping === false) {
            reject(new Error('Сервер не отвечает'));
          } else {
            resolve(result);
          }
        } catch (error) {
          console.error('❌ Ошибка парсинга JSON от API:', error.message, 'Data:', data.substring(0, 100));
          reject(new Error('Некорректный ответ API'));
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

// Обмен кода авторизации на токен Microsoft
function exchangeMicrosoftToken(code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: MICROSOFT_REDIRECT_URI
    }).toString();
    
    const options = {
      hostname: 'login.microsoftonline.com',
      port: 443,
      path: '/consumers/oauth2/v2.0/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            reject(new Error(result.error_description || result.error));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error('Ошибка парсинга токена Microsoft'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Получение XBL токена
function getXBLToken(msAccessToken) {
  return new Promise((resolve, reject) => {
    const requestData = {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    };
    
    const postData = JSON.stringify(requestData);
    
    const options = {
      hostname: 'user.auth.xboxlive.com',
      port: 443,
      path: '/users/authenticate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.XErr) {
            reject(new Error(`XBL ошибка ${result.XErr}: ${result.Message || 'Неизвестная ошибка'}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error('Ошибка парсинга XBL токена'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Получение XSTS токена
function getXSTSToken(xblToken) {
  return new Promise((resolve, reject) => {
    const requestData = {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xblToken]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    };
    
    const postData = JSON.stringify(requestData);
    
    const options = {
      hostname: 'xsts.auth.xboxlive.com',
      port: 443,
      path: '/xsts/authorize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.XErr) {
            reject(new Error(`XSTS ошибка ${result.XErr}: ${result.Message || 'Неизвестная ошибка'}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error('Ошибка парсинга XSTS токена'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Проверка лицензии Minecraft
function checkMinecraftLicense(xstsData) {
  return new Promise((resolve, reject) => {
    const xstsToken = xstsData.Token;
    const userHash = xstsData.DisplayClaims.xui[0].uhs;
    
    const options = {
      hostname: 'api.minecraftservices.com',
      port: 443,
      path: '/entitlements/mcstore',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${xstsToken}`,
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const hasLicense = result.items && result.items.some(item => item.name === 'game_minecraft');
          
          resolve({
            hasLicense: hasLicense,
            message: hasLicense ? 'Лицензия Minecraft найдена!' : 'Лицензия Minecraft не найдена.',
            userHash: userHash,
            items: result.items || []
          });
        } catch (e) {
          reject(new Error('Ошибка проверки лицензии'));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
