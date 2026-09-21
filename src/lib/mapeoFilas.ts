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
   * Columnas que se escriben siempre con el mismo valor.
   *
   * No salen de ningún campo porque el modelo no las tiene: la aplicación solo
   * conoce personas, y `PACIENTES.tipo` distingue `HUMANO` de `MASCOTA`. Sin
   * esto la fila nacería sin especie.
   */
  constantes?: Record<string, unknown>;
  /**
   * La columna por la que se reconoce que dos filas son el mismo registro.
   *
   * Por omisión `id`. `PERFIL_HUMANO` es la excepción: la mitad de identidad
   * que escribe `members` no tiene identificador propio —es la fila del
   * paciente— y se reconoce por `paciente_id`.
   */
  clave?: string;
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
  ownerGoogleId: 'la hoja es de la familia; no hay dueño por fila',
  sourceDeviceId: 'qué dispositivo escribió una fila deja de importar cuando solo hay una copia',
  syncStatus: 'no hay dos copias que sincronizar: la hoja es la copia',
  lastSyncedAt: 'no hay dos copias que sincronizar: la hoja es la copia',
  familyGroupId: 'la familia es la hoja, y la decide la URL del despliegue',

  // ── Reemplazado por el modelo de acceso de E4/E5 ──────────────────────────
  canAccessPortal: 'ahora es una fila en ACCESO con su rol y su alcance',
  permissionStatus: 'el estado de acceso vive en la columna `estado` de ACCESO',
  permissions: 'el rol y el alcance de ACCESO sustituyen al mapa de permisos por miembro',

  // ── Estado de funciones que no existen todavía ────────────────────────────
  calendarSyncStatus: 'la sincronización con Calendar no está construida',
  calendarSyncedAt: 'la sincronización con Calendar no está construida',
  calendarError: 'la sincronización con Calendar no está construida',
  googleCalendarHtmlLink: 'se puede reconstruir desde el identificador del evento',
  source: 'importación desde Gmail: es E11',
  sourceEmail: 'importación desde Gmail: pertenece a E11, que no existe',
  sourceMessageId: 'importación desde Gmail: pertenece a E11, que no existe',
  sourceSubject: 'importación desde Gmail: pertenece a E11, que no existe',
  sharedWithEmail: 'compartir un documento por Drive no está construido',
  permissionId: 'compartir un documento por Drive no está construido',
  sharedAt: 'compartir un documento por Drive no está construido',
  revokedAt: 'compartir un documento por Drive no está construido',
  shareStatus: 'compartir un documento por Drive no está construido',
  shareError: 'compartir un documento por Drive no está construido',
  retentionStatus: 'la política de retención no está construida',
  retentionReason: 'la política de retención no está construida',
  purgedAt: 'la política de retención no está construida',
  localPath: 'una ruta del dispositivo no significa nada en otro',

  // ── Duplicados dentro del propio modelo ───────────────────────────────────
  doctor: 'duplica `doctorName`; se guarda uno',
  scheduledAt: 'duplica `date` + `time`, que es como lo guarda la hoja',
  avatarUrl: 'tres campos para una foto; se guarda `photoUrl`',
  avatarPath: 'tres campos para una foto; se guarda `photoUrl` y se deja dicho',
  lastUpdated: 'lo cubre `actualizado_en`, que escribe el propio router',

  // ── Sellos de auditoría: los pone el backend, no el cliente ───────────────
  // Decisión de G0. Un reloj de cliente mal puesto ordenaría mal el historial
  // de alguien, y en un expediente clínico el orden es la mitad del dato.
  createdAt: 'lo sella el router en `creado_en`',
  updatedAt: 'lo sella el router en `actualizado_en`',
  deletedAt: 'lo sella el router en `borrado_en`, en la baja lógica',
  recordedAt: 'lo sella el router en `creado_en` al escribir la fila',

  // ── Copias desnormalizadas que salen de otra fila ─────────────────────────
  medicationName: 'se lee de la pauta a la que apunta `medicamento_id`',
};

/**
 * Descartes que solo valen para UNA colección.
 *
 * `DESCARTADOS` va por nombre de campo, y eso no siempre basta: `status` se
 * guarda en `estado` en media docena de colecciones y en las vacunas **no se
 * guarda en absoluto**, porque D3 decidió que ese estado se calcula. Un
 * descarte global lo habría tirado en todas.
 */
