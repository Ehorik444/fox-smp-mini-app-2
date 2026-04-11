FROM node:18-alpine

WORKDIR /app

# Устанавливаем переменную окружения DATA_DIR
ENV DATA_DIR=/app/data

# Создаём директорию и устанавливаем права
RUN mkdir -p /app/data && chmod 777 /app/data

# Правим права на /app/data (для volume)
RUN chown -R $(id -u):$(id -g) /app/data 2>/dev/null || chown -R 1000:1000 /app/data || true

# Скрипт для инициализации прав на /app/data в entrypoint
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

# Копируем только package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production || npm install --only=production

# Очищаем npm-кэш
RUN npm cache clean --force || true

# Копируем остальные файлы, кроме .env
COPY . .

EXPOSE 3000

CMD ["node", "src/bot.js"]
