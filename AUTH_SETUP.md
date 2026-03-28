# Настройка авторизации через Microsoft

## 1. Регистрация приложения в Azure Portal

1. Перейдите на https://portal.azure.com
2. Откройте "Azure Active Directory" → "App registrations" → "New registration"
3. Заполните:
   - **Name**: Fox SMP Auth
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: `https://yourdomain.com/api/auth/callback` (замените на ваш домен)

4. После создания скопируйте **Application (client) ID**

## 2. Настройка переменных окружения

Установите следующие переменные окружения:

```bash
export MICROSOFT_CLIENT_ID="ваш_client_id_из_azure"
export MICROSOFT_REDIRECT_URI="https://yourdomain.com/api/auth/callback"
```

Для production используйте `.env` файл или панель управления вашим хостингом.

## 3. Важные замечания

- Для работы авторизации необходим HTTPS (кроме localhost)
- Redirect URI должен точно совпадать с указанным в Azure Portal
- Убедитесь, что ваш домен добавлен в разрешённые redirect URI
- Токены хранятся в памяти сервера (для production рекомендуется использовать Redis)

## 4. Проверка работы

1. Запустите сервер: `npm start`
2. Откройте Mini App в Telegram
3. Перейдите на вкладку "🔐 Вход"
4. Нажмите "🎮 Войти через Microsoft"
5. Авторизуйтесь в окне Microsoft
6. После успешной проверки вы увидите статус лицензии

## 5. Структура OAuth потока

```
Пользователь → /api/auth/microsoft → Microsoft Login
     ↓
Callback ← /api/auth/callback?code=XXX ← Microsoft
     ↓
Обмен кода на токен → XBL Token → XSTS Token → Проверка лицензии
```

## 6. API эндпоинты

- `GET /api/auth/microsoft` - Начало OAuth потока
- `GET /api/auth/callback` - Callback от Microsoft
- `GET /api/server-status` - Статус Minecraft сервера
