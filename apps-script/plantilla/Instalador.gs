/**
 * Instalador.gs — crear el expediente de una familia (Bloque E, E2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se ejecuta desde el menú de la hoja, por el titular. Es el único momento en
 * que el script corre **desde el documento**, y de ahí salen dos cosas que
 * después no se podrían conseguir:
 *
 *   · `Session.getEffectiveUser().getEmail()`, el correo del titular. En una
 *     ejecución de Web App vendría vacío.
 *   · `SpreadsheetApp.getActive().getId()`, el identificador de la hoja. En una
 *     ejecución de Web App no hay documento activo. Sin guardarlo aquí, el
 *     router no sabría a qué hoja hablar.
 *
 * LAS DECISIONES NO ESTÁN AQUÍ
 * ────────────────────────────
 * Qué pestañas faltan, qué carpetas crear y qué disparadores borrar antes de
 * cuáles se decide en `Instalacion.gs`, que se genera desde TypeScript y tiene
 * pruebas. Este fichero es la parte que solo se puede comprobar ejecutándola:
 * las llamadas a Google.
 *
 * IDEMPOTENTE
 * ───────────
 * Se puede ejecutar dos veces. Crea solo lo que falta y **borra sus propios
 * disparadores antes de crearlos**. Un instalador que añade uno por invocación
 * agota los 20 de cuota sin decir nada, y el síntoma aparece semanas después,
 * cuando algo deja de programarse.
 */

/** Clave donde se guarda cuándo y cuánto tardó la última instalación. */
var CLAVE_ULTIMA_INSTALACION = 'ULTIMA_INSTALACION';

// ─────────────────────────────────────────────────────────────────────────────
// Menú
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menú de la hoja.
 *
 * Es un disparador **simple**: Apps Script lo ejecuta solo, sin autorización
 * previa. Por eso el titular ve «Paté ▸ Instalar» nada más abrir su copia, que
 * es justo lo que necesita para empezar.
 *
 * No se instala un disparador encima de esta función: lo haría correr dos veces
 * por apertura y el menú se construiría por duplicado.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Paté')
    .addItem('Instalar o actualizar', 'instalar')
    .addItem('Diagnóstico', 'mostrarDiagnostico')
    .addSeparator()
    .addItem('Quitar disparadores', 'desinstalar')
    .addToUi();
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea o completa el expediente de esta familia.
 *
 * Devuelve el resumen y lo escribe además en `AUDITORIA`, para que quede
 * constancia de cuánto tardó. El tiempo no es una curiosidad: el límite de una
 * ejecución son 6 minutos, y de lo que mida depende que la próxima versión vaya
 * de una pasada o nazca partida en fases.
 */
function instalar() {
  // Un cerrojo de documento. `instalar()` se puede lanzar desde el menú y desde
  // el editor a la vez, y dos pasadas simultáneas crearían las pestañas por
  // duplicado: las dos leerían la lista de existentes antes de que ninguna
  // hubiera escrito. La idempotencia protege de repetir, no de solaparse.
  var cerrojo = LockService.getDocumentLock();
  if (!cerrojo.tryLock(30000)) {
    SpreadsheetApp.getActive().toast('Ya hay una instalación en curso.', 'Paté', 8);
    return null;
  }
  try {
    return instalarConCerrojo_();
  } finally {
    cerrojo.releaseLock();
  }
}

