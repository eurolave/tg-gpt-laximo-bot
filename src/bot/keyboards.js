import { Markup } from 'telegraf';

export const mainMenu = () =>
  Markup.keyboard([
    ['🔎 Подбор по VIN', '🧩 Поиск по OEM'],
    ['🤖 Вопрос к GPT', '🛒 Корзина'],
    ['ℹ️ Помощь']
  ]).resize().persistent();

export const backMenu = () =>
  Markup.keyboard([['⬅️ В меню']]).resize();

export const partActions = (oem) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔁 Аналоги', `analogs:${oem}`)],
    [Markup.button.callback('🛒 В корзину', `cart:${oem}`)]
  ]);
