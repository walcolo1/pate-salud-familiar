/**
 * Router.gs — punto de entrada único del backend (Bloque E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todo entra por `doPost`. No hay una función por acción expuesta al exterior:
 * una sola puerta es una sola puerta que auditar.
 *
 * EL ORDEN DE LAS TRES LÍNEAS NO ES NEGOCIABLE
 * ────────────────────────────────────────────
 *   1. Verificar el `id_token` → de ahí sale el correo, y de ningún otro sitio.
 *   2. Resolver el acceso de ese correo en la hoja ACCESO **de este documento**.
 *   3. Despachar, pasando el acceso como parámetro obligatorio.
 *
 * El correo NUNCA sale del cuerpo de la petición. Un cliente puede escribir lo
 * que quiera en el JSON; lo que no puede es firmar un token de Google.
 *
 * Y `Session.getActiveUser().getEmail()` **tampoco** sirve: con
 * `executeAs: USER_DEPLOYING` devuelve cadena vacía. Medido en E0-bis, no
 * supuesto. Por eso existe `Auth.gs`.
 *
 * ESTADO: E1 · esqueleto. `doPost` responde para que la sonda `webapp-humo`
 * funcione contra la plantilla tal cual, y el despacho real llega en E6.
 */

/** Versión del contrato entre la PWA y este backend. */
var VERSION_API = 'e1';

/**
 * Petición de la PWA.
 *
 * El cuerpo llega como `text/plain` por costumbre prudente, no por necesidad:
 * E0-bis midió que `application/json` también cruza. Se lee igual con
 * `JSON.parse`, así que no hay motivo para cambiarlo.
 */
function doPost(e) {
  var salida;
  try {
    var peticion = leerCuerpo(e);

    // E6 sustituirá este bloque por: verificarIdentidad → resolverAcceso →
    // despachar(accion, payload, acceso). Hasta entonces responde lo mínimo
    // para que la plantilla sea sondeable desde el primer despliegue.
    salida = {
      ok: true,
      version: VERSION_API,
      accion: peticion.accion || 'ninguna',
      esquema: VERSION_ESQUEMA,
      // Las dos identidades, para que E0b-4 pueda comprobar que la primera
      // viene vacía. No es información sensible: es el correo del dueño del
      // script, respondiendo desde su propio script.
      usuarioActivo: Session.getActiveUser().getEmail(),
      usuarioEfectivo: Session.getEffectiveUser().getEmail(),
    };
  } catch (err) {
    salida = { ok: false, error: traducirError(err) };
  }
  return responder(salida);
}

/**
 * `doGet` existe solo para poder abrir la URL en el navegador y ver si la
 * implementación está viva. No expone ningún dato.
 */
function doGet() {
  return responder({ ok: true, version: VERSION_API, metodo: 'GET' });
}

/** Cuerpo de la petición, o un objeto vacío si no vino o no se entiende. */
function leerCuerpo(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Convierte una excepción en algo que se puede enseñar.
 *
 * Nunca devuelve el mensaje original: una traza de Apps Script puede llevar
 * nombres de función, identificadores de hoja y fragmentos de datos. Lo que
 * sale es un código; el detalle se queda en el registro de ejecuciones.
 */
function traducirError(err) {
  var codigo = err && err.message ? String(err.message) : 'ERROR';
  var conocidos = ['ACCESO_DENEGADO', 'TOKEN_INVALIDO', 'ACCION_DESCONOCIDA', 'NO_ENCONTRADO'];
  for (var i = 0; i < conocidos.length; i++) {
    if (codigo.indexOf(conocidos[i]) !== -1) return conocidos[i];
  }
  return 'ERROR_INTERNO';
}
