/**
 * Decisiones sobre invitaciones — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/invitaciones.ts
 * Genera:  node scripts/generar-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

/**
 * Invitaciones — cómo entra un familiar sin autorizar nada (Bloque E, E7)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El titular pasa una fricción de cuatro minutos, una vez. Todos los demás no
 * pasan por ninguna: no autorizan nada, no ven una pantalla de permisos de
 * Google y no instalan nada. Reciben un correo con un enlace y entran.
 *
 * Eso es lo que hace que la restricción de cuentas personales se sostenga en la
 * práctica y no solo en el papel. Si cada familiar tuviera que consentir los
 * ámbitos del script, la mitad no pasaría de la pantalla de «aplicación no
 * verificada».
 *
 * EL TOKEN NO SE GUARDA
 * ─────────────────────
 * En `ACCESO` va su SHA-256. Si la hoja se filtrara —y una hoja de cálculo se
 * comparte por accidente con una facilidad que un servidor no tiene—, los
 * hashes no dejan entrar a nadie.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí están las decisiones: la forma del token, la caducidad, la tabla de
 * estados y el cuerpo del correo. El azar y el hash viven en
 * `Invitaciones.gs`, porque `Utilities.getUuid` y `Utilities.computeDigest`
 * solo existen dentro de Apps Script. Lo que sí está aquí es la conversión de
 * bytes a hexadecimal, que es donde se esconden los errores de verdad.
 */
/**
 * Días que vive una invitación sin usar.
 *
 * Una invitación que no se usa en una semana es una invitación olvidada, y una
 * invitación olvidada que sigue viva es una puerta abierta en el correo de
 * alguien.
 */
var DIAS_VIGENCIA_INVITACION = 7;
/** Lo que puede ser una invitación en un momento dado. */
var ESTADOS_INVITACION = [
    'PENDIENTE',
    'ACEPTADA',
    'EXPIRADA',
    'REVOCADA',
    'INEXISTENTE',
];
/**
 * Por qué no se pudo aceptar.
 *
 * Estos códigos **sí** salen al cliente, al revés que los de E3 y E4, y la
 * diferencia tiene motivo: para llegar hasta aquí hay que traer un token, que
 * es un secreto. A quien ya lo tiene, decirle que caducó no le revela nada que
 * no pudiera averiguar probando. Y `INVITACION_DESTINATARIO_INVALIDO` es lo
 * único que permite a la PWA decir «estás en la cuenta equivocada» en vez de
 * dejar a alguien mirando un error mudo.
 *
 * Lo que **nunca** sale es para quién era la invitación.
 */
var ERRORES_INVITACION = [
    'INVITACION_DESCONOCIDA',
    'INVITACION_EXPIRADA',
    'INVITACION_YA_USADA',
    'INVITACION_REVOCADA',
    'INVITACION_DESTINATARIO_INVALIDO',
];
// ─────────────────────────────────────────────────────────────────────────────
// El token
// ─────────────────────────────────────────────────────────────────────────────
/** Mínimo de caracteres hexadecimales de un token. Dos UUID dan 64. */
var LONGITUD_MINIMA_TOKEN = 48;
/**
 * Junta varias piezas de azar en un token.
 *
 * Apps Script no tiene `crypto.getRandomValues`: lo que hay es
 * `Utilities.getUuid()`, que da un UUID v4 con **122 bits** de entropía. Uno
 * solo bastaría para que adivinarlo fuera imposible en la práctica, pero la
 * generación queda fuera de nuestro control y no se puede auditar, así que se
 * concatenan dos: 244 bits, y el coste es una llamada más.
 *
 * Esta función no inventa azar —no podría probarse si lo hiciera—; recibe las
 * piezas y comprueba que lo que sale sirve.
 */
