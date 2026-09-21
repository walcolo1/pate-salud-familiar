/**
 * De modelo a fila, y de vuelta (Bloque G, G0)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La aplicación piensa en objetos —`MedicalAppointment`, `MedicalOrder`— y la
 * hoja piensa en filas con columnas nombradas. Aquí está la traducción, y es el
 * sitio donde un dato se puede perder sin que nada falle.
 *
 * POR QUÉ UNA TABLA Y NO CATORCE FUNCIONES
 * ────────────────────────────────────────
 * Con una función por colección, cada una se escribe a mano y cada una puede
 * olvidarse un campo en silencio. Con un descriptor por colección, **el olvido
 * se puede detectar**: hay una prueba que recorre los campos de cada modelo y
 * exige que cada uno esté mapeado o **declarado como descartado a propósito**.
 *
 * Esa es la regla de G0, y es la misma idea que el trinquete de escrituras
 * mudas de G1 una capa más abajo: allí no se podía guardar sin hacer nada, aquí
 * no se puede traducir dejándose algo por el camino.
 *
 * LO QUE SE DESCARTA, SE DESCARTA POR ESCRITO
 * ───────────────────────────────────────────
 * `DESCARTADOS` no es una lista de campos que dan pereza: es la decisión de
 * E10, con su motivo al lado. Andamiaje de Firestore que el diseño de E ya
 * reemplazó, y estado de funciones que no existen todavía.
 */

/** Cómo se traduce un campo del modelo a una columna de la hoja. */
export interface CampoMapeado {
  /** La columna, tal y como está en el esquema. */
  columna: string;
  /**
   * Cómo se guarda cuando no es una cadena.
   *
   * `lista` junta con comas: una celda tiene que poder leerse, y un JSON dentro
   * de una hoja de cálculo es una celda que nadie entiende.
   */
  tipo?: 'texto' | 'numero' | 'booleano' | 'lista';
}

export interface Descriptor {
  /** La pestaña del esquema. */
  pestana: string;
  /** Campo del modelo → columna. */
  campos: Record<string, CampoMapeado>;
  /**
   * De qué campo sale el paciente al que pertenece la fila.
   *
   * El router lo necesita para comprobar el alcance: sin él, `aplicar()` no
   * puede saber si quien escribe tiene permiso sobre ese expediente.
   */
  pacienteDesde?: string;
}

/**
 * Campos que NO viajan a la hoja, y por qué.
 *
 * Están aquí para que la prueba de cobertura los dé por buenos. Añadir uno es
 * una decisión que queda escrita, no un descuido que pasa desapercibido.
 */
export const DESCARTADOS: Record<string, string> = {
  // ── Andamiaje del diseño multi-dispositivo sobre Firestore ────────────────
  // Cada fila decía de quién era y si estaba sincronizada. Con una hoja por
  // familia eso no existe: la fila es de la familia porque está en su hoja.
  ownerEmail: 'la hoja es de la familia; no hay dueño por fila',
  ownerGoogleId: 'ídem',
  sourceDeviceId: 'ídem',
  syncStatus: 'no hay dos copias que sincronizar: la hoja es la copia',
  lastSyncedAt: 'ídem',
  familyGroupId: 'la familia es la hoja, y la decide la URL del despliegue',

  // ── Reemplazado por el modelo de acceso de E4/E5 ──────────────────────────
  canAccessPortal: 'ahora es una fila en ACCESO con su rol y su alcance',
  permissionStatus: 'ídem: el estado vive en ACCESO',
  permissions: 'ídem: el rol y el alcance sustituyen al mapa de permisos',

  // ── Estado de funciones que no existen todavía ────────────────────────────
  calendarSyncStatus: 'la sincronización con Calendar no está construida',
  calendarSyncedAt: 'ídem',
  calendarError: 'ídem',
  googleCalendarHtmlLink: 'se puede reconstruir desde el identificador del evento',
  source: 'importación desde Gmail: es E11',
  sourceEmail: 'ídem',
  sourceMessageId: 'ídem',
  sourceSubject: 'ídem',
  sharedWithEmail: 'compartir un documento por Drive no está construido',
  permissionId: 'ídem',
  sharedAt: 'ídem',
  revokedAt: 'ídem',
  shareStatus: 'ídem',
  shareError: 'ídem',
  retentionStatus: 'la política de retención no está construida',
  retentionReason: 'ídem',
  purgedAt: 'ídem',
  localPath: 'una ruta del dispositivo no significa nada en otro',

  // ── Duplicados dentro del propio modelo ───────────────────────────────────
  doctor: 'duplica `doctorName`; se guarda uno',
  scheduledAt: 'duplica `date` + `time`, que es como lo guarda la hoja',
  avatarUrl: 'tres campos para una foto; se guarda `photoUrl`',
  avatarPath: 'ídem',
  lastUpdated: 'lo cubre `actualizado_en`, que escribe el propio router',
};

