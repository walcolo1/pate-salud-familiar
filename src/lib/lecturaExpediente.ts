/**
 * Lectura del expediente local — Paté · Salud Familiar (C2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * DISTINGUIR «NO HAY NADA» DE «NO SE PUDO LEER»
 * ─────────────────────────────────────────────
 * `loadAppState` devolvía `null` en los dos casos, y la interfaz no tenía cómo
 * saber cuál era. Si el JSON del expediente se corrompía, la aplicación
 * arrancaba mostrando «Aún no tienes miembros registrados» mientras el
 * historial clínico completo seguía en el navegador, sin abrir. Nadie iba a
 * pulsar «reintentar» ante una pantalla que dice que todo está en orden.
 *
 * Y HACÍA ALGO PEOR: LO BORRABA
 * ─────────────────────────────
 * Ante un fallo de lectura ejecutaba `localStorage.removeItem(clave)`. Un byte
 * corrupto, una cuota llena o un almacenamiento bloqueado por el navegador
 * bastaban para destruir el expediente de una familia sin preguntar y sin
 * dejar rastro. Aquí no se borra nada: el original se queda donde está —para
 * que reintentar tenga sentido— y se deja además una copia en cuarentena, que
 * es lo único de lo que se puede tirar para rescatar los datos a mano.
 *
 * La primera copia en cuarentena no se pisa nunca. Si el expediente se sigue
 * escribiendo sobre sí mismo tras el fallo, la copia más antigua es la que más
 * probabilidades tiene de estar completa.
 */

export type AlmacenLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Prefijo bajo el que se conserva un expediente que no se pudo leer. */
export const CLAVE_CUARENTENA = 'pate:cuarentena:';

export type MotivoIlegible =
  /** Había texto, pero no era JSON. */
  | 'JSON_INVALIDO'
  /** Era JSON, pero no un objeto: una cadena, un número, `null`. */
  | 'NO_ES_OBJETO'
  /** Era un objeto, pero sin las estructuras clínicas mínimas. */
  | 'FALTAN_CAMPOS'
  /** El propio almacén falló al leer: bloqueado, lleno, o sin permisos. */
  | 'LECTURA_FALLIDA';

export interface ExpedienteGuardado {
  schemaVersion?: number;
  members?: unknown[];
  appointments?: unknown[];
  [clave: string]: unknown;
}

export type ResultadoLectura =
  /** No hay nada guardado. Es un expediente nuevo, no un fallo. */
  | { estado: 'VACIO' }
  | { estado: 'OK'; datos: ExpedienteGuardado }
  | { estado: 'ILEGIBLE'; motivo: MotivoIlegible };

/**
 * Qué se le dice a quien lo está usando.
 *
 * Ninguno acusa a la persona ni sugiere que no haya datos: el expediente sigue
 * ahí, lo que ha fallado es leerlo, y esa diferencia es justo lo que estos
 * mensajes existen para transmitir.
 */
export const MENSAJE_ILEGIBLE: Record<MotivoIlegible, string> = {
  JSON_INVALIDO:
    'El expediente guardado en este dispositivo está dañado y no se pudo abrir. No se ha borrado nada: se conservó una copia por si es recuperable.',
  NO_ES_OBJETO:
    'El expediente guardado en este dispositivo no tiene el formato esperado. No se ha borrado nada: se conservó una copia por si es recuperable.',
  FALTAN_CAMPOS:
    'El expediente guardado en este dispositivo está incompleto y no se pudo abrir con seguridad. No se ha borrado nada: se conservó una copia.',
  LECTURA_FALLIDA:
    'No se pudo acceder al almacenamiento de este navegador. Puede estar bloqueado por una configuración de privacidad o sin espacio disponible.',
};

function almacenPorDefecto(): AlmacenLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Deja una copia del contenido ilegible bajo el prefijo de cuarentena.
 *
 * Si no se puede escribir —cuota llena, almacenamiento bloqueado— se sigue
 * adelante: el original no se ha tocado, que es lo que de verdad importa.
 */
function ponerEnCuarentena(clave: string, contenido: string, almacen: AlmacenLike): void {
  const destino = `${CLAVE_CUARENTENA}${clave}`;
  try {
    if (almacen.getItem(destino) !== null) return; // la primera copia manda
    almacen.setItem(destino, contenido);
  } catch {
    // Sin sitio para la copia. El expediente original sigue intacto.
  }
}

/**
 * Lee el expediente de una clave y dice con precisión qué ha pasado.
 *
 * Nunca elimina nada.
 */
export function leerExpediente(clave: string, almacen?: AlmacenLike | null): ResultadoLectura {
  const store = almacen === undefined ? almacenPorDefecto() : almacen;
  // Sin almacén no se puede afirmar que no haya nada guardado; solo que no se
  // ha podido mirar. Decir «vacío» aquí sería inventarse una respuesta.
  if (!store) return { estado: 'ILEGIBLE', motivo: 'LECTURA_FALLIDA' };

  let crudo: string | null;
  try {
    crudo = store.getItem(clave);
  } catch {
    return { estado: 'ILEGIBLE', motivo: 'LECTURA_FALLIDA' };
  }

  if (crudo === null || crudo === '') return { estado: 'VACIO' };

  let analizado: unknown;
  try {
    analizado = JSON.parse(crudo);
  } catch {
    ponerEnCuarentena(clave, crudo, store);
    return { estado: 'ILEGIBLE', motivo: 'JSON_INVALIDO' };
  }

  if (!analizado || typeof analizado !== 'object' || Array.isArray(analizado)) {
    ponerEnCuarentena(clave, crudo, store);
    return { estado: 'ILEGIBLE', motivo: 'NO_ES_OBJETO' };
  }

  const datos = analizado as ExpedienteGuardado;
  if (!Array.isArray(datos.members) || !Array.isArray(datos.appointments)) {
    ponerEnCuarentena(clave, crudo, store);
    return { estado: 'ILEGIBLE', motivo: 'FALTAN_CAMPOS' };
  }

  return { estado: 'OK', datos };
}