function componerToken(piezas) {
    const limpias = (piezas !== null && piezas !== void 0 ? piezas : [])
        .map((p) => String(p !== null && p !== void 0 ? p : '').replace(/-/g, '').trim().toLowerCase())
        .filter((p) => p.length > 0);
    if (limpias.length < 2)
        throw new Error('PAYLOAD: un token necesita al menos dos piezas de azar');
    const token = limpias.join('');
    if (!esTokenBienFormado(token)) {
        throw new Error('PAYLOAD: las piezas de azar no dan un token utilizable');
    }
    return token;
}
/**
 * ¿Tiene esto forma de token nuestro?
 *
 * Se comprueba **antes** de tocar la hoja. Un token mal formado no puede
 * corresponder a ninguna fila, así que buscarlo sería gastar una lectura de la
 * hoja por cada cadena que alguien quiera probar contra un endpoint público.
 */
function esTokenBienFormado(token) {
    return typeof token === 'string' && new RegExp(`^[0-9a-f]{${LONGITUD_MINIMA_TOKEN},}$`).test(token);
}
/**
 * Bytes a hexadecimal.
 *
 * `Utilities.computeDigest` devuelve bytes **con signo**, de −128 a 127, que es
 * la herencia de `byte` en Java. Pasarlos a hexadecimal sin corregir el signo
 * produce un hash distinto para la mitad de las entradas —y, lo que es peor, un
 * hash *estable*: nada falla, sencillamente ninguna invitación se encuentra
 * nunca. Está aquí, y no en el `.gs`, porque esto sí se puede probar.
 */
function aHexadecimal(bytes) {
    let salida = '';
    for (const crudo of bytes !== null && bytes !== void 0 ? bytes : []) {
        const byte = ((Number(crudo) % 256) + 256) % 256;
        salida += (byte < 16 ? '0' : '') + byte.toString(16);
    }
    return salida;
}
/**
 * ¿Son iguales estas dos cadenas?
 *
 * Recorre siempre lo mismo, pasen o no. Contra un Web App de Apps Script, con
 * la latencia de red por delante, un ataque de tiempo sobre la comparación de
 * un hash no es practicable; esto es defensa en profundidad y cuesta cuatro
 * líneas, no una necesidad medida.
 */
