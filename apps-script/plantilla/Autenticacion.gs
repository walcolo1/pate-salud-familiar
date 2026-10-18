/**
 * Verificación del id_token — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/autenticacion.ts
 * Genera:  node scripts/generar-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

/**
 * Autenticación — Paté · Salud Familiar (Bloque E, E3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * EL ÚNICO MURO
 * ─────────────
 * El Web App de cada titular es público y anónimo por diseño
 * (`ANYONE_ANONYMOUS`): sin eso, un `fetch` desde la PWA moriría en una
 * redirección a la pantalla de acceso de Google. La consecuencia es que
 * **cualquiera puede llamar al endpoint**, y lo único que separa a un familiar
 * de un desconocido es la verificación del `id_token`.
 *
 * No es una buena práctica añadida. Es el muro.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí viven las decisiones puras: descodificar el JWT, validar los tres
 * campos contra un reloj que se puede inyectar, normalizar un correo y derivar
 * la clave de caché. Todo probable sin red.
 *
 * Lo que NO está aquí es la llamada a `tokeninfo` ni el `CacheService`: eso es
 * `Auth.gs`, y solo una ejecución real lo comprueba. Este fichero se genera a
 * `Autenticacion.gs`, así que el backend ejecuta exactamente las funciones que
 * estas pruebas verifican.
 *
 * EL CORREO SALE DE AQUÍ Y DE NINGÚN OTRO SITIO
 * ─────────────────────────────────────────────
 * `ACCESO` se consulta por correo. Si el correo pudiera venir del cuerpo de la
 * petición, sería una llave maestra: bastaría con escribir el del titular. Sale
 * de un token que Google firmó, o no se responde.
 */
/** Emisores que Google usa para los `id_token`. Ambos son legítimos. */
var EMISORES_VALIDOS = ['accounts.google.com', 'https://accounts.google.com'];
/** Cuánto vive una verificación en caché. */
var CACHE_TOKEN_SEGUNDOS = 300;
/** Prefijo de la clave de caché, para no chocar con otras cosas del script. */
var PREFIJO_CACHE_TOKEN = 'tok_';
/**
 * Longitud del trozo de firma que se usa como clave.
 *
 * `CacheService` corta las claves a 250 caracteres, y un `id_token` entero pasa
 * de 1.000. La firma es la parte que cambia con cada token, así que sus últimos
 * caracteres identifican uno sin guardarlo.
 */
var LONGITUD_CLAVE_CACHE = 64;
/** Dominios donde los puntos y el `+etiqueta` no cambian de buzón. */
var DOMINIOS_CON_ALIAS = ['gmail.com', 'googlemail.com'];
/**
 * Error opaco. Siempre el mismo, falle lo que falle.
 *
 * Distinguir «el token caducó» de «la audiencia no es la nuestra» le dice a
 * quien lo está intentando qué corregir en el siguiente intento. Dentro del
 * registro de ejecuciones sí queda el detalle; hacia fuera, una sola palabra.
 */
var ERROR_TOKEN = 'TOKEN_INVALIDO';
function invalido() {
    throw new Error(ERROR_TOKEN);
}
// ─────────────────────────────────────────────────────────────────────────────
// Descodificar
// ─────────────────────────────────────────────────────────────────────────────
var ALFABETO_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/**
 * `base64url` → texto, respetando los caracteres no ASCII.
 *
 * Se descodifica a mano en vez de con `atob` **porque `atob` no existe en el
 * runtime de Apps Script**. Tampoco se usa `Utilities.base64Decode`, que sí
 * existe allí pero no en Node: este fichero tiene que ejecutarse en los dos
 * sitios, porque de él se genera el `.gs` y sobre él corren las pruebas. Una
 * función que solo funciona donde no se prueba es una trampa esperando.
 */