function instalarConCerrojo_() {
  var t0 = Date.now();
  var hoja = SpreadsheetApp.getActive();
  var resumen = {
    pestanasCreadas: 0,
    carpetasCreadas: 0,
    disparadoresBorrados: 0,
    disparadoresCreados: 0,
    semillasEscritas: 0,
  };

  // 1 · Pestañas. Se crean en el orden del esquema, con su fila de encabezados
  //     congelada para que no se pierda al desplazarse.
  var existentes = hoja.getSheets().map(function (h) {
    return h.getName();
  });
  var faltan = pestanasQueFaltan(existentes);
  for (var i = 0; i < faltan.length; i++) {
    crearPestana_(hoja, faltan[i]);
    resumen.pestanasCreadas++;
  }

  // 2 · Identidad de la familia y del documento. Antes que nada de lo que
  //     venga después, porque todo lo demás se apoya en esto.
  var propiedades = PropertiesService.getScriptProperties();
  propiedades.setProperty(CLAVE_ID_HOJA, hoja.getId());
  var emailTitular = Session.getEffectiveUser().getEmail();
  escribirConfig_(hoja, emailTitular);
  asegurarTitular_(hoja, emailTitular);

  // 3 · Semillas. Solo si la pestaña está vacía: reejecutar no debe duplicar
  //     catálogos ni resucitar dominios que el titular quitó a propósito.
  resumen.semillasEscritas += sembrarSiVacia_(hoja, 'DOMINIOS_AUTORIZADOS', filasDominios(ahoraISO_()));
  resumen.semillasEscritas += sembrarSiVacia_(hoja, 'CATALOGO_VACUNAS', filasCatalogoVacunas());

  // 4 · Árbol de Drive.
  var raiz = carpetaRaiz_();
  var subcarpetas = listarSubcarpetas_(raiz);
  var porCrear = carpetasQueFaltan(subcarpetas);
  for (var j = 0; j < porCrear.length; j++) {
    crearCarpeta_(porCrear[j], raiz);
    resumen.carpetasCreadas++;
  }

  // 5 · Disparadores. Borrar los nuestros y crearlos todos: comparar lo que hay
  //     con lo que debería haber es más frágil que rehacerlos, y rehacerlos
  //     cuesta milisegundos.
  var cambios = instalarDisparadores();
  resumen.disparadoresBorrados = cambios.borrados;
  resumen.disparadoresCreados = cambios.creados;

  var ms = Date.now() - t0;
  resumen.msTotal = ms;
  resumen.veredicto = veredictoDuracion(ms);

  propiedades.setProperty(
    CLAVE_ULTIMA_INSTALACION,
    JSON.stringify({ cuando: ahoraISO_(), ms: ms, veredicto: resumen.veredicto }),
  );
  auditar_('INSTALAR', 'OK', JSON.stringify(resumen));

  SpreadsheetApp.getActive().toast(
    'Instalación terminada en ' + (ms / 1000).toFixed(1) + ' s',
    'Paté',
    8,
  );
  return resumen;
}

/**
 * Crea los disparadores del proyecto, borrando antes los propios.
 *
 * Los ajenos se dejan en paz: borrar un disparador que puso otra persona es
 * tomar una decisión sobre su proyecto.
 */
function instalarDisparadores() {
  var actuales = ScriptApp.getProjectTriggers();
  var nombres = actuales.map(function (t) {
    return t.getHandlerFunction();
  });
  var plan = planDeDisparadores(nombres);

  var borrados = 0;
  for (var i = 0; i < actuales.length; i++) {
    if (plan.aBorrar.indexOf(actuales[i].getHandlerFunction()) === -1) continue;
    ScriptApp.deleteTrigger(actuales[i]);
    borrados++;
  }

  var creados = 0;
  for (var j = 0; j < plan.aCrear.length; j++) {
    crearDisparador_(plan.aCrear[j]);
    creados++;
  }

  return { borrados: borrados, creados: creados, ajenos: plan.ajenos };
}

/** Quita los disparadores de Paté y deja el resto del expediente intacto. */
function desinstalar() {
  var actuales = ScriptApp.getProjectTriggers();
  var nombres = actuales.map(function (t) {
    return t.getHandlerFunction();
  });
  var plan = planDeDisparadores(nombres);

  var borrados = 0;
  for (var i = 0; i < actuales.length; i++) {
    if (plan.aBorrar.indexOf(actuales[i].getHandlerFunction()) === -1) continue;
    ScriptApp.deleteTrigger(actuales[i]);
    borrados++;
  }

  auditar_('DESINSTALAR', 'OK', 'disparadores borrados: ' + borrados);
  SpreadsheetApp.getActive().toast(borrados + ' disparadores retirados', 'Paté', 5);
  return borrados;
}

