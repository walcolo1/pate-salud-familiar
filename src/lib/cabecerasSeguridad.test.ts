import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import nextConfig, {
  CABECERAS_SEGURIDAD,
  DIRECTIVAS_CSP,
  construirCSP,
} from '../../next.config';

/**
 * Pruebas de las cabeceras de seguridad (A7).
 *
 * Se importa `next.config.ts` DE VERDAD, no una copia de la política: una
 * prueba contra un duplicado seguiría en verde aunque alguien vaciara la
 * configuración real.
 *
 * Estas pruebas verifican la DECLARACIÓN. Que el servidor las emita de verdad
 * lo comprueba `e2e/cabeceras-seguridad.e2e.ts` contra respuestas HTTP reales:
 * son dos afirmaciones distintas y no se sustituyen entre sí.
 */

const claves = () => CABECERAS_SEGURIDAD.map((c) => c.key);
const valorDe = (k: string) => CABECERAS_SEGURIDAD.find((c) => c.key === k)?.value;

describe('next.config · contrato de configuración', () => {
  it('exporta headers() como función asíncrona', () => {
    expect(typeof nextConfig.headers).toBe('function');
  });

  it('no anuncia el framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('headers() aplica a TODAS las rutas, no solo a la raíz', async () => {
    const reglas = await nextConfig.headers!();
    expect(reglas).toHaveLength(1);
    expect(reglas[0].source).toBe('/:path*');
    expect(reglas[0].headers.map((h) => h.key).sort()).toEqual(claves().sort());
  });
});

