/**
 * Purga de la caché IndexedDB de Firestore — Paté · Salud Familiar (A6-F2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `firebase.ts` habilita `persistentLocalCache`, así que Firestore guarda en
 * IndexedDB una copia de todo documento leído: el expediente completo. Cerrar
 * sesión no la tocaba.
 *
 * EL MARCADOR VA ANTES DEL PRIMER INTENTO
 * ───────────────────────────────────────
 * `pate:purga_firestore_pendiente` se escribe ANTES de llamar a `terminate`,
 * no después de un fallo. Si el navegador se cierra a mitad de la operación,
 * la purga sigue marcada como pendiente y se completa en el próximo arranque.
 *
 * UNA PURGA DIFERIDA NUNCA SE REPORTA COMO ÉXITO
 * ──────────────────────────────────────────────
 * `clearIndexedDbPersistence` falla con `failed-precondition` si hay otra
 * pestaña abierta o un listener vivo, que es el caso realista y no el raro.
 * En ese caso se conserva el marcador y se devuelve `diferida`, para que la
 * interfaz pueda decir la verdad en lugar de afirmar que se borró todo.
 *
 * CONSECUENCIA DE `terminate()`
 * ─────────────────────────────
 * Deja la instancia de Firestore inutilizable. Tras una purga con éxito hay
 * que recargar la página: al cerrar sesión eso ya ocurre (paso l), y en el
 * arranque diferido lo provoca quien llama.
 */

import { isFirebaseBackend } from './dataBackend';

export const CLAVE_PURGA_PENDIENTE = 'pate:purga_firestore_pendiente';

export type ResultadoPurgaFirestore =
  /** La caché quedó borrada. */
  | 'ok'
  /** No se pudo completar; el marcador sigue puesto y se reintentará. */
  | 'diferida'
  /** No hay nada que purgar (backend distinto, sin navegador o sin IndexedDB). */
  | 'no_aplica';

// ─────────────────────────────────────────────────────────────────────────────
// Marcador
// ─────────────────────────────────────────────────────────────────────────────

function almacen(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hayPurgaPendiente(): boolean {
  try {
    return almacen()?.getItem(CLAVE_PURGA_PENDIENTE) === '1';
  } catch {
    return false;
  }
}

function marcarPendiente(): void {
  try {
    almacen()?.setItem(CLAVE_PURGA_PENDIENTE, '1');
  } catch {
    // Si no se puede marcar, se intenta la purga igual; solo se pierde el
    // reintento diferido.
  }
}

function desmarcarPendiente(): void {
  try {
    almacen()?.removeItem(CLAVE_PURGA_PENDIENTE);
  } catch {
    /* sin efecto */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Purga
// ─────────────────────────────────────────────────────────────────────────────

function indexedDbDisponible(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Termina la instancia de Firestore y borra su caché de IndexedDB.
 *
 * Nunca lanza. Tras devolver `'ok'` la instancia de Firestore queda
 * inutilizable y quien llama debe recargar la página.
 */
export async function purgarCacheFirestore(): Promise<ResultadoPurgaFirestore> {
  if (typeof window === 'undefined') return 'no_aplica';
  if (!isFirebaseBackend) return 'no_aplica';
  if (!indexedDbDisponible()) return 'no_aplica';

  // 1 · Marcador ANTES de tocar nada.
  marcarPendiente();

  let db: unknown;
  let terminate: (d: never) => Promise<void>;
  let clearIndexedDbPersistence: (d: never) => Promise<void>;
  try {
    const mod = await import('./firebase');
    db = mod.db;
    const fs = await import('firebase/firestore');
    terminate = fs.terminate as unknown as (d: never) => Promise<void>;
    clearIndexedDbPersistence = fs.clearIndexedDbPersistence as unknown as (d: never) => Promise<void>;
  } catch {
    // No se pudo ni cargar Firestore: se conserva el marcador.
    return 'diferida';
  }

  // 2 · terminate(). Si ya estaba terminada, rechaza y se ignora.
  try {
    await terminate(db as never);
  } catch {
    /* instancia ya terminada o no iniciada: se continúa */
  }

  // 3 · clearIndexedDbPersistence().
  try {
    await clearIndexedDbPersistence(db as never);
    desmarcarPendiente();
    return 'ok';
  } catch (err) {
    const codigo = (err as { code?: string } | null)?.code;
    if (codigo === 'unimplemented') {
      // El navegador no soporta la persistencia: no hay caché que borrar.
      desmarcarPendiente();
      return 'no_aplica';
    }
    // 'failed-precondition' (otra pestaña o listener vivo) y cualquier otro
    // error se tratan igual: NO se afirma que la caché quedó limpia.
    return 'diferida';
  }
}

/**
 * Completa en el arranque una purga que quedó pendiente.
 *
 * Debe invocarse ANTES de crear cualquier watcher, listener, carga remota o
 * sincronización: es el único momento en que `clearIndexedDbPersistence`
 * puede tener éxito con garantías, porque todavía no hay suscripciones vivas.
 *
 * Se memoiza a nivel de módulo para que dos montajes de AppContext —React en
 * modo estricto monta dos veces en desarrollo— no lancen dos purgas.
 */
let promesaEnCurso: Promise<ResultadoPurgaFirestore> | null = null;

export function ejecutarPurgaDiferidaSiProcede(): Promise<ResultadoPurgaFirestore> {
  if (promesaEnCurso) return promesaEnCurso;
  if (!hayPurgaPendiente()) return Promise.resolve<ResultadoPurgaFirestore>('no_aplica');
  promesaEnCurso = purgarCacheFirestore()
    .then((r) => {
      // Un marcador que no aplica -por ejemplo, tras cambiar de backend- no
      // debe quedarse huerfano bloqueando el arranque en cada carga.
      if (r === 'no_aplica') desmarcarPendiente();
      return r;
    })
    .finally(() => {
      promesaEnCurso = null;
    });
  return promesaEnCurso;
}
