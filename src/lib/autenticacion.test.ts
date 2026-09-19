import { describe, it, expect } from 'vitest';
import {
  CACHE_TOKEN_SEGUNDOS,
  ERROR_TOKEN,
  LONGITUD_CLAVE_CACHE,
  PREFIJO_CACHE_TOKEN,
  claveCache,
  decodificarPayloadJwt,
  leerCache,
  normalizarEmail,
  serializarCache,
  urlTokenInfo,
  validarClaims,
  type PayloadToken,
} from './autenticacion';

/**
 * El muro del backend, probado sin red.
 *
 * Ningún token de aquí es real: se fabrican firmando con una cadena cualquiera,
 * porque **la firma no se comprueba en este módulo** —de eso se encarga Google
 * en `tokeninfo`— y lo que se está probando son las tres validaciones.
 *
 * Ningún correo de aquí corresponde a una persona real.
 */

const AUDIENCIA = '123456789-abcdef.apps.googleusercontent.com';
const AHORA = Date.UTC(2026, 8, 18, 21, 0, 0);
const DENTRO_DE_UNA_HORA = Math.floor(AHORA / 1000) + 3600;

/** Fabrica un `id_token` sintético con el payload que se le pida. */
function tokenCon(payload: object, firma = 'firma-sintetica'): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.${firma}`;
}

const payloadValido = (over: Record<string, unknown> = {}): PayloadToken => ({
  aud: AUDIENCIA,
  sub: '1029384756',
  email: 'persona-sintetica@example.invalid',
  email_verified: true,
  exp: DENTRO_DE_UNA_HORA,
  iss: 'https://accounts.google.com',
  ...over,
});

describe('decodificarPayloadJwt', () => {
  it('lee el payload de un token bien formado', () => {
    const p = decodificarPayloadJwt(tokenCon({ email: 'a@example.invalid', sub: '7' }));
    expect(p.email).toBe('a@example.invalid');
    expect(p.sub).toBe('7');
  });

  it('respeta los caracteres no ASCII', () => {
    // Sin recomponer el UTF-8 a mano, una tilde llegaría rota y el nombre del
    // titular saldría con mojibake en CONFIG.
    const p = decodificarPayloadJwt(tokenCon({ email: 'añoración@example.invalid', sub: '7' }));
    expect(p.email).toBe('añoración@example.invalid');
  });

  it('rechaza lo que no es un JWT', () => {
    for (const basura of ['', 'no-es-un-token', 'a.b', 'a.b.c.d', null, undefined, 42]) {
      expect(() => decodificarPayloadJwt(basura as never), String(basura)).toThrow(ERROR_TOKEN);
    }
  });

  it('rechaza un payload que no es un objeto', () => {
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
    expect(() => decodificarPayloadJwt(`x.${b64('"soy una cadena"')}.y`)).toThrow(ERROR_TOKEN);
    expect(() => decodificarPayloadJwt(`x.${b64('[1,2,3]')}.y`)).toThrow(ERROR_TOKEN);
  });

  it('rechaza un payload que no es JSON', () => {
    expect(() => decodificarPayloadJwt('x.bm8tZXMtanNvbg.y')).toThrow(ERROR_TOKEN);
  });
});

describe('validarClaims · audiencia', () => {
  it('acepta la nuestra', () => {
    const id = validarClaims(payloadValido(), AUDIENCIA, AHORA);
    expect(id.sub).toBe('1029384756');
  });

  it('rechaza la de otra aplicación', () => {
    // Es la validación que más importa: sin ella, un token válido de CUALQUIER
    // aplicación de Google abriría este backend.
    const p = payloadValido({ aud: 'otra-app.apps.googleusercontent.com' });
    expect(() => validarClaims(p, AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
  });

  it('admite `aud` como lista, que es lo que permite el estándar', () => {
    const p = payloadValido({ aud: ['otra-app', AUDIENCIA] });
    expect(validarClaims(p, AUDIENCIA, AHORA).sub).toBe('1029384756');
  });

  it('rechaza si NO hay audiencia configurada', () => {
    // Un backend a medio instalar se queda cerrado, no abierto.
    expect(() => validarClaims(payloadValido(), '', AHORA)).toThrow(ERROR_TOKEN);
  });
});

describe('validarClaims · correo verificado', () => {
  it('acepta el booleano `true` del JWT', () => {
    expect(validarClaims(payloadValido({ email_verified: true }), AUDIENCIA, AHORA).sub).toBeTruthy();
  });

  it('acepta la cadena "true" que devuelve tokeninfo', () => {
    // `tokeninfo` manda TODOS los campos como cadenas. Comparar con `=== true`
    // habría rechazado la mitad de los tokens legítimos.
    expect(validarClaims(payloadValido({ email_verified: 'true' }), AUDIENCIA, AHORA).sub).toBeTruthy();
  });

  it('rechaza un correo sin verificar, en cualquiera de sus formas', () => {
    for (const v of [false, 'false', undefined, null, '', 0]) {
      expect(() => validarClaims(payloadValido({ email_verified: v }), AUDIENCIA, AHORA)).toThrow(
        ERROR_TOKEN,
      );
    }
  });
});

describe('validarClaims · caducidad', () => {
  it('acepta un token vivo', () => {
    expect(validarClaims(payloadValido(), AUDIENCIA, AHORA).sub).toBeTruthy();
  });

  it('acepta `exp` como cadena, que es como llega de tokeninfo', () => {
    const p = payloadValido({ exp: String(DENTRO_DE_UNA_HORA) });
    expect(validarClaims(p, AUDIENCIA, AHORA).sub).toBeTruthy();
  });

  it('rechaza uno caducado', () => {
    const p = payloadValido({ exp: Math.floor(AHORA / 1000) - 1 });
    expect(() => validarClaims(p, AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
  });

  it('rechaza uno que caduca justo ahora: sin margen de tolerancia', () => {
    // Un margen aquí es tiempo extra para un token robado.
    const p = payloadValido({ exp: Math.floor(AHORA / 1000) });
    expect(() => validarClaims(p, AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
  });

  it('rechaza un `exp` ausente o ilegible', () => {
    for (const v of [undefined, null, 'mañana', 0, -1, NaN]) {
      expect(() => validarClaims(payloadValido({ exp: v }), AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
    }
  });
});

describe('validarClaims · emisor e identidad', () => {
  it('acepta los dos emisores que usa Google', () => {
    for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
      expect(validarClaims(payloadValido({ iss }), AUDIENCIA, AHORA).sub).toBeTruthy();
    }
  });

  it('rechaza un emisor que no es Google', () => {
    const p = payloadValido({ iss: 'https://accounts.example.invalid' });
    expect(() => validarClaims(p, AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
  });

  it('no exige que venga `iss`: tokeninfo no siempre lo devuelve', () => {
    const p = payloadValido({ iss: undefined });
    expect(validarClaims(p, AUDIENCIA, AHORA).sub).toBeTruthy();
  });

  it('rechaza si falta el correo o el identificador', () => {
    expect(() => validarClaims(payloadValido({ email: '' }), AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
    expect(() => validarClaims(payloadValido({ sub: '' }), AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
    expect(() => validarClaims(payloadValido({ email: 42 }), AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
  });

  it('devuelve el correo ya normalizado', () => {
    // Quien llama no debería tener que acordarse de normalizar: si se le
    // olvidara una vez, el familiar invitado no entraría.
    const p = payloadValido({ email: 'Juan.Perez+EPS@Gmail.com' });
    expect(validarClaims(p, AUDIENCIA, AHORA).email).toBe('juanperez@gmail.com');
  });

  it('el error es siempre el mismo, falle lo que falle', () => {
    // Distinguir «caducó» de «audiencia equivocada» le dice a quien lo intenta
    // qué corregir en el siguiente intento.
    const casos = [
      payloadValido({ aud: 'otra' }),
      payloadValido({ exp: 1 }),
      payloadValido({ email_verified: false }),
      payloadValido({ sub: '' }),
    ];
    for (const p of casos) {
      expect(() => validarClaims(p, AUDIENCIA, AHORA)).toThrow(ERROR_TOKEN);
    }
  });
});

describe('normalizarEmail', () => {
  it('baja a minúsculas y recorta espacios', () => {
    expect(normalizarEmail('  Persona@Example.Invalid ')).toBe('persona@example.invalid');
  });

  it('en Gmail, los puntos no cuentan', () => {
    expect(normalizarEmail('juan.perez@gmail.com')).toBe('juanperez@gmail.com');
    expect(normalizarEmail('j.u.a.n@gmail.com')).toBe('juan@gmail.com');
  });

  it('en Gmail, el `+etiqueta` se descarta', () => {
    expect(normalizarEmail('juanperez+eps@gmail.com')).toBe('juanperez@gmail.com');
    expect(normalizarEmail('juan.perez+eps+mas@gmail.com')).toBe('juanperez@gmail.com');
  });

  it('googlemail.com se trata igual que gmail.com', () => {
    expect(normalizarEmail('juan.perez@googlemail.com')).toBe('juanperez@googlemail.com');
  });

  it('FUERA de Gmail los puntos SÍ cuentan', () => {
    // Hay servidores donde `a.b@` y `ab@` son dos personas distintas. Quitar
    // los puntos ahí fusionaría dos cuentas ajenas.
    expect(normalizarEmail('juan.perez@example.invalid')).toBe('juan.perez@example.invalid');
    expect(normalizarEmail('juan+eps@example.invalid')).toBe('juan+eps@example.invalid');
  });

  it('no fabrica un correo sin parte local', () => {
    expect(normalizarEmail('+eps@gmail.com')).toBe('+eps@gmail.com');
  });

  it('con basura devuelve cadena vacía o lo que vino, sin romperse', () => {
    expect(normalizarEmail(null)).toBe('');
    expect(normalizarEmail(42)).toBe('');
    expect(normalizarEmail('sin-arroba')).toBe('sin-arroba');
    expect(normalizarEmail('@gmail.com')).toBe('@gmail.com');
  });
});

describe('claveCache', () => {
  it('usa los últimos caracteres de la firma, con prefijo', () => {
    const firma = 'z'.repeat(200);
    const clave = claveCache(tokenCon(payloadValido(), firma));
    expect(clave.startsWith(PREFIJO_CACHE_TOKEN)).toBe(true);
    expect(clave.length).toBe(PREFIJO_CACHE_TOKEN.length + LONGITUD_CLAVE_CACHE);
  });

  it('nunca pasa del límite de 250 caracteres de CacheService', () => {
    // Un `id_token` de verdad pasa de mil; usarlo entero como clave la haría
    // inservible sin que nada avisara.
    const clave = claveCache(tokenCon(payloadValido(), 'z'.repeat(2000)));
    expect(clave.length).toBeLessThanOrEqual(250);
  });

  it('no contiene el token entero: solo un trozo de la firma', () => {
    const token = tokenCon(payloadValido(), 'z'.repeat(200));
    const clave = claveCache(token);
    expect(token).not.toContain(clave);
    expect(clave).not.toContain('.');
  });

  it('dos tokens distintos dan claves distintas', () => {
    const a = claveCache(tokenCon(payloadValido(), 'a'.repeat(100)));
    const b = claveCache(tokenCon(payloadValido(), 'b'.repeat(100)));
    expect(a).not.toBe(b);
  });

  it('con una firma corta la usa entera', () => {
    expect(claveCache(tokenCon(payloadValido(), 'corta'))).toBe(PREFIJO_CACHE_TOKEN + 'corta');
  });

  it('rechaza lo que no es un token', () => {
    for (const basura of ['', 'a.b', 'a.b.', null]) {
      expect(() => claveCache(basura as never), String(basura)).toThrow(ERROR_TOKEN);
    }
  });
});

describe('la caché no alarga la vida de un token', () => {
  const identidad = { email: 'persona@example.invalid', sub: '99' };

  it('devuelve la identidad mientras el token siga vivo', () => {
    const crudo = serializarCache(identidad, DENTRO_DE_UNA_HORA);
    expect(leerCache(crudo, AHORA)).toEqual(identidad);
  });

  it('descarta la entrada si el token caducó, aunque la caché siga viva', () => {
    // Es la parte menos evidente. La caché dura 300 s; si se verifica un token
    // al que le quedaban 10, sin esta comprobación valdría 290 s de más.
    const casiCaducado = Math.floor(AHORA / 1000) + 10;
    const crudo = serializarCache(identidad, casiCaducado);
    expect(leerCache(crudo, AHORA)).toEqual(identidad);
    expect(leerCache(crudo, AHORA + 11_000)).toBeNull();
  });

  it('la caché dura menos de lo que podría durar un token', () => {
    // Si la caché durase más que un token típico, la comprobación de arriba
    // sería la única defensa. Son 300 s contra los 3.600 de Google.
    expect(CACHE_TOKEN_SEGUNDOS).toBeLessThan(3600);
  });

  it('una entrada rota se ignora en vez de romper la petición', () => {
    // `null` significa «verifica otra vez», nunca «denegado».
    for (const basura of ['', 'no-es-json', '{}', '{"email":"a"}', null, undefined, 42]) {
      expect(leerCache(basura as never, AHORA), String(basura)).toBeNull();
    }
  });

  it('lo cacheado no incluye el token', () => {
    const crudo = serializarCache(identidad, DENTRO_DE_UNA_HORA);
    expect(crudo).not.toContain('eyJ');
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual(['email', 'exp', 'sub']);
  });
});

describe('urlTokenInfo', () => {
  it('apunta al extremo de Google y escapa el token', () => {
    const url = urlTokenInfo('a.b+c/d');
    expect(url.startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=')).toBe(true);
    expect(url).toContain('a.b%2Bc%2Fd');
  });
});
