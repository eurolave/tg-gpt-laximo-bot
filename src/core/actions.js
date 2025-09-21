// src/core/actions.js
// Экшены флоу: VIN → Units → Parts + OEM-поиск
import {
  findVehicleByVIN,
  listUnits,
  listPartsByUnit,
  partByOEM,
  crossesByOEM
} from '../clients/laximo.js';

export async function runAction(actionName, ctx, session) {
  switch (actionName) {
    // 1) VIN → получить vehicle + список узлов (assemblies)
    case 'getAssembliesByVIN': {
      const vin = session.data.vin;
      if (!vin) throw new Error('VIN is empty');

      const v = await findVehicleByVIN(vin);
      if (!v?.ssd || !v?.catalog) {
        throw new Error('FindVehicle: missing ssd/catalog in response');
      }

      // Сохраняем контекст для следующих шагов (важно!)
      session.data.vehicle = {
        vehicleid: v.vehicleid || '',
        catalog:   v.catalog,
        ssd:       v.ssd,
        brand:     v.brand || '',
        name:      v.name || ''
      };

      // Получаем узлы по catalog+ssd
      const units = await listUnits(v.catalog, v.ssd);
      return units; // { assemblies: [...] }
    }

    // 2) По выбранному узлу → детали
    case 'getPartsByAssembly': {
      const cb = session.lastCallback || '';
      const asmId = cb.startsWith('asm:') ? cb.slice(4) : '';
      if (!asmId) throw new Error('assemblyId not found in callback');

      const vehicle = session.data.vehicle || {};
      if (!vehicle?.catalog || !vehicle?.ssd) {
        throw new Error('vehicle catalog/ssd missing in session');
      }

      return await listPartsByUnit(asmId, vehicle.catalog, vehicle.ssd); // { items: [...] }
    }

    // OEM → карточка
    case 'getPartByOEM': {
      const oem = session.data.oem;
      if (!oem) throw new Error('OEM is empty');
      return await partByOEM(oem);
    }

    // OEM → аналоги
    case 'getCrossesByOEM': {
      const last = session.lastCallback || '';
      const oem = last.startsWith('x:') ? last.slice(2) : (session.data.oem || '');
      if (!oem) throw new Error('OEM is empty');
      return await crossesByOEM(oem);
    }

    // Добавить в корзину (демо; замените на БД)
    case 'addToCart': {
      const last = session.lastCallback || '';
      const oem = last.startsWith('cart:') ? last.slice(5) : (session.data.oem || '');
      session.data.cart = [...(session.data.cart || []), { oem, qty: 1 }];
      return { ok: true, oem };
    }

    default:
      throw new Error('Unknown action: ' + actionName);
  }
}
