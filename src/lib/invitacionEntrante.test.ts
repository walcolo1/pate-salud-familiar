import { describe, it, expect } from 'vitest';
import {
  CLAVE_SESION_FAMILIAR,
  MENSAJES,
  MENSAJE_DESCONOCIDO,
  MOTIVOS_PARAMETRO,
  cuerpoAceptacion,
  esUrlBackendValida,
  guardarBackend,
  interpretarRespuesta,
  leerBackend,
  leerParametros,
  mensajeDe,
  olvidarBackend,
  type AlmacenSimple,
} from './invitacionEntrante';
import { ERRORES_INVITACION, componerToken } from './invitaciones';

/**
 * `/invitacion` es la única ruta que recibe una URL de un desconocido y luego
 * le habla. Estas pruebas son, casi todas, sobre eso.
 */

const TOKEN = componerToken([
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
]);
const BACKEND = 'https://script.google.com/macros/s/AKfycbwFAKE0123456789abcdef/exec';

const params = (t?: string, backend?: string): URLSearchParams => {
  const p = new URLSearchParams();
  if (t !== undefined) p.set('t', t);
  if (backend !== undefined) p.set('backend', backend);
  return p;
};

/** Un `Storage` de mentira, para probar sin navegador. */
function almacen(inicial: Record<string, string> = {}): AlmacenSimple & { datos: Record<string, string> } {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => {
      datos[k] = v;
    },
    removeItem: (k) => {
      delete datos[k];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('esUrlBackendValida — la lista blanca de formas', () => {
  it('acepta un /exec de Apps Script', () => {
    expect(esUrlBackendValida(BACKEND)).toBe(true);
  });

  it('RECHAZA otro dominio, aunque la cadena esté dentro', () => {
    // El ataque que esta ruta tiene que parar: con un backend arbitrario, la
    // PWA mandaría el id_token del usuario a donde diga quien escribió el
    // enlace, con nuestra marca en la barra y la pantalla de Google de verdad.
    expect(esUrlBackendValida('https://malo.example/robar')).toBe(false);
    expect(esUrlBackendValida('https://script.google.com.malo.example/macros/s/AAAAAAAAAAAAAAAAAAAA/exec')).toBe(false);
    expect(esUrlBackendValida('https://malo.example/?x=https://script.google.com/macros/s/AAAAAAAAAAAAAAAAAAAA/exec')).toBe(false);
  });

  it('RECHAZA lo que no esté anclado por los dos extremos', () => {
    expect(esUrlBackendValida(BACKEND + '?redirect=https://malo.example')).toBe(false);
    expect(esUrlBackendValida(BACKEND + '#x')).toBe(false);
    expect(esUrlBackendValida(' prefijo ' + BACKEND)).toBe(false);
  });

  it('RECHAZA http, aunque el resto encaje', () => {
    expect(esUrlBackendValida(BACKEND.replace('https', 'http'))).toBe(false);
  });

  it('RECHAZA /dev: sirve la última versión guardada y pide sesión', () => {
    expect(esUrlBackendValida(BACKEND.replace('/exec', '/dev'))).toBe(false);
  });

  it('RECHAZA un identificador demasiado corto o con caracteres raros', () => {
    expect(esUrlBackendValida('https://script.google.com/macros/s/corto/exec')).toBe(false);
    expect(esUrlBackendValida('https://script.google.com/macros/s/AAAA..AAAA/../exec')).toBe(false);
  });

  it('RECHAZA lo que no es cadena', () => {
    expect(esUrlBackendValida(null)).toBe(false);
    expect(esUrlBackendValida(undefined)).toBe(false);
    expect(esUrlBackendValida(42)).toBe(false);
  });

  it('tolera espacios alrededor: los añaden los clientes de correo', () => {
    expect(esUrlBackendValida(`  ${BACKEND}  `)).toBe(true);
  });
});

describe('leerParametros', () => {
  it('con los dos parámetros buenos, los devuelve limpios', () => {
    expect(leerParametros(params(TOKEN, BACKEND))).toEqual({
      ok: true,
      token: TOKEN,
      backend: BACKEND,
    });
  });

  it('sin token', () => {
    expect(leerParametros(params(undefined, BACKEND))).toEqual({
      ok: false,
      motivo: 'FALTA_TOKEN',
    });
  });

  it('con un token que no tiene forma de token', () => {
    expect(leerParametros(params('abc', BACKEND))).toEqual({
      ok: false,
      motivo: 'TOKEN_MAL_FORMADO',
    });
  });

  it('sin backend', () => {
    expect(leerParametros(params(TOKEN))).toEqual({ ok: false, motivo: 'FALTA_BACKEND' });
  });

  it('con un backend que no es nuestro', () => {
    expect(leerParametros(params(TOKEN, 'https://malo.example/robar'))).toEqual({
      ok: false,
      motivo: 'BACKEND_NO_PERMITIDO',
    });
  });

  it('sin parámetros de ninguna clase', () => {
    expect(leerParametros(params()).ok).toBe(false);
    expect(leerParametros(null).ok).toBe(false);
    expect(leerParametros(undefined).ok).toBe(false);
  });

  it('devuelve UN motivo, no una lista', () => {
    // La pantalla enseña un mensaje. A quien abre un enlace roto no le sirve
    // saber que además el otro parámetro tampoco valía.
    const r = leerParametros(params('x', 'y'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(MOTIVOS_PARAMETRO).toContain(r.motivo);
  });

  it('el token se valida con la MISMA función que el backend', () => {
    // Si la PWA aceptara formas que el servidor rechaza, o al revés, el
    // usuario vería un error distinto según por dónde entrara.
    const casiBueno = TOKEN.slice(0, -1) + 'Z'; // mayúscula: no es hexadecimal
    expect(leerParametros(params(casiBueno, BACKEND)).ok).toBe(false);
  });
});

describe('los mensajes no filtran nada', () => {
  const todos = [...Object.values(MENSAJES), MENSAJE_DESCONOCIDO];

  it('ninguno lleva una dirección de correo', () => {
    // El de la cuenta equivocada es el que más tienta: sería cómodo escribir
    // «esta invitación es para ana@…», y sería contarle a quien tenga el
    // enlace quién está en esta familia.
    for (const m of todos) {
      expect(`${m.titulo} ${m.cuerpo}`).not.toMatch(/[^@\s]+@[^@\s]+\.[a-z]{2,}/i);
    }
  });

  it('ninguno dice de quién era la invitación ni a qué familia', () => {
    for (const m of todos) {
      expect(m.cuerpo.toLowerCase()).not.toMatch(/\bes para\b|\bpertenece a\b|\benviada a [a-z]/);
    }
  });

  it('todos dicen qué hacer ahora', () => {
    // Un error que no propone un siguiente paso es un callejón sin salida, y
    // en una pantalla de alta es el punto exacto donde la gente abandona.
    for (const m of todos) {
      expect(m.cuerpo.length, m.titulo).toBeGreaterThan(40);
      expect(
        // `píde` con tilde también cuenta: es la forma que sale en un mensaje
        // que se dirige a la persona («pídele a quien te invitó»).
        /p[ií]de|prueba|vuelve|cambia|comprueba|espera|inicia|habla/i.test(m.cuerpo),
        m.titulo,
      ).toBe(true);
    }
  });

  it('ninguno echa la culpa a quien lo lee', () => {
    for (const m of todos) {
      expect(`${m.titulo} ${m.cuerpo}`.toLowerCase()).not.toMatch(/has hecho mal|error tuyo|no deberías/);
    }
  });

  it('hay un mensaje para CADA código que el backend puede devolver', () => {
    // El trinquete: si E7 añade un código y nadie escribe su mensaje, esta se
    // pone roja antes de que un usuario vea el texto genérico.
    for (const codigo of ERRORES_INVITACION) {
      expect(Object.keys(MENSAJES), codigo).toContain(codigo);
    }
  });

  it('y para cada motivo de parámetro', () => {
    for (const motivo of MOTIVOS_PARAMETRO) {
      expect(Object.keys(MENSAJES), motivo).toContain(motivo);
    }
  });

  it('un código inesperado no rompe nada ni inventa', () => {
    expect(mensajeDe('ALGO_QUE_NO_EXISTE')).toEqual(MENSAJE_DESCONOCIDO);
    expect(mensajeDe(undefined)).toEqual(MENSAJE_DESCONOCIDO);
    expect(mensajeDe(null)).toEqual(MENSAJE_DESCONOCIDO);
  });

  it('un código que hereda de Object no se confunde con un mensaje', () => {
    expect(mensajeDe('constructor')).toEqual(MENSAJE_DESCONOCIDO);
    expect(mensajeDe('__proto__')).toEqual(MENSAJE_DESCONOCIDO);
  });

  it('solo se ofrece reintentar cuando reintentar puede servir de algo', () => {
    // Un botón de «volver a intentar» sobre una invitación caducada es una
    // promesa falsa.
    expect(MENSAJES.INVITACION_EXPIRADA.reintentable).toBe(false);
    expect(MENSAJES.INVITACION_YA_USADA.reintentable).toBe(false);
    expect(MENSAJES.BACKEND_NO_PERMITIDO.reintentable).toBe(false);
    expect(MENSAJES.INVITACION_DESTINATARIO_INVALIDO.reintentable).toBe(true);
    expect(MENSAJES.ERROR_CERROJO.reintentable).toBe(true);
  });
});

describe('cuerpoAceptacion', () => {
  it('manda exactamente lo que el router espera', () => {
    expect(JSON.parse(cuerpoAceptacion('id.token.firma', TOKEN))).toEqual({
      idToken: 'id.token.firma',
      accion: 'aceptarInvitacion',
      payload: { t: TOKEN },
    });
  });
});

describe('interpretarRespuesta', () => {
  it('ok:true es una aceptación', () => {
    expect(interpretarRespuesta({ ok: true, data: { aceptada: true } })).toEqual({
      estado: 'ACEPTADA',
    });
  });

  it('ok:false lleva el mensaje de su código', () => {
    const r = interpretarRespuesta({ ok: false, error: 'INVITACION_EXPIRADA' });
    expect(r).toEqual({ estado: 'RECHAZADA', mensaje: MENSAJES.INVITACION_EXPIRADA });
  });

  it('lo que no se entiende NO es un éxito', () => {
    // El fallo clásico de estas pantallas: comprobar `!error` en vez de
    // `ok === true` deja pasar un HTML de error, una redirección o un cuerpo
    // vacío como si fueran una bienvenida.
    expect(interpretarRespuesta(null).estado).toBe('RECHAZADA');
    expect(interpretarRespuesta({}).estado).toBe('RECHAZADA');
    expect(interpretarRespuesta({ ok: 'true' } as never).estado).toBe('RECHAZADA');
    expect(interpretarRespuesta({ data: { aceptada: true } }).estado).toBe('RECHAZADA');
  });
});

describe('la sesión familiar', () => {
  it('guarda la dirección y la recupera', () => {
    const a = almacen();
    expect(guardarBackend(BACKEND, a)).toBe(true);
    expect(a.datos[CLAVE_SESION_FAMILIAR]).toBe(BACKEND);
    expect(leerBackend(a)).toBe(BACKEND);
  });

  it('NO guarda una dirección que no aceptamos', () => {
    const a = almacen();
    expect(guardarBackend('https://malo.example/robar', a)).toBe(false);
    expect(a.datos[CLAVE_SESION_FAMILIAR]).toBeUndefined();
  });

  it('y tampoco la lee si apareciera guardada', () => {
    // El almacenamiento local lo puede escribir cualquier extensión. Validar
    // solo al guardar convertiría ese almacén en una forma de saltarse la
    // validación de la URL.
    const a = almacen({ [CLAVE_SESION_FAMILIAR]: 'https://malo.example/robar' });
    expect(leerBackend(a)).toBeNull();
  });

  it('sin almacén no se rompe: modo privado, cuota llena, bloqueado', () => {
    expect(guardarBackend(BACKEND, null)).toBe(false);
    expect(leerBackend(null)).toBeNull();
    expect(() => olvidarBackend(null)).not.toThrow();
  });

  it('un almacén que lanza al escribir no tumba el alta', () => {
    const roto: AlmacenSimple = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(guardarBackend(BACKEND, roto)).toBe(false);
    expect(leerBackend(roto)).toBeNull();
    expect(() => olvidarBackend(roto)).not.toThrow();
  });

  it('olvidar borra', () => {
    const a = almacen({ [CLAVE_SESION_FAMILIAR]: BACKEND });
    olvidarBackend(a);
    expect(leerBackend(a)).toBeNull();
  });

  it('la clave está versionada', () => {
    // Cambiar la forma de lo guardado sin cambiar la clave deja a los
    // navegadores que ya tienen datos leyendo algo que ya no entienden.
    expect(CLAVE_SESION_FAMILIAR).toMatch(/:v\d+$/);
  });
});
