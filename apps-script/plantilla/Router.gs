/**
 * Router.gs — la puerta única (Bloque E, E6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todo entra por `doPost` y pasa por la misma cadena, sin saltos:
 *
 *   cuerpo → verificarIdentidad (E3) → resolverAccesoLocal (E4) → puede (E5)
 *
 * Una sola puerta es una sola puerta que auditar. No hay función expuesta al
 * exterior que se salte un eslabón.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí están las llamadas a la hoja, el cerrojo y las propiedades. La cadena en
 * sí vive en `Despacho.gs`, generado desde `src/lib/router.ts`, donde se puede
 * provocar con dobles lo que aquí no: un token rechazado, un acceso revocado,
 * un cerrojo ocupado.
 *
 * EL CUERPO LLEGA COMO `text/plain`
 * ─────────────────────────────────
 * Por costumbre prudente, no por necesidad: E0-bis midió que `application/json`
 * también cruza. Se lee con `JSON.parse` igual.
 */

/** Versión del contrato con la PWA. Sube cuando cambie la forma de responder. */
var VERSION_API = 'e6';

/** Cuánto espera el cerrojo de un lote antes de rendirse. */
var ESPERA_LOTE_MS = 15000;

// ─────────────────────────────────────────────────────────────────────────────
// Entrada
// ─────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  var solicitud = leerSolicitud(e && e.postData ? e.postData.contents : null);
  if (!solicitud) return responder({ ok: false, error: 'ERROR_PAYLOAD' });

  var respuesta = despacharPeticion(solicitud, dependencias_());
  return responder(respuesta);
}

/**
 * `doGet` solo dice que hay algo vivo aquí.
 *
 * No recibe token, así que **no puede contar nada**: ni el correo del titular,
 * ni el identificador de la hoja, ni la revisión. Sirve para abrir la URL en el
 * navegador y ver que la implementación responde.
 */