/** Qué hay instalado y qué falta. No cambia nada. */
function mostrarDiagnostico() {
  var hoja = SpreadsheetApp.getActive();
  var existentes = hoja.getSheets().map(function (h) {
    return h.getName();
  });
  var propiedades = PropertiesService.getScriptProperties();
  var ultima = propiedades.getProperty(CLAVE_ULTIMA_INSTALACION);

  var lineas = [
    'Pestañas: ' +
      (NOMBRES_PESTANAS.length - pestanasQueFaltan(existentes).length) +
      ' de ' +
      NOMBRES_PESTANAS.length,
    'Disparadores: ' + ScriptApp.getProjectTriggers().length,
    'Identificador de hoja guardado: ' + (propiedades.getProperty(CLAVE_ID_HOJA) ? 'sí' : 'NO'),
    'Cliente OAuth configurado: ' + (propiedades.getProperty(CLAVE_CLIENTE_OAUTH) ? 'sí' : 'NO'),
    'Versión de esquema: ' + VERSION_ESQUEMA,
    'Última instalación: ' + (ultima || 'ninguna'),
  ];

  SpreadsheetApp.getUi().alert('Diagnóstico de Paté', lineas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que ejecutan los disparadores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NINGUNO DE ESTOS TRES PUEDE LANZAR UNA EXCEPCIÓN.
 *
 * Cuando un disparador falla, Apps Script le manda un correo al dueño del
 * script. Un disparador horario que falla son veinticuatro correos al día
 * diciendo lo mismo, y a la tercera mañana el titular desinstala la aplicación.
 *
 * Así que lo que todavía no existe **no se intenta**: se registra y se sale.
 */

/** Deja constancia de una apertura. Es la prueba de vida de los disparadores. */
function registrarApertura() {
  try {
    auditar_('APERTURA', 'OK', '');
  } catch (err) {
    // Ni siquiera esto puede tumbar el disparador.
  }
}

/** Seguimientos vencidos, alertas y aseo de la carpeta Temporal. */
function tareaDiaria() {
  try {
    auditar_('TAREA_DIARIA', 'PENDIENTE', 'Se implementa en E11');
  } catch (err) {
    // Silencio a propósito: ver el comentario de arriba.
  }
}

/**
 * Escaneo de correo entrante.
 *
 * Hasta E11 no hace nada, y no puede hacerlo: el manifiesto **no declara
 * ámbito de Gmail a propósito**, porque `gmail.readonly` es restringido y
 * obligaría a cada titular a volver a autorizar con una pantalla mucho más
 * seria. Cuando esa función llegue, será una decisión con su propio coste.
 */
function tareaHoraria() {
  try {
    auditar_('TAREA_HORARIA', 'PENDIENTE', 'Se implementa en E11');
  } catch (err) {
    // Silencio a propósito: ver el comentario de arriba.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auxiliares
// ─────────────────────────────────────────────────────────────────────────────

function ahoraISO_() {
  return new Date().toISOString();
}

/** Crea una pestaña con sus encabezados y la fila congelada. */
function crearPestana_(hoja, nombre) {
  var encabezados = encabezadosDe(nombre);
  if (!encabezados) throw new Error('PESTANA_DESCONOCIDA: ' + nombre);

  var pestana = hoja.insertSheet(nombre);
  pestana.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
  pestana.setFrozenRows(1);
  pestana.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
  return pestana;
}

/** Escribe `CONFIG` conservando el identificador de familia si ya existía. */
function escribirConfig_(hoja, emailTitular) {
  var pestana = hoja.getSheetByName('CONFIG');
  var encabezados = encabezadosDe('CONFIG');
  var existente = pestana.getLastRow() > 1 ? pestana.getRange(2, 1, 1, encabezados.length).getValues()[0] : null;

  var familiaId = existente && existente[0] ? existente[0] : 'fam-' + Utilities.getUuid().slice(0, 8);
  var nombreFamilia = existente && existente[1] ? existente[1] : 'Mi familia';
  var creadaEn = existente && existente[3] ? existente[3] : ahoraISO_();
  var sucesor = existente && existente[5] ? existente[5] : '';

  pestana
    .getRange(2, 1, 1, encabezados.length)
    .setValues([[familiaId, nombreFamilia, emailTitular, creadaEn, VERSION_ESQUEMA, sucesor]]);
}

/** Asegura la fila del titular en ACCESO, sin duplicarla ni degradarla. */
function asegurarTitular_(hoja, emailTitular) {
  var pestana = hoja.getSheetByName('ACCESO');
  var encabezados = encabezadosDe('ACCESO');
  var filas = pestana.getLastRow() > 1 ? pestana.getRange(2, 1, pestana.getLastRow() - 1, 1).getValues() : [];

  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]).toLowerCase() === String(emailTitular).toLowerCase()) return;
  }

  var fila = new Array(encabezados.length).fill('');
  fila[0] = emailTitular;
  fila[1] = 'TITULAR';
  fila[2] = '*';
  fila[4] = 'ACTIVO';
  fila[8] = ahoraISO_();
  pestana.appendRow(fila);
}

