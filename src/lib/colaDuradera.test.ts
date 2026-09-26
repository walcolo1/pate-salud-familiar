import { describe, it, expect } from 'vitest';
import { CLAVE_COLA, ColaDuradera, leerCola, paraEnviar, type AlmacenCola } from './colaDuradera';
import type { Mutacion } from './transporteBackend';

/**
 * Bloque H · la cola de reenvío sobrevive a una recarga.
 *
 * Hasta G4 guardaba **funciones** en memoria: un F5 o cerrar el navegador sin
 * conexión perdía los cambios pendientes, que seguían en pantalla pero nunca
 * llegaban a la hoja. Ahora guarda los lotes de mutaciones ya construidos, en
 * JSON, antes de enviarlos.
 */

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  const almacen: AlmacenCola = {
    getItem: (k) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k, v) => {
      datos.set(k, v);
    },
    removeItem: (k) => {
      datos.delete(k);
    },
  };
  return { almacen, datos };
}

const CITA: Mutacion = {
  tabla: 'CITAS',
  fila: { id: 'c1', paciente_id: 'p1', motivo: 'control' },
  pacienteId: 'p1',
  especie: 'HUMANO',
};
const BAJA: Mutacion = {
  tabla: 'MEDICAMENTOS',
  fila: { id: 'm1', paciente_id: 'p1', borrado_en: '2026-09-25T10:00:00.000Z' },
  pacienteId: 'p1',
  especie: 'HUMANO',
};

let n = 0;
const reloj = () => new Date(Date.UTC(2026, 8, 25, 10, 0, n++)).toISOString();
const nueva = (almacen: AlmacenCola) => new ColaDuradera(almacen, { ahora: reloj, generarId: () => `l${n}` });

describe('guarda en JSON, antes de enviar', () => {
  it('encolar escribe el lote en el almacén en el acto', () => {
    const { almacen, datos } = almacenFalso();
    const cola = nueva(almacen);
    cola.encolar([CITA]);

    const guardado = JSON.parse(datos.get(CLAVE_COLA)!);
    expect(guardado.version).toBe(1);
    expect(guardado.lotes).toHaveLength(1);
  });

  it('cada lote lleva marca de tiempo, y cada mutación entidad, acción y carga', () => {
    const { almacen, datos } = almacenFalso();
    nueva(almacen).encolar([CITA, BAJA]);
    const [lote] = JSON.parse(datos.get(CLAVE_COLA)!).lotes;

    expect(Date.parse(lote.creadoEn)).not.toBeNaN();
    expect(lote.mutaciones[0]).toMatchObject({ tabla: 'CITAS', accion: 'ESCRIBIR', fila: CITA.fila });
    expect(lote.mutaciones[1]).toMatchObject({ tabla: 'MEDICAMENTOS', accion: 'DAR_DE_BAJA' });
  });

  it('lo que se envía es exactamente lo que se construyó: la acción no viaja', () => {
    const { almacen } = almacenFalso();
    const lote = nueva(almacen).encolar([CITA, BAJA]);
    expect(paraEnviar(lote!)).toEqual([CITA, BAJA]);
  });

  it('un lote vacío no se encola', () => {
    const { almacen, datos } = almacenFalso();
    const cola = nueva(almacen);
    expect(cola.encolar([])).toBeNull();
    expect(cola.longitud).toBe(0);
    expect(datos.has(CLAVE_COLA)).toBe(false);
  });
});

describe('sobrevive a un F5', () => {
  it('otra instancia sobre el mismo almacén ve los mismos lotes, en el mismo orden', () => {
    const { almacen } = almacenFalso();
    const antes = nueva(almacen);
    const a = antes.encolar([CITA])!;
    const b = antes.encolar([BAJA])!;

    const despues = nueva(almacen); // la pestaña recargada
    expect(despues.lotes().map((l) => l.id)).toEqual([a.id, b.id]);
    expect(paraEnviar(despues.primero()!)).toEqual([CITA]);
  });

  it('quitar un lote lo quita también del almacén', () => {
    const { almacen, datos } = almacenFalso();
    const cola = nueva(almacen);
    const a = cola.encolar([CITA])!;
    cola.encolar([BAJA]);
    cola.quitar(a.id);

    expect(nueva(almacen).lotes()).toHaveLength(1);
    cola.quitar(cola.primero()!.id);
    // Vacía, la clave desaparece: nada clínico se queda en el disco sin motivo.
    expect(datos.has(CLAVE_COLA)).toBe(false);
  });
});

describe('lo que hay en el almacén no se cree a ciegas', () => {
  it('ignora un almacén ilegible sin romper', () => {
    const { almacen } = almacenFalso({ [CLAVE_COLA]: '{no es json' });
    expect(leerCola(almacen)).toEqual([]);
  });

  it('descarta lotes mal formados y conserva los buenos', () => {
    const bueno = { id: 'ok', creadoEn: '2026-09-25T10:00:00.000Z', mutaciones: [{ tabla: 'CITAS', accion: 'ESCRIBIR', fila: { id: 'c1' } }] };
    const { almacen } = almacenFalso({
      [CLAVE_COLA]: JSON.stringify({
        version: 1,
        lotes: [
          bueno,
          { id: 'sin-mutaciones', creadoEn: bueno.creadoEn, mutaciones: [] },
          // Una extensión del navegador puede escribir aquí. `ACCESO` no se
          // escribe por `aplicar`, y la cola no es la forma de colarlo.
          { id: 'acceso', creadoEn: bueno.creadoEn, mutaciones: [{ tabla: 'ACCESO', accion: 'ESCRIBIR', fila: {} }] },
          { id: 'fila-no-objeto', creadoEn: bueno.creadoEn, mutaciones: [{ tabla: 'CITAS', accion: 'ESCRIBIR', fila: 'x' }] },
          { id: 'especie-rara', creadoEn: bueno.creadoEn, mutaciones: [{ tabla: 'CITAS', accion: 'ESCRIBIR', fila: {}, especie: 'ROBOT' }] },
          null,
        ],
      }),
    });
    expect(leerCola(almacen).map((l) => l.id)).toEqual(['ok']);
  });

  it('una versión futura no se interpreta', () => {
    const { almacen } = almacenFalso({ [CLAVE_COLA]: JSON.stringify({ version: 99, lotes: [] }) });
    expect(leerCola(almacen)).toEqual([]);
  });
});

describe('sin almacén utilizable no se pierde nada en esta pestaña', () => {
  it('si el almacén está lleno, el lote sigue en memoria y se dice que no es duradera', () => {
    const almacen: AlmacenCola = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const cola = nueva(almacen);
    cola.encolar([CITA]);
    expect(cola.longitud).toBe(1);
    expect(cola.duradera).toBe(false);
  });

  it('sin almacén (servidor, modo privado) funciona en memoria', () => {
    const cola = new ColaDuradera(null);
    cola.encolar([CITA]);
    expect(cola.longitud).toBe(1);
    expect(cola.duradera).toBe(false);
  });
});

describe('descartar', () => {
  it('descartarTodo vacía la cola y su clave: solo lo llama un descarte explícito', () => {
    const { almacen, datos } = almacenFalso();
    const cola = nueva(almacen);
    cola.encolar([CITA]);
    cola.descartarTodo();
    expect(cola.longitud).toBe(0);
    expect(datos.has(CLAVE_COLA)).toBe(false);
  });
});
