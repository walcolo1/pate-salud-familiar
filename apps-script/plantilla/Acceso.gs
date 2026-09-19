/**
 * Acceso.gs — leer y mutar la pestaña ACCESO (Bloque E, E4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * E3 dice **quién** llama. Aquí se responde **qué es** dentro de este
 * expediente, y eso se decide en una sola fila de la pestaña `ACCESO` de esta
 * hoja y de ninguna otra.
 *
 * De qué titular son los datos no se pregunta: lo decide a qué URL se hizo el
 * POST. Cada familia tiene su despliegue, su hoja y su Drive.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí está lo que necesita hoja, caché o cerrojo. Las decisiones —resolver el
 * rol, el alcance, la clave versionada, qué mutaciones son coherentes— viven en
 * `Autorizacion.gs`, que se genera desde `src/lib/acceso.ts` y tiene 40
 * pruebas.
 *
 * LA HOJA SE ABRE POR IDENTIFICADOR
 * ─────────────────────────────────
 * `getActiveSpreadsheet()` devuelve null en una ejecución de Web App: no hay
 * documento activo. Se abre con el identificador que `instalar()` guardó, y por
 * eso el manifiesto pide `spreadsheets` completo y no `currentonly`.
 */

/** Cuánto espera el cerrojo antes de rendirse, en milisegundos. */
var ESPERA_CERROJO_MS = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué es este correo en esta hoja.
 *
 * @param {string} emailNormalizado  El que devolvió `verificarIdentidad`.
 * @return {Object} El acceso resuelto.
 * @throws {Error} `ACCESO_DENEGADO` si no figura o no está activo.
 */
function resolverAccesoLocal(emailNormalizado) {
  var propiedades = PropertiesService.getScriptProperties();
  var version = versionDesde(propiedades.getProperty(CLAVE_VERSION_ACCESO));

  // La versión se inicializa la primera vez, para que exista desde el principio
  // y `mutarAcceso` no tenga que preocuparse de su ausencia.
  if (!propiedades.getProperty(CLAVE_VERSION_ACCESO)) {
    propiedades.setProperty(CLAVE_VERSION_ACCESO, String(version));
  }

  var cache = CacheService.getScriptCache();
  var clave = claveAcceso(emailNormalizado, version);

  // 1 · ¿Ya se resolvió con ESTA versión?
  //
  // Si el titular revocó a alguien desde la última vez, la versión subió, la
  // clave es otra y esta búsqueda falla por construcción. No hay que invalidar
  // nada: la entrada vieja deja de encontrarse y caduca sola.
  var enCache = leerCacheAcceso(cache.get(clave), version);
  if (enCache) return enCache;

  // 2 · Leer la hoja.
  var hoja = abrirHoja_();
  var pestana = hoja.getSheetByName('ACCESO');
  if (!pestana) {
    registrarDenegacion_('la pestaña ACCESO no existe');
    throw new Error(ERROR_ACCESO);
  }

  var filas = [];
  if (pestana.getLastRow() > 1) {
    filas = pestana
      .getRange(2, 1, pestana.getLastRow() - 1, pestana.getLastColumn())
      .getValues();
  }

  var resultado = resolverAcceso(emailNormalizado, filas, emailTitular_(hoja), version);

  if (!resultado.permitido) {
    // El motivo se queda dentro. Decir «figuras pero estás revocado» en vez de
    // «no figuras» le confirma a quien lo intenta que ese correo existe en esta
    // familia.
    registrarDenegacion_(resultado.motivo);
    throw new Error(ERROR_ACCESO);
  }

  cache.put(clave, serializarAcceso(resultado.acceso), CACHE_ACCESO_SEGUNDOS);
  return resultado.acceso;
}

