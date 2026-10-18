/**
 * Bloque M2 · con qué hoja habla cada cuenta en este navegador.
 *
 * EL FALLO
 * ────────
 * La dirección vivía en una sola clave (`pate:familia:v1`) para todo el
 * navegador. Si la segunda cuenta de una familia —o alguien de otra familia—
 * entraba en el mismo navegador, hablaba con la hoja de la primera, y la
 * dirección por defecto (Bloque L) tapaba la que traía su enlace `?hoja=`.
 *
 * LA REGLA
 * ────────
 * - Cada cuenta tiene su hoja, guardada bajo una huella de la cuenta: nunca el
 *   correo ni el identificador en claro.
 * - `pate:familia:v1` sigue siendo «la última hoja registrada aquí» (la usan
 *   la invitación, la purga y las pruebas). Lleva un **dueño**: la primera
 *   cuenta que entra la adopta, y desde entonces no se la presta a otra.
 * - Un `?hoja=` abierto antes de entrar se guarda sin dueño y lo adopta la
 *   cuenta que entra a continuación.
 * - La dirección por defecto solo vale para una cuenta sin hoja propia.
 */

import { CLAVE_SESION_FAMILIAR, esUrlBackendValida, type AlmacenSimple } from './invitacionEntrante';

export const CLAVE_HOJAS_POR_CUENTA = 'pate:hojas:v1';

export type OrigenHoja = 'cuenta' | 'sin-dueno' | 'defecto';

export interface HojaResuelta {
  url: string | null;
  origen: OrigenHoja | null;
}

interface Registro {
  v: 1;
  /** Aleatoria por navegador: la misma cuenta da huellas distintas en dos equipos. */
  sal: string;
  /** huella de la cuenta → su /exec */
  cuentas: Record<string, string>;
  /** De quién es la `pate:familia:v1` actual. Sin él, la adopta la próxima cuenta. */
  legadoDe?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Huella síncrona
// ─────────────────────────────────────────────────────────────────────────────

/**
 * cyrb53, dos veces con semillas distintas: 106 bits, síncrono.
 *
 * Síncrono porque la dirección se pide en cada petición y no puede esperar a
 * WebCrypto. No protege un secreto —el identificador de Google no lo es—: solo
 * evita dejar en claro de quién es cada hoja.
 */
function cyrb53(texto: string, semilla: number): string {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function huellaDeCuentaSincrona(sal: string, sub: string): string {
  const base = `${sal}:${sub}`;
  return cyrb53(base, 1) + cyrb53(base, 7919);
}

function salNueva(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro
// ─────────────────────────────────────────────────────────────────────────────

function leerRegistro(almacen: AlmacenSimple): Registro {
  try {
    const r = JSON.parse(almacen.getItem(CLAVE_HOJAS_POR_CUENTA) || 'null') as Registro | null;
    if (r && r.v === 1 && typeof r.sal === 'string' && r.cuentas && typeof r.cuentas === 'object') return r;
  } catch {
    /* corrupto: se empieza de cero */
  }
  return { v: 1, sal: salNueva(), cuentas: {} };
}

function escribirRegistro(almacen: AlmacenSimple, r: Registro): void {
  try {
    almacen.setItem(CLAVE_HOJAS_POR_CUENTA, JSON.stringify(r));
  } catch {
    /* sin almacenamiento: la sesión sigue, solo no se recuerda */
  }
}

function leerLegado(almacen: AlmacenSimple): string | null {
  try {
    const v = almacen.getItem(CLAVE_SESION_FAMILIAR);
    return esUrlBackendValida(v) ? String(v).trim() : null;
  } catch {
    return null;
  }
}

/**
 * La hoja de esta cuenta, o la que le toca.
 *
 * Con `sub`: la suya; si no tiene, adopta la `pate:familia:v1` sin dueño; si
 * esa es de otra cuenta, no la toca y cae al defecto. Sin `sub` (antes de
 * entrar): la última registrada, o el defecto.
 */
export function resolverHoja(
  almacen: AlmacenSimple | null | undefined,
  sub: string | null | undefined,
  defecto: string | null,
): HojaResuelta {
  if (!almacen) return { url: defecto, origen: defecto ? 'defecto' : null };

  const legado = leerLegado(almacen);

  if (sub) {
    const r = leerRegistro(almacen);
    const h = huellaDeCuentaSincrona(r.sal, sub);
    const propia = r.cuentas[h];
    if (esUrlBackendValida(propia)) return { url: propia, origen: 'cuenta' };

    if (legado && (!r.legadoDe || r.legadoDe === h)) {
      r.cuentas[h] = legado;
      r.legadoDe = h;
      escribirRegistro(almacen, r);
      return { url: legado, origen: 'cuenta' };
    }
    return { url: defecto, origen: defecto ? 'defecto' : null };
  }

  if (legado) return { url: legado, origen: 'sin-dueno' };
  return { url: defecto, origen: defecto ? 'defecto' : null };
}

/** Guarda una /exec ya comprobada: de la cuenta si la hay, sin dueño si no. */
export function guardarHojaVerificada(
  almacen: AlmacenSimple | null | undefined,
  url: string,
  sub: string | null | undefined,
): boolean {
  if (!almacen || !esUrlBackendValida(url)) return false;
  const limpia = url.trim();
  try {
    almacen.setItem(CLAVE_SESION_FAMILIAR, limpia);
  } catch {
    return false;
  }
  const r = leerRegistro(almacen);
  if (sub) {
    const h = huellaDeCuentaSincrona(r.sal, sub);
    r.cuentas[h] = limpia;
    r.legadoDe = h;
  } else {
    delete r.legadoDe;
  }
  escribirRegistro(almacen, r);
  return true;
}
