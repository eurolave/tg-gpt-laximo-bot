// src/clients/laximo.js
// Экспортирует ИМЕННО эти функции: searchByVIN, partsByAssembly, partByOEM, crossesByOEM
// Внутри использует CAT: FindVehicle -> ListUnits -> ListDetailByUnit

import axios from 'axios';

const BASE = process.env.LAXIMO_BASE_URL;           // напр.: https://api.your-laximo.host
const API_KEY = process.env.LAXIMO_API_KEY;
const LOGIN = process.env.LAXIMO_LOGIN;
const PASSWORD = process.env.LAXIMO_PASSWORD;

// auth: 'header' (Bearer), 'basic' (login:password), 'body' (в тело POST)
const AUTH_MODE = (process.env.LAXIMO_AUTH_MODE || 'header').toLowerCase();
// метод обращения к вашему шлюзу: CAT чаще get, но оставим выбор
const METHOD = (process.env.LAXIMO_METHOD || 'get').toLowerCase();

// пути (при необходимости можно переопределить через ENV)
const PATH_FINDVEHICLE    = process.env.LAXIMO_PATH_FINDVEHICLE    || '/cat/FindVehicle';
const PATH_LIST_UNITS     = process.env.LAXIMO_PATH_LIST_UNITS     || '/cat/ListUnits';
const PATH_LIST_PARTS     = process.env.LAXIMO_PATH_LIST_PARTS     || '/cat/ListDetailByUnit';
const PATH_PART_BY_OEM    = process.env.LAXIMO_PATH_PART_BY_OEM    || '/doc/partByOem';
const PATH_CROSSES_BY_OEM = process.env.LAXIMO_PATH_CROSSES_BY_OEM || '/doc/crosses';

// дефолты, которые часто требуются ListUnits
const DEF_CATEGORY = process.env.LAXIMO_DEFAULT_CATEGORY ?? '0';
const DEF_GROUP    = process.env.LAXIMO_DEFAULT_GROUP ?? '1';

function headers() {
  const h = { 'User-Agent': 'tg-gpt-laximo-bot/1.0' };
  if (AUTH_MODE === 'header' && API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  if (AUTH_MODE === 'basic' && LOGIN && PASSWORD) {
    h.Authorization = 'Basic ' + Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64');
  }
  return h;
}
function body(extra = {}) {
  if (AUTH_MODE === 'body') {
    return { ...(API_KEY ? { apiKey: API_KEY } : {}), ...(LOGIN ? { login: LOGIN } : {}), ...(PASSWORD ? { password: PASSWORD } : {}), ...extra };
  }
  return extra;
}
async function callGet(path, params) {
  if (!BASE) throw new Error('LAXIMO_BASE_URL is not set');
  const url = `${BASE}${path}`;
  try {
    const { data } = await axios.get(url, { params, headers: headers(), timeout: 12000 });
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
    const { data } = await axios.post(url, body(payload), { headers: headers(), timeout: 12000 });
    return data;
  } catch (e) {
    console.error('[LAXIMO_POST_ERROR]', url, 'payload=', payload, 'status=', e.response?.status, 'data=', e.response?.data);
    throw e;
  }
}
const call = (path, paramsOrBody) => (METHOD === 'get' ? callGet(path, paramsOrBody) : callPost(path, paramsOrBody));

// ===== Нормализация ответов CAT/DOC =====
function normVehicle(raw) {
  const v = Array.isArray(raw) ? raw[0] : (raw?.vehicle || raw?.row || raw);
  return {
    vehicleid: String(v?.vehicleid ?? v?.VehicleId ?? v?.id ?? ''),
    ssd:       String(v?.ssd ?? v?.SSD ?? ''),
    catalog:   String(v?.catalog ?? v?.Catalog ?? ''),
    brand:     String(v?.brand ?? v?.Brand ?? ''),
    name:      String(v?.name ?? v?.Name ?? '')
  };
}
function normUnits(raw) {
  const rows = Array.isArray(raw) ? raw : (raw?.units || raw?.rows || []);
  return rows.map(r => ({
    id:   String(r?.unitid ?? r?.id ?? r?.code ?? r?.UnitId ?? ''),
    name: String(r?.name ?? r?.Name ?? r?.title ?? '')
  })).filter(a => a.id);
}
function normParts(raw) {
  const rows = Array.isArray(raw) ? raw : (raw?.items || raw?.rows || []);
  return rows.map(p => ({
    oem:   String(p?.oem ?? p?.OEM ?? p?.code ?? p?.partnumber ?? p?.PartNumber ?? ''),
    brand: String(p?.brand ?? p?.Brand ?? p?.maker ?? ''),
    name:  String(p?.name ?? p?.Name ?? p?.title ?? '')
  })).filter(p => p.oem);
}
function normCrosses(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.crosses || raw?.rows || []);
  return arr.map(c => ({
    oem:   String(c?.oem ?? c?.code ?? ''),
    brand: String(c?.brand ?? c?.maker ?? ''),
    name:  String(c?.name ?? c?.title ?? '')
  })).filter(c => c.oem);
}

