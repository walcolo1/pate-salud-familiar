import { describe, it, expect } from 'vitest';
import { estadoHoja } from './estadoHoja';

const base = { origen: 'REAL', hojaRegistrada: true, hayQueEntrar: false, pendientes: 0 };

describe('estado de la hoja en la barra lateral', () => {
  it('todo bien: conectada', () => {
    expect(estadoHoja(base)).toMatchObject({ etiqueta: 'Conectada', tono: 'ok' });
  });
  it('con cambios por enviar, lo dice y cuántos', () => {
    expect(estadoHoja({ ...base, pendientes: 3 })).toMatchObject({ etiqueta: '3 pendientes', tono: 'atencion' });
    expect(estadoHoja({ ...base, pendientes: 1 }).etiqueta).toBe('1 pendiente');
  });
  it('la sesión manda sobre los pendientes: sin ella no salen', () => {
    expect(estadoHoja({ ...base, pendientes: 2, hayQueEntrar: true }).etiqueta).toBe('Reconectar');
  });
  it('sin hoja registrada', () => {
    expect(estadoHoja({ ...base, hojaRegistrada: false })).toMatchObject({ etiqueta: 'Sin registrar', tono: 'atencion' });
  });
  it('en demostración no promete nada', () => {
    expect(estadoHoja({ ...base, origen: 'DEMO' })).toMatchObject({ etiqueta: 'Demostración', tono: 'neutro' });
  });
  it('ya no habla de Drive', () => {
    for (const e of [base, { ...base, pendientes: 2 }, { ...base, hojaRegistrada: false }]) {
      expect(JSON.stringify(estadoHoja(e))).not.toMatch(/Drive/);
    }
  });
});

describe('Bloque M2 · sin acceso', () => {
  it('dice «Sin acceso» aunque haya dirección, en vez de «Conectada»', () => {
    const e = estadoHoja({ origen: 'REAL', hojaRegistrada: true, hayQueEntrar: false, pendientes: 0, sinAcceso: true });
    expect(e.etiqueta).toBe('Sin acceso');
    expect(e.tono).toBe('atencion');
  });
});
