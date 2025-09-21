// src/clients/laximo.js
// Клиент Laximo (CAT/DOC) для Node-бота: FindVehicle → ListUnits → ListDetailByUnit + OEM-поиск
import axios from 'axios';

const BASE = process.env.LAXIMO_BASE_URL;           // напр.: https://api.your-laximo.host
const API_KEY = process.env.LAXIMO_API_KEY;
const LOGIN = process.env.LAXIMO_LOGIN;
const PASSWORD = process.env.LAXIMO_PASSWORD;

// способ авторизации: 'header' (Bearer), 'basic' (login:password), 'body' (в теле POST)
const AUTH_MODE = (process.env.LAXIMO_AUTH_MODE || 'header').toLowerCase();
// CAT чаще GET, но поддержим и POST на случай прокси/обёрток
const METHOD = (process.env.LAXIMO_METHOD || 'get').toLowerCase();

// пути (можно переопределить через ENV под вашу инсталляцию)
const PATH_FINDVEHICLE    = process.env.LAXIMO_PATH_FINDVEHICLE    || '/cat/FindVehicle';
const PATH_LIST_UNITS     = process.env.LAXIMO_PATH_LIST_UNITS     || '/cat/ListUnits';
const PATH_LIST_PARTS     = process.env.LAXIMO_PATH_LIST_PARTS     || '/cat/ListDetailByUnit';
const PATH_PART_BY_OEM    = process.env.LAXIMO_PATH_PART_BY_OEM    || '/doc/partByOem';
const PATH_CROSSES_BY_OEM = process.env.LAXIMO_PATH_CROSSES_BY_OEM || '/doc/crosses';

// дефолтные параметры для ListUnits (часто нужны)
const DEF_CATEGORY = process.env.LAXIMO_DEFAULT_CATEGORY ?? '0';
const DEF_GROUP    = process.env.LAXIMO_DEFAULT_GROUP ?? '1';

function buildHeaders() {
  const h = { 'User-Agent': 'tg-gpt-laximo-bot/1.0' };
  if (AUTH_MODE === 'header' && API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  if (AUTH_MODE === 'basic' && LOGIN && PASSWORD) {
    h.Authorization = 'Basic ' + Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64');
  }
  return h;
}
function buildBody(extra = {}) {
  if (AUTH_MODE === 'body') {
    return { ...(API_KEY ? { apiKey: API_KEY } : {}), ...(LOGIN ? { login: LOGIN } : {}), ...(PASSWORD ? { password: PASSWORD } : {}), ...extra };
  }
  return extra;
}
async function callGet(path, params) {
  if (!BASE) throw new Error('LAXIMO_BASE_URL is not set');
  const url = `${BASE}${path}`;
  try {
    const { data } = await axios.get(url, { params, headers: buildHeaders(), timeout: 12000 });
    return data;
  } catch (e) {
    console.error('[LAXIMO_GET_ERROR]', url, 'params=', params, 'status=', e.response?.status, 'data=', e.response?.data);
    throw e;
  }
}
async function callPost(path, payload) {
  if (!BASE) throw new Error('LAXIMO_BASE_URL is not set');
  const url = `${BASE}${path}`;
  try {
    const { data } = await axios.post(url, buildBody(payload), { headers: buildHeaders(), timeout: 12000 });
    return data;
  } catch (e) {
    console.error('[LAXIMO_POST_ERROR]', url, 'payload=', payload, 'status=', e.response?.status, 'data=', e.response?.data);
    throw e;
  }
}

// ===== CAT =====

// VIN → { vehicleid, ssd, catalog, brand, name }
export async function findVehicleByVIN(vin) {
  const fn = METHOD === 'get' ? callGet : callPost;
  const raw = await fn(PATH_FINDVEHICLE, { vin });

  // Нормализуем возможные варианты структуры ответа
  const v = Array.isArray(raw) ? raw[0] : (raw?.vehicle || raw?.row || raw);
  return {
    vehicleid: String(v?.vehicleid ?? v?.VehicleId ?? v?.id ?? ''),
    ssd:       String(v?.ssd ?? v?.SSD ?? ''),
    catalog:   String(v?.catalog ?? v?.Catalog ?? ''),
    brand:     String(v?.brand ?? v?.Brand ?? ''),
    name:      String(v?.name ?? v?.Name ?? '')
  };
}

// Список узлов по catalog+ssd → { assemblies:[{id,name}] }
export async function listUnits(catalog, ssd, category = DEF_CATEGORY, group = DEF_GROUP) {
  const fn = METHOD === 'get' ? callGet : callPost;
  const raw = await fn(PATH_LIST_UNITS, { catalog, ssd, category, group });

  const rows = Array.isArray(raw) ? raw : (raw?.units || raw?.rows || []);
  const assemblies = rows.map(r => ({
    id:   String(r?.unitid ?? r?.id ?? r?.code ?? r?.UnitId ?? ''),
    name: String(r?.name ?? r?.Name ?? r?.title ?? '')
  })).filter(a => a.id);
  return { assemblies };
}

// Детали по unitid + catalog + ssd → { items:[{oem,brand,name}] }
export async function listPartsByUnit(unitid, catalog, ssd) {
  const fn = METHOD === 'get' ? callGet : callPost;
  const raw = await fn(PATH_LIST_PARTS, { unitid, catalog, ssd });

  const rows = Array.isArray(raw) ? raw : (raw?.items || raw?.rows || []);
  const items = rows.map(p => ({
    oem:   String(p?.oem ?? p?.OEM ?? p?.code ?? p?.partnumber ?? p?.PartNumber ?? ''),
    brand: String(p?.brand ?? p?.Brand ?? p?.maker ?? ''),
    name:  String(p?.name ?? p?.Name ?? p?.title ?? '')
  })).filter(p => p.oem);
  return { items };
}

// ===== DOC (OEM) — по желанию

export async function partByOEM(oem) {
  const fn = METHOD === 'get' ? callGet : callPost;
  const raw = await fn(PATH_PART_BY_OEM, { oem });
  const p = Array.isArray(raw) ? raw[0] : raw;
  if (!p) return null;
  return {
    oem:   String(p?.oem ?? p?.code ?? oem),
    brand: String(p?.brand ?? p?.maker ?? ''),
    name:  String(p?.name ?? p?.title ?? '')
  };
}

export async function crossesByOEM(oem) {
  const fn = METHOD === 'get' ? callGet : callPost;
  const raw = await fn(PATH_CROSSES_BY_OEM, { oem });
  const arr = Array.isArray(raw) ? raw : (raw?.crosses || raw?.rows || []);
  const list = arr.map(c => ({
    oem:   String(c?.oem ?? c?.code ?? ''),
    brand: String(c?.brand ?? c?.maker ?? ''),
    name:  String(c?.name ?? c?.title ?? '')
  })).filter(c => c.oem);
  return { crosses: list };
}
