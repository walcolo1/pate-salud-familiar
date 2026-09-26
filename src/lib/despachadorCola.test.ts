import { describe, it, expect, vi } from 'vitest';
import { ColaDuradera, type AlmacenCola } from './colaDuradera';
import { DespachadorCola } from './despachadorCola';
import { ErrorBackend, FALLO_TRANSPORTE, type Mutacion } from './transporteBackend';

/**
 * Bloque H · el despachador vacía la cola en orden.
 *
 * FIFO estricto, y no por prolijidad: la hoja resuelve «la última fila que
 * habla manda». Si una edición vieja saliera después de una nueva, la pisaría.
 */

function almacen(): AlmacenCola {
  const d = new Map<string, string>();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k) };
}

const m = (id: string): Mutacion => ({ tabla: 'CITAS', fila: { id }, pacienteId: 'p1', especie: 'HUMANO' });

function montar(enviar: (lote: Mutacion[]) => Promise<void>) {
  let i = 0;
  const cola = new ColaDuradera(almacen(), { generarId: () => `l${++i}` });
  const cambios: number[] = [];
  const despachador = new DespachadorCola({ cola, enviar: vi.fn(enviar), alCambiar: (n) => cambios.push(n) });
  return { cola, despachador, cambios };
}

describe('en orden', () => {
  it('envía los lotes en el orden en que se encolaron y vacía la cola', async () => {
    const enviados: string[] = [];
    const { cola, despachador } = montar(async (lote) => void enviados.push(String(lote[0].fila.id)));
    cola.encolar([m('a')]);
    cola.encolar([m('b')]);
    cola.encolar([m('c')]);

    const informe = await despachador.vaciar();
    expect(enviados).toEqual(['a', 'b', 'c']);
    expect(informe.enviados).toEqual(['l1', 'l2', 'l3']);
    expect(informe.quedan).toBe(0);
    expect(cola.longitud).toBe(0);
  });

  it('un fallo pasajero detiene el despacho y NO deja que los siguientes adelanten', async () => {
    const enviados: string[] = [];
    const { cola, despachador } = montar(async (lote) => {
      const id = String(lote[0].fila.id);
      if (id === 'b') throw new ErrorBackend(FALLO_TRANSPORTE, 'sin red');
      enviados.push(id);
    });
    cola.encolar([m('a')]);
    cola.encolar([m('b')]);
    cola.encolar([m('c')]);

    const informe = await despachador.vaciar();
    expect(enviados).toEqual(['a']); // `c` no sale antes que `b`
    expect(informe.quedan).toBe(2);
    expect(informe.detenidoPor).toBe(FALLO_TRANSPORTE);
    expect(cola.lotes().map((l) => l.id)).toEqual(['l2', 'l3']);
  });

  it('sin hoja o sin credencial también espera, sin perder nada', async () => {
    for (const codigo of ['SIN_BACKEND', 'SIN_IDENTIDAD']) {
      const { cola, despachador } = montar(async () => {
        throw new ErrorBackend(codigo);
      });
      cola.encolar([m('a')]);
      const informe = await despachador.vaciar();
      expect(informe.quedan, codigo).toBe(1);
      expect(informe.rechazados, codigo).toEqual([]);
    }
  });
});

describe('lo que la hoja rechaza', () => {
  it('se saca de la cola y se informa: reintentar un permiso denegado no lo concede', async () => {
    const { cola, despachador } = montar(async (lote) => {
      if (lote[0].fila.id === 'a') throw new ErrorBackend('PERMISO_INSUFICIENTE');
    });
    cola.encolar([m('a')]);
    cola.encolar([m('b')]);

    const informe = await despachador.vaciar();
    expect(informe.rechazados).toEqual([{ id: 'l1', codigo: 'PERMISO_INSUFICIENTE' }]);
    expect(informe.enviados).toEqual(['l2']);
    expect(cola.longitud).toBe(0);
  });
});

describe('concurrencia', () => {
  it('dos llamadas a la vez no envían nada dos veces', async () => {
    let soltar!: () => void;
    const enviar = vi.fn(() => new Promise<void>((r) => (soltar = r)));
    const { cola, despachador } = montar(enviar);
    cola.encolar([m('a')]);

    const x = despachador.vaciar();
    const y = despachador.vaciar();
    soltar();
    await Promise.all([x, y]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('lo que se encola mientras se envía sale en la misma pasada', async () => {
    const enviados: string[] = [];
    const ref: { cola?: ColaDuradera } = {};
    const monta = montar(async (lote) => {
      const id = String(lote[0].fila.id);
      enviados.push(id);
      if (id === 'a') ref.cola?.encolar([m('b')]); // el usuario guarda otra cosa mientras
    });
    ref.cola = monta.cola;
    monta.cola.encolar([m('a')]);

    await monta.despachador.vaciar();
    expect(enviados).toEqual(['a', 'b']);
    expect(monta.cola.longitud).toBe(0);
  });

  it('nunca lanza, y avisa del tamaño de la cola al cambiar', async () => {
    const { cola, despachador, cambios } = montar(async () => {
      throw new Error('algo raro');
    });
    cola.encolar([m('a')]);
    await expect(despachador.vaciar()).resolves.toMatchObject({ quedan: 0 });
    expect(cambios.at(-1)).toBe(0);
  });
});