function base64UrlAUtf8(segmento) {
    const limpio = segmento.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    const bytes = [];
    let acumulador = 0;
    let bits = 0;
    for (let i = 0; i < limpio.length; i++) {
        const valor = ALFABETO_BASE64.indexOf(limpio.charAt(i));
        if (valor === -1)
            continue;
        acumulador = (acumulador << 6) | valor;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((acumulador >> bits) & 0xff);
        }
    }
    // Los bytes se recomponen a UTF-8 con `decodeURIComponent` sobre su
    // representación en porcentaje. Sin esto, una tilde en el nombre llegaría
    // rota y acabaría escrita así en CONFIG.
    let porcentajes = '';
    for (let i = 0; i < bytes.length; i++) {
        porcentajes += '%' + ('00' + bytes[i].toString(16)).slice(-2);
    }
    return decodeURIComponent(porcentajes);
}
/**
 * El payload de un JWT, **sin comprobar la firma**.
 *
 * Que no se comprueba la firma no es un descuido: quien la comprueba es Google,
 * en `tokeninfo`. Esta función sirve para leer un token que ya vino verificado
 * y para las pruebas. Nunca debe usarse sola para decidir un acceso.
 */
function decodificarPayloadJwt(idToken) {
    if (typeof idToken !== 'string' || idToken.length === 0)
        invalido();
    const partes = idToken.split('.');
    if (partes.length !== 3)
        invalido();
    if (partes[1].length === 0)
        invalido();
    try {
        const payload = JSON.parse(base64UrlAUtf8(partes[1]));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
            invalido();
        return payload;
    }
    catch {
        invalido();
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Validar
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ¿Es `true`, venga como venga?
 *
 * `tokeninfo` devuelve **todos los campos como cadenas**, así que
 * `email_verified` llega como `"true"`, no como `true`. Al descodificar el JWT
 * a mano llega como booleano. Los dos caminos acaban aquí, y comparar con
 * `=== true` habría rechazado la mitad de los tokens legítimos.
 */
function esCierto(v) {
    return v === true || v === 'true';
}
/** Un `exp` utilizable, en segundos. `tokeninfo` lo manda como cadena. */
function aSegundos(v) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
}
/**
 * Las tres validaciones, sin atajos.
 *
 * @param payload  Del JWT o de `tokeninfo`, da igual: los tipos se normalizan.
 * @param audienciaEsperada  Nuestro `OAUTH_CLIENT_ID`.
 * @param ahoraMs  Reloj inyectable. En producción, `Date.now()`.
 * @throws `TOKEN_INVALIDO` ante cualquier fallo, sin decir cuál.
 */
function validarClaims(payload, audienciaEsperada, ahoraMs) {
    // Sin audiencia configurada no se valida nada: se rechaza. Un backend a medio
    // instalar tiene que quedarse cerrado, no abierto.
    if (typeof audienciaEsperada !== 'string' || audienciaEsperada.length === 0)
        invalido();
    if (!payload || typeof payload !== 'object')
        invalido();
    // 1 · `aud`. El JWT admite una lista; los de Google traen una sola cadena.
    //     Sin esta comprobación, un token válido de CUALQUIER otra aplicación
    //     abriría este backend.
    const aud = payload.aud;
    const audiencias = Array.isArray(aud) ? aud : [aud];
    if (!audiencias.some((a) => a === audienciaEsperada))
        invalido();
    // 2 · `email_verified`. Un correo sin verificar puede ser de cualquiera.
    if (!esCierto(payload.email_verified))
        invalido();
    // 3 · `exp`. Estricto, sin margen de tolerancia: el reloj de los servidores
    //     de Google y el nuestro son el mismo, y un margen aquí es tiempo extra
    //     para un token robado.
    const exp = aSegundos(payload.exp);
    if (exp === null || exp * 1000 <= ahoraMs)
        invalido();
    // El emisor, si viene, tiene que ser Google. `tokeninfo` no siempre lo
    // devuelve, así que no se exige su presencia — pero si está y no cuadra, no
    // hay nada que pensar.
    if (payload.iss !== undefined && !EMISORES_VALIDOS.includes(String(payload.iss)))
        invalido();
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (email.length === 0 || sub.length === 0)
        invalido();
    return { email: normalizarEmail(email), sub };
}
// ─────────────────────────────────────────────────────────────────────────────
// Correos
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Deja un correo en su forma canónica, para poder compararlo.
 *
 * Gmail ignora los puntos de la parte local y todo lo que siga a un `+`, así
 * que `juan.perez@gmail.com`, `juanperez@gmail.com` y `juanperez+eps@gmail.com`
 * son **el mismo buzón**. Si `ACCESO` guardara una forma y el token trajera
 * otra, el familiar invitado no entraría y nadie sabría por qué.
 *
 * Fuera de Gmail esas reglas **no valen**: hay servidores donde `a.b@` y `ab@`
 * son dos personas distintas. Ahí solo se recortan espacios y se baja a
 * minúsculas, que es lo que el estándar permite dar por seguro.
 */
function normalizarEmail(email) {
    if (typeof email !== 'string')
        return '';
    const limpio = email.trim().toLowerCase();
    const arroba = limpio.lastIndexOf('@');
    if (arroba <= 0 || arroba === limpio.length - 1)
        return limpio;
    const dominio = limpio.slice(arroba + 1);
    if (!DOMINIOS_CON_ALIAS.includes(dominio))
        return limpio;
    let local = limpio.slice(0, arroba);
    const mas = local.indexOf('+');
    if (mas !== -1)
        local = local.slice(0, mas);
    local = local.replace(/\./g, '');
    // `+etiqueta@gmail.com` sin nada delante no es una cuenta: mejor devolver lo
    // que vino que fabricar un correo sin parte local.
    if (local.length === 0)
        return limpio;
    return local + '@' + dominio;
}
// ─────────────────────────────────────────────────────────────────────────────
// Caché
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Clave de caché de un token.
 *
 * `CacheService` corta las claves a 250 caracteres y un `id_token` pasa de mil,
 * así que se usan los últimos caracteres de la **firma**: es la parte que
 * cambia con cada token, y guardarla entera no haría falta.
 *
 * El token en sí **no se guarda en ninguna parte**, ni como clave ni como
 * valor. Lo que se cachea es el resultado de haberlo verificado.
 */
function claveCache(idToken) {
    if (typeof idToken !== 'string' || idToken.length === 0)
        invalido();
    const partes = idToken.split('.');
    if (partes.length !== 3 || partes[2].length === 0)
        invalido();
    const firma = partes[2];
    const trozo = firma.length > LONGITUD_CLAVE_CACHE ? firma.slice(-LONGITUD_CLAVE_CACHE) : firma;
    return PREFIJO_CACHE_TOKEN + trozo;
}
function serializarCache(identidad, expSegundos) {
    return JSON.stringify({ email: identidad.email, sub: identidad.sub, exp: expSegundos });
}
/**
 * Lee una entrada de caché y **vuelve a comprobar la caducidad**.
 *
 * Es la parte menos evidente de todo esto. La caché dura 300 segundos, pero el
 * token puede caducar antes: si se verifica uno al que le quedaban 10 segundos,
 * sin esta comprobación seguiría valiendo durante 290 segundos más. La caché
 * ahorra la llamada a Google, no alarga la vida del token.
 *
 * @returns La identidad, o `null` si no sirve. `null` significa «verifica otra
 *     vez», nunca «denegado»: quien decide sigue siendo `tokeninfo`.
 */
function leerCache(crudo, ahoraMs) {
    if (typeof crudo !== 'string' || crudo.length === 0)
        return null;
    try {
        const entrada = JSON.parse(crudo);
        const exp = aSegundos(entrada === null || entrada === void 0 ? void 0 : entrada.exp);
        if (exp === null || exp * 1000 <= ahoraMs)
            return null;
        if (typeof entrada.email !== 'string' || entrada.email.length === 0)
            return null;
        if (typeof entrada.sub !== 'string' || entrada.sub.length === 0)
            return null;
        return { email: entrada.email, sub: entrada.sub };
    }
    catch {
        return null;
    }
}
/** La URL de verificación de Google. El token va en la consulta, como exige. */
function urlTokenInfo(idToken) {
    return 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
}
// ─────────────────────────────────────────────────────────────────────────────
// Ticket de sesión (sesión persistente)
// ─────────────────────────────────────────────────────────────────────────────
/*
 * POR QUÉ HACE FALTA
 * ──────────────────
 * El `id_token` de Google dura una hora y el navegador no puede renovarlo por
 * su cuenta: GIS no da token de refresco. Al recargar, la credencial se pierde
 * y la aplicación pedía volver a entrar. En la práctica eso era el aviso rojo
 * en cada F5, en cada PWA reabierta y a la hora de uso.
 *
 * QUÉ ES
 * ──────
 * Un ticket que **firma este mismo backend** con HMAC-SHA256 y una clave que
 * solo existe en sus `ScriptProperties`. Se emite **a cambio de un `id_token`
 * ya verificado por Google** (o de otro ticket válido, para renovarlo), y a
 * partir de ahí sustituye al `id_token` en cada petición.
 *
 * LO QUE NO LLEVA
 * ───────────────
 * Ni correo, ni nombre, ni `sub`. Solo la **huella** de la cuenta —un HMAC del
 * correo normalizado con la misma clave secreta—, la fecha de emisión y la de
 * caducidad. En el navegador es una cadena opaca: quien la lea no sabe de
 * quién es, y sin la clave no puede fabricar otra.
 *
 * POR QUÉ SIGUE SIENDO EL MISMO MURO
 * ──────────────────────────────────
 * El ticket no da acceso por sí mismo: el router vuelve a resolver el correo
 * buscando su huella en `ACCESO` (y el titular en `CONFIG`) **en cada
 * petición**, igual que con un `id_token`. Quien sale de `ACCESO` deja de
 * entrar en el acto, tenga el ticket que tenga. Rotar la clave
 * (`SESION_SECRETO`) invalida todos los tickets de golpe.
 */
/** Marca de los tickets. Un `id_token` es un JWT y nunca empieza así. */
var PREFIJO_TICKET = 'pt1.';
/** Treinta días. Se renuevan solos mientras se usen. */
var VIGENCIA_TICKET_MS = 30 * 24 * 60 * 60 * 1000;
/** El cliente pide uno nuevo cuando al suyo le quedan menos de quince días. */
var RENOVAR_TICKET_ANTES_MS = 15 * 24 * 60 * 60 * 1000;
/** Prefijo de lo que se firma para obtener la huella de una cuenta. */
var CONTEXTO_HUELLA = 'pate:cuenta:';
/** Cuánto se cachea en el servidor la resolución huella → correo. */
var CACHE_HUELLA_SEGUNDOS = 600;
function esTicketSesion(token) {
    return typeof token === 'string' && token.indexOf(PREFIJO_TICKET) === 0;
}
/**
 * Texto ASCII → base64url, sin relleno.
 *
 * A mano por la misma razón que `base64UrlAUtf8`: tiene que correr igual en
 * Apps Script y en Node. Solo se usa con JSON de esta misma función, que es
 * ASCII por construcción (números y una huella base64url).
 */
function asciiABase64Url(texto) {
    let salida = '';
    let i = 0;
    for (; i + 2 < texto.length; i += 3) {
        const n = (texto.charCodeAt(i) << 16) | (texto.charCodeAt(i + 1) << 8) | texto.charCodeAt(i + 2);
        salida +=
            ALFABETO_BASE64.charAt((n >> 18) & 63) +
                ALFABETO_BASE64.charAt((n >> 12) & 63) +
                ALFABETO_BASE64.charAt((n >> 6) & 63) +
                ALFABETO_BASE64.charAt(n & 63);
    }
    const resto = texto.length - i;
    if (resto === 1) {
        const n = texto.charCodeAt(i) << 16;
        salida += ALFABETO_BASE64.charAt((n >> 18) & 63) + ALFABETO_BASE64.charAt((n >> 12) & 63);
    }
    else if (resto === 2) {
        const n = (texto.charCodeAt(i) << 16) | (texto.charCodeAt(i + 1) << 8);
        salida +=
            ALFABETO_BASE64.charAt((n >> 18) & 63) +
                ALFABETO_BASE64.charAt((n >> 12) & 63) +
                ALFABETO_BASE64.charAt((n >> 6) & 63);
    }
    return salida.replace(/\+/g, '-').replace(/\//g, '_');
}
/**
 * Comparación en tiempo constante.
 *
 * Comparar firmas con `===` corta en el primer carácter distinto, y el tiempo
 * que tarda en contestar le dice a quien prueba cuántos acertó.
 */
function firmasIguales(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string')
        return false;
    // La longitud de una firma HMAC-SHA256 en base64url es fija (43): que
    // difiera no revela nada que no se sepa ya.
    if (a.length !== b.length || a.length === 0)
        return false;
    let diferencia = 0;
    for (let i = 0; i < a.length; i++)
        diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diferencia === 0;
}
/** La huella de una cuenta: HMAC del correo normalizado. */
function huellaDeCorreo(email, firmar) {
    const normalizado = normalizarEmail(email);
    if (normalizado.length === 0)
        invalido();
    return firmar(CONTEXTO_HUELLA + normalizado);
}
/** Emite un ticket para un correo **ya verificado**. */
function emitirTicket(email, firmar, ahoraMs) {
    if (!Number.isFinite(ahoraMs) || ahoraMs <= 0)
        invalido();
    const carga = {
        v: 1,
        h: huellaDeCorreo(email, firmar),
        iat: Math.floor(ahoraMs),
        exp: Math.floor(ahoraMs + VIGENCIA_TICKET_MS),
    };
    const cuerpo = PREFIJO_TICKET + asciiABase64Url(JSON.stringify(carga));
    return { ticket: cuerpo + '.' + firmar(cuerpo), expira: carga.exp };
}
/**
 * La carga de un ticket, **sin comprobar la firma**. Para el cliente, que solo
 * necesita saber cuándo caduca, y para las pruebas. Nunca decide un acceso.
 */
function cargaDeTicket(ticket) {
    if (!esTicketSesion(ticket))
        return null;
    const partes = String(ticket).slice(PREFIJO_TICKET.length).split('.');
    if (partes.length !== 2 || partes[0].length === 0 || partes[1].length === 0)
        return null;
    try {
        const carga = JSON.parse(base64UrlAUtf8(partes[0]));
        if (!carga || typeof carga !== 'object' || carga.v !== 1)
            return null;
        if (typeof carga.h !== 'string' || carga.h.length < 16)
            return null;
        if (typeof carga.iat !== 'number' || typeof carga.exp !== 'number')
            return null;
        if (!Number.isFinite(carga.iat) || !Number.isFinite(carga.exp) || carga.exp <= carga.iat)
            return null;
        return { v: 1, h: carga.h, iat: carga.iat, exp: carga.exp };
    }
    catch {
        return null;
    }
}
/**
 * Verifica un ticket: firma, forma y caducidad. Devuelve su carga.
 *
 * @throws `TOKEN_INVALIDO` ante cualquier fallo, sin decir cuál — igual que
 *     con un `id_token`.
 */
function verificarTicket(ticket, firmar, ahoraMs) {
    if (!esTicketSesion(ticket))
        invalido();
    const texto = String(ticket);
    const punto = texto.lastIndexOf('.');
    if (punto <= PREFIJO_TICKET.length)
        invalido();
    const cuerpo = texto.slice(0, punto);
    const firma = texto.slice(punto + 1);
    if (!firmasIguales(firmar(cuerpo), firma))
        invalido();
    const carga = cargaDeTicket(texto);
    if (!carga)
        invalido();
    // Sin margen, como con el `id_token`. Tampoco se aceptan tickets «del
    // futuro»: o el reloj está mal o alguien está jugando con la carga.
    if (carga.exp <= ahoraMs)
        invalido();
    if (carga.iat > ahoraMs + 5 * 60 * 1000)
        invalido();
    if (carga.exp - carga.iat > VIGENCIA_TICKET_MS)
        invalido();
    return carga;
}
/**
 * Busca, entre los correos con derecho a entrar, el de una huella.
 *
 * Son los de `ACCESO` más el titular: una familia, no un padrón, así que
 * recorrerlos firma unos pocos correos. El resultado se cachea en el servidor.
 */
function correoDeHuella(huella, candidatos, firmar) {
    if (typeof huella !== 'string' || huella.length === 0)
        return null;
    const vistos = {};
    for (let i = 0; i < (candidatos || []).length; i++) {
        const email = normalizarEmail(candidatos[i]);
        if (email.length === 0 || email.indexOf('@') === -1 || vistos[email])
            continue;
        vistos[email] = true;
        if (firmasIguales(firmar(CONTEXTO_HUELLA + email), huella))
            return email;
    }
    return null;
}
