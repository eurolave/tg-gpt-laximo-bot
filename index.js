import 'dotenv/config';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

bot.start((ctx) => ctx.reply('Привет! Спроси меня что-нибудь.'));
bot.on('text', async (ctx) => {
  const r = await client.responses.create({
    model: 'gpt-5-mini',
    input: `Отвечай кратко и по делу. Вопрос: ${ctx.message.text}`
  });
  await ctx.reply((r.output_text || '').slice(0, 4000));
});

bot.launch();
console.log('Bot started (long-polling)');
