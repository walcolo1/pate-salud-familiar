/**
 * Purga de la persistencia local — Paté · Salud Familiar (A6-F2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Elimina de `localStorage` todo rastro del expediente al cerrar sesión.
 *
 * ESTRATEGIA: LISTA BLANCA, NO LISTA NEGRA
 * ────────────────────────────────────────
 * Se elimina cualquier clave que empiece por `pate` y no esté explícitamente
 * preservada. La dirección importa: con una lista negra, una clave nueva que
 * alguien olvide registrar sobrevive a la purga y con ella la PHI. Con lista
 * blanca, lo desconocido se borra, que es el lado correcto en el que fallar.
 *
 * NUNCA SE LEE LO QUE SE VA A BORRAR
 * ──────────────────────────────────
 * No se invoca `getItem` sobre ninguna clave que se elimina. Esto cumple la
 * decisión de A6 sobre la clave demo heredada —se purga sin abrirla— y evita
 * que PHI pase por memoria, registros o trazas durante la limpieza.
 *
 * NO SE TOCA NADA AJENO
 * ─────────────────────
 * Las claves de otras aplicaciones que compartan el origen quedan intactas.
 */

import {
  CLAVE_PREFERENCIAS,
  CLAVE_DEVICE_ID,
  CLAVE_MIGRACION,
  type AlmacenLike,
} from './preferencias';

/** Prefijo que identifica las claves de esta aplicación. */
export const PREFIJO_APP = 'pate';

/**
 * Lo único que sobrevive a un cierre de sesión. Lista cerrada.
 *
 * Deliberadamente NO incluye `pate:purga_firestore_pendiente`: en la secuencia
 * de cierre la purga local (paso i) ocurre antes que la de Firestore (paso j),
 * que vuelve a escribir su marcador justo después. Un marcador anterior que se
 * pierda aquí se reescribe de inmediato; y si el backend no es Firebase, no
 * hay caché que purgar y el marcador huérfano sobra.
 */
export const CLAVES_PRESERVADAS: ReadonlySet<string> = new Set<string>([
  CLAVE_PREFERENCIAS, // pate:prefs:v1
  CLAVE_DEVICE_ID,    // pate_salud_device_id
  CLAVE_MIGRACION,    // pate:prefs:migrado
]);

export interface ResultadoPurgaLocal {
  /** Nombres de las claves eliminadas. Nunca su contenido. */
  clavesEliminadas: string[];
  /** Claves que no se pudieron eliminar. Solo el nombre y el código. */
  errores: string[];
  /** `true` si no se pudo acceder al almacenamiento en absoluto. */
  sinAlmacenamiento: boolean;
}

function almacenPorDefecto(): AlmacenLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Decide si una clave debe eliminarse. Exportada para poder probarla sola. */
export function debeEliminarse(clave: string): boolean {
  if (CLAVES_PRESERVADAS.has(clave)) return false;
  return clave.startsWith(PREFIJO_APP);
}

/**
 * Elimina del almacenamiento local todo lo que pertenezca a la aplicación
 * salvo las tres claves preservadas.
 *
 * Nunca lanza: los fallos se acumulan en `errores` para que el cierre de
 * sesión pueda continuar. Un fallo al limpiar jamás debe dejar al usuario
 * dentro de una vista que muestra el expediente.
 */
export function purgarPersistenciaLocal(
  store?: AlmacenLike | null,
): ResultadoPurgaLocal {
  const s = store ?? almacenPorDefecto();
  if (!s) {
    return { clavesEliminadas: [], errores: [], sinAlmacenamiento: true };
  }

  const clavesEliminadas: string[] = [];
  const errores: string[] = [];

  // Se toma una instantánea de los nombres ANTES de borrar: eliminar mientras
  // se recorre por índice desplaza el resto y salta claves.
  const nombres: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) nombres.push(k);
    }
  } catch {
    return { clavesEliminadas: [], errores: ['enumeracion_fallida'], sinAlmacenamiento: false };
  }

  for (const clave of nombres) {
    if (!debeEliminarse(clave)) continue;
    try {
      // Sin getItem previo: no se lee lo que se va a borrar.
      s.removeItem(clave);
      clavesEliminadas.push(clave);
    } catch {
      errores.push(`no_eliminada:${clave}`);
    }
  }

  return { clavesEliminadas, errores, sinAlmacenamiento: false };
}
