/**
 * Instalador.gs — crear el expediente de una familia (Bloque E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se ejecuta desde el menú de la hoja, una vez, por el titular. Es el único
 * momento en que el script corre con una interfaz delante, y eso importa: es
 * también el único momento en que `Session.getEffectiveUser().getEmail()`
 * devuelve algo útil. Por eso `email_titular` se captura AQUÍ y se guarda en
 * `CONFIG`, en vez de resolverse en cada petición, donde vendría vacío.
 *
 * IDEMPOTENTE, Y NO COMO ADORNO
 * ─────────────────────────────
 * `instalar()` se puede ejecutar dos veces. Crea solo lo que falta y **borra
 * sus propios disparadores antes de crearlos**. Un instalador que añade un
 * disparador por invocación agota los 20 de cuota sin que nadie lo note, y el
 * síntoma aparece semanas después, cuando algo deja de programarse.
 *
 * También es la vía de migración: compara `CONFIG.version_esquema` con
 * `VERSION_ESQUEMA` y aplica lo que falte.
 *
 * LO QUE E1 NO HACE
 * ─────────────────
 * Sembrar catálogos es E2. Aquí solo están el contrato y el menú, que sí tiene
 * que existir desde el principio: `onOpen` es lo que hace que el titular
 * encuentre por dónde empezar después de copiar la hoja, y funciona sin
 * autorización previa.
 *
 * ESTADO: E1 · contrato y menú. La implementación llega en E2.
 */

/**
 * Propiedad donde se guarda el identificador de la hoja.
 *
 * No es un atajo: en una ejecución de Web App **no hay documento activo**, así
 * que `getActiveSpreadsheet()` devuelve null y el router no sabría a qué hoja
 * hablar. El identificador se captura aquí, durante la instalación, que es el
 * único momento en que el script corre desde la propia hoja.
 */
var CLAVE_ID_HOJA = 'ID_HOJA';

/** Carpeta raíz que el instalador crea en el Drive del titular. */
var CARPETA_RAIZ = 'Paté · Salud Familiar';

/** Subcarpetas del árbol de documentos. */
var SUBCARPETAS = ['DOCUMENTOS', 'EXAMENES', 'ORDENES', 'MASCOTAS'];

/** Menú de la hoja. Lo dibuja `onOpen`, que no necesita autorización. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Paté')
    .addItem('Instalar', 'instalar')
    .addItem('Diagnóstico', 'mostrarDiagnostico')
    .addToUi();
}

/**
 * Crea o completa el expediente de esta familia.
 *
 * Pasos, en orden: pestañas y encabezados desde `PESTANAS` → árbol de Drive →
 * `CONFIG` con el correo del titular → fila TITULAR en `ACCESO` →
 * disparadores → cliente OAuth y **identificador de la hoja** en
 * `PropertiesService`.
 *
 * E2 tiene que **cronometrarlo y dejar el total en la hoja**: el límite de una
 * ejecución es de 6 minutos, y de cuánto tarde depende que vaya de una pasada
 * o nazca partido en fases. Es uno de los cabos que E0-bis dejó abiertos.
 *
 * @return {{creadas: number, msTotal: number}}
 */
function instalar() {
  throw new Error('NO_IMPLEMENTADO: E2');
}

/**
 * Crea los disparadores del script, borrando antes los suyos.
 *
 * Los disparadores NO viajan al copiar la hoja —E0-bis comprobó que el código
 * sí y ellos no—, así que crearlos aquí no es una comodidad: es la única forma
 * de que existan en la copia de cada titular.
 */
function instalarDisparadores() {
  throw new Error('NO_IMPLEMENTADO: E2');
}

/** Estado del expediente: si hace falta instalar, migrar o nada. */
function mostrarDiagnostico() {
  throw new Error('NO_IMPLEMENTADO: E2');
}
