// Простая заглушка клиента Laximo: подключите реальные эндпоинты из вашей документации.
import axios from 'axios';

const BASE = process.env.LAXIMO_BASE_URL;
const LOGIN = process.env.LAXIMO_LOGIN;
const PASSWORD = process.env.LAXIMO_PASSWORD;
const API_KEY = process.env.LAXIMO_API_KEY;

async function post(path, payload) {
  if (!BASE) throw new Error('LAXIMO_BASE_URL не задан');
  const body = { ...payload };
  if (API_KEY) body.apiKey = API_KEY;
  if (LOGIN) body.login = LOGIN;
  if (PASSWORD) body.password = PASSWORD;
  const { data } = await axios.post(`${BASE}${path}`, body, { timeout: 5000 });
  return data;
}

export async function partByOEM(oem) {
  if (!BASE) return null; // если нет настроек — тихо выходим
  try {
    // Замените '/doc/by-oem' на реальный путь из ваших доков Laximo
    const data = await post('/doc/by-oem', { oem });
    return data;
  } catch (e) {
    return null;
  }
}
