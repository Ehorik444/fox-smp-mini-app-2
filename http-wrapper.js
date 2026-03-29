const http = require("http");
const fs = require("fs");
const path = require("path");

const server = http.createServer((req, res) => {
  // Разрешаем CORS для Telegram
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Для главной страницы возвращаем HTML для Mini App
  if (req.url === '/' || req.url === '/miniapp' || req.url.startsWith('/miniapp')) {
    res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Fox SMP Mini App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <div id="root">Fox SMP Mini App is loading...</div>
    <script>
        // Проверяем, что мы внутри Telegram Web App
        if (window.Telegram && window.Telegram.WebApp) {
            // Инициализируем Web App
            const tg = window.Telegram.WebApp;
            tg.ready();
            
            // Здесь будет ваша логика Mini App
            document.getElementById('root').innerHTML = '<h1>Fox SMP Mini App</h1><p>Connected to server: c11.play2go.cloud:20073</p>';
        } else {
            document.getElementById('root').innerHTML = '<h1>Fox SMP Mini App</h1><p>This app should be opened in Telegram.</p>';
        }
    </script>
</body>
</html>`;
    res.end(html);
  } else {
    // Для других запросов возвращаем 404
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.end("Not Found");
  }
});

server.listen(3000, "0.0.0.0", () => console.log("HTTP server started on port 3000"));
