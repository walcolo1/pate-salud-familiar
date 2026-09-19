import { describe, it, expect } from 'vitest';
import {
  PLAN_E6,
  JWT_FALSO,
  clasificar,
  cuerpoDe,
  fugasEn,
  redactar,
  resumen,
  tokenDe,
  type PruebaEnVivo,
  type Resultado,
  type TokensReales,
} from './sondaE6';

/**
 * El plan de la validación en vivo se prueba igual que todo lo demás.
 *
 * Es tentador dejarlo sin pruebas «porque solo es un guion», y es justo al
 * revés: si la sonda clasifica mal una respuesta, la validación manual queda
 * dando un verde que no existe, y eso es peor que no haberla hecho. Un arnés en
 * el que no se confía es un arnés que se ignora.
 */

const TOKENS: TokensReales = { titular: 'token-A', segunda: 'token-B' };
const CONTEXTO = { emailSegunda: 'segunda@gmail.com' };

const prueba = (parcial: Partial<PruebaEnVivo>): PruebaEnVivo => ({
  id: 'X',
  criterio: 1,
  titulo: 't',
  porque: 'p',
  token: 'NINGUNO',
  accion: 'ping',
  espera: { clase: 'OK' },
  ...parcial,
});

describe('el plan cubre las cinco promesas y en el orden correcto', () => {
  it('las cinco promesas tienen al menos una prueba', () => {
    const criterios = new Set(PLAN_E6.map((p) => p.criterio));
    expect([...criterios].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('los identificadores son únicos', () => {
    const ids = PLAN_E6.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la cuenta ajena se usa ANTES de darla de alta', () => {
    // Si `E6L-6` fuera después del alta, no probaría la denegación por defecto:
    // probaría que una fila ACTIVO entra, que es otra cosa.
    const denegada = PLAN_E6.findIndex((p) => p.id === 'E6L-6');
    const alta = PLAN_E6.findIndex((p) => p.id === 'E6L-7');
    expect(denegada).toBeGreaterThanOrEqual(0);
    expect(denegada).toBeLessThan(alta);
  });

  it('la revocada vuelve a llamar DESPUÉS de haber entrado y DESPUÉS de revocar', () => {
    // El orden es el experimento. Con la caché fría, que la revocada no entre
    // no demuestra que la versión invalide nada.
    const entra = PLAN_E6.findIndex((p) => p.id === 'E6L-7');
    const revoca = PLAN_E6.findIndex((p) => p.id === 'E6L-8');
    const reintenta = PLAN_E6.findIndex((p) => p.id === 'E6L-9');
    expect(entra).toBeLessThan(revoca);
    expect(revoca).toBeLessThan(reintenta);
  });

  it('la revocación se pide por la API, nunca editando la hoja', () => {
    // Tachar la celda a mano no sube la versión: el revocado seguiría entrando
    // hasta que caducara su entrada de caché. La prueba tiene que ir por
    // `revocar`, que es lo que pasa por `mutarAcceso`.
    const revoca = PLAN_E6.find((p) => p.id === 'E6L-8');
    expect(revoca?.accion).toBe('revocar');
    expect(revoca?.token).toBe('TITULAR');
  });

  it('solo ping se lanza sin token; todo lo demás con verbo lleva uno o lo prueba ausente', () => {
    const anonimas = PLAN_E6.filter((p) => p.token === 'NINGUNO');
    for (const p of anonimas) {
      const esPing = p.accion === 'ping';
      const esperaRechazo = p.espera.clase === 'ERROR';
      expect(esPing || esperaRechazo, `${p.id} pide ${p.accion} sin token y espera pasar`).toBe(
        true,
      );
    }
  });

  it('cada prueba dice por qué existe', () => {
    for (const p of PLAN_E6) expect(p.porque.length).toBeGreaterThan(20);
  });
});

describe('tokenDe', () => {
  it('NINGUNO no manda token', () => {
    expect(tokenDe('NINGUNO', TOKENS)).toBeNull();
  });

  it('BASURA no tiene forma de JWT: se rechaza sin salir a la red', () => {
    expect(tokenDe('BASURA', TOKENS)).not.toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
  });

  it('JWT_FALSO sí tiene los tres tramos, para que la petición llegue a Google', () => {
    // Si no los tuviera, `claveCache` lanzaría antes y la prueba pasaría sin
    // haber comprobado nunca que `tokeninfo` rechaza lo que no firmó.
    expect(JWT_FALSO.split('.')).toHaveLength(3);
    expect(tokenDe('JWT_FALSO', TOKENS)).toBe(JWT_FALSO);
  });

  it('los reales salen del contexto de ejecución, no de aquí', () => {
    expect(tokenDe('TITULAR', TOKENS)).toBe('token-A');
    expect(tokenDe('SEGUNDA', TOKENS)).toBe('token-B');
  });
});

describe('cuerpoDe', () => {
  it('sin token el campo NO aparece, en vez de ir vacío', () => {
    const cuerpo = JSON.parse(cuerpoDe(prueba({ token: 'NINGUNO' }), TOKENS, CONTEXTO));
    expect(Object.keys(cuerpo)).not.toContain('idToken');
    expect(cuerpo.accion).toBe('ping');
  });

  it('con token lo incluye', () => {
    const cuerpo = JSON.parse(
      cuerpoDe(prueba({ token: 'TITULAR', accion: 'listarPacientes' }), TOKENS, CONTEXTO),
    );
    expect(cuerpo.idToken).toBe('token-A');
  });

  it('el payload se calcula en el momento, con el correo que haya', () => {
    const cuerpo = JSON.parse(
      cuerpoDe(
        prueba({ accion: 'revocar', payloadDe: (c) => ({ email: c.emailSegunda }) }),
        TOKENS,
        CONTEXTO,
      ),
    );
    expect(cuerpo.payload).toEqual({ email: 'segunda@gmail.com' });
  });

  it('un cuerpo crudo se manda tal cual', () => {
    expect(cuerpoDe(prueba({ cuerpoCrudo: 'no soy json' }), TOKENS, CONTEXTO)).toBe('no soy json');
  });

  it('ninguna prueba del plan lleva un correo escrito a mano', () => {
    for (const p of PLAN_E6) {
      const cuerpo = cuerpoDe(p, { titular: 'a', segunda: 'b' }, { emailSegunda: 'x@y.com' });
      expect(cuerpo.replace('x@y.com', ''), `${p.id}`).not.toMatch(/@/);
    }
  });
});

describe('fugasEn — la misma regla que E0b-4, sobre el texto crudo', () => {
  it('un correo es una fuga, aunque venga dentro de un mensaje', () => {
    expect(fugasEn('{"ok":true,"data":{"mensaje":"hola ana@gmail.com"}}')).toContain(
      'una dirección de correo',
    );
  });

  it('una cadena larga es una fuga: puede ser el identificador de la hoja', () => {
    expect(fugasEn('{"idHoja":"1V4BsPDtScIrYiPSZ58iCBqOcy52DKX5eqhDW7jpyN60"}')).toContain(
      'un identificador largo',
    );
  });

  it('la respuesta que E6 dejó no tiene ninguna', () => {
    expect(fugasEn('{"ok":true,"data":{"version":"e6","esquema":1}}')).toEqual([]);
  });

  it('la respuesta que devolvía E1 sí la tiene: por eso se quitó', () => {
    const vieja = '{"ok":true,"usuarioActivo":"","usuarioEfectivo":"titular@gmail.com"}';
    expect(fugasEn(vieja)).toContain('una dirección de correo');
  });
});

describe('redactar', () => {
  it('un id_token no llega nunca a la consola', () => {
    const token = `eyJhbGciOiJSUzI1NiJ9.${'a'.repeat(30)}.${'b'.repeat(30)}`;
    expect(redactar(`token=${token}`)).toBe('token=‹id_token›');
  });

  it('un correo tampoco', () => {
    expect(redactar('denegado a juan@gmail.com')).toBe('denegado a ‹correo›');
  });

  it('ni el identificador de la hoja', () => {
    expect(redactar('1V4BsPDtScIrYiPSZ58iCBqOcy52DKX5eqhDW7jpyN60')).toBe('‹identificador›');
  });

  it('lo que no es sensible pasa entero', () => {
    expect(redactar('{"ok":true,"data":{"version":"e6"}}')).toBe('{"ok":true,"data":{"version":"e6"}}');
  });
});

describe('clasificar', () => {
  const ok = prueba({ espera: { clase: 'OK' } });
  const denegado = prueba({ espera: { clase: 'ERROR', codigo: 'ACCESO_DENEGADO' } });
  const sinFugas = prueba({ espera: { clase: 'OK_SIN_FUGAS' } });

  it('un 302 se nombra por lo que es: el despliegue pide sesión', () => {
    const r = clasificar(ok, 302, '<html>Iniciar sesión</html>');
    expect(r.veredicto).toBe('FALLA');
    expect(r.detalle).toMatch(/Cualquier usuario/);
  });

  it('un 200 con HTML de Google también', () => {
    const r = clasificar(ok, 200, '<html><a href="https://accounts.google.com/">x</a></html>');
    expect(r.veredicto).toBe('FALLA');
  });

  it('otro código HTTP se enseña redactado', () => {
    const r = clasificar(ok, 500, 'falló con ana@gmail.com dentro');
    expect(r.veredicto).toBe('FALLA');
    expect(r.detalle).not.toMatch(/ana@/);
  });

  it('ok:true cuando se esperaba ok:true', () => {
    expect(clasificar(ok, 200, '{"ok":true,"data":{}}').veredicto).toBe('PASA');
  });

  it('el código correcto cuando se esperaba un error', () => {
    expect(clasificar(denegado, 200, '{"ok":false,"error":"ACCESO_DENEGADO"}').veredicto).toBe(
      'PASA',
    );
  });

  it('OTRO código de error NO pasa: confundirlos es confundir dos muros', () => {
    // Que una petición se rechace no basta. Si el token cae en E3 cuando la
    // prueba esperaba que cayera en E4, la cadena está mal ordenada y esta es
    // la única señal que lo diría.
    const r = clasificar(denegado, 200, '{"ok":false,"error":"TOKEN_INVALIDO"}');
    expect(r.veredicto).toBe('FALLA');
    expect(r.detalle).toMatch(/esperaba ACCESO_DENEGADO/);
  });

  it('un ok:true donde se esperaba un rechazo es un fallo, no un acierto', () => {
    expect(clasificar(denegado, 200, '{"ok":true,"data":{}}').veredicto).toBe('FALLA');
  });

  it('una respuesta que no es JSON falla y no se imprime entera', () => {
    const r = clasificar(ok, 200, 'x'.repeat(5000));
    expect(r.veredicto).toBe('FALLA');
    expect(r.detalle.length).toBeLessThan(300);
  });

  it('OK_SIN_FUGAS falla si se escapa un correo, aunque ok sea true', () => {
    const r = clasificar(sinFugas, 200, '{"ok":true,"data":{"usuario":"a@b.com"}}');
    expect(r.veredicto).toBe('FALLA');
    expect(r.detalle).toMatch(/correo/);
  });

  it('OK_SIN_FUGAS pasa con la respuesta que E6 dejó', () => {
    const r = clasificar(sinFugas, 200, '{"ok":true,"data":{"version":"e6","esquema":1}}');
    expect(r.veredicto).toBe('PASA');
  });

  it('ningún detalle publicado lleva datos sin redactar', () => {
    // El detalle se pega en la evidencia. Si algo se cuela aquí, acaba en el
    // repositorio.
    const casos = [
      clasificar(ok, 500, 'ana@gmail.com'),
      clasificar(ok, 200, 'no json con ana@gmail.com'),
      clasificar(sinFugas, 200, '{"ok":true,"data":{"version":"e6"}}'),
    ];
    for (const c of casos) expect(c.detalle).not.toMatch(/ana@gmail\.com/);
  });
});

describe('resumen', () => {
  const r = (id: string, criterio: number, veredicto: 'PASA' | 'FALLA'): Resultado => ({
    id,
    criterio,
    titulo: id,
    veredicto,
    detalle: '',
  });

  it('cuenta y dice qué promesas quedan abiertas', () => {
    expect(resumen([r('a', 1, 'PASA'), r('b', 5, 'FALLA'), r('c', 3, 'FALLA')])).toEqual({
      pasan: 1,
      fallan: 2,
      criteriosAbiertos: [3, 5],
    });
  });

  it('un criterio con una prueba caída queda abierto aunque otra suya pase', () => {
    expect(resumen([r('a', 5, 'PASA'), r('b', 5, 'FALLA')]).criteriosAbiertos).toEqual([5]);
  });

  it('todo verde no deja nada abierto', () => {
    expect(resumen([r('a', 1, 'PASA')]).criteriosAbiertos).toEqual([]);
  });
});
