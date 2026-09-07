import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad HTTP — Paté · Salud Familiar (A7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La aplicación maneja información clínica de menores y adultos. Estas
 * cabeceras no la cifran ni la ocultan: reducen la superficie de ataque del
 * navegador —inyección de scripts, secuestro por marco, filtración de la URL
 * hacia terceros— que es donde un expediente médico puede escaparse sin que
 * nadie toque el servidor.
 *
 * CADA ORIGEN DE ESTA LISTA ESTÁ VERIFICADO CONTRA EL CÓDIGO REAL
 * ───────────────────────────────────────────────────────────────
 * No se copió una plantilla. Cada permiso corresponde a una llamada que existe
 * hoy en `src/`, y los que no se pudieron confirmar quedan fuera —quitar un
 * permiso es barato; descubrir tarde que sobraba, no.
 *
 * DELIBERADAMENTE AUSENTE: Apps Script
 * ────────────────────────────────────
 * `script.google.com` y `script.googleusercontent.com` NO aparecen. El backend
 * GAS todavía no existe; abrirles paso ahora sería conceder un permiso a un
 * sistema que nadie ha escrito. Corresponde al Bloque E.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Directivas de la CSP, como datos y no como cadena, para poder probarlas.
 *
 * SOBRE `'unsafe-inline'` EN script-src
 * ─────────────────────────────────────
 * Está ahí por una razón medida, no por comodidad. El App Router de Next
 * inserta seis bloques `<script>` en línea en CADA página —los datos de
 * hidratación de React (`self.__next_f.push`)—. Verificado sobre la
 * compilación de producción, no supuesto.
 *
 * Las dos alternativas reales:
 *
 *   · Hashes: cambian en cada compilación y por página. Inviable.
 *   · Nonce por petición: exige middleware y, según la documentación de Next,
 *     saca a TODAS las rutas de la generación estática. La compilación actual
 *     rinde 20 rutas estáticas, y la aplicación es una PWA con un service
 *     worker que precachea el App Shell. El coste no es teórico.
 *
 * Se documenta como deuda consciente. Todo lo demás sí se aprieta al máximo:
 * `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
 * `form-action 'self'` y una lista blanca cerrada de destinos de red — que es
 * lo que de verdad contiene la exfiltración de datos clínicos aunque alguien
 * lograra ejecutar código en la página.
 */
export const DIRECTIVAS_CSP: Readonly<Record<string, readonly string[]>> = {
  // Todo lo no declarado abajo: solo el propio origen.
  'default-src': ["'self'"],

  // GIS se carga desde accounts.google.com (src/app/layout.tsx).
  // `apis.google.com` NO se incluye: no hay una sola referencia a gapi en el
  // código; la autenticación es enteramente Google Identity Services.
  'script-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
  'script-src-elem': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],

  // El HTML compilado no lleva <style> en línea, pero sí hay un atributo
  // `style={{ width }}` (barra de progreso de medicamentos) y GIS inyecta sus
  // propios estilos al dibujar el botón de acceso.
  'style-src': ["'self'", "'unsafe-inline'"],

  // Las fuentes (Geist, vía next/font) quedan autohospedadas en la
  // compilación: el CSS apunta a /_next/static/media/*.woff2. Sin terceros.
  'font-src': ["'self'"],

  // data:  avatares incrustados como data-URI (≤32 KB)
  // blob:  previsualización de avatar con URL.createObjectURL
  // lh3    foto de perfil que devuelve el id_token de Google
  // fbst   descargas de Firebase Storage (getDownloadURL)
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://lh3.googleusercontent.com',
    'https://firebasestorage.googleapis.com',
  ],

  // Destinos de red confirmados en el código: www./sheets./gmail.googleapis.com,
  // Firestore, Identity Toolkit y Secure Token (todos *.googleapis.com), y
  // accounts.google.com para GIS.
  //
  // `*.firebaseio.com` NO está: la auditoría de A7 confirmó cero referencias a
  // Realtime Database. Permitir conexiones a un servicio que la aplicación no
  // usa solo amplía la superficie por la que podrían salir datos clínicos.
  'connect-src': ["'self'", 'https://*.googleapis.com', 'https://accounts.google.com'],

  // GIS dibuja el botón de acceso dentro de un iframe propio.
  'frame-src': ['https://accounts.google.com'],

  // El service worker (/sw.js) es del propio origen.
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],

  // Sin plugins, sin <base> secuestrable, sin envíos de formulario a terceros.
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],

  // Nadie puede meter esta aplicación en un marco: sin clickjacking.
  'frame-ancestors': ["'none'"],
};

/** Serializa las directivas al formato de la cabecera. */
export function construirCSP(
  directivas: Readonly<Record<string, readonly string[]>> = DIRECTIVAS_CSP,
): string {
  return Object.entries(directivas)
    .map(([nombre, valores]) => `${nombre} ${valores.join(' ')}`)
    .join('; ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Cabeceras
// ─────────────────────────────────────────────────────────────────────────────

export const CABECERAS_SEGURIDAD: ReadonlyArray<{ key: string; value: string }> = [
  {
    key: 'Content-Security-Policy',
    value: construirCSP(),
  },
  {
    // Dos años, subdominios incluidos y apto para la lista de precarga.
    // Los navegadores la ignoran sobre http://localhost, así que no estorba en
    // desarrollo.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Sin adivinación de tipo: un .json subido no puede ejecutarse como script.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Hacia otros orígenes solo viaja el dominio, nunca la ruta. Importa: las
    // rutas de esta aplicación llevan identificadores de miembro.
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // La aplicación no usa ubicación, cámara ni micrófono. Se niegan a todos,
    // incluido el propio origen.
    key: 'Permissions-Policy',
    value: 'geolocation=(), camera=(), microphone=()',
  },
  {
    // Redundante con frame-ancestors, pero cubre navegadores que aún no
    // implementan esa directiva.
    key: 'X-Frame-Options',
    value: 'DENY',
  },
];

const nextConfig: NextConfig = {
  // No anunciar el framework: quita una pista gratuita a quien enumere.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...CABECERAS_SEGURIDAD],
      },
    ];
  },
};

export default nextConfig;
