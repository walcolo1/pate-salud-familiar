/**
 * Invitaciones.gs — alta y canje de invitaciones (Bloque E, E7)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El titular pasa una fricción de cuatro minutos, una vez. Todos los demás no
 * pasan por ninguna: reciben un correo con un enlace y entran.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí está lo que solo existe dentro de Apps Script: el azar
 * (`Utilities.getUuid`), el hash (`Utilities.computeDigest`), la hoja, el
 * cerrojo y el correo. Las decisiones —la forma del token, la caducidad, la
 * tabla de estados, el cuerpo del correo y quién puede aceptar qué— viven en
 * `Invitacion.gs`, que se genera desde `src/lib/invitaciones.ts` y tiene 62
 * pruebas.
 *
 * EL TOKEN NO SE GUARDA
 * ─────────────────────
 * En `ACCESO` va su SHA-256. Una hoja de cálculo se comparte por accidente con
 * una facilidad que un servidor no tiene; si eso pasa, los hashes no dejan
 * entrar a nadie.
 *
 * `MailApp`, NO `GmailApp`
 * ────────────────────────
 * Los dos envían correo. `GmailApp` exige `https://mail.google.com/` —ámbito
 * **restringido**, acceso total al buzón— y `MailApp` se conforma con
 * `script.send_mail`, que solo permite enviar. Pedir acceso al buzón entero
 * para mandar una invitación es justo el tipo de exceso que hace que un titular
 * cancele la instalación.
 *
 * Cuota: 100 destinatarios al día en una cuenta gratuita, y es la del titular.
 * Las invitaciones son raras; lo que hay que vigilar es la automatización de
 * E11, que comparte ese cupo.
 */

/** Dónde vive la dirección de la PWA. La escribe el titular al configurar. */
var CLAVE_URL_PWA = 'URL_PWA';

/** Dónde vive la dirección de este mismo despliegue, para meterla en el enlace. */
var CLAVE_URL_BACKEND = 'URL_BACKEND';

/** Cuánto espera el cerrojo de una invitación antes de rendirse. */
var ESPERA_INVITACION_MS = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// Azar y hash: lo único que no se puede probar fuera de Apps Script
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un token nuevo.
 *
 * Apps Script no tiene `crypto.getRandomValues`. Lo que hay es
 * `Utilities.getUuid()`, un UUID v4 con 122 bits de entropía; se concatenan dos
 * porque la generación queda fuera de nuestro control y no se puede auditar, y
 * la segunda llamada no cuesta nada.
 */
function generarToken_() {
  return componerToken([Utilities.getUuid(), Utilities.getUuid()]);
}

/**
 * El SHA-256 de un token, en hexadecimal.
 *
 * `computeDigest` devuelve bytes **con signo**, de −128 a 127. La conversión
 * está en `Invitacion.gs` justamente porque ahí sí se puede probar: hacerla mal
 * produce un hash estable y equivocado, con lo que nada falla y ninguna
 * invitación se encuentra nunca.
 */
