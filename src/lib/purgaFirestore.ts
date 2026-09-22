/**
 * Purga de la caché IndexedDB de Firestore (A6-F2, reescrita en G4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Firestore guardaba en IndexedDB una copia de todo documento leído: el
 * expediente completo. Cerrar sesión no la tocaba, y **borrar el SDK tampoco
 * la borra**: los datos siguen en el disco de quien ya abrió la aplicación.
 *
 * Por eso este módulo sobrevive a G4 aunque Firebase ya no exista. Es lo único
 * que queda de él, y tiene que quedarse **una temporada**: hasta que los
 * navegadores de quienes usaron la versión anterior hayan pasado por aquí.
 *
 * QUÉ CAMBIÓ EN G4
 * ────────────────
 * Antes se purgaba con el propio SDK —`terminate()` y
 * `clearIndexedDbPersistence()`—. Sin SDK hay que ir directo a IndexedDB y
 * **borrar las bases por su nombre**.
 *
 * El marcador va ANTES del primer intento: si el navegador se cierra a mitad,
 * la purga sigue pendiente y se completa en el próximo arranque.
 *
 * UNA PURGA A MEDIAS NUNCA SE REPORTA COMO ÉXITO
 * ──────────────────────────────────────────────
 * `deleteDatabase` se queda **bloqueada** si otra pestaña tiene la base
 * abierta, que es el caso realista y no el raro. Entonces se conserva el
 * marcador y se devuelve `diferida`, para que la interfaz pueda decir la
 * verdad en vez de afirmar que se borró todo.
 */

export const CLAVE_PURGA_PENDIENTE = 'pate:purga_firestore_pendiente';

/** Cuánto se espera a un borrado antes de darlo por bloqueado. */
export const ESPERA_BORRADO_MS = 3_000;

export type ResultadoPurgaFirestore =
  /** La caché quedó borrada. */
  | 'ok'
  /** No se pudo completar; el marcador sigue puesto y se reintentará. */
  | 'diferida'
  /** No hay nada que purgar, o no hay forma de encontrarlo. */
  | 'no_aplica';

/**
 * Las bases que dejaba Firebase con nombre fijo.
 *
 * La de Firestore **no está aquí** porque su nombre lleva dentro el
 * identificador del proyecto (`firestore/[DEFAULT]/<proyecto>/main`), y ese
 * identificador se fue con la configuración. Se encuentra enumerando.
 */
export const BASES_CONOCIDAS: readonly string[] = [
  'firebaseLocalStorageDb',
  'firebase-installations-database',
  'firebase-heartbeat-database',
];

/** Si el nombre de una base es de Firebase. */
export function esBaseDeFirebase(nombre: unknown): boolean {
  return /firebase|firestore/i.test(String(nombre ?? ''));
}

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

/** Lo poco que se usa de IndexedDB. Inyectable para poder probarlo. */
export interface AlmacenIndexado {
  databases?: () => Promise<{ name?: string }[]>;
  deleteDatabase: (nombre: string) => IDBOpenDBRequest;
}

function indexadoDelNavegador(): AlmacenIndexado | null {
  try {
    if (typeof indexedDB === 'undefined' || indexedDB === null) return null;
    return indexedDB as unknown as AlmacenIndexado;
  } catch {
    return null;
  }
}

/**
 * Borra una base. Resuelve `false` si se bloqueó o falló.
 *
 * El plazo no es adorno: cuando otra pestaña tiene la base abierta, la petición
 * **no falla** — se queda esperando indefinidamente a que se cierre. Sin plazo,
 * el cierre de sesión se colgaría ahí.
 */
export function borrarBase(
  indexado: AlmacenIndexado,
  nombre: string,
  espera = ESPERA_BORRADO_MS,
): Promise<boolean> {
  return new Promise<boolean>((resolver) => {
    let resuelto = false;
    const acabar = (bien: boolean) => {
      if (resuelto) return;
      resuelto = true;
      resolver(bien);
    };

    let peticion: IDBOpenDBRequest;
    try {
      peticion = indexado.deleteDatabase(nombre);
    } catch {
      acabar(false);
      return;
    }

    const plazo = setTimeout(() => acabar(false), espera);
    const cerrar = (bien: boolean) => {
      clearTimeout(plazo);
      acabar(bien);
    };

    peticion.onsuccess = () => cerrar(true);
    peticion.onerror = () => cerrar(false);
    // `onblocked` es otra pestaña con la base abierta. No es un error: es que
    // todavía no se puede, y por eso la purga queda diferida y no fallida.
    peticion.onblocked = () => cerrar(false);
  });
}

/**
 * Borra la caché de Firestore que quedara en este navegador.
 *
 * Nunca lanza.
 */
export async function purgarCacheFirestore(
  indexado: AlmacenIndexado | null = indexadoDelNavegador(),
): Promise<ResultadoPurgaFirestore> {
  if (typeof window === 'undefined') return 'no_aplica';
  if (!indexado) return 'no_aplica';

  // 1 · Marcador ANTES de tocar nada.
  marcarPendiente();

  let nombres: string[];
  if (typeof indexado.databases === 'function') {
    try {
      const listadas = await indexado.databases();
      nombres = listadas.map((b) => String(b?.name ?? '')).filter(esBaseDeFirebase);
    } catch {
      return 'diferida';
    }
  } else {
    // Sin enumeración no hay forma de dar con la base de Firestore: su nombre
    // lleva dentro el identificador del proyecto, que se fue con la
    // configuración. Se borra lo que tiene nombre fijo y **se deja de
    // reintentar**: volver cada arranque a no encontrar nada no limpia nada y
    // sí gasta el arranque de todos.
    for (const nombre of BASES_CONOCIDAS) await borrarBase(indexado, nombre);
    desmarcarPendiente();
    return 'no_aplica';
  }

  if (nombres.length === 0) {
    desmarcarPendiente();
    return 'no_aplica';
  }

  const resultados = await Promise.all(nombres.map((n) => borrarBase(indexado, n)));
  if (resultados.some((bien) => !bien)) return 'diferida';

  desmarcarPendiente();
  return 'ok';
}

/**
 * Completa en el arranque una purga que quedó pendiente.
 *
 * Se memoiza a nivel de módulo para que dos montajes de `AppContext` —React
 * monta dos veces en modo estricto— no lancen dos purgas.
 */
let promesaEnCurso: Promise<ResultadoPurgaFirestore> | null = null;

export function ejecutarPurgaDiferidaSiProcede(): Promise<ResultadoPurgaFirestore> {
  if (promesaEnCurso) return promesaEnCurso;
  if (!hayPurgaPendiente()) return Promise.resolve<ResultadoPurgaFirestore>('no_aplica');

  promesaEnCurso = purgarCacheFirestore()
    .then((r) => {
      // Un marcador que ya no aplica no puede quedarse huérfano bloqueando el
      // arranque en cada carga.
      if (r === 'no_aplica') desmarcarPendiente();
      return r;
    })
    .finally(() => {
      promesaEnCurso = null;
    });
  return promesaEnCurso;
}
