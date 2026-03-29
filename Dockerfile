FROM node:18-alpine

WORKDIR /app

# Директория для постоянных данных: БД, файлы состояния, логи.
# Монтируется как Docker volume — данные сохраняются при перезапуске.
# В коде бота используйте: const DATA_DIR = process.env.DATA_DIR || '/app/data';
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data && chmod 777 /app/data
RUN chown -R $(id -u):$(id -g) /app/data 2>/dev/null || chown -R 1000:1000 /app/data || true

# Создаем entrypoint скрипт для инициализации прав на /app/data
RUN echo '#!/bin/sh' > /usr/local/bin/entrypoint.sh && \
    echo 'set -e' >> /usr/local/bin/entrypoint.sh && \
    echo '# Инициализация прав на /app/data (важно для volume)' >> /usr/local/bin/entrypoint.sh && \
    echo 'mkdir -p /app/data' >> /usr/local/bin/entrypoint.sh && \
    echo 'chmod 777 /app/data' >> /usr/local/bin/entrypoint.sh && \
    echo 'chown -R $(id -u):$(id -g) /app/data 2>/dev/null || true' >> /usr/local/bin/entrypoint.sh && \
    echo '# Запускаем основное приложение' >> /usr/local/bin/entrypoint.sh && \
    echo 'exec "$@"' >> /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production || npm install --only=production

# Очищаем npm кеш для уменьшения размера образа
RUN npm cache clean --force || true

# Копируем код приложения
COPY . .

# Открываем порт
EXPOSE 3000

# Создаем простой HTTP сервер для health checks
RUN echo 'const http = require("http"); const server = http.createServer((req, res) => { res.writeHead(200, {"Content-Type": "text/plain"}); res.end("Bot is running"); }); server.listen(3000, "0.0.0.0", () => console.log("HTTP server started on port 3000"));' > /app/http-wrapper.js
CMD ["sh", "-c", "node /app/http-wrapper.js & node http-wrapper.js"]

