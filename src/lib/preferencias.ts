/**
 * Preferencias no clínicas — Paté · Salud Familiar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta A6, las preferencias de interfaz vivían DENTRO de `SavedAppState`,
 * mezcladas con el expediente clínico en la clave `pate-salud-state:{uid}`.
 * Eso hacía imposible purgar la PHI al cerrar sesión sin destruir también la
 * configuración del usuario.
 *
 * Este módulo las separa en una clave propia, por dispositivo y no por usuario,
 * que es lo único —junto al `deviceId`— que sobrevive a un cierre de sesión.
 *
 * REGLA DE ADMISIÓN, sin excepciones
 * ──────────────────────────────────
 * Aquí solo entra configuración de interfaz y de bloqueo. Nunca correo, UID,
 * familyId, memberId, rol, spreadsheetId, URLs privadas, tokens, marcas de
 * sincronización ni ningún dato clínico. La lista blanca de abajo es cerrada:
 * lo que no esté en `PREFERENCIAS_POR_DEFECTO` no se lee, no se escribe y no
 * se conserva, aunque aparezca en el almacenamiento.
 *
 * TESTABILIDAD
 * ────────────
 * Todas las funciones aceptan un almacén inyectable. En el navegador usan
 * `window.localStorage`; en las pruebas se les pasa un doble en memoria, de
 * modo que no hace falta jsdom.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Claves
// ─────────────────────────────────────────────────────────────────────────────

/** Preferencias no clínicas. Sobrevive al cierre de sesión. */
export const CLAVE_PREFERENCIAS = 'pate:prefs:v1';

/** Identificador seudónimo del dispositivo. Ya existía; se respeta. */
export const CLAVE_DEVICE_ID = 'pate_salud_device_id';

/** Marca de migración ya ejecutada, para que sea idempotente. */
export const CLAVE_MIGRACION = 'pate:prefs:migrado';

/** Prefijo de las claves de estado de sesión real desde las que se migra. */
const PREFIJO_ESTADO = 'pate-salud-state:';

/**
 * Clave de estado de la sesión demo. Se excluye deliberadamente de la
 * migración: la clave heredada equivalente se purga sin leerla (decisión de
 * A6, punto 6), y abrir datos demo para rescatar preferencias no compensa.
 */
const CLAVE_ESTADO_DEMO = `${PREFIJO_ESTADO}demo`;

// ─────────────────────────────────────────────────────────────────────────────
// Forma
// ─────────────────────────────────────────────────────────────────────────────

export interface Preferencias {
  /** Copia en Drive activada (preferencia, no estado de sincronización). */
  driveSyncEnabled: boolean;
  /** Sincronización con Calendar activada. */
  calendarSyncEnabled: boolean;
  /**
   * Bloque B · Solo se admiten citas futuras al importar.
   *
   * Conserva el nombre `gmail*` a propósito: renombrarlo descartaría el valor
   * ya guardado por quien lo tuviera configurado. La preferencia sigue
   * aplicando, pero ahora a la importación MANUAL, no a ningún escaneo.
   */
  /** Descartar citas ya pasadas al importar. */
  gmailOnlyFutureAppointments: boolean;
  /** Bloqueo por inactividad activado. */
  autoLockEnabled: boolean;
  /** Minutos de inactividad antes de bloquear. */
  autoLockMinutes: number;
  /** Bloqueo nocturno activado. */
  nightLockEnabled: boolean;
  /** Inicio del bloqueo nocturno, formato HH:mm. */
  nightLockStart: string;
  /** Fin del bloqueo nocturno, formato HH:mm. */
  nightLockEnd: string;
}

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  driveSyncEnabled: true,
  calendarSyncEnabled: true,
  gmailOnlyFutureAppointments: true,
  autoLockEnabled: false,
  autoLockMinutes: 15,
  nightLockEnabled: false,
  nightLockStart: '22:00',
  nightLockEnd: '06:00',
};

/** Lista blanca cerrada. Cualquier otro campo se descarta. */
export const CAMPOS_PREFERENCIAS = Object.keys(
  PREFERENCIAS_POR_DEFECTO,
) as (keyof Preferencias)[];

// ─────────────────────────────────────────────────────────────────────────────
// Almacén
// ─────────────────────────────────────────────────────────────────────────────

/** Subconjunto de `Storage` que este módulo necesita. */
export type AlmacenLike = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

function almacenPorDefecto(): AlmacenLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Almacenamiento bloqueado por política del navegador.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

const ES_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Convierte un objeto arbitrario en unas Preferencias completas y válidas.
 *
 * El contenido de localStorage es manipulable por cualquiera que abra las
 * herramientas del navegador, así que cada campo se valida por separado y un
 * valor inválido cae al valor por defecto en lugar de propagarse a la app.
 * Los campos que no estén en la lista blanca se descartan sin más.
 */
