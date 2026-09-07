import { describe, it, expect } from 'vitest';
import {
  reducirCierre,
  dialogoVisible,
  estaOcupado,
  ESTADO_CIERRE_INICIAL,
  type EstadoCierre,
  type AccionCierre,
} from './cierreSesion';

const solicitar = (sincronizando: boolean, pendientes: number): AccionCierre => ({
  tipo: 'solicitar', sincronizando, pendientes,
});

describe('solicitar cierre desde reposo', () => {
  it('sin pendientes y sin sync: purga directamente, sin diálogo', () => {
    expect(reducirCierre(ESTADO_CIERRE_INICIAL, solicitar(false, 0))).toEqual({ fase: 'purgando' });
  });

  it('con sincronización en curso: espera, aunque no haya pendientes', () => {
    expect(reducirCierre(ESTADO_CIERRE_INICIAL, solicitar(true, 0)))
      .toEqual({ fase: 'sincronizando', pendientes: 0 });
  });

  it('la sincronización en curso tiene prioridad sobre los pendientes', () => {
    expect(reducirCierre(ESTADO_CIERRE_INICIAL, solicitar(true, 4)))
      .toEqual({ fase: 'sincronizando', pendientes: 4 });
  });

  it('con pendientes y sin sync: abre el flujo de pendientes', () => {
    expect(reducirCierre(ESTADO_CIERRE_INICIAL, solicitar(false, 3)))
      .toEqual({ fase: 'pendientes', pendientes: 3 });
  });
});

describe('sincronización en curso', () => {
  const enSync: EstadoCierre = { fase: 'sincronizando', pendientes: 2 };

  it('al terminar sin pendientes continúa el cierre automáticamente', () => {
    expect(reducirCierre(enSync, { tipo: 'sync_finalizada', pendientes: 0 }))
      .toEqual({ fase: 'purgando' });
  });

  it('al terminar con pendientes abre el flujo de pendientes', () => {
    expect(reducirCierre(enSync, { tipo: 'sync_finalizada', pendientes: 5 }))
      .toEqual({ fase: 'pendientes', pendientes: 5 });
  });

  it('cancelar vuelve a reposo sin purgar', () => {
    expect(reducirCierre(enSync, { tipo: 'cancelar' })).toEqual({ fase: 'inactivo' });
  });

  it('no se puede descartar cambios desde aquí', () => {
    expect(reducirCierre(enSync, { tipo: 'confirmar_descarte' })).toEqual(enSync);
    expect(reducirCierre(enSync, { tipo: 'pedir_descarte' })).toEqual(enSync);
  });
});

describe('cambios pendientes', () => {
  const pend: EstadoCierre = { fase: 'pendientes', pendientes: 3 };

  it('un reintento exitoso purga', () => {
    expect(reducirCierre(pend, { tipo: 'reintento_ok' })).toEqual({ fase: 'purgando' });
  });

  it('un reintento fallido NO purga ni cierra sesión, y conserva el contador', () => {
    const r = reducirCierre(pend, { tipo: 'reintento_fallido', error: 'Sin conexión' });
    expect(r).toEqual({ fase: 'pendientes', pendientes: 3, error: 'Sin conexión' });
  });

  it('descartar exige una segunda confirmación: nunca purga en un solo paso', () => {
    const paso1 = reducirCierre(pend, { tipo: 'pedir_descarte' });
    expect(paso1).toEqual({ fase: 'confirmar_descarte', pendientes: 3 });
    expect(reducirCierre(pend, { tipo: 'confirmar_descarte' })).toEqual(pend);
  });

  it('la segunda confirmación sí purga', () => {
    const paso1 = reducirCierre(pend, { tipo: 'pedir_descarte' });
    expect(reducirCierre(paso1, { tipo: 'confirmar_descarte' })).toEqual({ fase: 'purgando' });
  });

  it('cancelar desde la segunda pantalla vuelve a reposo', () => {
    const paso1 = reducirCierre(pend, { tipo: 'pedir_descarte' });
    expect(reducirCierre(paso1, { tipo: 'cancelar' })).toEqual({ fase: 'inactivo' });
  });
});

describe('reentrada y doble cierre', () => {
  it('purgando es ABSORBENTE: ninguna acción lo saca de ahí', () => {
    const purgando: EstadoCierre = { fase: 'purgando' };
    const acciones: AccionCierre[] = [
      solicitar(false, 0), solicitar(true, 9),
      { tipo: 'sync_finalizada', pendientes: 0 },
      { tipo: 'reintento_ok' },
      { tipo: 'reintento_fallido', error: 'x' },
      { tipo: 'pedir_descarte' },
      { tipo: 'confirmar_descarte' },
      { tipo: 'cancelar' },
    ];
    for (const a of acciones) {
      expect(reducirCierre(purgando, a)).toEqual({ fase: 'purgando' });
    }
  });

  it('un segundo clic en cerrar sesión no reinicia el flujo abierto', () => {
    const pend: EstadoCierre = { fase: 'pendientes', pendientes: 3, error: 'Sin conexión' };
    expect(reducirCierre(pend, solicitar(false, 99))).toEqual(pend);
  });

  it('doble clic desde reposo produce UNA sola purga', () => {
    const primero = reducirCierre(ESTADO_CIERRE_INICIAL, solicitar(false, 0));
    const segundo = reducirCierre(primero, solicitar(false, 0));
    expect(primero).toEqual({ fase: 'purgando' });
    expect(segundo).toBe(primero);
  });

  it('doble confirmación de descarte no encadena dos purgas', () => {
    const conf: EstadoCierre = { fase: 'confirmar_descarte', pendientes: 2 };
    const a = reducirCierre(conf, { tipo: 'confirmar_descarte' });
    const b = reducirCierre(a, { tipo: 'confirmar_descarte' });
    expect(a).toEqual({ fase: 'purgando' });
    expect(b).toBe(a);
  });
});

describe('ayudas de presentación', () => {
  it('el diálogo se muestra en todas las fases salvo reposo', () => {
    expect(dialogoVisible({ fase: 'inactivo' })).toBe(false);
    expect(dialogoVisible({ fase: 'sincronizando', pendientes: 0 })).toBe(true);
    expect(dialogoVisible({ fase: 'pendientes', pendientes: 1 })).toBe(true);
    expect(dialogoVisible({ fase: 'confirmar_descarte', pendientes: 1 })).toBe(true);
    expect(dialogoVisible({ fase: 'purgando' })).toBe(true);
  });

  it('solo purgando bloquea la interacción', () => {
    expect(estaOcupado({ fase: 'purgando' })).toBe(true);
    expect(estaOcupado({ fase: 'pendientes', pendientes: 1 })).toBe(false);
    expect(estaOcupado({ fase: 'sincronizando', pendientes: 0 })).toBe(false);
  });
});
