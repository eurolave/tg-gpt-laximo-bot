import 'dotenv/config';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { normalizeInput } from './utils.js';
import { partByOEM } from './clients/laximo.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

bot.start((ctx) => ctx.reply('Привет! Я GPT-бот. Напишите вопрос или отправьте OEM/VIN.'));

bot.on('text', async (ctx) => {
  const txt = (ctx.message?.text || '').trim();
  try {
    // Примитивная ветка OEM: если строка похожа на артикул (буквы+цифры, 3+ символа)
    if (/^[A-Za-z0-9._-]{3,}$/.test(txt)) {
      try {
        const p = await partByOEM(txt);
        if (p) {
          await ctx.reply(`Карточка по OEM ${txt} (демо):\n` + JSON.stringify(p).slice(0, 3500));
          return;
        }
      } catch (e) {
        // тихо падаем в GPT, если Laximo не настроен
      }
    }

    const q = normalizeInput(txt);
    const r = await client.responses.create({
      model: 'gpt-5-mini',
      input: `Отвечай кратко и по делу. Вопрос: ${q}`
    });
    await ctx.reply((r.output_text || '').slice(0, 4000));
  } catch (err) {
    console.error(err);
    await ctx.reply('Упс, произошла ошибка. Попробуйте ещё раз.');
  }
});

bot.launch();
console.log('✅ Bot started (long-polling)');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
