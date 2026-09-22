/**
 * El titular registra la hoja de su familia (G4b)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Faltaba entero. La URL del `/exec` solo la escribía `/invitacion` al aceptar
 * una invitación, y **el titular nunca pasa por ahí**: la hoja es suya. Así
 * que su navegador no sabía dónde escribir, cada guardado acababa en
 * `SIN_BACKEND`, y la validación en vivo de G4b no dejó ni una fila en la hoja.
 *
 * El router ya lo esperaba. El comentario de `ping` dice que existe «para que
 * la PWA compruebe la URL que acaba de pegar el titular antes de registrarla».
 * Esto es el otro lado.
 *
 * SE COMPRUEBA ANTES DE GUARDAR, Y NO SOLO LA FORMA
 * ─────────────────────────────────────────────────
 * Una URL bien formada puede ser de otro Apps Script, o de éste sirviendo
 * código viejo. El segundo caso es el de E9-bis: guardar en el editor no
 * cambia lo que sirve la URL —hay que publicar una versión nueva—, y un
 * despliegue desactualizado produce fallos lejos de su causa.
 */

import { CLAVE_SESION_FAMILIAR, esUrlBackendValida, type AlmacenSimple } from './invitacionEntrante';
import { VERSION_CONTRATO } from './router';
import { VERSION_ESQUEMA } from './esquemaHoja';

export type MotivoRechazo = 'URL_INVALIDA' | 'NO_RESPONDE' | 'NO_ES_PATE' | 'DESPLIEGUE_ANTIGUO';

export type ResultadoRegistro =
  | { ok: true; version: string; esquema: number }
  | { ok: false; motivo: MotivoRechazo; detalle?: string };

export const MENSAJES_REGISTRO: Record<MotivoRechazo, string> = {
  URL_INVALIDA:
    'Esa dirección no es la de una aplicación web de Apps Script. Tiene que terminar en /exec.',
  NO_RESPONDE:
    'La dirección no contesta. Comprueba que el despliegue existe y que su acceso es «Cualquier usuario».',
  NO_ES_PATE:
    'La dirección contesta, pero no es el backend de Paté. Revisa que sea la de tu hoja de la familia.',
  DESPLIEGUE_ANTIGUO:
    'El despliegue sirve una versión anterior del código. En Apps Script: Administrar implementaciones ▸ editar ▸ Versión: versión nueva.',
};

interface Opciones {
  fetch?: typeof globalThis.fetch;
  almacen?: AlmacenSimple | null;
}

/**
 * Comprueba la URL con `ping` y, si todo cuadra, la guarda.
 *
 * `ping` es la única acción del router que **no pide identidad**, y por eso
 * sirve aquí: registrar la hoja no puede exigir una sesión con esa hoja,
 * porque es el paso que la hace posible.
 *
 * Nunca lanza. Devuelve el motivo del rechazo para que la pantalla lo diga.
 */
export async function comprobarYRegistrar(
  url: string,
  opciones: Opciones = {},
): Promise<ResultadoRegistro> {
  const limpia = String(url ?? '').trim();
  if (!esUrlBackendValida(limpia)) return { ok: false, motivo: 'URL_INVALIDA' };

  const hacerPeticion = opciones.fetch ?? globalThis.fetch;

  let cuerpo: unknown;
  try {
    const respuesta = await hacerPeticion(limpia, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'ping' }),
    });
    if (!respuesta.ok) return { ok: false, motivo: 'NO_RESPONDE', detalle: `HTTP ${respuesta.status}` };
    cuerpo = await respuesta.json();
  } catch (err) {
    return { ok: false, motivo: 'NO_RESPONDE', detalle: (err as Error)?.message };
  }

  const sobre = cuerpo as { ok?: unknown; data?: { version?: unknown; esquema?: unknown } } | null;
  const version = sobre?.data?.version;
  const esquema = Number(sobre?.data?.esquema);

  // `ok === true` y una versión con forma de versión. Mirar solo que no haya
  // error dejaría pasar un HTML de inicio de sesión como si fuera Paté.
  if (!sobre || sobre.ok !== true || typeof version !== 'string' || !Number.isFinite(esquema)) {
    return { ok: false, motivo: 'NO_ES_PATE' };
  }

  if (version !== VERSION_CONTRATO || esquema < VERSION_ESQUEMA) {
    return {
      ok: false,
      motivo: 'DESPLIEGUE_ANTIGUO',
      detalle: `sirve ${version} con esquema ${esquema}; se esperaba ${VERSION_CONTRATO} con esquema ${VERSION_ESQUEMA}`,
    };
  }

  const almacen =
    opciones.almacen ?? (typeof window === 'undefined' ? null : window.localStorage);
  try {
    almacen?.setItem(CLAVE_SESION_FAMILIAR, limpia);
  } catch {
    // Modo privado o cuota llena: la comprobación fue bien, pero no se puede
    // recordar. Se dice como si no respondiera, que es lo que el usuario verá.
    return { ok: false, motivo: 'NO_RESPONDE', detalle: 'no se pudo guardar en este navegador' };
  }

  return { ok: true, version, esquema };
}
