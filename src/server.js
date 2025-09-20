import 'dotenv/config';
import express from 'express';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { normalizeInput } from './utils.js';
import { partByOEM } from './clients/laximo.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

bot.on('text', async (ctx) => {
  const txt = (ctx.message?.text || '').trim();
  try {
    if (/^[A-Za-z0-9._-]{3,}$/.test(txt)) {
      try {
        const p = await partByOEM(txt);
        if (p) {
          await ctx.reply(`Карточка по OEM ${txt} (демо):\n` + JSON.stringify(p).slice(0, 3500));
          return;
        }
      } catch (e) {}
    }
    const q = normalizeInput(txt);
    const r = await client.responses.create({
      model: 'gpt-5-mini',
      input: `Отвечай кратко и по делу. Вопрос: ${q}`
    });
    await ctx.reply((r.output_text || '').slice(0, 4000));
  } catch (err) {
    console.error(err);
    await ctx.reply('Упс, ошибка. Попробуйте ещё раз.');
  }
});

const app = express();
app.use(express.json());

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
