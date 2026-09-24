import { describe, it, expect, vi } from 'vitest';
import { CargaAlEntrar } from './cargaAlEntrar';

/**
 * El expediente se carga solo al entrar.
 *
 * La validación en vivo: al entrar, «Mi familia: 0», y los datos solo llegaban
 * tras pasar por Ajustes. La carga se disparaba con un temporizador de 500 ms
 * que, tras un F5, llegaba ANTES que la credencial de GIS: fallaba sin
 * identidad, se callaba el error, y cuando la credencial llegaba se tomaba por
 * una renovación y no se volvía a intentar nunca.
 *
 * Aquí la carga no depende del orden: se intenta cada vez que cambia algo
 * (entra el usuario, llega la credencial, se registra la hoja) y ocurre en
 * cuanto están las dos cosas.
 */

function montar(opciones: { hoja?: boolean; identidad?: boolean; cargar?: () => Promise<void> } = {}) {
  const estado = { hoja: opciones.hoja ?? true, identidad: opciones.identidad ?? true };
  const cargar = vi.fn(opciones.cargar ?? (async () => {}));
  const cambios: boolean[] = [];
  const carga = new CargaAlEntrar({
    hayHoja: () => estado.hoja,
    hayIdentidad: () => estado.identidad,
    cargar,
    alCambiarCargando: (v) => cambios.push(v),
  });
  return { carga, cargar, estado, cambios };
}

describe('cuándo carga', () => {
  it('con hoja e identidad, carga', async () => {
    const { carga, cargar } = montar();
    expect(await carga.intentar()).toBe('cargada');
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('sin identidad espera, y carga cuando llega la credencial (el caso del F5)', async () => {
    const { carga, cargar, estado } = montar({ identidad: false });
    expect(await carga.intentar()).toBe('sin_identidad');
    expect(cargar).not.toHaveBeenCalled();

    estado.identidad = true; // GIS entrega el id_token segundos después
    expect(await carga.intentar()).toBe('cargada');
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('sin hoja no pregunta a nadie', async () => {
    const { carga, cargar } = montar({ hoja: false });
    expect(await carga.intentar()).toBe('sin_hoja');
    expect(cargar).not.toHaveBeenCalled();
  });
});

describe('una vez por sesión', () => {
  it('las renovaciones de cada hora no recargan el expediente', async () => {
    const { carga, cargar } = montar();
    await carga.intentar();
    expect(await carga.intentar()).toBe('ya_cargada');
    expect(await carga.intentar()).toBe('ya_cargada');
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('dos disparos a la vez hacen una sola carga', async () => {
    let soltar!: () => void;
    const { carga, cargar } = montar({ cargar: () => new Promise<void>((r) => (soltar = r)) });
    const a = carga.intentar();
    const b = carga.intentar();
    soltar();
    expect(await a).toBe('cargada');
    expect(await b).toBe('cargada');
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('tras cerrar sesión, la siguiente entrada vuelve a cargar', async () => {
    const { carga, cargar } = montar();
    await carga.intentar();
    carga.reiniciar();
    expect(await carga.intentar()).toBe('cargada');
    expect(cargar).toHaveBeenCalledTimes(2);
  });
});

describe('si falla', () => {
  it('se puede volver a intentar: un fallo de red no deja el expediente vacío para siempre', async () => {
    let falla = true;
    const { carga, cargar } = montar({
      cargar: async () => {
        if (falla) throw new Error('sin red');
      },
    });
    expect(await carga.intentar()).toBe('fallo');
    falla = false;
    expect(await carga.intentar()).toBe('cargada');
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it('nunca lanza: quien la dispara es un efecto o un oyente', async () => {
    const { carga } = montar({
      cargar: async () => {
        throw new Error('x');
      },
    });
    await expect(carga.intentar()).resolves.toBe('fallo');
  });
});

describe('el indicador de carga', () => {
  it('se enciende mientras carga y se apaga al terminar, bien o mal', async () => {
    const ok = montar();
    await ok.carga.intentar();
    expect(ok.cambios).toEqual([true, false]);

    const mal = montar({
      cargar: async () => {
        throw new Error('x');
      },
    });
    await mal.carga.intentar();
    expect(mal.cambios).toEqual([true, false]);
  });

  it('no parpadea cuando no hay nada que cargar', async () => {
    const { carga, cambios } = montar({ identidad: false });
    await carga.intentar();
    expect(cambios).toEqual([]);
  });
});
