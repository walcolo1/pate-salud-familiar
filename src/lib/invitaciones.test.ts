import { describe, it, expect } from 'vitest';
import {
  ASUNTO_INVITACION,
  DIAS_VIGENCIA_INVITACION,
  ERRORES_INVITACION,
  LONGITUD_MINIMA_TOKEN,
  PLANTILLA_CORREO_INVITACION,
  PROHIBIDO_EN_CORREO,
  aHexadecimal,
  caducidadDesde,
  componerToken,
  cuerpoInvitacion,
  enlaceInvitacion,
  esTokenBienFormado,
  esUrlPwaValida,
  estadoInvitacion,
  haCaducado,
  igualesEnTiempoConstante,
  marcadoresProhibidos,
  validarAceptacion,
  validarInvitacion,
  type FilaInvitacion,
} from './invitaciones';
import { ROLES } from './acceso';

/**
 * Las invitaciones, probadas sin hoja, sin correo y sin azar.
 *
 * Ningún correo de aquí corresponde a una persona real. El azar y el hash no
 * se prueban porque no están aquí: viven en `Invitaciones.gs`, que es lo único
 * que no se puede ejecutar fuera de Apps Script. Lo que sí está aquí es todo lo
 * que decide si alguien entra.
 */

const AHORA = new Date(2026, 8, 19, 12, 0, 0).getTime();
const UN_DIA = 24 * 60 * 60 * 1000;

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const UUID_B = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const TOKEN = componerToken([UUID_A, UUID_B]);
const HASH = 'a'.repeat(64);

