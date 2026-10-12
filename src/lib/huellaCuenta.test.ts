import { describe, it, expect } from 'vitest';
import { huellaCuenta, nuevaSal } from './huellaCuenta';
import { sujetoDe, tokenFalsoParaPruebas } from './sesionGoogle';

/**
 * Bloque I · de quién es cada lote, sin guardar quién es.
 *
 * La cola tiene que saber qué cuenta hizo cada cambio, para no enviarlo con la
 * credencial de otra. Pero la regla del proyecto prohíbe guardar correos,
 * UID o identificadores en el navegador. La huella cumple las dos cosas: es
 * `SHA-256(sal || sub)` con una sal aleatoria que vive con la cola. Sirve para
 * comparar con la credencial que llega, y no dice de quién es.
 */

const SUB_A = '108765432109876543210';
const SUB_B = '109999999999999999999';

describe('huellaCuenta', () => {
  it('la misma cuenta y la misma sal dan la misma huella', async () => {
    const sal = nuevaSal();
    expect(await huellaCuenta(sal, SUB_A)).toBe(await huellaCuenta(sal, SUB_A));
  });

  it('dos cuentas dan huellas distintas', async () => {
    const sal = nuevaSal();
    expect(await huellaCuenta(sal, SUB_A)).not.toBe(await huellaCuenta(sal, SUB_B));
  });

  it('con otra sal, la misma cuenta da otra huella: no se puede cruzar entre navegadores', async () => {
    expect(await huellaCuenta(nuevaSal(), SUB_A)).not.toBe(await huellaCuenta(nuevaSal(), SUB_A));
  });

  it('la huella no contiene el identificador', async () => {
    const h = await huellaCuenta(nuevaSal(), SUB_A);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(SUB_A);
  });

  it('sin sujeto no hay huella', async () => {
    await expect(huellaCuenta(nuevaSal(), '')).rejects.toThrow();
  });

  it('cada sal es nueva y de 128 bits', () => {
    const a = nuevaSal();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(nuevaSal()).not.toBe(a);
  });
});

describe('sujetoDe · la cuenta de una credencial', () => {
  it('lee el `sub` del id_token', () => {
    expect(sujetoDe(tokenFalsoParaPruebas(Date.now() + 60_000, SUB_A))).toBe(SUB_A);
  });

  it('nada, o basura, no tiene sujeto', () => {
    expect(sujetoDe(null)).toBeNull();
    expect(sujetoDe('no-es-un-token')).toBeNull();
    expect(sujetoDe('a.e30.b')).toBeNull(); // carga `{}`
  });
});
