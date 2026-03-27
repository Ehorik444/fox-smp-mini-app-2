const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());

// Конфигурация (замените на свои данные)
const CLIENT_ID = 'your-client-id';
const CLIENT_SECRET = 'your-client-secret';
const REDIRECT_URI = 'https://your-domain.com/auth/microsoft/callback';
const FRONTEND_URL = 'https://your-miniapp.com'; // домен, где лежат HTML

// Начало авторизации
app.get('/auth/microsoft', (req, res) => {
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=user.read`;
    res.redirect(authUrl);
});

// Callback после авторизации
app.get('/auth/microsoft/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('No code provided');
    }

    try {
        // Обмен кода на токен
        const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;

        // Получение информации о пользователе
        const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const { id, displayName, mail } = userResponse.data;

        // Здесь можно сохранить пользователя в БД, связать с Telegram ID (если нужно)
        // В демо просто создаём токен сессии (JWT) или устанавливаем cookie

        // Создаём простую сессию: сохраняем в cookie
        // В реальном проекте лучше использовать JWT и httpOnly cookie
        res.cookie('ms_auth', 'true', { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 }); // 30 дней
        res.cookie('ms_user_id', id, { httpOnly: true });
        res.cookie('ms_user_name', displayName, { httpOnly: true });

        // Перенаправляем обратно на payment.html (или home.html, если уже оплачено)
        // Для простоты отдаём страницу, которая сохранит флаг в localStorage
        res.send(`
            <html>
                <body>
                    <script>
                        localStorage.setItem('ms_auth', 'true');
                        localStorage.setItem('ms_user', '${displayName}');
                        localStorage.setItem('ms_email', '${mail || ''}');
                        window.location.href = '${FRONTEND_URL}/payment.html';
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('OAuth error:', error.response?.data || error.message);
        res.status(500).send('Authentication failed');
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