describe('lista de cabeceras', () => {
  it('contiene las cinco cabeceras exigidas', () => {
    for (const k of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(claves()).toContain(k);
    }
  });

  it('ninguna cabecera se declara dos veces', () => {
    expect(new Set(claves()).size).toBe(claves().length);
  });

  it('ninguna cabecera queda vacía', () => {
    for (const c of CABECERAS_SEGURIDAD) expect(c.value.trim().length).toBeGreaterThan(0);
  });

  it('HSTS con dos años, subdominios y preload', () => {
    expect(valorDe('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
  });

  it('nosniff, referrer y permisos con los valores exactos', () => {
    expect(valorDe('X-Content-Type-Options')).toBe('nosniff');
    expect(valorDe('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valorDe('Permissions-Policy')).toBe('geolocation=(), camera=(), microphone=()');
  });

  it('niega ubicación, cámara y micrófono también al propio origen', () => {
    // `geolocation=(self)` permitiría a la app pedirlo. La lista debe ir vacía.
    expect(valorDe('Permissions-Policy')).not.toContain('self');
    expect(valorDe('Permissions-Policy')).not.toContain('*');
  });
});

describe('Content-Security-Policy', () => {
  const csp = () => valorDe('Content-Security-Policy')!;

  it('declara las directivas de contención exigidas', () => {
    expect(DIRECTIVAS_CSP['default-src']).toEqual(["'self'"]);
    expect(DIRECTIVAS_CSP['object-src']).toEqual(["'none'"]);
    expect(DIRECTIVAS_CSP['base-uri']).toEqual(["'self'"]);
    expect(DIRECTIVAS_CSP['frame-ancestors']).toEqual(["'none'"]);
  });

  it('permite Google Identity Services donde hace falta y solo ahí', () => {
    expect(DIRECTIVAS_CSP['script-src']).toContain('https://accounts.google.com');
    expect(DIRECTIVAS_CSP['frame-src']).toEqual(['https://accounts.google.com']);
    expect(DIRECTIVAS_CSP['connect-src']).toContain('https://accounts.google.com');
  });

  it('permite las APIs de Google que se usan, por su nombre y sin comodín', () => {
    // Hasta G4 aquí había `https://*.googleapis.com`. Cubría Sheets, Drive y
    // Calendar, que se usan… y también Firestore, Identity Toolkit y Secure
    // Token, que se fueron con Firebase. Un comodín no se puede recortar: se
    // sustituye por la lista medida en el código.
    expect(DIRECTIVAS_CSP['connect-src']).toContain('https://www.googleapis.com');
    expect(DIRECTIVAS_CSP['connect-src']).not.toContain('https://*.googleapis.com');
    // Bloque H · sin salidas a Sheets desde el navegador: la hoja de la
    // familia la escribe el Web App, y la exportación y el informe individual,
    // que no tenían botón desde G4b, se retiraron.
    expect(DIRECTIVAS_CSP['connect-src']).not.toContain('https://sheets.googleapis.com');
  });

  it('NO queda ningún destino de Firebase, en ninguna directiva', () => {
    // G4 retiró Firebase entero. Dejar abiertos sus destinos sería dejar una
    // vía de salida a un servicio que la aplicación ya no usa.
    for (const resto of [
      'firestore.googleapis.com',
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
      'firebasestorage.googleapis.com',
      'firebaseio.com',
      'firebaseapp.com',
    ]) {
      expect(csp(), resto).not.toContain(resto);
    }
  });

  it('cada host de googleapis que llama el código está permitido', () => {
    // La otra mitad: quitar el comodín no puede dejar sin red a Drive, a
    // Calendar ni a Sheets. Se recorre src/ y todo host literal tiene que
    // estar en la lista. `oauth2.googleapis.com` es la excepción, y está
    // razonada: lo llama el backend (Auth.gs), nunca el navegador.
    const RAIZ = join(process.cwd(), 'src');
    const ficheros = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const r = join(dir, n);
        return statSync(r).isDirectory() ? ficheros(r) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [r] : [];
      });

    const hosts = new Set<string>();
    for (const f of ficheros(RAIZ)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/[a-z0-9.-]*googleapis\.com/g)) {
        hosts.add(m[0]);
      }
    }
    hosts.delete('https://oauth2.googleapis.com');

    expect(hosts.size, 'no se encontró ningún host: la prueba no mira nada').toBeGreaterThan(0);
    for (const host of hosts) expect(DIRECTIVAS_CSP['connect-src'], host).toContain(host);
  });

  it('NO permite Realtime Database: la aplicación no lo usa', () => {
    // Mínimo privilegio. La auditoría de A7 confirmó cero referencias a RTDB;
    // dejarlo abierto solo daría una vía de salida más a datos clínicos.
    expect(DIRECTIVAS_CSP['connect-src']).not.toContain('https://*.firebaseio.com');
    expect(csp()).not.toContain('firebaseio.com');
  });

  it('NO permite apis.google.com: no hay ningún flujo con gapi', () => {
    expect(csp()).not.toContain('apis.google.com');
  });

  it('connect-src se limita a seis destinos y ni uno más', () => {
    // Si alguien añade un destino, esta prueba obliga a justificarlo aquí.
    //
    // Los dos últimos entraron en E0-bis y no por comodidad: sin ellos, la PWA
    // no puede hablar con el Web App de Apps Script de su titular, que es el
    // backend del Bloque E. Cada destino es un sitio al que podrían salir datos
    // clínicos, así que la lista se lee entera antes de tocarla.
    expect([...DIRECTIVAS_CSP['connect-src']]).toEqual([
      "'self'",
      'https://www.googleapis.com',
      'https://accounts.google.com',
      'https://script.google.com',
      'https://script.googleusercontent.com',
    ]);
  });

  it('permite avatares: data-URI, previsualización blob y foto de Google', () => {
    const img = DIRECTIVAS_CSP['img-src'];
    expect(img).toContain('data:');
    expect(img).toContain('blob:');
    expect(img).toContain('https://lh3.googleusercontent.com');
    // G4 · Firebase Storage se fue: las fotos de miembros que apuntaban ahí
    // eran datos de prueba.
    expect(img).not.toContain('https://firebasestorage.googleapis.com');
  });

  it('NO admite eval en ninguna directiva', () => {
    expect(csp()).not.toContain('unsafe-eval');
  });

  it('abre paso a Apps Script SOLO donde hace falta: conectarse', () => {
    // Hasta E0-bis esta prueba exigía lo contrario, y era correcta: la ausencia
    // era deliberada. Se invierte a propósito, con la medición delante
    // (`docs/evidencia/E0bis-06-sonda-cors.md`), no de refilón.
    expect(DIRECTIVAS_CSP['connect-src']).toContain('https://script.google.com');
    // El segundo host no es decorativo: `…/exec` redirige a `/macros/echo` en
    // `script.googleusercontent.com`, y la CSP comprueba también el destino de
    // la redirección. Con uno solo, la petición muere igual.
    expect(DIRECTIVAS_CSP['connect-src']).toContain('https://script.googleusercontent.com');

    // Y en ninguna otra directiva. El Web App es un destino de datos, no una
    // fuente de código ni un marco: nada de Apps Script debe poder ejecutarse
    // ni pintarse dentro de la aplicación.
    for (const d of ['script-src', 'script-src-elem', 'frame-src', 'img-src', 'style-src']) {
      expect(DIRECTIVAS_CSP[d] ?? [], d).not.toContain('https://script.google.com');
      expect(DIRECTIVAS_CSP[d] ?? [], d).not.toContain('https://script.googleusercontent.com');
    }
  });

  it('la hoja de estilos de GIS entra, y SOLO ella', () => {
    // GIS no pinta su botón solo con estilos en línea: descarga una hoja
    // externa desde `accounts.google.com/gsi/style`. Sin esta fuente el botón
    // sale sin formato y la consola lo denuncia en cada carga. Lo vio la
    // validación en vivo de G4b; la suite no, porque bloquea Google a propósito.
    expect(DIRECTIVAS_CSP['style-src']).toContain('https://accounts.google.com/gsi/style');

    // Con la RUTA, no el dominio entero: `accounts.google.com` a secas dejaría
    // cargar cualquier hoja de ese host, y una hoja de estilos también puede
    // exfiltrar datos (selectores de atributo que piden imágenes).
    expect(DIRECTIVAS_CSP['style-src']).not.toContain('https://accounts.google.com');
  });

  it('no se cuela `data:` ni `blob:` donde podrían ejecutarse', () => {
    // En img-src son necesarios; en script-src serían un agujero.
    for (const d of ['script-src', 'script-src-elem', 'connect-src', 'frame-src']) {
      expect(DIRECTIVAS_CSP[d], d).not.toContain('data:');
      expect(DIRECTIVAS_CSP[d], d).not.toContain('blob:');
    }
  });

  it('ningún comodín deja entrar a cualquiera', () => {
    for (const [nombre, valores] of Object.entries(DIRECTIVAS_CSP)) {
      expect(valores, nombre).not.toContain('*');
      expect(valores, nombre).not.toContain('https:');
      expect(valores, nombre).not.toContain('http:');
    }
  });

  it('`unsafe-inline` queda acotado a script y estilo, nunca a la red', () => {
    // Es la deuda documentada del App Router. No debe filtrarse a otras
    // directivas, donde no tendría ninguna justificación.
    const permitidas = new Set(['script-src', 'script-src-elem', 'style-src']);
    for (const [nombre, valores] of Object.entries(DIRECTIVAS_CSP)) {
      if (permitidas.has(nombre)) continue;
      expect(valores, nombre).not.toContain("'unsafe-inline'");
    }
  });

  it('todo origen remoto es https, sin texto claro', () => {
    for (const valores of Object.values(DIRECTIVAS_CSP)) {
      for (const v of valores) {
        if (v.startsWith('http')) expect(v.startsWith('https://')).toBe(true);
      }
    }
  });

  it('se serializa con `;` entre directivas y sin punto y coma final', () => {
    const s = construirCSP({ 'default-src': ["'self'"], 'object-src': ["'none'"] });
    expect(s).toBe("default-src 'self'; object-src 'none'");
  });

  it('la cabecera real incluye todas las directivas declaradas', () => {
    for (const nombre of Object.keys(DIRECTIVAS_CSP)) {
      expect(csp()).toContain(`${nombre} `);
    }
  });
});