const filaDe = (campos: Partial<FilaInvitacion> = {}): FilaInvitacion => ({
  email: 'invitada@example.invalid',
  estado: 'INVITADO',
  token_hash: HASH,
  token_expira: new Date(AHORA + 3 * UN_DIA).toISOString(),
  ...campos,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('componerToken', () => {
  it('junta dos UUID sin guiones', () => {
    expect(TOKEN).toBe((UUID_A + UUID_B).replace(/-/g, ''));
    expect(TOKEN).toHaveLength(64);
  });

  it('exige al menos dos piezas de azar', () => {
    // Un solo UUID bastaría en la práctica, pero la generación queda fuera de
    // nuestro control y no se puede auditar. Dos cuestan una llamada más.
    expect(() => componerToken([UUID_A])).toThrow(/dos piezas/);
    expect(() => componerToken([])).toThrow();
  });

  it('las piezas vacías no cuentan como piezas', () => {
    expect(() => componerToken([UUID_A, '', '   '])).toThrow(/dos piezas/);
  });

  it('lo que sale siempre pasa la comprobación de forma', () => {
    expect(esTokenBienFormado(TOKEN)).toBe(true);
  });

  it('no acepta piezas que no sean hexadecimales', () => {
    expect(() => componerToken(['no-es-hex-' + 'x'.repeat(40), UUID_B])).toThrow();
  });
});

describe('esTokenBienFormado', () => {
  it('rechaza lo corto, lo vacío y lo que no es cadena', () => {
    // Se comprueba antes de tocar la hoja: sin esto, cada cadena que alguien
    // pruebe contra un endpoint público cuesta una lectura de la hoja.
    expect(esTokenBienFormado('abc')).toBe(false);
    expect(esTokenBienFormado('')).toBe(false);
    expect(esTokenBienFormado(null)).toBe(false);
    expect(esTokenBienFormado(123)).toBe(false);
  });

  it('rechaza mayúsculas y caracteres fuera del alfabeto', () => {
    expect(esTokenBienFormado('A'.repeat(64))).toBe(false);
    expect(esTokenBienFormado('z'.repeat(64))).toBe(false);
    expect(esTokenBienFormado('a'.repeat(63) + '/')).toBe(false);
  });

  it('acepta justo la longitud mínima', () => {
    expect(esTokenBienFormado('0'.repeat(LONGITUD_MINIMA_TOKEN))).toBe(true);
    expect(esTokenBienFormado('0'.repeat(LONGITUD_MINIMA_TOKEN - 1))).toBe(false);
  });
});

describe('aHexadecimal · los bytes con signo de Apps Script', () => {
  it('un byte negativo NO produce un hexadecimal negativo', () => {
    // `Utilities.computeDigest` devuelve bytes de −128 a 127, herencia del
    // `byte` de Java. Sin corregir el signo sale un hash distinto para la mitad
    // de las entradas, y además *estable*: nada falla, sencillamente ninguna
    // invitación se encuentra nunca.
    expect(aHexadecimal([-1])).toBe('ff');
    expect(aHexadecimal([-128])).toBe('80');
    expect(aHexadecimal([127])).toBe('7f');
  });

  it('rellena a dos dígitos', () => {
    expect(aHexadecimal([0, 1, 15, 16])).toBe('00010f10');
  });

  it('32 bytes dan 64 caracteres, que es lo que mide un SHA-256', () => {
    const bytes = Array.from({ length: 32 }, (_, i) => i - 16);
    expect(aHexadecimal(bytes)).toHaveLength(64);
    expect(aHexadecimal(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sin bytes, cadena vacía', () => {
    expect(aHexadecimal([])).toBe('');
  });
});

describe('igualesEnTiempoConstante', () => {
  it('dice que sí cuando son iguales', () => {
    expect(igualesEnTiempoConstante(HASH, HASH)).toBe(true);
  });

  it('dice que no cuando cambia un solo carácter', () => {
    expect(igualesEnTiempoConstante(HASH, 'b' + HASH.slice(1))).toBe(false);
  });

  it('una cadena vacía nunca es igual a nada, ni a otra vacía', () => {
    // Que dos hashes ausentes «coincidan» dejaría entrar a cualquiera con una
    // fila sin token.
    expect(igualesEnTiempoConstante('', '')).toBe(false);
    expect(igualesEnTiempoConstante(HASH, '')).toBe(false);
  });

  it('lo que no es cadena tampoco', () => {
    expect(igualesEnTiempoConstante(null, null)).toBe(false);
    expect(igualesEnTiempoConstante(undefined, HASH)).toBe(false);
  });
});

describe('caducidad', () => {
  it('siete días, y el número no está escrito dos veces', () => {
    const iso = caducidadDesde(AHORA);
    expect(Date.parse(iso) - AHORA).toBe(DIAS_VIGENCIA_INVITACION * UN_DIA);
  });

  it('lo de dentro de tres días no ha caducado', () => {
    expect(haCaducado(new Date(AHORA + 3 * UN_DIA).toISOString(), AHORA)).toBe(false);
  });

  it('lo de ayer sí', () => {
    expect(haCaducado(new Date(AHORA - UN_DIA).toISOString(), AHORA)).toBe(true);
  });

  it('justo en el instante de caducar, caducada', () => {
    expect(haCaducado(new Date(AHORA).toISOString(), AHORA)).toBe(true);
  });

  it('una caducidad ilegible o ausente cuenta como caducada', () => {
    // Al revés, una celda mal editada sería una invitación eterna.
    expect(haCaducado('', AHORA)).toBe(true);
    expect(haCaducado('el martes', AHORA)).toBe(true);
    expect(haCaducado(null, AHORA)).toBe(true);
    expect(haCaducado(undefined, AHORA)).toBe(true);
  });
});

describe('estadoInvitacion', () => {
  it('PENDIENTE con hash y sin caducar', () => {
    expect(estadoInvitacion(filaDe(), AHORA)).toBe('PENDIENTE');
  });

  it('EXPIRADA cuando pasó la fecha', () => {
    expect(
      estadoInvitacion(filaDe({ token_expira: new Date(AHORA - UN_DIA).toISOString() }), AHORA),
    ).toBe('EXPIRADA');
  });

  it('ACEPTADA cuando la fila ya está ACTIVO', () => {
    expect(estadoInvitacion(filaDe({ estado: 'ACTIVO' }), AHORA)).toBe('ACEPTADA');
  });

  it('REVOCADA manda sobre todo lo demás, incluso con el token vivo', () => {
    expect(estadoInvitacion(filaDe({ estado: 'REVOCADO' }), AHORA)).toBe('REVOCADA');
  });

  it('INEXISTENTE sin fila', () => {
    expect(estadoInvitacion(null, AHORA)).toBe('INEXISTENTE');
    expect(estadoInvitacion(undefined, AHORA)).toBe('INEXISTENTE');
  });

  it('INEXISTENTE cuando la fila no tiene hash: la invitación ya se consumió', () => {
    expect(estadoInvitacion(filaDe({ token_hash: '', estado: 'INVITADO' }), AHORA)).toBe(
      'INEXISTENTE',
    );
  });
});

describe('validarAceptacion', () => {
  const peticion = (extra: Partial<Parameters<typeof validarAceptacion>[0]> = {}) =>
    validarAceptacion({
      fila: filaDe(),
      hashRecibido: HASH,
      emailAceptante: 'invitada@example.invalid',
      ahoraMs: AHORA,
      ...extra,
    });

  it('deja entrar a quien trae el token correcto desde la cuenta correcta', () => {
    const r = peticion();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email).toBe('invitada@example.invalid');
  });

  it('sin fila, desconocida', () => {
    expect(peticion({ fila: null })).toEqual({ ok: false, error: 'INVITACION_DESCONOCIDA' });
  });

  it('con el hash cambiado, desconocida', () => {
    // Que la búsqueda haya encontrado una fila no basta: se vuelve a comparar
    // el hash aquí, porque quien la buscó pudo mirar por otro campo.
    expect(peticion({ hashRecibido: 'b'.repeat(64) })).toEqual({
      ok: false,
      error: 'INVITACION_DESCONOCIDA',
    });
  });

  it('una fila sin hash no deja entrar a nadie, ni con el hash vacío', () => {
    expect(
      peticion({ fila: filaDe({ token_hash: '' }), hashRecibido: '' }).ok,
      'dos ausencias no son una coincidencia',
    ).toBe(false);
  });

  it('REENVIADA: otra cuenta con el token bueno NO entra', () => {
    // La decisión de E7: el correo que manda es el del `id_token`, no el del
    // enlace. Si Ana le pasa su enlace a Luis, Luis no entra.
    expect(peticion({ emailAceptante: 'otro@example.invalid' })).toEqual({
      ok: false,
      error: 'INVITACION_DESTINATARIO_INVALIDO',
    });
  });

  it('los puntos de gmail.com no convierten a la destinataria en otra persona', () => {
    const r = peticion({
      fila: filaDe({ email: 'ana.gomez@gmail.com' }),
      emailAceptante: 'anagomez@gmail.com',
    });
    expect(r.ok, 'es la misma cuenta para Google y se la dejó fuera').toBe(true);
  });

  it('fuera de gmail.com los puntos sí distinguen dos buzones', () => {
    expect(
      peticion({
        fila: filaDe({ email: 'ana.gomez@example.invalid' }),
        emailAceptante: 'anagomez@example.invalid',
      }).ok,
    ).toBe(false);
  });

  it('caducada, y se dice', () => {
    expect(
      peticion({ fila: filaDe({ token_expira: new Date(AHORA - UN_DIA).toISOString() }) }),
    ).toEqual({ ok: false, error: 'INVITACION_EXPIRADA' });
  });

  it('ya usada: una invitación no se canjea dos veces', () => {
    expect(peticion({ fila: filaDe({ estado: 'ACTIVO' }) })).toEqual({
      ok: false,
      error: 'INVITACION_YA_USADA',
    });
  });

  it('revocada antes de aceptarla: no entra', () => {
    // El titular invita, se arrepiente y revoca antes de que la persona abra el
    // correo. El enlace tiene que quedarse muerto.
    expect(peticion({ fila: filaDe({ estado: 'REVOCADO' }) })).toEqual({
      ok: false,
      error: 'INVITACION_REVOCADA',
    });
  });

  it('caducada Y de otra persona: se dice lo accionable', () => {
    // Quien llega aquí ya demostró tener el token. «Estás en la cuenta
    // equivocada» le sirve; «caducó» le manda a pedir otra que tampoco podrá
    // usar.
    expect(
      peticion({
        fila: filaDe({ token_expira: new Date(AHORA - UN_DIA).toISOString() }),
        emailAceptante: 'otro@example.invalid',
      }),
    ).toEqual({ ok: false, error: 'INVITACION_DESTINATARIO_INVALIDO' });
  });

  it('sin correo de aceptante no entra nadie', () => {
    expect(peticion({ emailAceptante: '' }).ok).toBe(false);
    expect(peticion({ emailAceptante: null }).ok).toBe(false);
  });

  it('NINGÚN rechazo dice para quién era la invitación', () => {
    // Es lo único que no puede salir: el código viaja a un navegador que puede
    // no ser el de la destinataria.
    const rechazos = [
      peticion({ fila: null }),
      peticion({ emailAceptante: 'otro@example.invalid' }),
      peticion({ fila: filaDe({ estado: 'ACTIVO' }) }),
      peticion({ fila: filaDe({ token_expira: '2020-01-01T00:00:00.000Z' }) }),
    ];
    for (const r of rechazos) {
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/invitada|example\.invalid/);
    }
  });

  it('todos los códigos que devuelve están en el catálogo', () => {
    const codigos = [
      peticion({ fila: null }),
      peticion({ emailAceptante: 'otro@example.invalid' }),
      peticion({ fila: filaDe({ estado: 'ACTIVO' }) }),
      peticion({ fila: filaDe({ estado: 'REVOCADO' }) }),
      peticion({ fila: filaDe({ token_expira: '2020-01-01T00:00:00.000Z' }) }),
    ].map((r) => (r.ok ? '' : r.error));

    for (const c of codigos) expect(ERRORES_INVITACION).toContain(c);
  });
});

describe('esUrlPwaValida', () => {
  it('acepta una dirección https normal, con o sin ruta', () => {
    expect(esUrlPwaValida('https://pate.example.com')).toBe(true);
    expect(esUrlPwaValida('https://pate.example.com/app')).toBe(true);
  });

  it('rechaza http: el token viajaría en claro', () => {
    expect(esUrlPwaValida('http://pate.example.com')).toBe(false);
  });

  it('rechaza credenciales embebidas', () => {
    // `https://pate.example.com@malo.example/` es válida para un navegador y no
    // lleva a donde parece.
    expect(esUrlPwaValida('https://pate.example.com@malo.example/')).toBe(false);
  });

  it('rechaza lo vacío, lo que no es cadena y lo que trae consulta', () => {
    expect(esUrlPwaValida('')).toBe(false);
    expect(esUrlPwaValida(null)).toBe(false);
    expect(esUrlPwaValida('https://pate.example.com/?x=1')).toBe(false);
  });
});

describe('enlaceInvitacion', () => {
  const BASE = 'https://pate.example.com';
  const BACKEND = 'https://script.google.com/macros/s/AAAA/exec';

  it('lleva el token y el backend, los dos escapados', () => {
    const enlace = enlaceInvitacion(BASE, TOKEN, BACKEND);
    expect(enlace).toBe(
      `${BASE}/invitacion?t=${TOKEN}&backend=${encodeURIComponent(BACKEND)}`,
    );
    expect(enlace).not.toContain('macros/s/AAAA/exec');
  });

  it('no duplica la barra si la base la trae', () => {
    expect(enlaceInvitacion(BASE + '/', TOKEN, BACKEND)).toContain(`${BASE}/invitacion?`);
  });

  it('se niega antes que mandar a nadie a un sitio que no es el nuestro', () => {
    expect(() => enlaceInvitacion('http://malo.example', TOKEN, BACKEND)).toThrow(/PAYLOAD/);
    expect(() => enlaceInvitacion(BASE, 'corto', BACKEND)).toThrow(/PAYLOAD/);
    expect(() => enlaceInvitacion(BASE, TOKEN, 'http://malo.example')).toThrow(/PAYLOAD/);
  });
});

describe('el cuerpo del correo es aséptico', () => {
  const ENLACE = 'https://pate.example.com/invitacion?t=' + TOKEN + '&backend=x';

  it('sustituye el enlace y nada más', () => {
    const cuerpo = cuerpoInvitacion(ENLACE);
    expect(cuerpo).toContain(ENLACE);
    expect(cuerpo).not.toContain('{{');
  });

  it('el asunto no dice de quién ni de qué familia', () => {
    expect(ASUNTO_INVITACION).not.toMatch(/@|\bde\s+[A-ZÁÉÍÓÚÑ]/);
  });

  it('la plantilla NO tiene ningún marcador prohibido', () => {
    // El trinquete. Si alguien personaliza el correo «solo un poco», esto se
    // pone rojo antes de que salga de aquí.
    expect(marcadoresProhibidos(PLANTILLA_CORREO_INVITACION)).toEqual([]);
  });

  it('el único marcador de la plantilla es el enlace', () => {
    const marcadores = PLANTILLA_CORREO_INVITACION.match(/\{\{[^}]*\}\}/g) ?? [];
    expect(marcadores).toEqual(['{{enlace}}']);
  });

  it('dice cuánto dura y que no se puede reenviar', () => {
    // Las dos cosas que evitan un caso de soporte, y las dos son ciertas.
    expect(PLANTILLA_CORREO_INVITACION).toContain(String(DIAS_VIGENCIA_INVITACION) + ' días');
    expect(PLANTILLA_CORREO_INVITACION.toLowerCase()).toContain('reenviarlo');
  });

  it('no lleva HTML: un correo de texto no ejecuta nada ni delata si se abrió', () => {
    expect(PLANTILLA_CORREO_INVITACION).not.toMatch(/<[a-z]/i);
  });

  it('un cuerpo sin enlace no se genera', () => {
    expect(() => cuerpoInvitacion('')).toThrow(/PAYLOAD/);
    expect(() => cuerpoInvitacion('   ')).toThrow(/PAYLOAD/);
  });

  it('marcadoresProhibidos encuentra lo que busca', () => {
    expect(marcadoresProhibidos('hola {{nombre}} y {{PACIENTE}}')).toEqual([
      '{{nombre',
      '{{paciente',
    ]);
  });
});

describe('validarInvitacion', () => {
  it('acepta lo coherente y devuelve el correo normalizado', () => {
    const r = validarInvitacion(
      { email: ' Ana.Gomez@GMail.com ', rol: 'lector', pacientes: 'p_ana' },
      ROLES,
    );
    expect(r).toEqual({ ok: true, email: 'anagomez@gmail.com', rol: 'LECTOR', pacientes: 'p_ana' });
  });

  it('sin destinatario, no hay invitación', () => {
    expect(validarInvitacion({ rol: 'LECTOR' }, ROLES).ok).toBe(false);
    expect(validarInvitacion({ email: 'sin-arroba', rol: 'LECTOR' }, ROLES)).toEqual({
      ok: false,
      error: 'SIN_DESTINATARIO',
    });
  });

  it('un rol que no existe se rechaza', () => {
    expect(validarInvitacion({ email: 'a@b.com', rol: 'ADMIN' }, ROLES)).toEqual({
      ok: false,
      error: 'ROL_DESCONOCIDO',
    });
  });

  it('nadie reparte el rol de TITULAR', () => {
    // Hay uno, y es quien posee la hoja.
    expect(validarInvitacion({ email: 'a@b.com', rol: 'TITULAR' }, ROLES)).toEqual({
      ok: false,
      error: 'ROL_NO_ASIGNABLE',
    });
  });

  it('sin pacientes, cadena vacía y no undefined', () => {
    const r = validarInvitacion({ email: 'a@b.com', rol: 'LECTOR' }, ROLES);
    expect(r.ok && r.pacientes).toBe('');
  });

  it('se valida ANTES de generar el token y de enviar nada', () => {
    // No es una propiedad de esta función, es la razón de que exista: un correo
    // enviado no se puede retirar, y un token escrito en la hoja sin correo
    // enviado es una fila que nadie podrá usar nunca.
    expect(PROHIBIDO_EN_CORREO.length).toBeGreaterThan(0);
    expect(validarInvitacion({ email: '', rol: 'LECTOR' }, ROLES).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lo que pasa DE VERDAD al reabrir un enlace ya usado (medido el 2026-09-20)
// ─────────────────────────────────────────────────────────────────────────────

describe('una invitación ya canjeada', () => {
  /**
   * `ACEPTAR` vacía `token_hash`. Desde ese momento la fila **no se encuentra**
   * buscando por hash, que es como la busca `aceptarInvitacion`.
   *
   * Consecuencia: reabrir un enlace ya usado NO llega a `INVITACION_YA_USADA`.
   * Llega a `INVITACION_DESCONOCIDA`, porque para el backend esa invitación
   * dejó de existir. Se vio abriendo por segunda vez un enlace real.
   */
  it('deja la fila sin hash, así que ya no se puede encontrar', () => {
    const yaCanjeada = filaDe({ estado: 'ACTIVO', token_hash: '', token_expira: '' });
    expect(estadoInvitacion(yaCanjeada, AHORA)).toBe('ACEPTADA');

    // Pero la búsqueda por hash no la devuelve, así que a `validarAceptacion`
    // le llega `null` y responde DESCONOCIDA. Es el camino real.
    expect(
      validarAceptacion({
        fila: null,
        hashRecibido: HASH,
        emailAceptante: 'invitada@example.invalid',
        ahoraMs: AHORA,
      }),
    ).toEqual({ ok: false, error: 'INVITACION_DESCONOCIDA' });
  });

  it('YA_USADA solo se alcanza con la hoja editada a mano', () => {
    // Una fila ACTIVO que conserva su hash no la produce ninguna operación de
    // la API. El código se queda porque una hoja la puede editar una persona,
    // y entonces sí hay que rechazar; pero no es el camino que ve un usuario.
    const aMano = filaDe({ estado: 'ACTIVO', token_hash: HASH });
    expect(
      validarAceptacion({
        fila: aMano,
        hashRecibido: HASH,
        emailAceptante: 'invitada@example.invalid',
        ahoraMs: AHORA,
      }),
    ).toEqual({ ok: false, error: 'INVITACION_YA_USADA' });
  });
});
