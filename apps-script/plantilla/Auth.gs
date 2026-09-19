/**
 * Auth.gs — verificación del id_token (Bloque E, E3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El endpoint es público y anónimo por diseño (`ANYONE_ANONYMOUS`), así que
 * **esta es la única puerta**. No es una buena práctica añadida: es el muro.
 *
 * QUIÉN COMPRUEBA LA FIRMA
 * ────────────────────────
 * Google, en `tokeninfo`. Validar la firma aquí exigiría traerse las claves
 * públicas de Google, cachearlas, rotarlas y verificar RS256 a mano en un
 * entorno sin biblioteca criptográfica. Una llamada de red con caché de cinco
 * minutos es mucho menos código, y el código que no existe no tiene fallos.
 *
 * Lo que cuesta: una dependencia de red por verificación fría. Con la caché,
 * una familia normal hace una llamada cada cinco minutos, no una por petición.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí está lo que necesita red o estado: `UrlFetchApp`, `CacheService` y
 * `PropertiesService`. Las decisiones —las tres validaciones, la normalización
 * del correo, la clave de caché— viven en `Autenticacion.gs`, que se genera
 * desde `src/lib/autenticacion.ts` y tiene 42 pruebas.
 *
 * POR QUÉ NO `Session.getActiveUser()`
 * ────────────────────────────────────
 * Con `executeAs: USER_DEPLOYING` devuelve cadena vacía; se comprobó en E0-bis.
 * Y aunque devolviera algo, diría quién ABRIÓ la aplicación, no quién firmó la
 * petición.
 */

/** Cuánto espera a Google antes de rendirse, en milisegundos. */
var TIEMPO_ESPERA_TOKENINFO_MS = 10000;

/**
 * Verifica un `id_token` y devuelve la identidad.
 *
 * @param {string} idToken  El token que envió la PWA.
 * @return {{email: string, sub: string}}  Correo **ya normalizado** y el
 *     identificador estable de esa cuenta en Google.
 * @throws {Error} `TOKEN_INVALIDO` ante cualquier fallo, sin distinguir cuál.
 */
function verificarIdentidad(idToken) {
  var ahora = Date.now();
  var clave = claveCache(idToken); // lanza TOKEN_INVALIDO si no es un JWT
  var cache = CacheService.getScriptCache();

  // 1 · ¿Ya se verificó hace poco?
  //
  // `leerCache` vuelve a comprobar la caducidad del token, no solo la de la
  // entrada: la caché ahorra la llamada a Google, no alarga la vida del token.
  var enCache = leerCache(cache.get(clave), ahora);
  if (enCache) return enCache;

  // 2 · La audiencia. Sin ella no se valida nada y se rechaza: un backend a
  //     medio instalar tiene que quedarse cerrado, no abierto.
  var audiencia = PropertiesService.getScriptProperties().getProperty(CLAVE_CLIENTE_OAUTH);
  if (!audiencia) {
    registrarFalloAuth_('sin OAUTH_CLIENT_ID configurado');
    throw new Error(ERROR_TOKEN);
  }

  // 3 · Que lo verifique Google.
  var datos = consultarTokenInfo_(idToken);

  // 4 · Las tres validaciones, sobre la respuesta de Google y no sobre el JWT
  //     descodificado a mano: lo que Google confirma es lo que vale.
  var identidad = validarClaims(datos, audiencia, ahora);

  // 5 · Guardar el resultado, nunca el token. Con su `exp`, para que el paso 1
  //     pueda descartarlo cuando caduque.
  var exp = Number(datos.exp);
  cache.put(clave, serializarCache(identidad, exp), CACHE_TOKEN_SEGUNDOS);

  return identidad;
}

/**
 * Pregunta a Google si el token es suyo y sigue vivo.
 *
 * Cualquier cosa que no sea un 200 con JSON legible es un token inválido. No se
 * distingue «Google dijo que no» de «Google no contestó»: hacia fuera, las dos
 * son la misma respuesta, y hacia dentro queda el registro.
 *
 * @return {Object} El cuerpo de la respuesta. Ojo: todos sus campos son
 *     **cadenas**, incluidos `exp` y `email_verified`. `validarClaims` lo sabe.
 */
function consultarTokenInfo_(idToken) {
  var respuesta;
  try {
    respuesta = UrlFetchApp.fetch(urlTokenInfo(idToken), {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
      // Sin esto, un fallo de red tarda lo que quiera y se come el tiempo de
      // ejecución de la petición entera.
      timeout: TIEMPO_ESPERA_TOKENINFO_MS,
    });
  } catch (err) {
    registrarFalloAuth_('tokeninfo no respondió');
    throw new Error(ERROR_TOKEN);
  }

  if (respuesta.getResponseCode() !== 200) {
    // 400 es lo que devuelve Google ante un token caducado o falsificado. No se
    // registra el token ni el cuerpo: podría llevar el correo de quien lo
    // intentó.
    registrarFalloAuth_('tokeninfo devolvió ' + respuesta.getResponseCode());
    throw new Error(ERROR_TOKEN);
  }

  try {
    var datos = JSON.parse(respuesta.getContentText());
    if (!datos || typeof datos !== 'object') throw new Error('cuerpo inesperado');
    return datos;
  } catch (err) {
    registrarFalloAuth_('tokeninfo devolvió algo que no es JSON');
    throw new Error(ERROR_TOKEN);
  }
}

/**
 * Deja constancia de un rechazo, sin decir de quién.
 *
 * Va al registro de ejecuciones, no a `AUDITORIA`: una petición rechazada no
 * tiene identidad verificada, así que no hay a quién atribuirla, y escribir en
 * la hoja por cada intento fallido sería regalar una forma de llenarla.
 *
 * El motivo se guarda para poder diagnosticar; lo que sale por la respuesta
 * sigue siendo una sola palabra.
 */
function registrarFalloAuth_(motivo) {
  console.warn('auth rechazada: ' + motivo);
}
