import { describe, it, expect } from 'vitest';
import { CLAVE_HOJAS_POR_CUENTA, guardarHojaVerificada, huellaDeCuentaSincrona, resolverHoja } from './hojaPorCuenta';
import { CLAVE_SESION_FAMILIAR, type AlmacenSimple } from './invitacionEntrante';

const DEFECTO = 'https://script.google.com/macros/s/AKfy_oficial_familia_1_abcdef/exec';
const NUEVA = 'https://script.google.com/macros/s/AKfy_familia_nueva_2_abcdef/exec';
const OTRA = 'https://script.google.com/macros/s/AKfy_tercera_familia_3_abcd/exec';
const WALTER = 'sub-walter-0001';
const VISITA = 'sub-wcoloradog-0002';

function almacen(datos: Record<string, string> = {}): AlmacenSimple & { datos: Map<string, string> } {
  const m = new Map(Object.entries(datos));
  return {
    datos: m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('Bloque M2 · cada cuenta, su hoja', () => {
  it('el caso real: ?hoja= antes de entrar, otra cuenta del mismo navegador después', () => {
    const a = almacen();
    // 1 · Se abre «Abrir Paté ya conectado» sin sesión: la hoja queda sin dueño.
    expect(guardarHojaVerificada(a, NUEVA, null)).toBe(true);
    expect(resolverHoja(a, null, DEFECTO)).toEqual({ url: NUEVA, origen: 'sin-dueno' });
    // 2 · Entra wcoloradog: la adopta. Ya no ve la hoja por defecto.
    expect(resolverHoja(a, VISITA, DEFECTO)).toEqual({ url: NUEVA, origen: 'cuenta' });
    // 3 · Entra Walter en el mismo navegador: NO hereda la de wcoloradog.
    expect(resolverHoja(a, WALTER, DEFECTO)).toEqual({ url: DEFECTO, origen: 'defecto' });
    // 4 · Y wcoloradog la sigue teniendo al volver.
    expect(resolverHoja(a, VISITA, DEFECTO).url).toBe(NUEVA);
  });

  it('la dirección por defecto no tapa la hoja de una cuenta', () => {
    const a = almacen();
    guardarHojaVerificada(a, NUEVA, VISITA);
    expect(resolverHoja(a, VISITA, DEFECTO).url).toBe(NUEVA);
    expect(resolverHoja(a, WALTER, DEFECTO).url).toBe(DEFECTO);
  });

  it('una instalación anterior (solo pate:familia:v1) la adopta la primera cuenta que entra', () => {
    const a = almacen({ [CLAVE_SESION_FAMILIAR]: NUEVA });
    expect(resolverHoja(a, WALTER, DEFECTO).url).toBe(NUEVA);
    expect(resolverHoja(a, VISITA, DEFECTO).url).toBe(DEFECTO);
    // La clave de siempre sigue ahí (la conserva la purga y la usan otros módulos).
    expect(a.getItem(CLAVE_SESION_FAMILIAR)).toBe(NUEVA);
  });

  it('cambiar de hoja con sesión la cambia solo para esa cuenta', () => {
    const a = almacen();
    guardarHojaVerificada(a, NUEVA, VISITA);
    guardarHojaVerificada(a, OTRA, WALTER);
    expect(resolverHoja(a, VISITA, DEFECTO).url).toBe(NUEVA);
    expect(resolverHoja(a, WALTER, DEFECTO).url).toBe(OTRA);
  });

  it('nunca guarda la cuenta en claro, y la huella cambia con la sal', () => {
    const a = almacen();
    guardarHojaVerificada(a, NUEVA, VISITA);
    expect(a.getItem(CLAVE_HOJAS_POR_CUENTA)).not.toContain(VISITA);
    expect(huellaDeCuentaSincrona('s1', VISITA)).not.toBe(huellaDeCuentaSincrona('s2', VISITA));
    expect(huellaDeCuentaSincrona('s1', VISITA)).toMatch(/^[0-9a-f]{28}$/);
  });

  it('una dirección que no es /exec no se guarda, y un registro corrupto no rompe nada', () => {
    const a = almacen({ [CLAVE_HOJAS_POR_CUENTA]: '{no es json' });
    expect(guardarHojaVerificada(a, 'https://malo.example/exec', VISITA)).toBe(false);
    expect(resolverHoja(a, VISITA, DEFECTO).url).toBe(DEFECTO);
    expect(resolverHoja(null, VISITA, null)).toEqual({ url: null, origen: null });
  });
});