/** El correo del titular, de `CONFIG`. Lo capturó `instalar()`. */
function emailTitular_(hoja) {
  var config = hoja.getSheetByName('CONFIG');
  if (!config || config.getLastRow() < 2) return '';
  var encabezados = encabezadosDe('CONFIG') || [];
  var columna = encabezados.indexOf('email_titular');
  if (columna === -1) return '';
  return String(config.getRange(2, columna + 1).getValue() || '').trim();
}

function abrirHoja_() {
  var id = PropertiesService.getScriptProperties().getProperty(CLAVE_ID_HOJA);
  if (!id) {
    registrarDenegacion_('sin ID_HOJA: la instalación no terminó');
    throw new Error(ERROR_ACCESO);
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Anota el último acceso de alguien.
 *
 * No bloquea la respuesta ni la tumba si falla: es un dato de conveniencia, y
 * perderlo no debe costarle la petición a un familiar.
 */
function registrarAcceso(emailNormalizado) {
  try {
    var hoja = abrirHoja_();
    var pestana = hoja.getSheetByName('ACCESO');
    if (!pestana || pestana.getLastRow() < 2) return;

    var encabezados = encabezadosDe('ACCESO') || [];
    var colEmail = encabezados.indexOf('email');
    var colUltimo = encabezados.indexOf('ultimo_acceso');
    if (colEmail === -1 || colUltimo === -1) return;

    var correos = pestana.getRange(2, colEmail + 1, pestana.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < correos.length; i++) {
      if (String(correos[i][0]).trim().toLowerCase() !== emailNormalizado) continue;
      pestana.getRange(i + 2, colUltimo + 1).setValue(new Date().toISOString());
      return;
    }
  } catch (err) {
    console.warn('no se pudo anotar el último acceso');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La ÚNICA puerta de escritura sobre `ACCESO`.
 *
 * Tres cosas pasan aquí y las tres importan:
 *
 *   1. Un **cerrojo de script**. Dos titulares no existen, pero sí dos
 *      pestañas del mismo titular: sin cerrojo, revocar y cambiar un rol a la
 *      vez leerían la misma hoja y una de las dos escrituras desaparecería.
 *   2. La escritura.
 *   3. **La versión sube.** Es lo que hace que revocar surta efecto en la
 *      siguiente petición y no dentro de cinco minutos. Va después de escribir
 *      y dentro del cerrojo: si subiera antes, una petición intermedia podría
 *      cachear el estado viejo con la clave nueva.
 *
 * Escribir en `ACCESO` por otro camino deja a un revocado dentro hasta que
 * caduque su entrada de caché.
 *
 * @param {string} operacion  INVITAR | ACEPTAR | CAMBIAR_ROL | REVOCAR.
 * @param {Object} datos  Al menos `{ email }`. Según la operación, más.
 * @param {Object} accesoSolicitante  El de quien pide el cambio.
 */
function mutarAcceso(operacion, datos, accesoSolicitante) {
  if (!puedeMutarAcceso(accesoSolicitante)) {
    registrarDenegacion_('quien pide la mutación no es TITULAR');
    throw new Error(ERROR_ACCESO);
  }

  var cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(ESPERA_CERROJO_MS)) {
    throw new Error('OCUPADO');
  }

  try {
    var hoja = abrirHoja_();
    var titular = emailTitular_(hoja);
    var objetivo = normalizarEmail((datos || {}).email);

    var problema = validarMutacion(operacion, objetivo, titular, (datos || {}).rol);
    if (problema) {
      registrarDenegacion_('mutación rechazada: ' + problema);
      throw new Error(ERROR_ACCESO);
    }

    var pestana = hoja.getSheetByName('ACCESO');
    if (!pestana) throw new Error(ERROR_ACCESO);

    var resultado = escribirMutacion_(pestana, operacion, objetivo, datos || {});

    // La versión sube SIEMPRE que se haya tocado la hoja, aunque la operación
    // no cambiara nada visible: es más barato invalidar de más que dejar viva
    // una entrada que ya no corresponde.
    var propiedades = PropertiesService.getScriptProperties();
    propiedades.setProperty(
      CLAVE_VERSION_ACCESO,
      String(siguienteVersion(propiedades.getProperty(CLAVE_VERSION_ACCESO))),
    );

    // La auditoría registra la acción y a quién afectó, nunca el token de
    // invitación ni nada clínico.
    auditar_('ACCESO_' + operacion, 'OK', objetivo);

    return resultado;
  } finally {
    cerrojo.releaseLock();
  }
}

/** Escribe la fila. Presupone cerrojo tomado y mutación ya validada. */
function escribirMutacion_(pestana, operacion, objetivo, datos) {
  var encabezados = encabezadosDe('ACCESO') || [];
  var col = {};
  for (var i = 0; i < encabezados.length; i++) col[encabezados[i]] = i;

  var ultima = pestana.getLastRow();
  var filas = ultima > 1 ? pestana.getRange(2, 1, ultima - 1, encabezados.length).getValues() : [];

  var indice = -1;
  for (var j = 0; j < filas.length; j++) {
    if (String(filas[j][col.email]).trim().toLowerCase() === objetivo) {
      indice = j;
      break;
    }
  }

  var ahora = new Date().toISOString();

  if (operacion === 'INVITAR') {
    var nueva = new Array(encabezados.length).fill('');
    nueva[col.email] = objetivo;
    nueva[col.rol] = datos.rol || 'LECTOR';
    nueva[col.pacientes_asignados] = datos.pacientes || '';
    nueva[col.paciente_propio] = datos.pacientePropio || '';
    nueva[col.estado] = 'INVITADO';
    nueva[col.token_hash] = datos.tokenHash || '';
    nueva[col.token_expira] = datos.tokenExpira || '';
    nueva[col.invitado_por] = datos.invitadoPor || '';
    nueva[col.fecha_alta] = ahora;

    // Reinvitar a alguien que ya figura reescribe su fila en vez de añadir una
    // segunda: dos filas con el mismo correo harían que el rol dependiera de
    // cuál se encontrara primero.
    if (indice === -1) pestana.appendRow(nueva);
    else pestana.getRange(indice + 2, 1, 1, encabezados.length).setValues([nueva]);
    return { creada: indice === -1 };
  }

  if (indice === -1) {
    registrarDenegacion_('la fila objetivo no existe');
    throw new Error(ERROR_ACCESO);
  }

  var numeroFila = indice + 2;

  if (operacion === 'ACEPTAR') {
    pestana.getRange(numeroFila, col.estado + 1).setValue('ACTIVO');
    // El token se consume: una invitación aceptada no se puede volver a usar.
    pestana.getRange(numeroFila, col.token_hash + 1).setValue('');
    pestana.getRange(numeroFila, col.token_expira + 1).setValue('');
    return { aceptada: true };
  }

  if (operacion === 'CAMBIAR_ROL') {
    pestana.getRange(numeroFila, col.rol + 1).setValue(datos.rol);
    if (typeof datos.pacientes === 'string') {
      pestana.getRange(numeroFila, col.pacientes_asignados + 1).setValue(datos.pacientes);
    }
    return { cambiada: true };
  }

  // REVOCAR. La fila **no se borra**: se marca. Quién tuvo acceso y hasta
  // cuándo es justo lo que habría que poder responder después.
  pestana.getRange(numeroFila, col.estado + 1).setValue('REVOCADO');
  pestana.getRange(numeroFila, col.token_hash + 1).setValue('');
  return { revocada: true };
}

/**
 * Deja constancia de un rechazo, sin decir de quién.
 *
 * Va al registro de ejecuciones, no a `AUDITORIA`: por el mismo motivo que en
 * E3, una petición denegada no debe poder llenar la hoja.
 */
function registrarDenegacion_(motivo) {
  console.warn('acceso denegado: ' + motivo);
}
