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
  // Sesión persistente: un ticket firmado por este backend sustituye al
  // `id_token` de una hora. Ver `verificarTicketSesion_`.
  if (esTicketSesion(idToken)) return verificarTicketSesion_(idToken);

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

// ─────────────────────────────────────────────────────────────────────────────
// Sesión persistente (ticket firmado)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La clave con la que se firman los tickets. Vive solo aquí.
 *
 * Borrar esta propiedad cierra **todas** las sesiones de todos los
 * dispositivos de una vez: la siguiente petición crea otra clave y ningún
 * ticket anterior vuelve a cuadrar.
 */
var CLAVE_SECRETO_SESION = 'SESION_SECRETO';

/** Prefijo de la caché huella → correo. */
var PREFIJO_CACHE_HUELLA = 'hue_';

function secretoSesion_() {
  var propiedades = PropertiesService.getScriptProperties();
  var secreto = propiedades.getProperty(CLAVE_SECRETO_SESION);
  if (secreto) return secreto;

  // Dos peticiones a la vez podrían crear dos claves distintas, y la que
  // perdiera dejaría inservibles los tickets que ya hubiera firmado.
  var cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(10000)) throw new Error(ERROR_TOKEN);
  try {
    secreto = propiedades.getProperty(CLAVE_SECRETO_SESION);
    if (!secreto) {
      secreto = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
      propiedades.setProperty(CLAVE_SECRETO_SESION, secreto);
    }
    return secreto;
  } finally {
    cerrojo.releaseLock();
  }
}

/** HMAC-SHA256 con la clave de sesión, en base64url sin relleno. */
function firmadorSesion_() {
  var secreto = secretoSesion_();
  return function (texto) {
    var bytes = Utilities.computeHmacSha256Signature(texto, secreto, Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  };
}

/**
 * Verifica un ticket y devuelve la identidad, igual que con un `id_token`.
 *
 * El correo **no viaja en el ticket**: se recupera buscando su huella entre
 * los correos que hoy tienen derecho a entrar. Quien ya no está en `ACCESO`
 * no aparece, y el ticket deja de servir sin tener que revocar nada.
 */
function verificarTicketSesion_(ticket) {
  var firmar = firmadorSesion_();
  var carga = verificarTicket(ticket, firmar, Date.now()); // lanza TOKEN_INVALIDO

  var email = correoDeHuellaConCache_(carga.h, firmar);
  if (!email) {
    registrarFalloAuth_('ticket de una cuenta sin acceso');
    throw new Error(ERROR_TOKEN);
  }
  // `sub` no existe para un ticket, y nada lo usa para decidir: el acceso se
  // resuelve por correo. Se marca para que se vea de dónde salió.
  return { email: email, sub: 'ticket' };
}

function correoDeHuellaConCache_(huella, firmar) {
  var cache = CacheService.getScriptCache();
  var clave = PREFIJO_CACHE_HUELLA + huella.slice(0, 64);
  var enCache = cache.get(clave);
  if (enCache) return enCache;

  var hoja = abrirHoja_();
  var candidatos = [emailTitular_(hoja)];
  var pestana = hoja.getSheetByName('ACCESO');
  if (pestana && pestana.getLastRow() > 1) {
    var columna = (encabezadosDe('ACCESO') || []).indexOf('email');
    if (columna !== -1) {
      var valores = pestana.getRange(2, columna + 1, pestana.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < valores.length; i++) candidatos.push(valores[i][0]);
    }
  }

  var email = correoDeHuella(huella, candidatos, firmar);
  // Solo se cachea el acierto. Que alguien salga de `ACCESO` lo sigue
  // decidiendo `resolverAccesoLocal`, que relee la hoja por versión.
  if (email) cache.put(clave, email, CACHE_HUELLA_SEGUNDOS);
  return email;
}

/** Emite un ticket para quien ya pasó la cadena entera. */
function abrirSesion(payload, acceso, identidad) {
  if (!identidad || !identidad.email) throw new Error(ERROR_TOKEN);
  var emitido = emitirTicket(identidad.email, firmadorSesion_(), Date.now());
  return { ticket: emitido.ticket, expira: emitido.expira };
}