// ===== Модульный контекст последнего VIN (MVP для совместимости с текущим actions.js) =====
let lastVinCtx = { catalog: '', ssd: '' };

// ===== Экспорты под ВАШИ текущие импорты =====

/**
 * searchByVIN(vin) — делает FindVehicle + ListUnits и возвращает:
 * { vehicle: {vehicleid, catalog, ssd, brand, name}, assemblies: [{id,name}...] }
 * + сохраняет catalog/ssd в lastVinCtx для следующего partsByAssembly().
 */
export async function searchByVIN(vin) {
  const vehicle = normVehicle(await call(PATH_FINDVEHICLE, { vin }));
  if (!vehicle?.ssd || !vehicle?.catalog) {
    return { vehicle, assemblies: [] };
  }
  // запоминаем контекст
  lastVinCtx = { catalog: vehicle.catalog, ssd: vehicle.ssd };

  const assemblies = normUnits(
    await call(PATH_LIST_UNITS, { catalog: vehicle.catalog, ssd: vehicle.ssd, category: DEF_CATEGORY, group: DEF_GROUP })
  );
  return { vehicle, assemblies };
}

/**
 * partsByAssembly(assemblyId) — берёт unit из аргумента и использует
 * последний VIN-контекст (catalog+ssd), сохранённый в searchByVIN().
 * Возвращает { items: [...] }.
 */
export async function partsByAssembly(assemblyId) {
  if (!lastVinCtx?.ssd || !lastVinCtx?.catalog) {
    throw new Error('VIN context is empty — call searchByVIN() before partsByAssembly()');
  }
  const items = normParts(
    await call(PATH_LIST_PARTS, { unitid: assemblyId, catalog: lastVinCtx.catalog, ssd: lastVinCtx.ssd })
  );
  return { items };
}

// ===== DOC (OEM) =====

export async function partByOEM(oem) {
  const raw = await call(PATH_PART_BY_OEM, { oem });
  const p = Array.isArray(raw) ? raw[0] : raw;
  if (!p) return null;
  return {
    oem:   String(p?.oem ?? p?.code ?? oem),
    brand: String(p?.brand ?? p?.maker ?? ''),
    name:  String(p?.name ?? p?.title ?? '')
  };
}

export async function crossesByOEM(oem) {
  const list = normCrosses(await call(PATH_CROSSES_BY_OEM, { oem }));
  return { crosses: list };
}

// ===== Дополнительно экспортируем «новые» имена (на будущее) =====
export async function findVehicleByVIN(vin) { return normVehicle(await call(PATH_FINDVEHICLE, { vin })); }
export async function listUnits(catalog, ssd, category = DEF_CATEGORY, group = DEF_GROUP) {
  return { assemblies: normUnits(await call(PATH_LIST_UNITS, { catalog, ssd, category, group })) };
}
export async function listPartsByUnit(unitid, catalog, ssd) {
  return { items: normParts(await call(PATH_LIST_PARTS, { unitid, catalog, ssd })) };
}
