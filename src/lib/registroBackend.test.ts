import { describe, it, expect, vi } from 'vitest';
import { comprobarYRegistrar, MENSAJES_REGISTRO } from './registroBackend';
import { CLAVE_SESION_FAMILIAR } from './invitacionEntrante';
import { VERSION_CONTRATO } from './router';
import { VERSION_ESQUEMA } from './esquemaHoja';

/**
 * G4b · el titular registra la hoja de su familia.
 *
 * Faltaba entero, y lo encontró la validación en vivo: la URL del `/exec` solo
 * la escribía `/invitacion`, al aceptar una invitación. El titular nunca pasa
 * por ahí —la hoja es suya—, así que su navegador no sabía dónde escribir y
 * cada guardado acababa en `SIN_BACKEND`.
 *
 * Lo que se prueba aquí es lo que decide si una URL se acepta. El caso que más
 * importa es el de E9-bis: **un despliegue que sirve código viejo**. Guardar
 * en el editor de Apps Script no cambia lo que sirve la URL, y aceptar un
 * despliegue desactualizado produce fallos lejos de su causa.
 */

const URL_BUENA = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';

function almacen() {
  const m = new Map<string, string>();
  return {
    datos: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function responde(cuerpo: unknown, estado = 200) {
  return vi.fn(async () => ({
    ok: estado < 400,
    status: estado,
    json: async () => cuerpo,
  })) as unknown as typeof globalThis.fetch;
}

const PING_BUENO = { ok: true, data: { version: VERSION_CONTRATO, esquema: VERSION_ESQUEMA } };

describe('lo que se acepta', () => {
  it('un /exec que contesta como Paté, con la versión de hoy, se guarda', async () => {
    const a = almacen();
    const r = await comprobarYRegistrar(URL_BUENA, { fetch: responde(PING_BUENO), almacen: a });

    expect(r.ok).toBe(true);
    expect(a.datos.get(CLAVE_SESION_FAMILIAR)).toBe(URL_BUENA);
  });

  it('se guarda donde luego se lee: localStorage, con la clave de E9', async () => {
    // El fallo original era exactamente éste, en la otra dirección.
    const a = almacen();
    await comprobarYRegistrar(`  ${URL_BUENA}  `, { fetch: responde(PING_BUENO), almacen: a });
    expect(a.datos.get(CLAVE_SESION_FAMILIAR)).toBe(URL_BUENA);
  });

  it('pregunta con `ping`, que no necesita identidad', async () => {
    // Registrar la hoja no puede exigir una sesión con esa hoja: es el paso que
    // la hace posible.
    const espia = responde(PING_BUENO);
    await comprobarYRegistrar(URL_BUENA, { fetch: espia, almacen: almacen() });

    const [url, opciones] = (espia as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(URL_BUENA);
    expect(JSON.parse(String(opciones.body))).toEqual({ accion: 'ping' });
  });
});

describe('lo que NO se acepta, y se dice por qué', () => {
  it('una URL que no es un /exec de Apps Script ni se llama', async () => {
    const espia = responde(PING_BUENO);
    const a = almacen();
    const r = await comprobarYRegistrar('https://malo.example/robar', { fetch: espia, almacen: a });

    expect(r).toMatchObject({ ok: false, motivo: 'URL_INVALIDA' });
    expect(espia).not.toHaveBeenCalled();
    expect(a.datos.size).toBe(0);
  });

  it('un despliegue que no contesta', async () => {
    const fetch = (async () => {
      throw new Error('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    const r = await comprobarYRegistrar(URL_BUENA, { fetch, almacen: almacen() });
    expect(r).toMatchObject({ ok: false, motivo: 'NO_RESPONDE' });
  });

  it('algo que contesta pero no es Paté', async () => {
    // Otro Apps Script cualquiera, o la página de inicio de sesión de Google.
    for (const cuerpo of [{ hola: 1 }, { ok: true, data: {} }, { ok: false, error: 'X' }]) {
      const a = almacen();
      const r = await comprobarYRegistrar(URL_BUENA, { fetch: responde(cuerpo), almacen: a });
      expect(r, JSON.stringify(cuerpo)).toMatchObject({ ok: false, motivo: 'NO_ES_PATE' });
      expect(a.datos.size).toBe(0);
    }
  });

  it('un despliegue con código VIEJO no se registra', async () => {
    // La lección de E9-bis. Guardar en el editor no cambia lo que sirve la URL:
    // hay que publicar versión nueva. Registrar uno desactualizado produciría
    // escrituras que fallan —o columnas que se pierden— lejos de su causa.
    const a = almacen();
    const r = await comprobarYRegistrar(URL_BUENA, {
      fetch: responde({ ok: true, data: { version: 'e6', esquema: VERSION_ESQUEMA } }),
      almacen: a,
    });
    expect(r).toMatchObject({ ok: false, motivo: 'DESPLIEGUE_ANTIGUO' });
    expect(a.datos.size).toBe(0);
  });

  it('un despliegue con el esquema viejo tampoco', async () => {
    // El router coloca los valores por nombre de columna, con SU lista de
    // columnas. Uno que sirve v3 tiraría en silencio lo que la v4 añadió.
    const r = await comprobarYRegistrar(URL_BUENA, {
      fetch: responde({ ok: true, data: { version: VERSION_CONTRATO, esquema: VERSION_ESQUEMA - 1 } }),
      almacen: almacen(),
    });
    expect(r).toMatchObject({ ok: false, motivo: 'DESPLIEGUE_ANTIGUO' });
  });
});

describe('los mensajes', () => {
  it('cada motivo tiene uno, y dice qué hacer', () => {
    for (const motivo of ['URL_INVALIDA', 'NO_RESPONDE', 'NO_ES_PATE', 'DESPLIEGUE_ANTIGUO'] as const) {
      expect(MENSAJES_REGISTRO[motivo].length, motivo).toBeGreaterThan(30);
    }
  });

  it('el del despliegue viejo dice cómo arreglarlo', () => {
    expect(MENSAJES_REGISTRO.DESPLIEGUE_ANTIGUO).toMatch(/versión nueva/i);
  });
});
