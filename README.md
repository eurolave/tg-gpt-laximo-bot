# Telegram GPT-5 Bot (Railway-ready) + Laximo stub

Минимальный бот на **Node.js + Telegraf** с **OpenAI Responses API** и заглушкой клиента **Laximo**.
Работает в двух режимах: **long-polling** (локально) и **webhook** (для Railway/Render/Fly).

## 1) Локальный запуск (long-polling)
```bash
cp .env.example .env
# заполните TELEGRAM_BOT_TOKEN и OPENAI_API_KEY
npm i
npm run start
```

## 2) Webhook (для Railway)
```bash
# В .env укажите WEBHOOK_SECRET и WEBHOOK_URL (на Railway WEBHOOK_URL = https://<app>.up.railway.app)
npm run start:webhook
```
Сервер слушает `0.0.0.0:$PORT`. Railway автоматически задаст `PORT` и выдаст публичный домен.

## 3) Переменные окружения (обязательные)
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`

**Webhook:**
- `WEBHOOK_SECRET` — произвольная строка, добавляется в путь; пример: `/tg/SECRET`
- `WEBHOOK_URL` — базовый URL приложения (например, `https://my-bot.up.railway.app`)

**Laximo (опционально):**
- `LAXIMO_BASE_URL`, `LAXIMO_LOGIN`, `LAXIMO_PASSWORD` или `LAXIMO_API_KEY`

## 4) Деплой на Railway (кратко)
1. Создайте проект → Deploy from GitHub Repo.
2. Добавьте переменные в **Variables** (из `.env.example`).
3. (По желанию) Подключите Managed Postgres/Redis.
4. Запустите `start:webhook`. Бот сам вызовет `setWebhook` на `WEBHOOK_URL + /tg/WEBHOOK_SECRET`.

## 5) Проверки
- Логи Railway должны показывать `✅ Webhook set: https://.../tg/...`
- Напишите `/start` в чате с ботом.
- Если Laximo не настроен — OEM-запросы просто обрабатываются GPT-слоем.

## 6) Замечания по безопасности
- Никогда не коммитьте `.env`.
- Ключи храните в Railway Variables/Secrets.
- Ограничьте права бота (privacy mode) при необходимости.
