/**
 * Plan de instalación — Paté · Salud Familiar (Bloque E, E2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * QUÉ ES ESTO Y QUÉ NO
 * ────────────────────
 * Aquí viven las **decisiones** de la instalación: qué pestañas faltan, qué
 * carpetas hay que crear, qué disparadores borrar antes de crear cuáles, y qué
 * filas siembran los catálogos. Todo puro, todo probable sin abrir un navegador.
 *
 * Lo que NO vive aquí son las llamadas a Google. Esas están en
 * `apps-script/plantilla/Instalador.gs` y solo las puede comprobar una
 * ejecución real; de ahí que E2 tenga también una validación manual.
 *
 * Este fichero se **genera** a `Instalacion.gs` igual que el esquema, así que
 * el instalador ejecuta exactamente las funciones que estas pruebas verifican,
 * no una segunda versión escrita a mano que se parezca.
 *
 * LA IDEMPOTENCIA NO ES UN ADORNO
 * ───────────────────────────────
 * `instalar()` se va a ejecutar más de una vez: para completar una instalación
 * a medias, para migrar de versión de esquema, o sencillamente porque alguien
 * pulsa dos veces. Un instalador que añade un disparador por invocación agota
 * los 20 de cuota sin decir nada, y el síntoma aparece semanas después cuando
 * algo deja de programarse.
 *
 * Por eso el plan de disparadores es «borrar los míos y crearlos todos», nunca
 * «crear los que falten»: comparar disparadores existentes con los deseados es
 * más frágil que rehacerlos, y rehacerlos cuesta milisegundos.
 */

import { PESTANAS } from './esquemaHoja';

// ─────────────────────────────────────────────────────────────────────────────
// Pestañas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las pestañas que hay que crear, dadas las que ya existen.
 *
 * Devuelve nombres en el orden del esquema, no en el de la hoja: una
 * instalación a medias se completa dejando las pestañas en su sitio, no al
 * final.
 */
export function pestanasQueFaltan(existentes: readonly string[]): string[] {
  const hay = new Set(existentes ?? []);
  return PESTANAS.filter((p) => !hay.has(p.nombre)).map((p) => p.nombre);
}