function doGet() {
  return responder({ ok: true, data: { version: VERSION_API } });
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/** Ata las funciones reales a la cadena pura. */
function dependencias_() {
  return {
    verificarIdentidad: verificarIdentidad,
    resolverAcceso: resolverAccesoLocal,
    puede: puede,
    manejadores: MANEJADORES,
    registrar: function (evento, detalle) {
      console.warn('router: ' + evento + ' · ' + detalle);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejadores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué hace cada acción, **ya autorizada**.
 *
 * Ninguno de estos vuelve a comprobar identidad ni rol: para cuando se les
 * llama, la cadena ya pasó. Lo que sí hacen las mutaciones es revalidar el
 * alcance mutación a mutación, porque un lote puede tocar a varios pacientes y
 * el permiso de la acción solo autorizó el verbo de entrada.
 */
var MANEJADORES = {
  /** Prueba de vida. No lee nada y no cuenta nada. */
  ping: function () {
    return { version: VERSION_API, esquema: VERSION_ESQUEMA };
  },

  obtenerRevision: function () {
    return { revision: revisionActual_() };
  },

  listarPacientes: function (payload, acceso) {
    var filas = leerPestana_('PACIENTES');
    var cols = columnasDe_('PACIENTES');
    var visibles = [];
    for (var i = 0; i < filas.length; i++) {
      var id = String(filas[i][cols.id] || '').trim();
      // El alcance se aplica aquí también: listar es una lectura, y una lista
      // completa ya dice quién existe en esta familia.
      if (id && alcanza(acceso, id)) visibles.push(filas[i]);
    }
    return { filas: visibles, revision: revisionActual_() };
  },

  verCatalogos: function () {
    return {
      vacunas: leerPestana_('CATALOGO_VACUNAS'),
      dominios: leerPestana_('DOMINIOS_AUTORIZADOS'),
    };
  },

  consultar: function (payload, acceso) {
    var tabla = String(payload.tabla || '');
    if (!verboDeTabla(tabla)) throw new Error('PAYLOAD: tabla no consultable');

    var pacienteId = String(payload.pacienteId || '').trim();
    if (!alcanza(acceso, pacienteId)) throw new Error('PERMISO');

    var cols = columnasDe_(tabla);
    var filas = leerPestana_(tabla);
    var suyas = [];
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][cols.paciente_id] || '').trim() === pacienteId) suyas.push(filas[i]);
    }
    return { tabla: tabla, filas: suyas, revision: revisionActual_() };
  },

  aplicar: function (payload, acceso) {
    return aplicar(acceso, payload.mutaciones);
  },

  invitar: function (payload, acceso) {
    return mutarAcceso('INVITAR', payload, acceso);
  },
  cambiarRol: function (payload, acceso) {
    return mutarAcceso('CAMBIAR_ROL', payload, acceso);
  },
  revocar: function (payload, acceso) {
    return mutarAcceso('REVOCAR', payload, acceso);
  },

  verAuditoria: function () {
    return { filas: leerPestana_('AUDITORIA') };
  },

  exportar: function () {
    var salida = {};
    for (var i = 0; i < PESTANAS.length; i++) {
      salida[PESTANAS[i].nombre] = leerPestana_(PESTANAS[i].nombre);
    }
    return { esquema: VERSION_ESQUEMA, revision: revisionActual_(), tablas: salida };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// aplicar: el lote transaccional
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica un lote de mutaciones, o ninguna.
 *
 * EL ORDEN ES LO QUE LO HACE TRANSACCIONAL
 *
 *   1. Validar el lote **entero** con `puede()`, antes de tocar nada. Escribir
 *      tres mutaciones y descubrir en la cuarta que falta permiso deja el
 *      expediente a medias, y un expediente a medias es peor que uno sin
 *      cambiar: nadie sabe qué entró y qué no.
 *   2. Tomar el cerrojo.
 *   3. Escribir, agrupando por pestaña con un solo `setValues` cada una. Una
 *      llamada por fila sería el camino más rápido a los 6 minutos.
 *   4. Subir la revisión **una vez por lote**, no una por fila.
 *   5. Dejar traza anonimizada.
 *
 * Apps Script no tiene transacciones sobre una hoja, así que esto no es
 * atómico de verdad: si falla a mitad del paso 3, quedan filas escritas. Lo que
 * sí garantiza es que **nunca se escribe nada sin haber autorizado todo**, que
 * es el fallo que importa.
 */
function aplicar(acceso, mutaciones) {
  var validacion = validarLote(acceso, mutaciones, puede);
  if (!validacion.ok) {
    registrarDenegacion_('lote rechazado en la posición ' + validacion.indice);
    throw new Error(validacion.error === 'PERMISO_INSUFICIENTE' ? 'PERMISO' : 'PAYLOAD');
  }

  var cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(ESPERA_LOTE_MS)) throw new Error('OCUPADO');

  try {
    var porTabla = agruparPorTabla_(mutaciones);
    var escritas = 0;

    var tablas = Object.keys(porTabla);
    for (var i = 0; i < tablas.length; i++) {
      escritas += anexarFilas_(tablas[i], porTabla[tablas[i]]);
    }

    var revision = subirRevision_();
    auditar_('APLICAR', 'OK', trazaDeLote(mutaciones));

    return { aplicadas: escritas, revision: revision };
  } finally {
    cerrojo.releaseLock();
  }
}

function agruparPorTabla_(mutaciones) {
  var porTabla = {};
  for (var i = 0; i < mutaciones.length; i++) {
    var m = mutaciones[i];
    var tabla = String(m.tabla);
    if (!porTabla[tabla]) porTabla[tabla] = [];
    porTabla[tabla].push(m.fila || {});
  }
  return porTabla;
}

/**
 * Escribe varias filas de una pestaña en una sola llamada.
 *
 * Los valores se colocan **por nombre de columna**, nunca por el orden en que
 * vinieran en el objeto: un cliente que mandara las claves en otro orden
 * desplazaría las columnas sin que nada fallara.
 */
function anexarFilas_(tabla, objetos) {
  var encabezados = encabezadosDe(tabla);
  if (!encabezados) throw new Error('PAYLOAD: pestaña desconocida');

  var hoja = abrirHoja_();
  var pestana = hoja.getSheetByName(tabla);
  if (!pestana) throw new Error('PAYLOAD: pestaña ausente');

  var ahora = new Date().toISOString();
  var matriz = [];
  for (var i = 0; i < objetos.length; i++) {
    var fila = [];
    for (var c = 0; c < encabezados.length; c++) {
      var columna = encabezados[c];
      var valor = objetos[i][columna];
      if (columna === 'creado_en' || columna === 'actualizado_en') valor = valor || ahora;
      if (columna === 'borrado_en' && valor === undefined) valor = '';
      fila.push(valor === undefined || valor === null ? '' : valor);
    }
    matriz.push(fila);
  }

  if (matriz.length === 0) return 0;
  pestana.getRange(pestana.getLastRow() + 1, 1, matriz.length, encabezados.length).setValues(matriz);
  return matriz.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Revisión y lectura
// ─────────────────────────────────────────────────────────────────────────────

function revisionActual_() {
  return revisionDesde(PropertiesService.getScriptProperties().getProperty(CLAVE_REVISION));
}

/** Sube la revisión. Se llama una vez por lote, dentro del cerrojo. */
function subirRevision_() {
  var propiedades = PropertiesService.getScriptProperties();
  var siguiente = siguienteRevision(propiedades.getProperty(CLAVE_REVISION));
  propiedades.setProperty(CLAVE_REVISION, String(siguiente));
  return siguiente;
}

/** Las filas de una pestaña, sin la de encabezados. */
function leerPestana_(nombre) {
  var pestana = abrirHoja_().getSheetByName(nombre);
  if (!pestana || pestana.getLastRow() < 2) return [];
  return pestana.getRange(2, 1, pestana.getLastRow() - 1, pestana.getLastColumn()).getValues();
}

/** Posición de cada columna, por nombre. Nunca índices a mano. */
function columnasDe_(tabla) {
  var encabezados = encabezadosDe(tabla) || [];
  var posiciones = {};
  for (var i = 0; i < encabezados.length; i++) posiciones[encabezados[i]] = i;
  return posiciones;
}
