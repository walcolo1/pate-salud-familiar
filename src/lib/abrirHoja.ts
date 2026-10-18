/**
 * «Abrir la hoja» desde Ajustes (cierre de G4).
 *
 * La dirección no se guarda en ningún sitio: se pide al despliegue al pulsar,
 * con la acción `verHoja`, que solo contesta al titular. Guardarla sería
 * guardar el ID de la hoja.
 *
 * LA PESTAÑA SE ABRE ANTES DE PEDIR
 * ─────────────────────────────────
 * Un `window.open` después de un `await` ya no cuenta como respuesta al clic, y
 * el navegador lo bloquea como ventana emergente. Así que primero se abre una
 * pestaña vacía, luego se pide la dirección, y se navega o se cierra.
 */

export const MENSAJES_ABRIR_HOJA = {
  PERMISO_INSUFICIENTE: 'Solo el titular puede abrir la hoja desde aquí.',
  // Bloque M2 · antes caían todos en «Inténtalo en un momento», que no es lo
  // que pasa y no dice qué hacer.
  ACCESO_DENEGADO:
    'Tu cuenta no figura en la hoja con la que habla este navegador. Conecta la tuya con «Cambiar dirección de la hoja» o desde tu hoja: Paté ▸ Conectar con la aplicación.',
  TOKEN_INVALIDO: 'Tu sesión de Google caducó. Vuelve a entrar e inténtalo otra vez.',
  ERROR_DESPACHO:
    'La hoja respondió con un error: puede que su instalación no terminara. En tu hoja, ejecuta Paté ▸ Instalar o actualizar.',
  FALLO_TRANSPORTE:
    'La dirección de la hoja no responde. Comprueba que la implementación existe y que su acceso es «Cualquier usuario».',
  ACCION_DESCONOCIDA:
    'El Web App de tu familia es anterior a esta versión. Publica la versión nueva del despliegue en Apps Script.',
  SIN_BACKEND: 'Este navegador todavía no tiene registrada la hoja de la familia.',
  SIN_IDENTIDAD: 'Tu sesión de Google no está activa. Vuelve a entrar con el botón de arriba e inténtalo otra vez.',
  BLOQUEADA: 'El navegador bloqueó la pestaña nueva. Permite las ventanas emergentes de esta aplicación.',
  OTRO: 'No se pudo obtener la dirección de la hoja. Inténtalo en un momento.',
} as const;

type Motivo = keyof typeof MENSAJES_ABRIR_HOJA;

/** Lo mínimo de una pestaña que hace falta. `window.open` devuelve esto. */
export interface PestanaAbierta {
  opener: unknown;
  location: { replace(url: string): void };
  close(): void;
}

function motivoDe(err: unknown): Motivo {
  const codigo = (err as { codigo?: unknown } | null)?.codigo;
  return typeof codigo === 'string' && codigo in MENSAJES_ABRIR_HOJA && codigo !== 'BLOQUEADA' && codigo !== 'OTRO'
    ? (codigo as Motivo)
    : 'OTRO';
}

/**
 * Abre la hoja en otra pestaña. Devuelve `null` si la abrió, o el mensaje que
 * hay que enseñar.
 */
export async function abrirHojaEnPestana(
  obtenerUrl: () => Promise<string>,
  abrir: () => PestanaAbierta | null = () => window.open('', '_blank') as PestanaAbierta | null,
): Promise<string | null> {
  const pestana = abrir();
  if (!pestana) return MENSAJES_ABRIR_HOJA.BLOQUEADA;

  // La hoja no tiene por qué poder tocar esta pestaña.
  pestana.opener = null;

  try {
    const url = await obtenerUrl();
    pestana.location.replace(url);
    return null;
  } catch (err) {
    pestana.close();
    return MENSAJES_ABRIR_HOJA[motivoDe(err)];
  }
}
