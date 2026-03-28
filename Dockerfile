# Используем официальный образ Node.js
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости (только продакшн)
RUN npm ci --only=production

# Очищаем кэш npm
RUN npm cache clean --force || true

# Копируем остальные файлы проекта
COPY . .

# Создаём папку для данных (если нужно)
RUN mkdir -p /app/data && chmod 777 /app/data

# Экспонируем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "app.js"]