export const DESCARTADOS_POR_COLECCION: Record<string, Record<string, string>> = {
  vaccines: {
    // Decisión de D3, y vale igual aquí: un estado guardado que nadie refresca
    // miente en cuanto pasa la medianoche. Se calcula desde `proxima_dosis`.
    status: 'el estado de una vacuna se calcula, no se guarda (D3)',
  },
  doseReminders: {
    // Igual que `medicationName`: es una copia de la pauta. Guardarla dos veces
    // garantiza que algún día digan cosas distintas.
    dose: 'se lee de la pauta a la que apunta `medicamento_id`',
  },
};

/** ¿Está este campo descartado a propósito, aquí o en general? */
export function estaDescartado(coleccion: string, campo: string): boolean {
  if (Object.prototype.hasOwnProperty.call(DESCARTADOS, campo)) return true;
  const propios = DESCARTADOS_POR_COLECCION[coleccion];
  return !!propios && Object.prototype.hasOwnProperty.call(propios, campo);
}

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
  const fila: Record<string, unknown> = { ...(descriptor.constantes ?? {}) };

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

// ─────────────────────────────────────────────────────────────────────────────
// Leer un registro que se escribió a trozos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una fila de `consultar`, que llega como matriz, puesta bajo sus nombres.
 *
 * Nunca por posición a secas: una hoja instalada con un esquema anterior
 * devuelve **menos columnas** que las que el esquema tiene hoy, y eso está
 * previsto —el crecimiento es solo por el final— pero solo funciona si el
 * nombre manda.
 */
export function filaDesdeCeldas(
  encabezados: readonly string[],
  celdas: readonly unknown[],
): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  for (let i = 0; i < encabezados.length; i++) {
    fila[encabezados[i]] = i < (celdas ?? []).length ? celdas[i] : '';
  }
  return fila;
}

/**
 * ¿Esta fila dice algo sobre las columnas de este descriptor?
 *
 * La clave no cuenta: la llevan **todas** las filas del registro, incluidas
 * las que escribió el otro dueño de la pestaña. Contarla haría que cualquier
 * fila «hablara» y volvería inútil la distinción.
 */
function hablaDe(descriptor: Descriptor, fila: Record<string, unknown>): boolean {
  const clave = descriptor.clave ?? 'id';
  for (const { columna } of Object.values(descriptor.campos)) {
    if (columna === clave) continue;
    if (texto(fila[columna]).trim().length > 0) return true;
  }
  return false;
}

/**
 * Las filas de una pestaña, convertidas en los registros que de verdad hay.
 *
 * EL ROUTER SOLO ANEXA
 * ────────────────────
 * `aplicar()` añade filas; no modifica ninguna. Guardar dos veces el mismo
 * paciente deja **dos filas**, y borrarlo deja una tercera con `borrado_en`.
 * Leer, por tanto, no es leer filas: es colapsarlas.
 *
 * LA REGLA: LA ÚLTIMA QUE HABLA MANDA, ENTERA
 * ───────────────────────────────────────────
 * Entera, y no «el último valor no vacío de cada columna». La diferencia se ve
 * al borrar un dato: con la regla campo a campo, vaciar una nota la haría
 * reaparecer, porque el valor anterior seguiría ganando. Para quien acaba de
 * borrarla, eso es el dato volviendo solo.
 *
 * Y «que habla» porque una pestaña puede tener **dos dueños**: en
 * `PERFIL_HUMANO`, `members` escribe la identidad y `healthProfiles` lo
 * clínico. Cada descriptor solo puede ser pisado por una fila que escriba sus
 * columnas; si no, la mitad de identidad borraría las alergias cada vez que
 * alguien corrigiera un apellido.
 *
 * Lo que esta regla NO cubre, y queda dicho: dos personas editando a la vez el
 * mismo registro no se mezclan — gana quien escribió después, con el registro
 * entero. Es lo mismo que hacía la hoja antes, y G2 decide qué avisar.
 */
export function colapsar(
  descriptor: Descriptor,
  filas: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const clave = descriptor.clave ?? 'id';
  const orden: string[] = [];
  const vivos = new Map<string, Record<string, unknown> | null>();

  for (const fila of filas ?? []) {
    const id = texto((fila ?? {})[clave]).trim();
    // Una fila sin clave no se puede agrupar. Agruparlas todas bajo la cadena
    // vacía inventaría un registro que nadie escribió.
    if (id.length === 0) continue;
    if (!vivos.has(id)) orden.push(id);

    if (estaDadaDeBaja(fila)) {
      vivos.set(id, null);
      continue;
    }
    if (hablaDe(descriptor, fila)) vivos.set(id, aModelo(descriptor, fila));
  }

  const salida: Record<string, unknown>[] = [];
  for (const id of orden) {
    const modelo = vivos.get(id);
    if (modelo) salida.push(modelo);
  }
  return salida;
}
