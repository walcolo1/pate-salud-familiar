/**
 * Bloque M2 · la hoja con la que habla ahora este navegador, para la cuenta
 * que está dentro. Un solo sitio para la sesión, el canje del ticket y el
 * registro, para que no vuelvan a mirar almacenes distintos (G4b).
 */

import { getActiveUser } from '../data/persistence';
import { urlBackendPorDefecto } from './invitacionEntrante';
import { resolverHoja, type HojaResuelta } from './hojaPorCuenta';

/** El `sub` de Google de la cuenta activa, o `null` (demostración o nadie). */
export function subActivo(): string | null {
  const u = getActiveUser();
  return u && u !== 'demo' && u.provider === 'google' && u.googleId ? u.googleId : null;
}

export function hojaActual(): HojaResuelta {
  if (typeof window === 'undefined') return { url: null, origen: null };
  return resolverHoja(window.localStorage, subActivo(), urlBackendPorDefecto());
}

export function urlBackendActual(): string | null {
  return hojaActual().url;
}
