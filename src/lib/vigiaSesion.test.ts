import { describe, it, expect, vi } from 'vitest';
import { VigiaSesion, PLAZO_CREDENCIAL_MS } from './vigiaSesion';

/**
 * Cierre del Bloque H · una sesión sin credencial no puede quedarse callada.
 *
 * La validación en vivo: tras cerrar sesión y volver a entrar, «La sesión
 * caducó», «Mi familia (0)» y nada que pulsar. El usuario seguía «dentro»
 * —está en el almacenamiento local— pero el `id_token`, que solo vive en
 * memoria, se había perdido con una recarga, y GIS no lo devolvió en silencio.
 * El aviso de «vuelve a entrar» existía en `identidadGis`, pero AppContext no
 * lo conectaba a nada.
 *
 * El vigía decide cuándo hay que pedir entrar, y cuándo deja de hacer falta.
 */

function reloj() {
  const tareas: { id: number; cuando: number; fn: () => void }[] = [];
  let ahora = 0;
  let siguiente = 1;
  return {
    programar: (fn: () => void, ms: number) => {
      const id = siguiente++;
      tareas.push({ id, cuando: ahora + ms, fn });
      return id;
    },
    cancelar: (id: unknown) => {
      const i = tareas.findIndex((t) => t.id === id);
      if (i >= 0) tareas.splice(i, 1);
    },
    avanzar(ms: number) {
      ahora += ms;
      for (const t of [...tareas].sort((a, b) => a.cuando - b.cuando)) {
        if (t.cuando <= ahora) {
          tareas.splice(tareas.indexOf(t), 1);
          t.fn();
        }
      }
    },
  };
}

function montar(vigente = false) {
  const r = reloj();
  const cambios: boolean[] = [];
  const estado = { vigente };
  const vigia = new VigiaSesion({
    programar: r.programar,
    cancelar: r.cancelar,
    hayCredencial: () => estado.vigente,
    alCambiar: (hace) => cambios.push(hace),
  });
  return { vigia, r, cambios, estado };
}

describe('cuándo pide volver a entrar', () => {
  it('usuario de Google activo y ninguna credencial en el plazo: lo pide', () => {
    const { vigia, r, cambios } = montar(false);
    vigia.usuarioActivo(true);
    r.avanzar(PLAZO_CREDENCIAL_MS - 1);
    expect(cambios).toEqual([]); // GIS aún puede devolverla en silencio
    r.avanzar(1);
    expect(cambios).toEqual([true]);
    expect(vigia.hayQueEntrar).toBe(true);
  });

  it('si la credencial llega a tiempo, no pide nada', () => {
    const { vigia, r, cambios, estado } = montar(false);
    vigia.usuarioActivo(true);
    r.avanzar(PLAZO_CREDENCIAL_MS / 2);
    estado.vigente = true;
    vigia.llegoCredencial();
    r.avanzar(PLAZO_CREDENCIAL_MS);
    expect(cambios).toEqual([]);
  });

  it('si al activarse ya hay credencial, ni siquiera espera', () => {
    const { vigia, r, cambios } = montar(true);
    vigia.usuarioActivo(true);
    r.avanzar(PLAZO_CREDENCIAL_MS * 2);
    expect(cambios).toEqual([]);
  });

  it('GIS pide volver a entrar (la sesión caducó sin renovarse): se pide al momento', () => {
    const { vigia, cambios } = montar(true);
    vigia.usuarioActivo(true);
    vigia.sesionPerdida();
    expect(cambios).toEqual([true]);
  });

  it('un fallo por falta de identidad con usuario activo también lo pide', () => {
    const { vigia, cambios } = montar(false);
    vigia.usuarioActivo(true);
    vigia.faltoIdentidad();
    expect(cambios).toEqual([true]);
  });
});

describe('cuándo deja de pedirlo', () => {
  it('en cuanto llega una credencial se limpia, sin recargar nada', () => {
    const { vigia, r, cambios, estado } = montar(false);
    vigia.usuarioActivo(true);
    r.avanzar(PLAZO_CREDENCIAL_MS);
    estado.vigente = true;
    vigia.llegoCredencial();
    expect(cambios).toEqual([true, false]);
    expect(vigia.hayQueEntrar).toBe(false);
  });

  it('sin usuario activo no hay nada que pedir: en /login el botón ya está', () => {
    const { vigia, r, cambios } = montar(false);
    vigia.usuarioActivo(false);
    r.avanzar(PLAZO_CREDENCIAL_MS * 2);
    vigia.sesionPerdida();
    vigia.faltoIdentidad();
    expect(cambios).toEqual([]);
  });

  it('al cerrar sesión se apaga y deja de vigilar', () => {
    const { vigia, r, cambios } = montar(false);
    vigia.usuarioActivo(true);
    r.avanzar(PLAZO_CREDENCIAL_MS);
    vigia.usuarioActivo(false);
    expect(cambios).toEqual([true, false]);
  });

  it('no avisa dos veces de lo mismo', () => {
    const { vigia, r, cambios } = montar(false);
    vigia.usuarioActivo(true);
    r.avanzar(PLAZO_CREDENCIAL_MS);
    vigia.sesionPerdida();
    vigia.faltoIdentidad();
    expect(cambios).toEqual([true]);
  });
});

describe('las pistas', () => {
  it('un oyente que falla no rompe el vigía', () => {
    const r = reloj();
    const vigia = new VigiaSesion({
      programar: r.programar,
      cancelar: r.cancelar,
      hayCredencial: () => false,
      alCambiar: vi.fn(() => {
        throw new Error('x');
      }),
    });
    vigia.usuarioActivo(true);
    expect(() => r.avanzar(PLAZO_CREDENCIAL_MS)).not.toThrow();
    expect(vigia.hayQueEntrar).toBe(true);
  });
});