/** Las columnas que escribe el router y no el cliente. */
export const COLUMNAS_DEL_ROUTER: readonly string[] = [
  'creado_en',
  'actualizado_en',
  'borrado_en',
];

// ─────────────────────────────────────────────────────────────────────────────
// Conversión
// ─────────────────────────────────────────────────────────────────────────────

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Una lista a una celda legible.
 *
 * Con comas y espacios, no con JSON. La hoja la abre el titular: una celda que
 * ponga `["polen","penicilina"]` es una celda que no se puede leer ni corregir
 * desde la propia hoja, y poder hacerlo es media razón de que sea una hoja.
 */
export const listaACelda = (v: unknown): string =>
  Array.isArray(v) ? v.map((x) => texto(x).trim()).filter((x) => x.length > 0).join(', ') : texto(v);

export const celdaALista = (v: unknown): string[] =>
  texto(v)
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

/** Un valor del modelo, listo para una celda. */
export function valorACelda(valor: unknown, tipo: CampoMapeado['tipo']): unknown {
  if (tipo === 'lista') return listaACelda(valor);
  if (tipo === 'booleano') return valor === true ? 'SI' : 'NO';
  if (tipo === 'numero') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : '';
  }
  return texto(valor);
}

/** Y de vuelta. */
export function celdaAValor(celda: unknown, tipo: CampoMapeado['tipo']): unknown {
  if (tipo === 'lista') return celdaALista(celda);
  if (tipo === 'booleano') return texto(celda).trim().toUpperCase() === 'SI';
  if (tipo === 'numero') {
    const n = Number(celda);
    return Number.isFinite(n) ? n : null;
  }
  const s = texto(celda);
  return s.length === 0 ? null : s;
}

/**
 * El modelo, convertido en fila.
 *
 * No escribe `creado_en` ni `actualizado_en`: las pone el router, que es quien
 * sabe la hora del servidor. Un reloj de cliente mal puesto ordenaría mal el
 * historial de alguien.
 */
export function aFila(descriptor: Descriptor, modelo: Record<string, unknown>): Record<string, unknown> {
  const fila: Record<string, unknown> = {};

  for (const [campo, mapeo] of Object.entries(descriptor.campos)) {
    if (!(campo in (modelo ?? {}))) continue;
    fila[mapeo.columna] = valorACelda(modelo[campo], mapeo.tipo);
  }

  return fila;
}

/** La fila, convertida en modelo. */
export function aModelo(
  descriptor: Descriptor,
  fila: Record<string, unknown>,
): Record<string, unknown> {
  const modelo: Record<string, unknown> = {};

  for (const [campo, mapeo] of Object.entries(descriptor.campos)) {
    modelo[campo] = celdaAValor((fila ?? {})[mapeo.columna], mapeo.tipo);
  }

  return modelo;
}

/**
 * La fila de una baja lógica.
 *
 * El contrato dice `deleteX` y el esquema hace baja lógica: se marca
 * `borrado_en` y la fila se queda. Nada se borra — es una de las decisiones que
 * sostienen el proyecto, y en las reglas de Firestore era `allow delete: if
 * false`.
 *
 * El renombre a `darDeBajaX` queda para G4, cuando `FirebaseRepository` ya no
 * exista y cueste la mitad.
 */
export function filaDeBaja(id: string, ahoraISO: string): Record<string, unknown> {
  return { id, borrado_en: ahoraISO };
}

/** Si esta fila está dada de baja. Las lecturas la saltan. */
export function estaDadaDeBaja(fila: Record<string, unknown>): boolean {
  return texto((fila ?? {}).borrado_en).trim().length > 0;
}