/** Los encabezados de una pestaña, o `null` si no está en el esquema. */
export function encabezadosDe(nombre: string): string[] | null {
  const p = PESTANAS.filter((x) => x.nombre === nombre)[0];
  return p ? p.encabezados.slice() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Árbol de Drive
// ─────────────────────────────────────────────────────────────────────────────

/** Carpeta raíz en el Drive del titular. */
export const CARPETA_RAIZ = 'Paté · Salud Familiar';

/**
 * Las tres subcarpetas.
 *
 * `Temporal` es la única que acumula sin que nadie la mire, así que nace con
 * una regla escrita: lo que entre ahí lo borra el mantenimiento diario. Una
 * carpeta temporal sin política de vaciado en una aplicación clínica es un
 * sitio donde se quedan documentos de pacientes para siempre.
 */
export const SUBCARPETAS = ['Documentos', 'Respaldos', 'Temporal'] as const;

/** Días que sobrevive un fichero en `Temporal` antes de que el aseo lo retire. */
export const DIAS_RETENCION_TEMPORAL = 7;

/** Las que hay que crear, dadas las que ya existen. Respeta el orden. */
export function carpetasQueFaltan(existentes: readonly string[]): string[] {
  const hay = new Set(existentes ?? []);
  return SUBCARPETAS.filter((c) => !hay.has(c));
}

// ─────────────────────────────────────────────────────────────────────────────
// Disparadores
// ─────────────────────────────────────────────────────────────────────────────

export type TipoDisparador = 'ALAPERTURA' | 'DIARIO' | 'HORARIO';

export interface EspecificacionDisparador {
  /** Función que ejecuta. Es además su identidad: no hay dos con la misma. */
  funcion: string;
  tipo: TipoDisparador;
  /** Hora local a la que corre un disparador diario. */
  hora?: number;
  /** Para qué está, en una línea. */
  motivo: string;
}

/**
 * Los tres disparadores del backend.
 *
 * Tres, no veinte: la cuota son 20 por script y un disparador por cada orden
 * médica los agotaría en una familia activa. Las tareas concretas viven en la
 * pestaña `SEGUIMIENTOS` y las consume el disparador diario.
 */
export const DISPARADORES: readonly EspecificacionDisparador[] = [
  {
    funcion: 'registrarApertura',
    tipo: 'ALAPERTURA',
    motivo:
      'Deja constancia en AUDITORIA de cada apertura de la hoja. Es además la ' +
      'forma rápida de comprobar que un disparador instalado de verdad se ejecuta.',
  },
  {
    funcion: 'tareaDiaria',
    tipo: 'DIARIO',
    hora: 6,
    motivo:
      'Seguimientos vencidos, alertas de vacunas y aseo de la carpeta Temporal. ' +
      'A las 6 para que lo del día esté listo antes de que nadie abra la app.',
  },
  {
    funcion: 'tareaHoraria',
    tipo: 'HORARIO',
    motivo:
      'Escaneo de correo entrante. Hasta E11 no hace nada: el manifiesto no ' +
      'declara ámbito de Gmail a propósito.',
  },
];

/**
 * El `onOpen` simple NO se instala.
 *
 * `Instalador.gs` ya define un `onOpen` que Apps Script ejecuta solo, sin
 * disparador y sin autorización. Añadir encima un disparador instalable sobre
 * la misma función haría que el menú se construyera dos veces en cada apertura.
 * Por eso el disparador de apertura apunta a `registrarApertura`, que hace otra
 * cosa.
 */
export const FUNCION_MENU_SIMPLE = 'onOpen';

export interface PlanDisparadores {
  /** Los nuestros que hay ahora mismo. Se borran antes de crear. */
  aBorrar: string[];
  /** Los que se crean después. Siempre todos. */
  aCrear: EspecificacionDisparador[];
  /** Los que había y no son nuestros. Se dejan en paz. */
  ajenos: string[];
}

/**
 * Qué hacer con los disparadores, dado lo que ya hay.
 *
 * @param existentes Nombres de función de los disparadores del proyecto.
 */
export function planDeDisparadores(existentes: readonly string[]): PlanDisparadores {
  const nuestros = new Set(DISPARADORES.map((d) => d.funcion));
  const hay = existentes ?? [];

  return {
    // Se borran TODAS las apariciones, no una: si una instalación anterior
    // duplicó uno, esta pasada lo deja en uno.
    aBorrar: hay.filter((f) => nuestros.has(f)),
    aCrear: [...DISPARADORES],
    // Un disparador que no reconocemos lo puso alguien por su cuenta. Borrarlo
    // sería tomar una decisión sobre el proyecto de otra persona.
    ajenos: hay.filter((f) => !nuestros.has(f)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Semillas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dominios de confianza para la automatización de correo.
 *
 * Son los más comunes en Colombia y el titular los ajusta desde la aplicación.
 * Sembrarlos no autoriza nada por sí solo: `DOMINIOS_AUTORIZADOS` decide de
 * quién se acepta un mensaje, y un mensaje aceptado sigue pasando por la
 * bandeja de candidatos antes de tocar el expediente.
 */
export const SEMILLA_DOMINIOS: ReadonlyArray<readonly [string, string]> = [
  ['sura.com.co', 'EPS Sura'],
  ['colsanitas.com', 'Colsanitas'],
  ['compensar.com', 'Compensar'],
  ['famisanar.com.co', 'Famisanar'],
  ['nuevaeps.com.co', 'Nueva EPS'],
  ['salud-total.com.co', 'Salud Total'],
  ['sanitas.es', 'Sanitas'],
  ['colmedica.com', 'Colmédica'],
  ['synlab.co', 'Laboratorio Synlab'],
  ['labcolsanitas.com', 'Laboratorio Colsanitas'],
];

/**
 * Catálogo de vacunas caninas y felinas.
 *
 * Es una referencia para no escribir el nombre a mano cada vez, **no una pauta
 * clínica**: los meses son los de uso corriente y el veterinario manda. Por eso
 * ninguna fila dice «obligatoria» sin más: la columna existe, pero el criterio
 * es del profesional, no del catálogo.
 */
export const SEMILLA_CATALOGO_VACUNAS: ReadonlyArray<
  readonly [string, string, number, number, string]
> = [
  ['PERRO', 'Parvovirus', 2, 12, 'Refuerzo anual habitual'],
  ['PERRO', 'Moquillo', 2, 12, 'Suele ir en la polivalente'],
  ['PERRO', 'Hepatitis infecciosa', 2, 12, 'Suele ir en la polivalente'],
  ['PERRO', 'Leptospirosis', 3, 12, 'Refuerzo anual habitual'],
  ['PERRO', 'Rabia', 3, 12, 'Obligatoria en la mayoría de municipios'],
  ['PERRO', 'Tos de las perreras', 3, 12, 'Recomendada si convive con otros perros'],
  ['GATO', 'Panleucopenia', 2, 12, 'Suele ir en la trivalente'],
  ['GATO', 'Calicivirus', 2, 12, 'Suele ir en la trivalente'],
  ['GATO', 'Rinotraqueítis', 2, 12, 'Suele ir en la trivalente'],
  ['GATO', 'Leucemia felina', 3, 12, 'Recomendada si sale al exterior'],
  ['GATO', 'Rabia', 3, 12, 'Obligatoria en la mayoría de municipios'],
];

/** Una fila de `DOMINIOS_AUTORIZADOS` lista para escribir. */
export function filasDominios(ahora: string): string[][] {
  return SEMILLA_DOMINIOS.map((d, i) => [
    `dom-semilla-${i + 1}`,
    d[0],
    d[1],
    'SI',
    ahora,
    ahora,
    '',
  ]);
}

/** Una fila de `CATALOGO_VACUNAS` lista para escribir. */
export function filasCatalogoVacunas(): string[][] {
  return SEMILLA_CATALOGO_VACUNAS.map((v, i) => [
    `vac-semilla-${i + 1}`,
    v[0],
    v[1],
    String(v[2]),
    String(v[3]),
    'NO',
    v[4],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Propiedades del script
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identificador de la hoja, guardado durante la instalación.
 *
 * En una ejecución de Web App no hay documento activo, así que
 * `getActiveSpreadsheet()` devuelve null y el router no sabría a qué hoja
 * hablar. La instalación es el único momento en que se puede capturar.
 */
export const CLAVE_ID_HOJA = 'ID_HOJA';

/** Cliente OAuth contra el que se valida el `aud` de cada `id_token`. */
export const CLAVE_CLIENTE_OAUTH = 'OAUTH_CLIENT_ID';

/** Versión de la caché de ACCESO. La incrementa cada mutación. */
export const CLAVE_VERSION_ACCESO = 'ACCESO_VERSION';

/** Límite de una ejecución de Apps Script, en milisegundos. */
export const LIMITE_EJECUCION_MS = 6 * 60 * 1000;

/**
 * A partir de aquí, la instalación va demasiado apretada.
 *
 * No es el límite: es el punto en el que conviene partirla en fases antes de
 * que una familia con más datos se lo encuentre de golpe.
 */
export const UMBRAL_ALERTA_MS = 180 * 1000;

export type VeredictoDuracion = 'HOLGADO' | 'ACEPTABLE' | 'PARTIR';

/** Qué decir del tiempo que tardó una instalación. */
export function veredictoDuracion(ms: number): VeredictoDuracion {
  if (ms < 60_000) return 'HOLGADO';
  if (ms < UMBRAL_ALERTA_MS) return 'ACEPTABLE';
  return 'PARTIR';
}
