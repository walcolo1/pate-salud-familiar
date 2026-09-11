/**
 * Invitaciones.gs — alta, cambio de rol y revocación (Bloque E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El titular pasa por una fricción de cuatro minutos, una vez. Todos los demás
 * no pasan por ninguna: no autorizan nada, no ven una pantalla de permisos de
 * Google y no instalan nada. Reciben un correo con un enlace.
 *
 * EL TOKEN NO SE GUARDA
 * ─────────────────────
 * En `ACCESO` va su SHA-256. Si la hoja se filtrara, los hashes no dejan
 * entrar a nadie. Caduca a los siete días, porque una invitación que no se usa
 * en una semana es una invitación olvidada, y una invitación olvidada que
 * sigue viva es una puerta abierta.
 *
 * `MailApp`, NO `GmailApp`
 * ────────────────────────
 * Los dos envían correo. La diferencia está en el permiso que piden:
 * `GmailApp` exige `https://mail.google.com/` —ámbito **restringido**, acceso
 * total al buzón— y `MailApp` se conforma con `script.send_mail`, que solo
 * permite enviar. Pedir acceso al buzón entero para mandar una invitación es
 * justo el tipo de exceso que hace que un titular cancele la instalación.
 *
 * Cuota: 100 destinatarios al día en una cuenta gratuita, y es la del titular.
 * Las invitaciones son raras; lo que hay que vigilar es la automatización de
 * E11, que comparte ese cupo.
 *
 * ESTADO: E1 · contrato. La implementación llega en E5.
 */

/** Días que vive una invitación sin usar. */
var DIAS_VIGENCIA_INVITACION = 7;

/**
 * Invita a un correo con un rol y un alcance.
 *
 * @param {Object} acceso  El de quien invita. Tiene que ser TITULAR.
 * @param {{email: string, rol: string, pacientes: Array<string>}} datos
 * @return {{ok: boolean}}
 */
function invitar(acceso, datos) {
  throw new Error('NO_IMPLEMENTADO: E5');
}

/**
 * Canjea un token de invitación y deja la fila en ACTIVO.
 *
 * @param {string} token  En claro; aquí se calcula su hash y se compara.
 * @param {string} email  El verificado del `id_token`, no el del enlace.
 * @return {{ok: boolean}}
 */
function aceptarInvitacion(token, email) {
  throw new Error('NO_IMPLEMENTADO: E5');
}

/** Cambia el rol o el alcance de alguien que ya está dentro. */
function cambiarRol(acceso, email, rol, pacientes) {
  throw new Error('NO_IMPLEMENTADO: E5');
}

/**
 * Revoca un acceso con efecto inmediato.
 *
 * Pasa por `mutarAcceso`, que incrementa la versión de la caché: el revocado
 * deja de entrar en la siguiente petición, no cuando caduque una entrada.
 */
function revocar(acceso, email) {
  throw new Error('NO_IMPLEMENTADO: E5');
}
