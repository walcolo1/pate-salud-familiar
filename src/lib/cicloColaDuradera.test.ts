import { describe, it, expect, vi } from 'vitest';
import { ColaDuradera, CLAVE_COLA, type AlmacenCola } from './colaDuradera';
import { DespachadorCola, conectarDisparadores, construirLote, enviarConRepositorio } from './despachadorCola';
import { RepositorioBackend, type SesionBackend } from './repositorioBackend';
import { SesionGoogle, tokenFalsoParaPruebas } from './sesionGoogle';
import type { RepositoryContext } from './dataRepository';

/**
 * Bloque H · el ciclo de vida completo de un cambio sin conexión.
 *
 *   mutación sin red → cola en el almacén → F5 → la credencial de GIS llega
 *   tarde → despacho automático → cola vacía
 *
 * Con las piezas de verdad: `RepositorioBackend` construye el lote,
 * `SesionGoogle` guarda la credencial y avisa al llegar, y la cola escribe en
 * un almacén que sobrevive a la «recarga». Lo único falso es la red y el reloj.
 *
 * Es la prueba que habría pillado los cinco puntos ciegos que encontró la
 * validación en vivo del Bloque G: todos estaban en las costuras entre piezas
 * que se probaban por separado.
 */

const URL_BUENA = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';
const CTX: RepositoryContext = { uid: 'u1', email: 'titular@ejemplo.test', familyId: null };
const HORA = 60 * 60 * 1000;

/** El disco del navegador: lo único que sobrevive a un F5. */
function disco() {
  const datos = new Map<string, string>();
  const almacen: AlmacenCola = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
  return { almacen, datos };
}

/** La red: se corta y se restablece. Guarda qué lotes llegaron al router. */
function red() {
  const estado = { enLinea: false };
  const recibidos: { accion: string; mutaciones: { tabla: string; fila: Record<string, unknown> }[] }[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (!estado.enLinea) throw new TypeError('Failed to fetch');
    const cuerpo = JSON.parse(String(init.body));
    recibidos.push({ accion: cuerpo.accion, mutaciones: cuerpo.payload?.mutaciones ?? [] });
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { aplicadas: 1, revision: recibidos.length } }) };
  }) as unknown as typeof globalThis.fetch;
  return { estado, recibidos, fetch };
}

/** Una pestaña: su sesión en memoria, su repositorio, su cola y su despachador. */
function pestana(almacen: AlmacenCola, fetch: typeof globalThis.fetch, ahora: () => number) {
  const sesion = new SesionGoogle({
    renovar: async () => null,
    ahora,
    pedirEntrarDeNuevo: () => {},
    registrarFallo: () => {},
  });
  const sesionBackend: SesionBackend = {
    url: () => URL_BUENA,
    idToken: () => sesion.idToken(),
    renovar: () => sesion.renovarAhora(),
    fetch,
  };
  const repo = new RepositorioBackend(sesionBackend);
  const cola = new ColaDuradera(almacen);
  const despachador = new DespachadorCola({ cola, enviar: enviarConRepositorio(repo) });
  const oyentes = new Map<string, () => void>();
  const ventana = {
    addEventListener: (t: string, f: () => void) => void oyentes.set(t, f),
    removeEventListener: (t: string) => void oyentes.delete(t),
  };
  const desconectar = conectarDisparadores({ sesion, ventana, vaciar: () => despachador.vaciar() });
  return { sesion, repo, cola, despachador, ventana: oyentes, desconectar };
}

/** Deja correr las promesas pendientes. */
const drenar = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

describe('el ciclo de vida completo', () => {
  it('sin red → cola en disco → F5 → credencial tardía → despacho → cola vacía', async () => {
    const { almacen, datos } = disco();
    const net = red();
    const reloj = () => 1_000_000;

    // ── 1 · Con sesión y sin red, el titular apunta una vacuna.
    const antes = pestana(almacen, net.fetch, reloj);
    antes.sesion.recibir(tokenFalsoParaPruebas(reloj() + HORA));

    const lote = await construirLote(antes.repo, (repo) =>
      repo.saveVaccine(CTX, {
        id: 'v1',
        memberId: 'p1',
        vaccineName: 'Tétanos',
        dateApplied: '2026-09-25',
        doseNumber: 1,
        status: 'COMPLETED',
      } as Parameters<RepositorioBackend['saveVaccine']>[1]),
    );
    expect(lote.length).toBeGreaterThan(0);
    antes.cola.encolar(lote);
    const primerIntento = await antes.despachador.vaciar();

    // ── 2 · No salió, y está en el disco.
    expect(primerIntento.quedan).toBe(1);
    expect(net.recibidos).toEqual([]);
    expect(datos.has(CLAVE_COLA)).toBe(true);

    // ── 3 · F5. Se pierde todo lo que vivía en memoria, credencial incluida.
    antes.desconectar();
    const despues = pestana(almacen, net.fetch, reloj);
    expect(despues.cola.longitud).toBe(1);
    expect(despues.sesion.vigente).toBe(false);

    // ── 4 · Vuelve la red, pero la credencial de GIS aún no ha llegado.
    net.estado.enLinea = true;
    despues.ventana.get('online')?.();
    await drenar();
    expect(net.recibidos).toEqual([]); // sin credencial no sale nada…
    expect(despues.cola.longitud).toBe(1); // …y nada se pierde

    // ── 5 · Llega la credencial, segundos después de montar.
    despues.sesion.recibir(tokenFalsoParaPruebas(reloj() + HORA));
    await drenar();

    // ── 6 · Salió sola, exactamente lo que se construyó, y la cola quedó vacía.
    expect(net.recibidos).toHaveLength(1);
    expect(net.recibidos[0].accion).toBe('aplicar');
    expect(net.recibidos[0].mutaciones).toEqual(lote);
    expect(despues.cola.longitud).toBe(0);
    expect(datos.has(CLAVE_COLA)).toBe(false);
  });

  it('varios cambios sin red salen en el orden en que se hicieron', async () => {
    const { almacen } = disco();
    const net = red();
    const reloj = () => 1_000_000;
    const p = pestana(almacen, net.fetch, reloj);

    for (const nombre of ['primero', 'segundo', 'tercero']) {
      const lote = await construirLote(p.repo, (repo) =>
        repo.saveVaccine(CTX, {
          id: nombre,
          memberId: 'p1',
          vaccineName: nombre,
          dateApplied: '2026-09-25',
          doseNumber: 1,
          status: 'COMPLETED',
        } as Parameters<RepositorioBackend['saveVaccine']>[1]),
      );
      p.cola.encolar(lote);
    }

    net.estado.enLinea = true;
    p.sesion.recibir(tokenFalsoParaPruebas(reloj() + HORA));
    await drenar();

    expect(net.recibidos.map((r) => r.mutaciones[0].fila.id)).toEqual(['primero', 'segundo', 'tercero']);
  });

  it('las renovaciones de cada hora con la cola vacía no llaman a nadie', async () => {
    const { almacen } = disco();
    const net = red();
    net.estado.enLinea = true;
    const p = pestana(almacen, net.fetch, () => 1_000_000);
    p.sesion.recibir(tokenFalsoParaPruebas(1_000_000 + HORA));
    p.sesion.recibir(tokenFalsoParaPruebas(1_000_000 + 2 * HORA));
    await drenar();
    expect(net.fetch).not.toHaveBeenCalled();
  });
});
