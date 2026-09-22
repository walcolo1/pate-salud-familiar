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
