/**
 * Bloque L · qué decirle al titular cuando una invitación no sale.
 *
 * Antes la tarjeta enseñaba `err.message` tal cual —«ERROR_PAYLOAD», o
 * nada—, y una invitación que no salía parecía haber salido.
 */
export const MENSAJES_INVITACION: Record<string, string> = {
  ERROR_PAYLOAD:
    'La hoja rechazó la invitación: revisa el correo y el rol. Si sigue pasando, la hoja necesita la versión nueva del código.',
  PERMISO_INSUFICIENTE: 'Solo el titular puede invitar o retirar accesos.',
  ACCESO_DENEGADO: 'Tu cuenta no figura en ACCESO de esta hoja.',
  TOKEN_INVALIDO: 'Tu sesión de Google caducó. Vuelve a entrar y repite la invitación.',
  SIN_IDENTIDAD: 'Tu sesión de Google caducó. Vuelve a entrar y repite la invitación.',
  ERROR_DESPACHO:
    'La invitación quedó registrada en la hoja, pero el correo no salió. Vuelve a enviarla en unos minutos.',
  ERROR_CERROJO: 'La hoja estaba ocupada. Inténtalo otra vez en unos segundos.',
  FALLO_TRANSPORTE: 'No hubo conexión con la hoja. Comprueba la red e inténtalo otra vez.',
  SIN_BACKEND: 'Este navegador no sabe dónde está la hoja de la familia.',
  ACCION_DESCONOCIDA: 'La hoja tiene una versión anterior del código: publica la versión nueva.',
};

export function mensajeDeInvitacion(err: unknown): string {
  const codigo = String((err as { codigo?: unknown } | null)?.codigo ?? '').trim();
  return (
    MENSAJES_INVITACION[codigo] ??
    'No se pudo completar. Inténtalo otra vez; si se repite, revisa la hoja de la familia.'
  );
}