/** Siembra una pestaña solo si está vacía. Devuelve cuántas filas escribió. */
function sembrarSiVacia_(hoja, nombre, filas) {
  var pestana = hoja.getSheetByName(nombre);
  if (!pestana || pestana.getLastRow() > 1) return 0;
  if (!filas.length) return 0;
  pestana.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
  return filas.length;
}

/**
 * La carpeta raíz en el Drive del titular, creándola si hace falta.
 *
 * Con `drive.file` el script solo ve lo que él mismo creó, así que esta
 * búsqueda encuentra la carpeta de una instalación anterior y nada más. Es
 * justo lo que hace falta para ser idempotente sin husmear el Drive ajeno.
 */
function carpetaRaiz_() {
  var encontradas = Drive.Files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and name = '" + CARPETA_RAIZ + "' and trashed = false",
    fields: 'files(id,name)',
  });
  if (encontradas.files && encontradas.files.length > 0) return encontradas.files[0];
  return crearCarpeta_(CARPETA_RAIZ, null);
}

function listarSubcarpetas_(raiz) {
  var hijas = Drive.Files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and '" + raiz.id + "' in parents and trashed = false",
    fields: 'files(id,name)',
  });
  return (hijas.files || []).map(function (f) {
    return f.name;
  });
}

function crearCarpeta_(nombre, padre) {
  var cuerpo = { name: nombre, mimeType: 'application/vnd.google-apps.folder' };
  if (padre) cuerpo.parents = [padre.id];
  // Un solo argumento: la forma con `media` nula y `optionalArgs` es la que
  // más a menudo falla, y aquí no se sube ningún contenido. La respuesta por
  // defecto de Drive v3 ya trae `id` y `name`, que es todo lo que se usa.
  return Drive.Files.create(cuerpo);
}

/** Traduce una especificación de disparador a la API de `ScriptApp`. */
function crearDisparador_(especificacion) {
  if (especificacion.tipo === 'ALAPERTURA') {
    return ScriptApp.newTrigger(especificacion.funcion)
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onOpen()
      .create();
  }
  if (especificacion.tipo === 'DIARIO') {
    return ScriptApp.newTrigger(especificacion.funcion)
      .timeBased()
      .everyDays(1)
      .atHour(especificacion.hora)
      .create();
  }
  return ScriptApp.newTrigger(especificacion.funcion).timeBased().everyHours(1).create();
}

/**
 * Una línea en `AUDITORIA`.
 *
 * Solo se añade; nunca se edita ni se borra. Y nunca lleva contenido clínico:
 * registra quién hizo qué, no qué le pasó a un paciente. Eso es `HISTORIAL`.
 */
function auditar_(accion, resultado, detalle) {
  var id = PropertiesService.getScriptProperties().getProperty(CLAVE_ID_HOJA);
  var hoja = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  var pestana = hoja.getSheetByName('AUDITORIA');
  if (!pestana) return;

  pestana.appendRow([
    'aud-' + Utilities.getUuid().slice(0, 8),
    ahoraISO_(),
    Session.getEffectiveUser().getEmail(),
    accion,
    'SISTEMA',
    '',
    resultado,
    detalle || '',
  ]);
}
