import 'dotenv/config';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { handleUserText, handleCallback, startFlow } from '../core/orchestrator.js';
import { mainMenu, backMenu } from './keyboards.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

bot.start(async (ctx) => {
  await ctx.reply('Привет! Выберите, что нужно:', mainMenu());
});

// Команды
bot.command('menu', (ctx) => ctx.reply('Главное меню:', mainMenu()));
bot.command('vin', startFlow('vin_flow'));
bot.command('oem', startFlow('oem_flow'));
bot.command('help', (ctx) => ctx.reply('Я помогу подобрать детали по VIN/OEM и отвечу на вопросы GPT.', backMenu()));

// Reply-меню
bot.hears('🔎 Подбор по VIN', startFlow('vin_flow'));
bot.hears('🧩 Поиск по OEM', startFlow('oem_flow'));
bot.hears('🤖 Вопрос к GPT', (ctx) => ctx.reply('Напишите вопрос для GPT:', backMenu()));
bot.hears('🛒 Корзина', (ctx) => ctx.reply('Корзина пока в разработке. Скоро добавим!', backMenu()));
bot.hears('ℹ️ Помощь', (ctx) => ctx.reply('Отправьте VIN (17 симв.) или артикул OEM. Либо задайте вопрос GPT.', backMenu()));
bot.hears('⬅️ В меню', (ctx) => ctx.reply('Главное меню:', mainMenu()));

// Инлайн
bot.on('callback_query', handleCallback);

// Текст → сначала попытка обработать флоу, иначе GPT
bot.on('text', async (ctx) => {
  const handled = await handleUserText(ctx);
  if (handled) return;
  const r = await client.responses.create({
    model: 'gpt-5-mini',
    input: `Отвечай кратко и по делу. Вопрос: ${ctx.message.text}`
  });
  await ctx.reply((r.output_text || '').slice(0, 4000), mainMenu());
});

bot.launch();
console.log('✅ Bot started (меню подключено)');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
