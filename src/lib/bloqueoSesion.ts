/**
 * Bloqueo de sesión — Paté · Salud Familiar (A6-F3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta A6-F3 el bloqueo solo dibujaba una superposición: el expediente seguía
 * íntegro en memoria y en el DOM de debajo. Este módulo aporta las piezas puras
 * del bloqueo veraz.
 *
 * EL MARCADOR PERSISTENTE
 * ───────────────────────
 * `pate:bloqueo:v1` hace que el bloqueo sobreviva a una recarga. Contiene
 * EXACTAMENTE tres campos y ninguno es identificador ni dato clínico:
 *
 *     { bloqueado: true, bloqueadoDesde: <ms>, origen: 'REAL' | 'DEMO' }
 *
 * Cualquier otra forma —campos de más, tipos erróneos, marca de tiempo ausente—
 * se considera CORRUPTA. Un marcador corrupto nunca desbloquea: se trata como
 * REAL y se envía al usuario a iniciar sesión.
 */

import type { OrigenDatos } from './origenDatos';

export const CLAVE_BLOQUEO = 'pate:bloqueo:v1';

/** Ocho horas bloqueada ⇒ cierre de sesión con purga. */
export const UMBRAL_BLOQUEO_MS = 8 * 60 * 60 * 1000;

export type AlmacenLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface MarcadorBloqueo {
  bloqueado: true;
  bloqueadoDesde: number;
  origen: OrigenDatos;
}

export type LecturaMarcador =
  | { estado: 'sin_marcador' }
  | { estado: 'valido'; marcador: MarcadorBloqueo }
  | { estado: 'corrupto' };

