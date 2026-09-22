import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  configurarAvisoDeSesion,
  configurarRenovacion,
  sesionBackend,
  sesionDeLaAplicacion,
} from './identidad';
import { tokenFalsoParaPruebas } from './sesionGoogle';

/**
 * G3 · los dos enchufes.
 *
 * `SesionGoogle` sabe cuándo renovar; no sabe pedírselo a Google ni avisar a
 * nadie. Esto comprueba que el cableado no se pierda por el camino y, sobre
 * todo, que **sin conectar** se comporte como un desconocido educado: sin
 * sesión, sin ruido y sin reventar.
 */

afterEach(() => {
  configurarRenovacion(null);
  configurarAvisoDeSesion(null);
  sesionDeLaAplicacion.olvidar();
});

describe('sin nada conectado', () => {
  it('no hay sesión, y no pasa nada', async () => {
    await expect(sesionDeLaAplicacion.idToken()).resolves.toBe(null);
  });

  it('una renovación forzada devuelve null en vez de lanzar', async () => {
    // Es el estado real hasta que G3b mueva la inicialización de GIS a un solo
    // sitio. Tiene que ser aburrido, no un error.
    await expect(sesionDeLaAplicacion.renovarAhora()).resolves.toBe(null);
  });
});

describe('con los enchufes puestos', () => {
  it('la renovación pasa por donde se le dijo', async () => {
    const fresco = tokenFalsoParaPruebas(Date.now() + 60 * 60 * 1000);
    const renovar = vi.fn(async () => fresco);
    configurarRenovacion(renovar);

    await expect(sesionDeLaAplicacion.renovarAhora()).resolves.toBe(fresco);
    expect(renovar).toHaveBeenCalledTimes(1);
  });

  it('el aviso salta cuando ya no hay token que valga', async () => {
    const avisar = vi.fn();
    configurarAvisoDeSesion(avisar);
    configurarRenovacion(async () => null);

    sesionDeLaAplicacion.recibir(tokenFalsoParaPruebas(Date.now() - 1_000));
    await sesionDeLaAplicacion.idToken();

    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('desconectar el aviso no deja una llamada colgando', async () => {
    configurarAvisoDeSesion(vi.fn());
    configurarAvisoDeSesion(null);
    configurarRenovacion(async () => null);

    sesionDeLaAplicacion.recibir(tokenFalsoParaPruebas(Date.now() - 1_000));
    await expect(sesionDeLaAplicacion.idToken()).resolves.toBe(null);
  });
});

describe('lo que se le entrega al repositorio', () => {
  it('lleva las tres cosas: dónde, quién y cómo renovar', () => {
    const s = sesionBackend();
    expect(typeof s.url).toBe('function');
    expect(typeof s.idToken).toBe('function');
    expect(typeof s.renovar).toBe('function');
  });

  it('en el servidor no hay familia registrada, y se dice sin romperse', () => {
    // El árbol de Next importa este módulo también en el servidor, donde
    // `sessionStorage` no existe. Tocarlo allí sería un fallo de compilación
    // en producción y de los que no se ven en local.
    expect(sesionBackend().url()).toBe(null);
  });

  it('el token que entrega es el de la sesión, no una copia suya', async () => {
    const fresco = tokenFalsoParaPruebas(Date.now() + 60 * 60 * 1000);
    sesionDeLaAplicacion.recibir(fresco);
    await expect(sesionBackend().idToken()).resolves.toBe(fresco);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La URL de la familia: quien la escribe y quien la lee
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CLAVE_SESION_FAMILIAR } from './invitacionEntrante';

describe('la URL de la familia se lee de donde se escribe', () => {
  /**
   * El fallo que encontró la validación en vivo de G4b, con su nombre.
   *
   * `/invitacion` la guardaba en `localStorage` e `identidad.ts` la buscaba en
   * `sessionStorage`. Ninguna prueba lo vio porque las del repositorio inyectan
   * su propia sesión con la URL puesta, y la suite E2E no tiene backend. El
   * resultado fue `SIN_BACKEND` en cada guardado, y nada llegó a la hoja.
   */
  const URL_BUENA = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';

  function almacen(datos: Record<string, string> = {}) {
    const m = new Map(Object.entries(datos));
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('una URL guardada en localStorage se encuentra', () => {
    (globalThis as Record<string, unknown>).window = {
      localStorage: almacen({ [CLAVE_SESION_FAMILIAR]: URL_BUENA }),
      sessionStorage: almacen(),
    };
    expect(sesionBackend().url()).toBe(URL_BUENA);
  });

  it('y localStorage, no sessionStorage: el titular abre la PWA cada día', () => {
    // `sessionStorage` muere al cerrar la pestaña. Guardar ahí la hoja de la
    // familia obligaría a volver a registrarla en cada apertura. Y la URL no
    // es una credencial —el `/exec` es público y el acceso lo decide el
    // `id_token`—, así que no hay motivo de seguridad para lo contrario.
    (globalThis as Record<string, unknown>).window = {
      localStorage: almacen(),
      sessionStorage: almacen({ [CLAVE_SESION_FAMILIAR]: URL_BUENA }),
    };
    expect(sesionBackend().url()).toBe(null);
  });

  it('todo el código que escribe o lee la URL usa el MISMO almacén', () => {
    // La regla estructural, para que no vuelva: si alguien añade otra lectura
    // o escritura, tiene que ir contra `localStorage` o esto se pone rojo.
    const RAIZ = join(process.cwd(), 'src');
    const ficheros = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const r = join(dir, n);
        return statSync(r).isDirectory() ? ficheros(r) : /\.(ts|tsx)$/.test(n) ? [r] : [];
      });

    const usos: string[] = [];
    for (const f of ficheros(RAIZ)) {
      if (f.endsWith('.test.ts')) continue;
      const fuente = readFileSync(f, 'utf8');
      for (const m of fuente.matchAll(/(guardarBackend|leerBackend|olvidarBackend)\([^)]*?(window\.\w+Storage)/g)) {
        usos.push(`${relative(RAIZ, f)} → ${m[2]}`);
      }
    }

    expect(usos.length, 'no se encontró ningún uso: la prueba no mira nada').toBeGreaterThan(1);
    for (const uso of usos) expect(uso).toMatch(/window\.localStorage$/);
  });
});
