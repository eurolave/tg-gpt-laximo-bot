import 'dotenv/config';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { handleUserText, handleCallback, startFlow } from './core/orchestrator.js';
import { mainMenu, backMenu } from './bot/keyboards.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 👉 единая точка выбора модели
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

// универсальный вызов GPT
async function askGpt(input) {
  const r = await client.responses.create({
    model: MODEL,
    instructions:
      "You are GPT-5. If asked what model you are, answer exactly: 'GPT-5 Thinking'. Be concise and helpful.",
    input
  });
  return r.output_text || '';
}

// /start и базовое меню
bot.start(async (ctx) => {
  await ctx.reply('Привет! Выберите, что нужно:', mainMenu());
});

// команды
bot.command('menu', (ctx) => ctx.reply('Главное меню:', mainMenu()));
bot.command('vin', startFlow('vin_flow'));
bot.command('oem', startFlow('oem_flow'));
bot.command('help', (ctx) =>
  ctx.reply('Я помогу подобрать детали по VIN/OEM и отвечу на вопросы GPT.', backMenu())
);

// диагностика модели
bot.command('model', async (ctx) => {
  try {
    const test = await client.responses.create({ model: MODEL, input: 'pong' });
    await ctx.reply(`Using: ${MODEL}\nAPI responded with model: ${test.model || '(n/a)'}`);
  } catch (e) {
    await ctx.reply(`Model check error: ${e?.message || e}`);
  }
});

// reply-кнопки
bot.hears('🔎 Подбор по VIN', startFlow('vin_flow'));
bot.hears('🧩 Поиск по OEM', startFlow('oem_flow'));
bot.hears('🤖 Вопрос к GPT', (ctx) => ctx.reply('Напишите вопрос для GPT:', backMenu()));
bot.hears('🛒 Корзина', (ctx) => ctx.reply('Корзина пока в разработке. Скоро добавим!', backMenu()));
bot.hears('ℹ️ Помощь', (ctx) =>
  ctx.reply('Отправьте VIN (17 симв.) или артикул OEM. Либо задайте вопрос GPT.', backMenu())
);
bot.hears('⬅️ В меню', (ctx) => ctx.reply('Главное меню:', mainMenu()));

// инлайн-кнопки
bot.on('callback_query', handleCallback);

// текст → сначала пробуем диалоговый флоу, иначе GPT
bot.on('text', async (ctx) => {
  const handled = await handleUserText(ctx);
  if (handled) return;

  try {
    const answer = await askGpt(`Отвечай кратко и по делу. Вопрос: ${ctx.message.text}`);
    await ctx.reply(answer.slice(0, 4000), mainMenu());
  } catch (e) {
    console.error(e);
    await ctx.reply('Временная ошибка GPT. Попробуйте ещё раз.', backMenu());
  }
});

bot.launch();
console.log('✅ Bot started (long-polling, model=%s)', MODEL);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
