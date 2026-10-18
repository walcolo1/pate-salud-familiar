/**
 * Bloque M · configuración pública de la PWA, para la plantilla.
 *
 * Al instalarse en la hoja de una familia nueva, el Apps Script necesita el
 * Client ID contra el que validar los `id_token` (`OAUTH_CLIENT_ID`). Antes
 * había que pegarlo a mano en las propiedades del script —y nada lo decía—.
 * Ahora `instalar()` lo lee de aquí.
 *
 * Solo lo público: el Client ID ya viaja en el paquete que descarga cualquier
 * navegador. Sale de la variable de entorno, nunca de un literal (A8).
 */
export function GET() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
  return Response.json(
    { app: 'pate', clientId },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
