import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Guardián de configuración de entorno (A8).
 *
 * Hubo un Client ID de OAuth incrustado como valor por defecto en dos
 * archivos de producción. No era un secreto —un Client ID es público por
 * diseño—, pero hacía algo peor que filtrarlo: ataba el binario a un proyecto
 * de Google Cloud concreto y convertía una configuración ausente en un fallo
 * silencioso. La aplicación intentaba autenticar contra un proyecto ajeno en
 * lugar de decir que le faltaba una variable.
 *
 * Se retiró en el Bloque B. Esta prueba existe para que no vuelva.
 *
 * Recorre `src/` de verdad, sobre el disco, en lugar de comprobar una lista
 * de archivos conocidos: un archivo nuevo con el mismo error quedaría fuera
 * de cualquier lista, pero no del recorrido.
 */

const RAIZ = 'src';

/** Marcadores que no pueden aparecer en código de producción. */
const LITERALES_PROHIBIDOS = [
  // Client ID de OAuth incrustado.
  'apps.googleusercontent.com',
  // Claves de API de Google y tokens de acceso, por si alguna vez se pegan.
  'AIzaSy',
  'ya29.',
  'BEGIN PRIVATE KEY',
];

/**
 * Qué NO se revisa, y por qué.
 *
 * Las pruebas SÍ pueden nombrar estos literales: es su trabajo comprobar que
 * no aparecen en otro sitio, y prohibírselo dejaría la regla sin quien la
 * vigile.
 */
function esArchivoDeProduccion(ruta: string): boolean {
  if (/\.test\.tsx?$/.test(ruta)) return false;
  if (/\.d\.ts$/.test(ruta)) return false;
  return /\.(ts|tsx)$/.test(ruta);
}

function recorrer(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    // node_modules y salidas de compilación nunca están bajo src/, pero se
    // excluyen igual por si alguien crea un directorio así.
    if (entrada === 'node_modules' || entrada.startsWith('.next')) continue;
    if (statSync(ruta).isDirectory()) recorrer(ruta, acumulado);
    else if (esArchivoDeProduccion(ruta)) acumulado.push(ruta);
  }
  return acumulado;
}

describe('A8 · ningún identificador incrustado en producción', () => {
  const archivos = recorrer(RAIZ);

  it('recorre una cantidad razonable de archivos (la prueba no está vacía)', () => {
    // Sin esto, un fallo del recorrido daría cero archivos y la prueba pasaría
    // sin haber comprobado nada.
    expect(archivos.length).toBeGreaterThan(20);
  });

  for (const literal of LITERALES_PROHIBIDOS) {
    it(`ningún archivo de producción contiene «${literal}»`, () => {
      const culpables: string[] = [];
      for (const ruta of archivos) {
        if (readFileSync(ruta, 'utf8').includes(literal)) {
          culpables.push(relative(RAIZ, ruta).split(sep).join('/'));
        }
      }
      expect(culpables, culpables.join(', ')).toEqual([]);
    });
  }

  it('ninguna variable de entorno tiene un valor de reserva incrustado', () => {
    // `process.env.X || 'literal'` es el patrón exacto que causó el problema:
    // parece defensivo y en realidad oculta que falta configuración.
    // `?? ''` sí se admite: no aporta ningún valor, solo evita `undefined`.
    const patron = /process\.env\.[A-Z0-9_]+\s*(?:\|\||\?\?)\s*(['"`])(?!\1)/;
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const contenido = readFileSync(ruta, 'utf8');
      for (const linea of contenido.split('\n')) {
        if (patron.test(linea)) culpables.push(`${relative(RAIZ, ruta)}: ${linea.trim()}`);
      }
    }

    expect(culpables, culpables.join('\n')).toEqual([]);
  });
});

describe('A8 · plantilla de entorno completa', () => {
  /**
   * Si el código lee una variable que la plantilla no menciona, quien clone
   * el repositorio descubrirá que falta cuando algo se rompa, no antes.
   */
  it('toda variable NEXT_PUBLIC_* que usa el código está en .env.example', () => {
    const usadas = new Set<string>();
    for (const ruta of recorrer(RAIZ)) {
      const contenido = readFileSync(ruta, 'utf8');
      for (const m of contenido.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
        usadas.add(m[1]);
      }
    }

    const declaradas = new Set(
      readFileSync('.env.example', 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => l.split('=')[0].trim()),
    );

    const faltan = [...usadas].filter((v) => !declaradas.has(v)).sort();
    expect(faltan, `faltan en .env.example: ${faltan.join(', ')}`).toEqual([]);
  });

  it('.env.example no contiene ningún valor real', () => {
    const contenido = readFileSync('.env.example', 'utf8');
    for (const prohibido of LITERALES_PROHIBIDOS) {
      expect(contenido, prohibido).not.toContain(prohibido);
    }
    // Ni un identificador de aplicación de Firebase, que tiene forma propia.
    expect(contenido).not.toMatch(/1:\d{6,}:web:/);
  });
});
