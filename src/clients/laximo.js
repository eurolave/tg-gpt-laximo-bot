// src/clients/laximo.js
// SOAP-клиент для Laximo CAT (FindVehicle → ListUnits → ListDetailByUnit)
// Экспорт под ваш текущий код: searchByVIN, partsByAssembly, partByOEM, crossesByOEM

import soap from 'soap';
import axios from 'axios';

const WSDL_URL = process.env.LAXIMO_WSDL_URL;              // …CatalogHttpSoap11Endpoint?wsdl
const SOAP_ENDPOINT = process.env.LAXIMO_SOAP_ENDPOINT || ''; // опц.: …CatalogHttpSoap11Endpoint (без ?wsdl)
const LOGIN = process.env.LAXIMO_LOGIN || '';
const PASSWORD = process.env.LAXIMO_PASSWORD || '';

const DEF_CATEGORY = process.env.LAXIMO_DEFAULT_CATEGORY ?? '0';
const DEF_GROUP    = process.env.LAXIMO_DEFAULT_GROUP ?? '1';

// (опц.) REST-доки для OEM/кроссов (если хотите использовать DOC через HTTP)
const DOC_BASE = process.env.LAXIMO_DOC_BASE_URL || '';
const PATH_PART_BY_OEM    = process.env.LAXIMO_PATH_PART_BY_OEM    || '/doc/partByOem';
const PATH_CROSSES_BY_OEM = process.env.LAXIMO_PATH_CROSSES_BY_OEM || '/doc/crosses';

// ===== SOAP client singleton =====
let _client = null;
async function getClient() {
  if (_client) return _client;

  if (!WSDL_URL) throw new Error('LAXIMO_WSDL_URL is not set');

  const options = {
    endpoint: SOAP_ENDPOINT || undefined,  // если нужно принудительно задать HTTP-адрес
    wsdl_headers: { 'User-Agent': 'tg-gpt-laximo-bot/soap' },
    wsdl_options: {}
  };

  const client = await soap.createClientAsync(WSDL_URL, options);

  // Basic-авторизация (если нужна)
  if (LOGIN && PASSWORD) {
    client.setSecurity(new soap.BasicAuthSecurity(LOGIN, PASSWORD));
  }

  // Диагностика: какие методы доступны
  try {
    const desc = client.describe();
    console.log('ℹ️ Laximo SOAP methods:', JSON.stringify(desc, null, 2).slice(0, 2000));
  } catch {}

  _client = client;
  return client;
}

// Вспомогательная: вызвать метод с перебором вариантов имён аргументов
async function callSoap(methodName, variants) {
  const client = await getClient();

  // Попробуем вызвать метод разными наборами аргументов
  let lastErr = null;
  for (const args of variants) {
    try {
      const [res] = await client[`${methodName}Async`](args);
      return res;
    } catch (e) {
      lastErr = e;
      console.error(`[SOAP_CALL_FAIL] ${methodName} args=`, args, ' message=', e?.message);
    }
  }
  // Если ни один вариант не подошёл — бросаем последнюю ошибку
  throw lastErr || new Error(`SOAP ${methodName} failed`);
}

// ===== Нормализация =====
function normVehicle(raw) {
  // В разных инсталляциях ответ может оборачиваться по-разному.
  const v =
    raw?.vehicle || raw?.row || (Array.isArray(raw) ? raw[0] : raw) ||
    raw?.FindVehicleResult || raw?.return || raw;

  return {
    vehicleid: String(v?.vehicleid ?? v?.VehicleId ?? v?.id ?? ''),
    ssd:       String(v?.ssd ?? v?.SSD ?? ''),
    catalog:   String(v?.catalog ?? v?.Catalog ?? ''),
    brand:     String(v?.brand ?? v?.Brand ?? ''),
    name:      String(v?.name ?? v?.Name ?? '')
  };
}

function normUnits(raw) {
  const list =
    raw?.units || raw?.rows || raw?.ListUnitsResult || raw?.return ||
    (Array.isArray(raw) ? raw : []);
  const arr = Array.isArray(list) ? list : (list?.unit || list?.row || []);
  return (Array.isArray(arr) ? arr : [arr]).map(r => ({
    id:   String(r?.unitid ?? r?.id ?? r?.code ?? r?.UnitId ?? '').trim(),
    name: String(r?.name ?? r?.Name ?? r?.title ?? '').trim()
  })).filter(x => x.id);
}

