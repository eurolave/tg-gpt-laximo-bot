import 'dotenv/config';
import express from 'express';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { handleUserText, handleCallback, startFlow } from '../core/orchestrator.js';
import { mainMenu, backMenu } from './keyboards.js';

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Команды и меню
bot.command('menu', (ctx) => ctx.reply('Главное меню:', mainMenu()));
bot.command('vin', startFlow('vin_flow'));
bot.command('oem', startFlow('oem_flow'));
bot.command('help', (ctx) => ctx.reply('Я помогу подобрать детали по VIN/OEM и отвечу на вопросы GPT.', backMenu()));

bot.hears('🔎 Подбор по VIN', startFlow('vin_flow'));
bot.hears('🧩 Поиск по OEM', startFlow('oem_flow'));
bot.hears('🤖 Вопрос к GPT', (ctx) => ctx.reply('Напишите вопрос для GPT:', backMenu()));
bot.hears('🛒 Корзина', (ctx) => ctx.reply('Корзина пока в разработке. Скоро добавим!', backMenu()));
bot.hears('ℹ️ Помощь', (ctx) => ctx.reply('Отправьте VIN (17 симв.) или артикул OEM. Либо задайте вопрос GPT.', backMenu()));
bot.hears('⬅️ В меню', (ctx) => ctx.reply('Главное меню:', mainMenu()));

// Инлайн-кнопки
bot.on('callback_query', handleCallback);

// Текст
bot.on('text', async (ctx) => {
  const handled = await handleUserText(ctx);
  if (handled) return;
  const r = await client.responses.create({
    model: 'gpt-5-mini',
    input: `Отвечай кратко и по делу. Вопрос: ${ctx.message.text}`
  });
  await ctx.reply((r.output_text || '').slice(0, 4000), mainMenu());
});

app.use(express.json());

// health
app.get('/health', (req, res) => res.send('OK'));

const secret = process.env.WEBHOOK_SECRET || 'tg';
const path = `/tg/${secret}`;
app.use(path, bot.webhookCallback(path));

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', async () => {
  const base = process.env.WEBHOOK_URL || `http://localhost:${port}`;
  const url = `${base}${path}`;
  await bot.telegram.setWebhook(url);
  console.log('✅ Webhook set:', url);
});
