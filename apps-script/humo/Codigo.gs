/**
 * Paté · Salud Familiar — Script de humo del Bloque E (E0-bis)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ESTO NO ES EL BACKEND. Es lo mínimo necesario para responder empíricamente a
 * las cuatro preguntas que la documentación de Google no cierra:
 *
 *   1. ¿`executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS` responde a un
 *      `fetch` de origen cruzado sin morir en CORS?
 *   2. ¿Qué pantalla exacta ve el titular al autorizar, con estos ámbitos?
 *   3. ¿`/copy` de la hoja arrastra el script, y se pueden crear disparadores
 *      desde código en una cuenta @gmail.com gratuita?
 *   4. ¿Cuánto tarda de verdad una instalación como la del Bloque E, frente al
 *      límite de 6 minutos por ejecución?
 *
 * NINGÚN DATO REAL. Este script crea pestañas vacías y una carpeta de prueba
 * en el Drive de quien lo ejecuta. No lee correo, no toca Calendar y no envía
 * nada a ninguna parte.
 *
 * CÓMO SE MIDE
 * ────────────
 * El tiempo no se cronometra a mano: `instalarSimulado()` lo mide con
 * `Date.now()` y lo escribe en la pestaña `MEDICIONES` junto con el resto del
 * diagnóstico. Un cronómetro humano mide también el tiempo de mirar el reloj.
 *
 * LIMPIEZA
 * ────────
 * `limpiar()` borra las pestañas creadas, los disparadores y la carpeta de
 * prueba. La hoja de humo se puede tirar entera cuando E0-bis termine.
 */

/** Pestañas que crea la instalación simulada: las mismas 18 del Bloque E. */
var PESTANAS = [
  'CONFIG', 'ACCESO', 'PACIENTES', 'PERFIL_HUMANO', 'PERFIL_MASCOTA',
  'CITAS', 'VACUNAS', 'EXAMENES', 'EXAMENES_RESULTADOS', 'DOCUMENTOS',
  'MEDICAMENTOS', 'DOSIS', 'CONTROLES', 'ORDENES', 'RECORDATORIOS',
  'SEGUIMIENTOS', 'DOMINIOS_AUTORIZADOS', 'CATALOGO_VACUNAS',
];

var PESTANA_MEDICIONES = 'MEDICIONES';
var CARPETA_PRUEBA = 'PATE-HUMO-E0BIS';
var FUNCION_DISPARADOR = 'tareaDePrueba';

// ─────────────────────────────────────────────────────────────────────────────
// Menú
// ─────────────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Paté · Humo')
    .addItem('1 · Instalación simulada (mide el tiempo)', 'instalarSimulado')
    .addItem('2 · Crear disparador de prueba', 'crearTriggerDePrueba')
    .addItem('3 · Diagnóstico', 'mostrarDiagnostico')
    .addSeparator()
    .addItem('9 · Limpiar todo', 'limpiar')
    .addToUi();
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto 1 · El Web App
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `doGet` existe para poder abrir la URL en el navegador y confirmar de un
 * vistazo que la implementación está viva antes de pelearse con CORS.
 */
function doGet() {
  return responder({ ok: true, metodo: 'GET', version: 'humo-1' });
}

/**
 * `doPost` devuelve además las dos identidades.
 *
 * Es la comprobación de que `Session.getActiveUser().getEmail()` viene vacío
 * con `executeAs: USER_DEPLOYING` —la documentación lo dice, pero conviene
 * verlo— y de que `getEffectiveUser()` sí devuelve al titular. De ahí sale la
 * regla del Bloque E: la identidad de quien llama no puede salir de `Session`,
 * tiene que salir del `id_token` verificado.
 *
 * El cuerpo llega como texto plano a propósito: un Web App de Apps Script no
 * responde a un preflight `OPTIONS`, así que `application/json` mataría la
 * petición en CORS antes de llegar aquí.
 */
function doPost(e) {
  var accion = '';
  try {
    if (e && e.postData && e.postData.contents) {
      accion = String(JSON.parse(e.postData.contents).accion || '');
    }
  } catch (err) {
    accion = 'CUERPO_ILEGIBLE';
  }
  if (!accion && e && e.parameter) accion = String(e.parameter.action || '');

  return responder({
    ok: true,
    metodo: 'POST',
    accion: accion,
    tipoContenido: e && e.postData ? e.postData.type : null,
    // Se espera cadena vacía: es la prueba de la trampa que describe §2.1.
    usuarioActivo: Session.getActiveUser().getEmail(),
    usuarioEfectivo: Session.getEffectiveUser().getEmail(),
    zonaHoraria: Session.getScriptTimeZone(),
  });
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto 3 · Disparadores creados desde código
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un disparador cada minuto y borra antes los suyos.
 *
 * Idempotente a propósito: `instalar()` del Bloque E se va a poder reejecutar,
 * y un instalador que duplica disparadores en cada pasada agota los 20 que
 * permite la cuota sin que nadie se dé cuenta.
 */
function crearTriggerDePrueba() {
  borrarTriggersDePrueba();
  ScriptApp.newTrigger(FUNCION_DISPARADOR).timeBased().everyMinutes(1).create();
  var total = ScriptApp.getProjectTriggers().length;
  registrar('disparadores_tras_crear', total);
  return total;
}

function borrarTriggersDePrueba() {
  var borrados = 0;
  var todos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].getHandlerFunction() === FUNCION_DISPARADOR) {
      ScriptApp.deleteTrigger(todos[i]);
      borrados++;
    }
  }
  return borrados;
}