function normParts(raw) {
  const list =
    raw?.items || raw?.rows || raw?.ListDetailByUnitResult || raw?.return ||
    (Array.isArray(raw) ? raw : []);
  const arr = Array.isArray(list) ? list : (list?.item || list?.row || []);
  return (Array.isArray(arr) ? arr : [arr]).map(p => ({
    oem:   String(p?.oem ?? p?.OEM ?? p?.code ?? p?.partnumber ?? p?.PartNumber ?? '').trim(),
    brand: String(p?.brand ?? p?.Brand ?? p?.maker ?? '').trim(),
    name:  String(p?.name ?? p?.Name ?? p?.title ?? '').trim()
  })).filter(p => p.oem);
}

// ===== Временный контекст последнего VIN (для совместимости с текущим actions.js) =====
let lastVinCtx = { catalog: '', ssd: '' };

// ===== Публичные функции под ваш текущий код =====

/**
 * searchByVIN(vin):
 * 1) SOAP FindVehicle(vin)
 * 2) SOAP ListUnits(catalog, ssd, category, group)
 * Возвращает: { vehicle, assemblies }
 * и запоминает {catalog, ssd} для partsByAssembly().
 */
export async function searchByVIN(vin) {
  // Поменяем регистр аргументов, если метод чувствителен
  const fvRaw = await callSoap('FindVehicle', [{ vin }, { Vin: vin }, { VIN: vin }]);
  const vehicle = normVehicle(fvRaw);

  if (!vehicle?.catalog || !vehicle?.ssd) {
    console.warn('FindVehicle returned no catalog/ssd:', fvRaw);
    return { vehicle, assemblies: [] };
  }

  lastVinCtx = { catalog: vehicle.catalog, ssd: vehicle.ssd };

  const luRaw = await callSoap('ListUnits', [
    { catalog: vehicle.catalog, ssd: vehicle.ssd, category: DEF_CATEGORY, group: DEF_GROUP },
    { Catalog: vehicle.catalog, ssd: vehicle.ssd, Category: DEF_CATEGORY, Group: DEF_GROUP },
    { catalog: vehicle.catalog, SSD: vehicle.ssd, category: DEF_CATEGORY, group: DEF_GROUP }
  ]);
  const assemblies = normUnits(luRaw);

  return { vehicle, assemblies };
}

/**
 * partsByAssembly(assemblyId):
 * Использует {catalog, ssd} из последнего searchByVIN().
 * SOAP ListDetailByUnit(unitid, catalog, ssd)
 * Возвращает: { items }
 */
export async function partsByAssembly(assemblyId) {
  if (!lastVinCtx?.catalog || !lastVinCtx?.ssd) {
    throw new Error('VIN context is empty — call searchByVIN() first');
  }
  const lduRaw = await callSoap('ListDetailByUnit', [
    { unitid: assemblyId, catalog: lastVinCtx.catalog, ssd: lastVinCtx.ssd },
    { UnitId: assemblyId, Catalog: lastVinCtx.catalog, SSD: lastVinCtx.ssd },
    { unitId: assemblyId, catalog: lastVinCtx.catalog, ssd: lastVinCtx.ssd }
  ]);
  const items = normParts(lduRaw);
  return { items };
}

// ===== DOC (OEM) — опционально через REST (если настроили DOC_BASE) =====
async function httpGet(base, path, params) {
  const url = `${base}${path}`;
  const { data } = await axios.get(url, { params, timeout: 12000 });
  return data;
}

export async function partByOEM(oem) {
  if (!DOC_BASE) throw new Error('DOC REST is not configured (set LAXIMO_DOC_BASE_URL)');
  const raw = await httpGet(DOC_BASE, PATH_PART_BY_OEM, { oem });
  const p = Array.isArray(raw) ? raw[0] : raw;
  if (!p) return null;
  return {
    oem:   String(p?.oem ?? p?.code ?? oem),
    brand: String(p?.brand ?? p?.maker ?? ''),
    name:  String(p?.name ?? p?.title ?? '')
  };
}

export async function crossesByOEM(oem) {
  if (!DOC_BASE) throw new Error('DOC REST is not configured (set LAXIMO_DOC_BASE_URL)');
  const raw = await httpGet(DOC_BASE, PATH_CROSSES_BY_OEM, { oem });
  const arr = Array.isArray(raw) ? raw : (raw?.crosses || raw?.rows || []);
  const list = (Array.isArray(arr) ? arr : [arr]).map(c => ({
    oem:   String(c?.oem ?? c?.code ?? ''),
    brand: String(c?.brand ?? c?.maker ?? ''),
    name:  String(c?.name ?? c?.title ?? '')
  })).filter(c => c.oem);
  return { crosses: list };
}