function igualesEnTiempoConstante(a, b) {
    const uno = typeof a === 'string' ? a : '';
    const dos = typeof b === 'string' ? b : '';
    if (uno.length === 0 || dos.length === 0)
        return false;
    if (uno.length !== dos.length)
        return false;
    let diferencia = 0;
    for (let i = 0; i < uno.length; i++)
        diferencia |= uno.charCodeAt(i) ^ dos.charCodeAt(i);
    return diferencia === 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// Caducidad
// ─────────────────────────────────────────────────────────────────────────────
/** Cuándo caduca una invitación emitida ahora, en ISO. */
function caducidadDesde(ahoraMs, dias = DIAS_VIGENCIA_INVITACION) {
    return new Date(ahoraMs + dias * 24 * 60 * 60 * 1000).toISOString();
}
/**
 * ¿Ya pasó?
 *
 * Una caducidad ilegible cuenta como caducada. La alternativa —tratarla como
 * válida— convierte una celda mal editada en una invitación eterna.
 */
function haCaducado(expira, ahoraMs) {
    const texto = typeof expira === 'string' ? expira.trim() : '';
    if (texto.length === 0)
        return true;
    const cuando = Date.parse(texto);
    if (!Number.isFinite(cuando))
        return true;
    return cuando <= ahoraMs;
}
/**
 * En qué estado está la invitación de una fila.
 *
 * `INEXISTENTE` cuando no hay fila o no hay hash: una fila sin hash es alguien
 * que entró por otra vía o cuya invitación ya se consumió.
 */
function estadoInvitacion(fila, ahoraMs) {
    var _a, _b;
    if (!fila)
        return 'INEXISTENTE';
    const estado = String((_a = fila.estado) !== null && _a !== void 0 ? _a : '').trim().toUpperCase();
    if (estado === 'REVOCADO')
        return 'REVOCADA';
    if (estado === 'ACTIVO')
        return 'ACEPTADA';
    const hash = String((_b = fila.token_hash) !== null && _b !== void 0 ? _b : '').trim();
    if (hash.length === 0)
        return 'INEXISTENTE';
    if (haCaducado(fila.token_expira, ahoraMs))
        return 'EXPIRADA';
    return 'PENDIENTE';
}
/**
 * ¿Puede esta persona aceptar esta invitación?
 *
 * EL CORREO QUE MANDA ES EL DEL `id_token`
 * ────────────────────────────────────────
 * No el del enlace, que lo puede escribir cualquiera. Una invitación reenviada
 * **no funciona**: si Ana le pasa su enlace a Luis, Luis no entra. Cuesta algún
 * caso de soporte y evita que un correo perdido sea una puerta abierta.
 *
 * Los dos correos se comparan **normalizados**, por lo mismo que en E6-bis: el
 * titular teclea la dirección al invitar y puede escribirla con puntos.
 *
 * EL ORDEN DE LAS COMPROBACIONES
 * ──────────────────────────────
 * El destinatario se mira antes que la caducidad a propósito: quien llega a
 * este punto ya demostró tener el token, así que lo accionable —«estás en la
 * cuenta equivocada»— vale más que lo exacto.
 */
function validarAceptacion(peticion) {
    var _a;
    const { fila, hashRecibido, emailAceptante, ahoraMs } = peticion !== null && peticion !== void 0 ? peticion : {};
    if (!fila)
        return { ok: false, error: 'INVITACION_DESCONOCIDA' };
    // El hash tiene que coincidir con el de la fila. Que la búsqueda la haya
    // encontrado no basta: quien la buscó pudo mirar por otro campo.
    if (!igualesEnTiempoConstante(String((_a = fila.token_hash) !== null && _a !== void 0 ? _a : '').trim(), hashRecibido)) {
        return { ok: false, error: 'INVITACION_DESCONOCIDA' };
    }
    const estado = estadoInvitacion(fila, ahoraMs);
    if (estado === 'REVOCADA')
        return { ok: false, error: 'INVITACION_REVOCADA' };
    if (estado === 'ACEPTADA')
        return { ok: false, error: 'INVITACION_YA_USADA' };
    if (estado === 'INEXISTENTE')
        return { ok: false, error: 'INVITACION_DESCONOCIDA' };
    const destinatario = normalizarEmail(fila.email);
    const quienAcepta = normalizarEmail(emailAceptante);
    if (destinatario.length === 0 || quienAcepta.length === 0 || destinatario !== quienAcepta) {
        return { ok: false, error: 'INVITACION_DESTINATARIO_INVALIDO' };
    }
    if (estado === 'EXPIRADA')
        return { ok: false, error: 'INVITACION_EXPIRADA' };
    return { ok: true, email: destinatario };
}
// ─────────────────────────────────────────────────────────────────────────────
// El enlace
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ¿Sirve esta dirección como base de la PWA?
 *
 * Se valida antes de meterla en un correo. Una base mal configurada mandaría a
 * toda la familia a un sitio que no es el nuestro, con el token puesto.
 */
function esUrlPwaValida(url) {
    if (typeof url !== 'string')
        return false;
    const limpia = url.trim();
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s?#]*)?$/i.test(limpia))
        return false;
    // Credenciales embebidas: `https://usuario@malo.example/` es una dirección
    // válida para un navegador y no lleva a donde parece.
    if (limpia.indexOf('@') !== -1)
        return false;
    return true;
}
/**
 * El enlace que viaja en el correo.
 *
 * Lleva el token y **la dirección del backend de esta familia**, porque la PWA
 * es la misma para todos y no sabe con qué hoja hablar hasta que se lo dicen.
 * Esa dirección es una credencial —quien la tenga puede llamar al endpoint—,
 * así que viaja por el mismo canal que el token y con la misma caducidad
 * efectiva: el enlace entero se consume de una vez.
 */
function enlaceInvitacion(basePwa, token, urlBackend) {
    if (!esUrlPwaValida(basePwa))
        throw new Error('PAYLOAD: la URL de la PWA no es utilizable');
    if (!esTokenBienFormado(token))
        throw new Error('PAYLOAD: token mal formado');
    if (typeof urlBackend !== 'string' || !/^https:\/\//.test(urlBackend.trim())) {
        throw new Error('PAYLOAD: la URL del backend no es utilizable');
    }
    const base = basePwa.trim().replace(/\/+$/, '');
    return (base +
        '/invitacion?t=' +
        encodeURIComponent(token) +
        '&backend=' +
        encodeURIComponent(urlBackend.trim()));
}
// ─────────────────────────────────────────────────────────────────────────────
// El correo
// ─────────────────────────────────────────────────────────────────────────────
var ASUNTO_INVITACION = 'Te han dado acceso a un expediente familiar';
/**
 * El cuerpo, y lo único que cambia de un envío a otro es el enlace.
 *
 * ASÉPTICO A PROPÓSITO
 * ────────────────────
 * Ni el nombre del titular, ni el de la familia, ni el de ningún paciente, ni
 * nada clínico. La misma regla que rige los avisos de pantalla bloqueada, por
 * el mismo motivo y con uno más: un correo se reenvía por error, se queda en la
 * bandeja durante años y lo indexa un buscador de escritorio.
 *
 * La regla comprobable es **«sin interpolación»**, no «sin datos sensibles»: la
 * primera la puede verificar una prueba, la segunda exige criterio cada vez.
 */
var PLANTILLA_CORREO_INVITACION = [
    'Hola,',
    '',
    'Alguien te ha dado acceso a un expediente familiar en Paté.',
    '',
    'Para entrar, abre este enlace e inicia sesión con la cuenta de Google a la',
    'que llegó este correo:',
    '',
    '{{enlace}}',
    '',
    'El enlace caduca en ' + DIAS_VIGENCIA_INVITACION + ' días y solo se puede usar una vez.',
    'Solo funciona desde la cuenta a la que se envió: reenviarlo no sirve de nada.',
    '',
    'Si no esperabas este correo, no hagas nada. Sin abrir el enlace no ocurre',
    'nada en ninguna parte.',
].join('\n');
/**
 * Lo que NUNCA puede aparecer en el cuerpo de una invitación.
 *
 * Es un trinquete, no documentación: hay una prueba que lo recorre. Si alguien
 * personaliza el correo «solo un poco», se pone roja.
 */
var PROHIBIDO_EN_CORREO = [
    '{{nombre',
    '{{titular',
    '{{paciente',
    '{{familia',
    '{{email',
    '{{rol',
    '{{diagnostico',
    '{{medicamento',
];
/** El cuerpo final. Sustituye el enlace y nada más. */
function cuerpoInvitacion(enlace) {
    if (typeof enlace !== 'string' || enlace.trim().length === 0) {
        throw new Error('PAYLOAD: una invitación sin enlace no sirve de nada');
    }
    return PLANTILLA_CORREO_INVITACION.split('{{enlace}}').join(enlace.trim());
}
/** Qué marcadores prohibidos lleva un texto. Para la prueba, y para dormir. */
function marcadoresProhibidos(texto) {
    const contenido = String(texto !== null && texto !== void 0 ? texto : '').toLowerCase();
    return PROHIBIDO_EN_CORREO.filter((m) => contenido.indexOf(m) !== -1);
}
/**
 * ¿Tiene sentido esta invitación antes de tocar nada?
 *
 * No comprueba quién invita —de eso se encarga `validarMutacion`, que ya
 * existe— sino que lo invitado sea coherente. Se valida **antes** de generar el
 * token y antes de enviar el correo: un correo enviado no se puede retirar.
 */
function validarInvitacion(datos, rolesValidos) {
    var _a, _b;
    const email = normalizarEmail((datos !== null && datos !== void 0 ? datos : {}).email);
    if (email.length === 0 || email.indexOf('@') <= 0)
        return { ok: false, error: 'SIN_DESTINATARIO' };
    const rol = String((_a = (datos !== null && datos !== void 0 ? datos : {}).rol) !== null && _a !== void 0 ? _a : '').trim().toUpperCase();
    if (rolesValidos.indexOf(rol) === -1)
        return { ok: false, error: 'ROL_DESCONOCIDO' };
    // El titular es quien posee la hoja; no es un rol que se reparta.
    if (rol === 'TITULAR')
        return { ok: false, error: 'ROL_NO_ASIGNABLE' };
    const pacientes = String((_b = (datos !== null && datos !== void 0 ? datos : {}).pacientes) !== null && _b !== void 0 ? _b : '').trim();
    return { ok: true, email, rol, pacientes };
}
