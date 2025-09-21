// src/core/orchestrator.js
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { fileURLToPath } from 'url';
import { detectIntent } from './nlu.js';
import { getSession, setSession, clearSession } from './state.js';
import { runAction } from './actions.js';
import { renderByName } from './render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем все YAML-флоу из src/flows
const flows = {};
const flowsDir = path.resolve(__dirname, '..', 'flows');
if (fs.existsSync(flowsDir)) {
  for (const fname of fs.readdirSync(flowsDir)) {
    if (fname.endsWith('.yaml') || fname.endsWith('.yml')) {
      const raw = fs.readFileSync(path.join(flowsDir, fname), 'utf-8');
      const flow = YAML.parse(raw);
      flows[flow.id] = flow;
    }
  }
} else {
  console.warn('⚠️ Папка src/flows не найдена — сценарии не будут загружены.');
}

// Переход по состояниям (внутренняя функция)
async function proceed(ctx, session) {
  const flow = flows[session.flow];
  if (!flow) { await clearSession(ctx.from.id); return; }
  const state = flow.states[session.state];
  if (!state) { await clearSession(ctx.from.id); return; }

  // Если ожидаем текст (vin/oem) — просто показываем prompt и ждём следующий апдейт
  if (state.expect === 'vin' || state.expect === 'oem') {
    if (state.prompt) await ctx.reply(state.prompt);
    await setSession(ctx.from.id, session);
    return;
  }

  // Action (вызовы Laximo и т.п.)
  if (state.action) {
    if (state.loading) await ctx.reply(state.loading);
    try {
      const result = await runAction(state.action, ctx, session);
      session.data = { ...(session.data || {}), [state.action]: result };
    } catch (e) {
      console.error('action error:', e?.message || e);
      if (state.on_error) await ctx.reply(state.on_error);
      return;
    }
  }

  // Render (списки, карточки, кнопки)
  if (state.render) {
    await renderByName(state.render, ctx, session);
  }

  // Переходим далее (если нет ветвлений)
  if (state.next && !state.branches) {
    session.state = state.next;
    await setSession(ctx.from.id, session);
    return proceed(ctx, session);
  }

  await setSession(ctx.from.id, session);
}

// Экспорт 1: обработка текстовых сообщений
export async function handleUserText(ctx) {
  const userId = ctx.from.id;
  let session = await getSession(userId);
  const text = (ctx.message?.text || '').trim();

  // Если сессии нет — определить интент и стартовать нужный flow
  if (!session?.flow) {
    const intent = detectIntent(text);
    const flow =
      intent === 'VIN' ? flows['vin_flow'] :
      intent === 'OEM' ? flows['oem_flow'] :
      null;

    if (!flow) return false; // не наш кейс — пусть обработает GPT

    session = { flow: flow.id, state: flow.entry, data: {} };
    await setSession(userId, session);
  }

  // Если текущее состояние ожидает текст — валидируем и двигаемся дальше
  const flow = flows[session.flow];
  const state = flow.states[session.state];

  if (state?.expect === 'vin' || state?.expect === 'oem') {
    if (state.validate?.regex) {
      const re = new RegExp(state.validate.regex, 'i');
      if (!re.test(text)) {
        if (state.validate.on_fail) await ctx.reply(state.validate.on_fail);
        return true;
      }
    }
    // Сохраняем ввод и переходим к next
    session.data = session.data || {};
    session.data[state.expect] = text;
    session.state = state.next || session.state;
    await setSession(userId, session);
    await proceed(ctx, session);
    return true;
  }

  // Иначе — не вмешиваемся (пусть GPT ответит)
  return false;
}

// Экспорт 2: обработка инлайн-кнопок (callback_query)
export async function handleCallback(ctx) {
  const userId = ctx.from.id;
  const data = String(ctx.callbackQuery?.data || '');

  const session = await getSession(userId);
  if (!session?.flow) { try { await ctx.answerCbQuery(); } catch {}; return false; }

  const flow = flows[session.flow];
  const state = flow.states[session.state];
  if (!state) { await clearSession(userId); try { await ctx.answerCbQuery(); } catch {}; return false; }

  // Примитивный роутинг веток
  session.lastCallback = data;

  let moved = false;
  if (state.branches && Array.isArray(state.branches)) {
    for (const br of state.branches) {
      if (br.when?.startsWith('startsWith(')) {
        const needle = br.when.slice('startsWith('.length, -1).replace(/^['"]|['"]$/g, '');
        if (data.startsWith(needle)) { session.state = br.next; moved = true; break; }
      } else if (br.when?.startsWith('equals(')) {
        const needle = br.when.slice('equals('.length, -1).replace(/^['"]|['"]$/g, '');
        if (data === needle) { session.state = br.next; moved = true; break; }
      }
    }
  }
  if (!moved && state.next) {
    session.state = state.next;
  }

  await setSession(userId, session);
  await proceed(ctx, session);
  try { await ctx.answerCbQuery(); } catch {}
  return true;
}

// Экспорт 3: хелпер для явного старта флоу (/vin, /oem)
export function startFlow(flowId) {
  return async (ctx) => {
    const flow = flows[flowId];
    if (!flow) return ctx.reply('Сценарий не найден.');
    const session = { flow: flow.id, state: flow.entry, data: {} };
    await setSession(ctx.from.id, session);
    await proceed(ctx, session);
  };
}