function hashToken_(token) {
  return aHexadecimal(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invitar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invita a un correo con un rol y un alcance.
 *
 * SE ESCRIBE ANTES DE ENVIAR, Y NO AL REVÉS
 * ─────────────────────────────────────────
 * Si el envío falla después de escribir, queda una fila con un token que nadie
 * recibió: el titular reinvita y `mutarAcceso` reescribe la misma fila, sin
 * duplicarla. Al revés —enviar primero— dejaría a alguien con un enlace en el
 * correo que no corresponde a ninguna fila, y eso no se arregla solo.
 *
 * @param {Object} datos  `{ email, rol, pacientes }`.
 * @param {Object} acceso  El de quien invita. `mutarAcceso` exige que sea TITULAR.
 */
function invitar(datos, acceso) {
  // 1 · Que lo pedido tenga sentido, antes de generar nada y antes de escribir.
  //     Un correo enviado no se puede retirar.
  var validacion = validarInvitacion(datos || {}, ROLES);
  if (!validacion.ok) throw new Error('PAYLOAD: ' + validacion.error);

  var urlPwa = PropertiesService.getScriptProperties().getProperty(CLAVE_URL_PWA);
  var urlBackend = PropertiesService.getScriptProperties().getProperty(CLAVE_URL_BACKEND);
  if (!urlPwa || !urlBackend) {
    // Fallar cerrado, igual que `Auth.gs` sin audiencia: una instalación a
    // medias no debe poder mandar enlaces que no llevan a ninguna parte.
    throw new Error('PAYLOAD: falta URL_PWA o URL_BACKEND en las propiedades');
  }

  // 2 · El token. Se compone el enlace ANTES de escribir, para que una URL mal
  //     configurada se descubra aquí y no con la fila ya puesta.
  var token = generarToken_();
  var enlace = enlaceInvitacion(urlPwa, token, urlBackend);

  // 3 · La fila, por la puerta de siempre: `mutarAcceso` lleva el cerrojo, la
  //     validación de quién invita y la subida de versión.
  mutarAcceso(
    'INVITAR',
    {
      email: validacion.email,
      rol: validacion.rol,
      pacientes: validacion.pacientes,
      tokenHash: hashToken_(token),
      tokenExpira: caducidadDesde(Date.now()),
      invitadoPor: acceso && acceso.email ? acceso.email : '',
    },
    acceso,
  );

  // 4 · El correo. Aséptico: ni el nombre del titular, ni el de la familia, ni
  //     nada clínico. Se lee en una pantalla bloqueada y se reenvía por error.
  try {
    MailApp.sendEmail({
      to: validacion.email,
      subject: ASUNTO_INVITACION,
      // Texto plano a propósito: no ejecuta nada y no delata si se abrió.
      body: cuerpoInvitacion(enlace),
      noReply: true,
    });
  } catch (err) {
    console.warn('invitacion: la fila se escribió pero el correo no salió');
    throw new Error('ERROR_DESPACHO');
  }

  // Ni el token ni el enlace vuelven en la respuesta: el enlace viaja por el
  // correo y por ningún otro sitio. Devolverlo aquí lo dejaría en el registro
  // de red del navegador del titular.
  return { invitada: true, expiraEn: DIAS_VIGENCIA_INVITACION };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aceptar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canjea una invitación y deja la fila en ACTIVO.
 *
 * LA ÚNICA ACCIÓN CON IDENTIDAD Y SIN ACCESO
 * ──────────────────────────────────────────
 * Por eso no pasa por `mutarAcceso`, que exige TITULAR: quien acepta no es
 * nadie todavía. Lo que la protege es el token —244 bits, caducidad de siete
 * días y un solo uso— y la comprobación de que el correo verificado del
 * `id_token` es el de la fila.
 *
 * EL CORREO QUE MANDA ES EL DEL `id_token`
 * ────────────────────────────────────────
 * No el del enlace. Una invitación reenviada no funciona.
 *
 * @param {Object} payload  `{ t: '<token>' }`.
 * @param {Object} _acceso  Siempre `null` aquí. Está por la firma del router.
 * @param {{email: string}} identidad  Lo que devolvió E3.
 */
function aceptarInvitacion(payload, _acceso, identidad) {
  var token = (payload || {}).t;

  // Antes de tocar la hoja. Un token mal formado no puede corresponder a
  // ninguna fila, y este endpoint es público: sin esto, cada cadena que alguien
  // pruebe cuesta una lectura de la hoja.
  if (!esTokenBienFormado(token)) throw new Error('INVITACION_DESCONOCIDA');
  if (!identidad || !identidad.email) throw new Error('TOKEN_INVALIDO');

  return mutarInvitacion_(hashToken_(token), identidad.email);
}

/**
 * La escritura del canje, bajo cerrojo.
 *
 * Es la hermana de `mutarAcceso` para el único caso que aquella no puede
 * cubrir. Lleva su mismo cerrojo de script —dos pestañas del mismo navegador
 * aceptando a la vez leerían la misma hoja y una escritura desaparecería— y
 * sube la versión por el mismo motivo.
 */
function mutarInvitacion_(hashRecibido, emailAceptante) {
  var cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(ESPERA_INVITACION_MS)) throw new Error('OCUPADO');

  try {
    var hoja = abrirHoja_();
    var pestana = hoja.getSheetByName('ACCESO');
    if (!pestana) throw new Error('INVITACION_DESCONOCIDA');

    var encabezados = encabezadosDe('ACCESO') || [];
    var fila = buscarPorHash_(pestana, encabezados, hashRecibido);

    var veredicto = validarAceptacion({
      fila: fila ? fila.datos : null,
      hashRecibido: hashRecibido,
      emailAceptante: emailAceptante,
      ahoraMs: Date.now(),
    });

    if (!veredicto.ok) {
      // El motivo sí sale, y está razonado en `invitaciones.ts`: para llegar
      // hasta aquí hay que traer el token, que es un secreto. Lo que no sale
      // nunca es para quién era la invitación.
      console.warn('invitacion rechazada: ' + veredicto.error);
      throw new Error(veredicto.error);
    }

    // Deja la fila ACTIVO y consume el token, por el mismo camino que usa
    // `mutarAcceso`: es el único sitio que sabe dónde está cada columna.
    escribirMutacion_(pestana, 'ACEPTAR', veredicto.email, {});

    var propiedades = PropertiesService.getScriptProperties();
    propiedades.setProperty(
      CLAVE_VERSION_ACCESO,
      String(siguienteVersion(propiedades.getProperty(CLAVE_VERSION_ACCESO))),
    );

    auditar_('ACCESO_ACEPTAR', 'OK', veredicto.email);
    return { aceptada: true };
  } finally {
    cerrojo.releaseLock();
  }
}

/**
 * La fila cuyo `token_hash` coincide, si hay alguna.
 *
 * Se busca **por el hash**, no por el correo: quien acepta puede no ser quien
 * dice el enlace, y buscar por correo dejaría que alguien comprobara si una
 * dirección figura en esta familia sin tener ningún token.
 */
function buscarPorHash_(pestana, encabezados, hashRecibido) {
  if (pestana.getLastRow() < 2) return null;

  var col = {};
  for (var i = 0; i < encabezados.length; i++) col[encabezados[i]] = i;

  var filas = pestana.getRange(2, 1, pestana.getLastRow() - 1, encabezados.length).getValues();
  for (var j = 0; j < filas.length; j++) {
    var hash = String(filas[j][col.token_hash] || '').trim();
    if (!igualesEnTiempoConstante(hash, hashRecibido)) continue;
    return {
      numero: j + 2,
      datos: {
        email: filas[j][col.email],
        estado: filas[j][col.estado],
        token_hash: hash,
        token_expira: filas[j][col.token_expira],
      },
    };
  }
  return null;
}
