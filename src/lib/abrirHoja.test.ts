import { describe, it, expect, vi } from 'vitest';
import { abrirHojaEnPestana, MENSAJES_ABRIR_HOJA } from './abrirHoja';

/**
 * Cierre de G4 · «Abrir la hoja» lleva a la hoja del Web App.
 *
 * El botón viejo abría el ID guardado de la hoja operacional anterior, la que
 * ya nadie escribe. Este pide la dirección al despliegue en el momento, y lo
 * delicado no es pedirla sino abrirla: un `window.open` después de un `await`
 * lo bloquea el navegador por ventana emergente.
 */

const HOJA = 'https://docs.google.com/spreadsheets/d/1HojaSintetica0123456789/edit';

function pestanaFalsa() {
  return {
    opener: {} as unknown,
    location: { replace: vi.fn() },
    close: vi.fn(),
  };
}

describe('abrir la hoja en otra pestaña', () => {
  it('abre la pestaña ANTES de esperar la dirección', async () => {
    const orden: string[] = [];
    const pestana = pestanaFalsa();
    await abrirHojaEnPestana(
      async () => {
        orden.push('pedir');
        return HOJA;
      },
      () => {
        orden.push('abrir');
        return pestana;
      },
    );
    expect(orden).toEqual(['abrir', 'pedir']);
  });

  it('corta el opener y navega con replace', async () => {
    const pestana = pestanaFalsa();
    const r = await abrirHojaEnPestana(async () => HOJA, () => pestana);
    expect(r).toBeNull();
    expect(pestana.opener).toBeNull();
    expect(pestana.location.replace).toHaveBeenCalledWith(HOJA);
  });

  it('si falla, cierra la pestaña vacía y dice por qué', async () => {
    const casos: [string, keyof typeof MENSAJES_ABRIR_HOJA][] = [
      ['PERMISO_INSUFICIENTE', 'PERMISO_INSUFICIENTE'],
      ['ACCION_DESCONOCIDA', 'ACCION_DESCONOCIDA'],
      ['SIN_BACKEND', 'SIN_BACKEND'],
      ['SIN_IDENTIDAD', 'SIN_IDENTIDAD'],
      ['ERROR_RARO', 'OTRO'],
    ];
    for (const [codigo, motivo] of casos) {
      const pestana = pestanaFalsa();
      const r = await abrirHojaEnPestana(
        async () => {
          throw Object.assign(new Error(codigo), { codigo });
        },
        () => pestana,
      );
      expect(r, codigo).toBe(MENSAJES_ABRIR_HOJA[motivo]);
      expect(pestana.close, codigo).toHaveBeenCalled();
      expect(pestana.location.replace, codigo).not.toHaveBeenCalled();
    }
  });

  it('un despliegue anterior pide publicar la versión nueva, no «error»', () => {
    expect(MENSAJES_ABRIR_HOJA.ACCION_DESCONOCIDA).toMatch(/versión nueva/);
  });

  it('con la ventana emergente bloqueada, lo dice en vez de callar', async () => {
    const pedir = vi.fn(async () => HOJA);
    const r = await abrirHojaEnPestana(pedir, () => null);
    expect(r).toBe(MENSAJES_ABRIR_HOJA.BLOQUEADA);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('los mensajes no llevan la dirección ni ningún identificador', () => {
    for (const m of Object.values(MENSAJES_ABRIR_HOJA)) {
      expect(m).not.toMatch(/docs\.google|spreadsheets\/d\//);
    }
  });
});
