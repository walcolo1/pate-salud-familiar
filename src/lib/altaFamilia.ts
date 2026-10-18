/**
 * Bloque M · cómo empieza una familia nueva.
 *
 * La plantilla maestra se copia con `/copy`: Google ofrece la copia y el
 * script viaja con ella (E2, E8). Su enlace es público a propósito —es lo que
 * se le da a cada titular— y se puede cambiar por despliegue con
 * `NEXT_PUBLIC_PLANTILLA_URL` (otro molde, otra marca).
 */

/** El `/copy` de la plantilla maestra limpia (ver docs/PLANTILLA_PRODUCCION.md). */
export const URL_PLANTILLA_OFICIAL =
  'https://docs.google.com/spreadsheets/d/1eMuQxdZdt525IXryR-8PalRmuw243LlPnkO7T-L68fs/copy';

const PATRON_COPIA = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]{20,}\/copy$/;

export function esEnlaceDeCopia(url: unknown): boolean {
  return typeof url === 'string' && PATRON_COPIA.test(url.trim());
}

export function urlPlantilla(configurada: string | undefined = process.env.NEXT_PUBLIC_PLANTILLA_URL): string {
  const valor = String(configurada ?? '').trim();
  return esEnlaceDeCopia(valor) ? valor : URL_PLANTILLA_OFICIAL;
}

/**
 * Las rutas que siguen abiertas para alguien sin acceso a la hoja: la que le
 * explica qué hacer, la del enlace de invitación, Ajustes (para conectar otra
 * hoja o cerrar sesión) y la entrada.
 */
export const RUTAS_SIN_ACCESO = ['/crear-expediente', '/invitacion', '/settings', '/login', '/onboarding'];

export function rutaPermitidaSinAcceso(ruta: string | null | undefined): boolean {
  const r = String(ruta ?? '');
  return RUTAS_SIN_ACCESO.some((base) => r === base || r.startsWith(base + '/'));
}