/** Lo que ejecuta el disparador: deja constancia de que corrió y con quién. */
function tareaDePrueba() {
  registrar('disparador_ejecutado', new Date().toISOString());
  registrar('disparador_identidad', Session.getEffectiveUser().getEmail());
}

// ─────────────────────────────────────────────────────────────────────────────
// Punto 4 · Cuánto tarda una instalación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea las 18 pestañas, siembra encabezados, monta el árbol de Drive y mide.
 *
 * Es idempotente: no crea lo que ya existe. Eso importa para la medición,
 * porque el número que interesa es el de la **primera** pasada, que es la que
 * un titular real va a ejecutar.
 */
function instalarSimulado() {
  var t0 = Date.now();
  var hoja = SpreadsheetApp.getActiveSpreadsheet();
  var creadas = 0;

  for (var i = 0; i < PESTANAS.length; i++) {
    var nombre = PESTANAS[i];
    if (hoja.getSheetByName(nombre)) continue;
    var pestana = hoja.insertSheet(nombre);
    // Unos encabezados cualesquiera: lo que se mide es el coste de escribir,
    // no el contenido.
    pestana.getRange(1, 1, 1, 6).setValues([['id', 'campo_1', 'campo_2', 'campo_3', 'creado_en', 'notas']]);
    pestana.setFrozenRows(1);
    creadas++;
  }

  var tPestanas = Date.now() - t0;

  // Árbol de Drive, como el que monta el instalador real.
  var tDrive0 = Date.now();
  var raiz = carpetaPorNombre(CARPETA_PRUEBA);
  var subcarpetas = ['DOCUMENTOS', 'EXAMENES', 'ORDENES', 'MASCOTAS'];
  for (var j = 0; j < subcarpetas.length; j++) {
    if (!raiz.getFoldersByName(subcarpetas[j]).hasNext()) {
      raiz.createFolder(subcarpetas[j]);
    }
  }
  var tDrive = Date.now() - tDrive0;

  var total = Date.now() - t0;

  registrar('pestanas_creadas', creadas);
  registrar('ms_pestanas', tPestanas);
  registrar('ms_drive', tDrive);
  registrar('ms_total_instalacion', total);
  registrar('limite_ms_por_ejecucion', 6 * 60 * 1000);
  registrar('margen_ms', 6 * 60 * 1000 - total);

  return { creadas: creadas, msTotal: total };
}

function carpetaPorNombre(nombre) {
  var existentes = DriveApp.getFoldersByName(nombre);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(nombre);
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico y registro
// ─────────────────────────────────────────────────────────────────────────────

/** Escribe una fila en `MEDICIONES`. Es el acta de la prueba. */
function registrar(clave, valor) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet();
  var pestana = hoja.getSheetByName(PESTANA_MEDICIONES);
  if (!pestana) {
    pestana = hoja.insertSheet(PESTANA_MEDICIONES, 0);
    pestana.getRange(1, 1, 1, 3).setValues([['momento', 'clave', 'valor']]);
    pestana.setFrozenRows(1);
  }
  pestana.appendRow([new Date(), clave, valor]);
}

function diagnostico() {
  return {
    usuarioEfectivo: Session.getEffectiveUser().getEmail(),
    usuarioActivo: Session.getActiveUser().getEmail(),
    zonaHoraria: Session.getScriptTimeZone(),
    disparadores: ScriptApp.getProjectTriggers().length,
    idHoja: SpreadsheetApp.getActiveSpreadsheet().getId(),
    pestanas: SpreadsheetApp.getActiveSpreadsheet().getSheets().length,
  };
}

function mostrarDiagnostico() {
  var d = diagnostico();
  var texto = '';
  for (var clave in d) {
    if (Object.prototype.hasOwnProperty.call(d, clave)) {
      texto += clave + ': ' + d[clave] + '\n';
      registrar('diag_' + clave, d[clave]);
    }
  }
  SpreadsheetApp.getUi().alert('Diagnóstico del script de humo', texto, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ─────────────────────────────────────────────────────────────────────────────
// Limpieza
// ─────────────────────────────────────────────────────────────────────────────

function limpiar() {
  var borrados = borrarTriggersDePrueba();

  var hoja = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < PESTANAS.length; i++) {
    var pestana = hoja.getSheetByName(PESTANAS[i]);
    if (pestana) hoja.deleteSheet(pestana);
  }

  var carpetas = DriveApp.getFoldersByName(CARPETA_PRUEBA);
  while (carpetas.hasNext()) {
    // A la papelera, no borrado definitivo: el usuario decide si la vacía.
    carpetas.next().setTrashed(true);
  }

  registrar('limpieza', 'disparadores borrados: ' + borrados);
}
