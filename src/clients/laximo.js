// src/clients/laximo.js
import axios from 'axios';

const BASE = process.env.LAXIMO_BASE_URL;       // например: https://api.laximo.ru
const LOGIN = process.env.LAXIMO_LOGIN;
const PASSWORD = process.env.LAXIMO_PASSWORD;
const API_KEY = process.env.LAXIMO_API_KEY;

function authPayload() {
  const a = {};
  if (API_KEY) a.apiKey = API_KEY;
  if (LOGIN) a.login = LOGIN;
  if (PASSWORD) a.password = PASSWORD;
  return a;
}

async function post(path, payload = {}, timeout = 5000) {
  if (!BASE) throw new Error('LAXIMO_BASE_URL is not set');
  const url = `${BASE}${path}`;
  const body = { ...authPayload(), ...payload };
  const { data } = await axios.post(url, body, { timeout });
  return data;
}

/** VIN → узлы (assemblies) */
export async function searchByVIN(vin) {
  // Уточните путь в вашей документации, это пример
  const data = await post('/search/vin', { vin });
  // Приведём к нормальной форме:
  // Ожидаем data.assemblies = [{ id, name }]
  if (!data) return { assemblies: [] };
  return {
    assemblies: (data.assemblies || data || []).map(a => ({
      id: a.id || a.assemblyId || a.code,
      name: a.name || a.title || `Узел ${a.id}`
    }))
  };
}

/** Узел → детали (parts) */
export async function partsByAssembly(assemblyId) {
  // Уточните путь/параметры. Пример:
  const data = await post('/assemblies/parts', { assemblyId });
  // Ожидаем data.items = [{ oem, brand, name }]
  const items = (data.items || data || []).map(p => ({
    oem: p.oem || p.code || p.partNumber,
    brand: p.brand || p.maker || '',
    name: p.name || p.title || ''
  })).filter(p => p.oem);
  return { items };
}

/** OEM → карточка */
export async function partByOEM(oem) {
  const data = await post('/doc/by-oem', { oem });
  if (!data) return null;
  // Возьмём первую запись
  const p = Array.isArray(data) ? data[0] : data;
  return {
    oem: p.oem || p.code || oem,
    brand: p.brand || p.maker || '',
    name: p.name || p.title || ''
  };
}

/** OEM → аналоги/кроссы */
export async function crossesByOEM(oem) {
  const data = await post('/doc/crosses', { oem });
  const list = (data.crosses || data || []).map(c => ({
    oem: c.oem || c.code,
    brand: c.brand || c.maker || '',
    name: c.name || ''
  })).filter(c => c.oem);
  return { crosses: list };
}
