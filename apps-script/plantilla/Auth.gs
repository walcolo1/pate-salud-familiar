/**
 * Auth.gs — verificación del id_token (Bloque E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El endpoint es público y anónimo por diseño (`ANYONE_ANONYMOUS`), así que
 * **esta es la única puerta**. No es una buena práctica añadida: es el muro.
 *
 * TRES VALIDACIONES, SIN ATAJOS
 * ─────────────────────────────
 *   · `aud` — el token fue emitido para NUESTRO cliente OAuth, no para otro.
 *     Sin esto, cualquiera con un token válido de cualquier aplicación entra.
 *   · `email_verified` — Google confirmó que ese correo es de quien lo usa.
 *   · `exp` — no ha caducado.
 *
 * Y el correo sale de AQUÍ, nunca del cuerpo de la petición. Es la línea de la
 * que depende todo lo demás: `ACCESO` se consulta por correo, así que un correo
 * que el cliente pudiera elegir sería una llave maestra.
 *
 * POR QUÉ NO `Session.getActiveUser()`
 * ────────────────────────────────────
 * Con `executeAs: USER_DEPLOYING` devuelve cadena vacía. Está en la
 * documentación y se comprobó en E0-bis. Si algún día devolviera algo, seguiría
 * sin servir: diría quién ABRIÓ la aplicación, no quién firmó la petición.
 *
 * ESTADO: E1 · contrato. La implementación llega en E3.
 */

/** Clave de `PropertiesService` donde la instalación guarda el cliente OAuth. */
var CLAVE_CLIENTE_OAUTH = 'OAUTH_CLIENT_ID';

/** Cuánto se cachea un token ya verificado. Corto: un token dura una hora. */
var CACHE_TOKEN_SEGUNDOS = 300;

/**
 * Verifica un `id_token` y devuelve la identidad.
 *
 * @param {string} idToken  El token que envió la PWA.
 * @return {{email: string, sub: string}}  Correo verificado y su identificador
 *     estable en Google.
 * @throws {Error} `TOKEN_INVALIDO` si falla cualquiera de las tres
 *     validaciones. No se distingue cuál: decirlo ayuda a quien lo intenta.
 */
function verificarIdentidad(idToken) {
  throw new Error('NO_IMPLEMENTADO: E3');
}

/**
 * Normaliza un correo para poder compararlo.
 *
 * Gmail ignora los puntos de la parte local y todo lo que siga a un `+`, así
 * que `juan.perez@gmail.com`, `juanperez@gmail.com` y `juanperez+eps@gmail.com`
 * son la misma cuenta. Si `ACCESO` guardara una forma y la petición trajera
 * otra, el familiar invitado no entraría y nadie sabría por qué.
 *
 * @param {string} email
 * @return {string}
 */
function normalizarEmail(email) {
  throw new Error('NO_IMPLEMENTADO: E3');
}