export function sanearPreferencias(entrada: unknown): Preferencias {
  const base: Preferencias = { ...PREFERENCIAS_POR_DEFECTO };
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return base;
  }
  const bruto = entrada as Record<string, unknown>;

  const booleano = (clave: keyof Preferencias) => {
    const v = bruto[clave];
    if (typeof v === 'boolean') (base[clave] as boolean) = v;
  };
  const hora = (clave: keyof Preferencias) => {
    const v = bruto[clave];
    if (typeof v === 'string' && ES_HORA.test(v)) (base[clave] as string) = v;
  };

  booleano('driveSyncEnabled');
  booleano('calendarSyncEnabled');
  booleano('gmailOnlyFutureAppointments');
  booleano('autoLockEnabled');
  booleano('nightLockEnabled');

  hora('nightLockStart');
  hora('nightLockEnd');

  if (
    typeof bruto.autoLockMinutes === 'number' &&
    Number.isFinite(bruto.autoLockMinutes) &&
    bruto.autoLockMinutes >= 1 &&
    bruto.autoLockMinutes <= 240
  ) {
    base.autoLockMinutes = Math.floor(bruto.autoLockMinutes);
  }

  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura y escritura
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve siempre unas preferencias completas, incluso sin almacenamiento. */
export function leerPreferencias(store?: AlmacenLike | null): Preferencias {
  const s = store ?? almacenPorDefecto();
  if (!s) return { ...PREFERENCIAS_POR_DEFECTO };
  try {
    const crudo = s.getItem(CLAVE_PREFERENCIAS);
    if (!crudo) return { ...PREFERENCIAS_POR_DEFECTO };
    return sanearPreferencias(JSON.parse(crudo));
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

/**
 * Mezcla `parcial` sobre lo ya guardado y persiste el resultado saneado.
 * Devuelve las preferencias resultantes, o `null` si no se pudo escribir.
 */
export function guardarPreferencias(
  parcial: Partial<Preferencias>,
  store?: AlmacenLike | null,
): Preferencias | null {
  const s = store ?? almacenPorDefecto();
  const combinadas = sanearPreferencias({ ...leerPreferencias(s), ...parcial });
  if (!s) return null;
  try {
    s.setItem(CLAVE_PREFERENCIAS, JSON.stringify(combinadas));
    return combinadas;
  } catch {
    // Cuota agotada o almacenamiento bloqueado: no es motivo para romper la app.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Migración desde SavedAppState
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoMigracion {
  /** `true` si esta llamada hizo trabajo; `false` si ya estaba migrado o no había nada. */
  migrado: boolean;
  /** Cuántos campos de la lista blanca se rescataron del estado antiguo. */
  camposRescatados: number;
}

/**
 * Copia a `CLAVE_PREFERENCIAS` los campos de la lista blanca que estuvieran
 * dentro de un `pate-salud-state:*` de sesión real.
 *
 * · Es idempotente: deja una marca y no vuelve a ejecutarse.
 * · NO borra nada. La purga es responsabilidad de A6-F2.
 * · NO lee la clave de estado demo ni la clave heredada.
 */
export function migrarPreferenciasDesdeEstado(
  store?: AlmacenLike | null,
): ResultadoMigracion {
  const s = store ?? almacenPorDefecto();
  if (!s) return { migrado: false, camposRescatados: 0 };

  try {
    if (s.getItem(CLAVE_MIGRACION) === '1') {
      return { migrado: false, camposRescatados: 0 };
    }
  } catch {
    return { migrado: false, camposRescatados: 0 };
  }

  // Buscar la primera clave de estado de sesión REAL.
  let claveEstado: string | null = null;
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k) continue;
      if (k.startsWith(PREFIJO_ESTADO) && k !== CLAVE_ESTADO_DEMO) {
        claveEstado = k;
        break;
      }
    }
  } catch {
    return { migrado: false, camposRescatados: 0 };
  }

  const rescatadas: Partial<Preferencias> = {};
  let camposRescatados = 0;

  if (claveEstado) {
    try {
      const crudo = s.getItem(claveEstado);
      if (crudo) {
        const estado = JSON.parse(crudo) as Record<string, unknown>;
        for (const campo of CAMPOS_PREFERENCIAS) {
          if (estado[campo] !== undefined) {
            (rescatadas as Record<string, unknown>)[campo] = estado[campo];
            camposRescatados++;
          }
        }
      }
    } catch {
      // Estado corrupto: se continúa con los valores por defecto.
    }
  }

  guardarPreferencias(rescatadas, s);
  try {
    s.setItem(CLAVE_MIGRACION, '1');
  } catch {
    // Si no se pudo marcar, la próxima carga repite el trabajo. Es idempotente.
  }

  return { migrado: true, camposRescatados };
}