/** Los tres únicos campos admitidos. Cualquier extra invalida el marcador. */
const CAMPOS_MARCADOR = ['bloqueado', 'bloqueadoDesde', 'origen'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Estructuras clínicas que se vacían al bloquear
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las 16 estructuras que contienen información clínica.
 *
 * Es una lista cerrada y hay una prueba que verifica que NO incluye `user`,
 * `familyId`, `deviceId`, `pendingSyncCount`, tokens ni preferencias: vaciar de
 * más rompería la sesión o destruiría la advertencia de cambios pendientes.
 */
export const CLAVES_ESTADO_CLINICO = [
  'members',
  'healthProfiles',
  'appointments',
  'checkups',
  'vaccines',
  'exams',
  'examResults',
  'documents',
  'history',
  'reminders',
  'tasks',
  'medicalOrders',
  'medicationPrescriptions',
  'medicationDoseReminders',
  'appointmentCandidates',
  'sharedReports',
] as const;

export type ClaveEstadoClinico = (typeof CLAVES_ESTADO_CLINICO)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Ventana nocturna
// ─────────────────────────────────────────────────────────────────────────────

const ES_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutosDelDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function aMinutos(hhmm: string): number | null {
  if (!ES_HORA.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * ¿Está `minutosAhora` dentro de la ventana [inicio, fin)?
 *
 * Contempla el cruce de medianoche —`22:00`–`06:00` es la configuración por
 * defecto— y trata una ventana degenerada (inicio == fin) como vacía, no como
 * "todo el día", que sería la interpretación peligrosa.
 *
 * Horas mal formadas devuelven `false`: ante una configuración corrupta es
 * preferible no bloquear que bloquear siempre.
 */
export function estaEnVentanaNocturna(
  minutosAhora: number,
  inicio: string,
  fin: string,
): boolean {
  const i = aMinutos(inicio);
  const f = aMinutos(fin);
  if (i === null || f === null) return false;
  if (i === f) return false;
  return i > f
    ? minutosAhora >= i || minutosAhora < f // cruza medianoche
    : minutosAhora >= i && minutosAhora < f; // misma noche
}

// ─────────────────────────────────────────────────────────────────────────────
// Umbral de 8 horas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `>=` y no `>`: exactamente ocho horas bloqueada ya cierra la sesión.
 *
 * Compara marcas de tiempo en lugar de fiarse de un temporizador, para que una
 * pestaña suspendida por el navegador detecte el tiempo real transcurrido en
 * cuanto vuelve a activarse.
 */
export function superoUmbralBloqueo(desde: number | null | undefined, ahora: number): boolean {
  if (desde === null || desde === undefined) return false;
  if (!Number.isFinite(desde)) return false;
  return ahora - desde >= UMBRAL_BLOQUEO_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marcador persistente
// ─────────────────────────────────────────────────────────────────────────────

function almacenPorDefecto(): AlmacenLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Valida forma exacta: los tres campos, sus tipos, y ninguno de más. */
export function validarMarcador(entrada: unknown): MarcadorBloqueo | null {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const m = entrada as Record<string, unknown>;

  const claves = Object.keys(m);
  if (claves.length !== CAMPOS_MARCADOR.length) return null;
  for (const c of claves) {
    if (!(CAMPOS_MARCADOR as readonly string[]).includes(c)) return null;
  }

  if (m.bloqueado !== true) return null;
  if (typeof m.bloqueadoDesde !== 'number' || !Number.isFinite(m.bloqueadoDesde)) return null;
  if (m.bloqueadoDesde <= 0) return null;
  if (m.origen !== 'REAL' && m.origen !== 'DEMO') return null;

  return { bloqueado: true, bloqueadoDesde: m.bloqueadoDesde, origen: m.origen };
}

export function leerMarcadorBloqueo(store?: AlmacenLike | null): LecturaMarcador {
  const s = store ?? almacenPorDefecto();
  if (!s) return { estado: 'sin_marcador' };
  let crudo: string | null;
  try {
    crudo = s.getItem(CLAVE_BLOQUEO);
  } catch {
    return { estado: 'sin_marcador' };
  }
  if (!crudo) return { estado: 'sin_marcador' };

  let parseado: unknown;
  try {
    parseado = JSON.parse(crudo);
  } catch {
    return { estado: 'corrupto' };
  }
  const marcador = validarMarcador(parseado);
  return marcador ? { estado: 'valido', marcador } : { estado: 'corrupto' };
}

export function escribirMarcadorBloqueo(
  bloqueadoDesde: number,
  origen: OrigenDatos,
  store?: AlmacenLike | null,
): boolean {
  const s = store ?? almacenPorDefecto();
  if (!s) return false;
  const marcador: MarcadorBloqueo = { bloqueado: true, bloqueadoDesde, origen };
  try {
    s.setItem(CLAVE_BLOQUEO, JSON.stringify(marcador));
    return true;
  } catch {
    return false;
  }
}

/** Solo se borra tras una restauración correcta o un cierre seguro. */
export function borrarMarcadorBloqueo(store?: AlmacenLike | null): void {
  const s = store ?? almacenPorDefecto();
  if (!s) return;
  try {
    s.removeItem(CLAVE_BLOQUEO);
  } catch {
    /* sin efecto */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisión de arranque
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionArranque =
  /** No había bloqueo: arranque normal. */
  | { accion: 'arrancar_normal' }
  /** Bloqueo vigente: mostrar la superposición sin cargar datos clínicos. */
  | { accion: 'seguir_bloqueado'; origen: OrigenDatos }
  /** Superó las 8 horas: cerrar sesión con purga. */
  | { accion: 'cerrar_sesion' }
  /** Marcador ilegible: ni se desbloquea ni se adivina. A iniciar sesión. */
  | { accion: 'ir_a_login' };

/**
 * Qué hacer al arrancar la aplicación, según el marcador persistente.
 * Función pura para poder probar los cuatro caminos sin navegador.
 */
export function decidirArranque(lectura: LecturaMarcador, ahora: number): DecisionArranque {
  if (lectura.estado === 'sin_marcador') return { accion: 'arrancar_normal' };
  if (lectura.estado === 'corrupto') return { accion: 'ir_a_login' };
  if (superoUmbralBloqueo(lectura.marcador.bloqueadoDesde, ahora)) {
    return { accion: 'cerrar_sesion' };
  }
  return { accion: 'seguir_bloqueado', origen: lectura.marcador.origen };
}
