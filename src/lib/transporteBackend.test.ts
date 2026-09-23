import { describe, it, expect, vi } from 'vitest';
import {
  CODIGOS_REINTENTABLES,
  ErrorBackend,
  FALLO_TRANSPORTE,
  aplicar,
  obtenerRevision,
  pedir,
  urlDeLaHoja,
  type ContextoTransporte,
} from './transporteBackend';

/**
 * El transporte, probado sin red y sin despliegue.
 *
 * Lo que se comprueba aquí no es que la petición llegue —eso lo validó E6-live
 * contra Google— sino lo otro: qué hace esta capa con lo que vuelve. Es donde
 * se decide si un HTML de sesión caducada pasa por un guardado correcto.
 */

const URL_BUENA = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';

function contextoCon(respuesta: unknown, opciones: { estado?: number; crudo?: string } = {}) {
  const espia = vi.fn(async () => ({
    ok: (opciones.estado ?? 200) < 400,
    status: opciones.estado ?? 200,
    json: async () => {
      if (opciones.crudo !== undefined) throw new Error('no es JSON');
      return respuesta;
    },
  })) as unknown as typeof globalThis.fetch;

  const contexto: ContextoTransporte = { url: URL_BUENA, idToken: 'id.token.firma', fetch: espia };
  return { contexto, espia: espia as unknown as ReturnType<typeof vi.fn> };
}

describe('pedir · lo que manda', () => {
  it('manda idToken, accion y payload al /exec', async () => {
    const { contexto, espia } = contextoCon({ ok: true, data: { x: 1 } });
    await pedir(contexto, 'consultar', { tabla: 'CITAS' });

    const [url, opciones] = espia.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_BUENA);
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(String(opciones.body))).toEqual({
      idToken: 'id.token.firma',
      accion: 'consultar',
      payload: { tabla: 'CITAS' },
    });
  });

  it('sin payload, el campo no aparece', async () => {
    const { contexto, espia } = contextoCon({ ok: true, data: {} });
    await pedir(contexto, 'obtenerRevision');
    const cuerpo = JSON.parse(String((espia.mock.calls[0] as [string, RequestInit])[1].body));
    expect(Object.keys(cuerpo)).toEqual(['idToken', 'accion']);
  });

  it('va como text/plain, que es lo que E0-bis dejó medido', async () => {
    const { contexto, espia } = contextoCon({ ok: true, data: {} });
    await pedir(contexto, 'ping');
    const cabeceras = (espia.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(cabeceras['Content-Type']).toMatch(/text\/plain/);
  });
});

describe('pedir · lo que NO manda', () => {
  it('una URL que no es un /exec no se llama siquiera', async () => {
    // La dirección sale del almacenamiento local, y eso lo puede escribir
    // cualquier extensión del navegador.
    const { espia } = contextoCon({ ok: true });
    const malo: ContextoTransporte = {
      url: 'https://malo.example/robar',
      idToken: 'x',
      fetch: espia as unknown as typeof globalThis.fetch,
    };
    await expect(pedir(malo, 'consultar')).rejects.toThrow(ErrorBackend);
    expect(espia).not.toHaveBeenCalled();
  });

  it('sin token tampoco se gasta una llamada', async () => {
    const { espia } = contextoCon({ ok: true });
    const sinToken: ContextoTransporte = {
      url: URL_BUENA,
      idToken: '',
      fetch: espia as unknown as typeof globalThis.fetch,
    };
    await expect(pedir(sinToken, 'consultar')).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
    expect(espia).not.toHaveBeenCalled();
  });
});

describe('pedir · lo que hace con la respuesta', () => {
  it('ok:true devuelve el data', async () => {
    const { contexto } = contextoCon({ ok: true, data: { filas: [1, 2] } });
    await expect(pedir(contexto, 'consultar')).resolves.toEqual({ filas: [1, 2] });
  });

  it('ok:false lanza con SU código, no con uno genérico', async () => {
    // El código es lo que permite a quien llama decidir: reintentar, avisar o
    // rendirse. Aplanarlos todos a «falló» quita esa decisión.
    const { contexto } = contextoCon({ ok: false, error: 'PERMISO_INSUFICIENTE' });
    await expect(pedir(contexto, 'aplicar')).rejects.toMatchObject({
      codigo: 'PERMISO_INSUFICIENTE',
    });
  });

  it('una respuesta que NO se entiende no es un éxito', async () => {
    // Mirar `!error` en vez de `ok === true` dejaría pasar esto como un
    // guardado correcto, y el fallo aparecería cuando alguien buscara el dato.
    for (const cuerpo of [{}, { data: { x: 1 } }, { ok: 'true' }, null]) {
      const { contexto } = contextoCon(cuerpo);
      await expect(pedir(contexto, 'aplicar'), JSON.stringify(cuerpo)).rejects.toThrow();
    }
  });

  it('un HTML de sesión caducada tampoco', async () => {
    const { contexto } = contextoCon(undefined, { crudo: '<html>Iniciar sesión</html>' });
    await expect(pedir(contexto, 'aplicar')).rejects.toMatchObject({ codigo: FALLO_TRANSPORTE });
  });

  it('un HTTP que no es 200 se distingue de un rechazo del router', async () => {
    const { contexto } = contextoCon({ ok: false, error: 'X' }, { estado: 500 });
    await expect(pedir(contexto, 'aplicar')).rejects.toMatchObject({ codigo: FALLO_TRANSPORTE });
  });

  it('un fetch que lanza es transporte, no una respuesta', async () => {
    const contexto: ContextoTransporte = {
      url: URL_BUENA,
      idToken: 'x',
      fetch: (async () => {
        throw new Error('Failed to fetch');
      }) as unknown as typeof globalThis.fetch,
    };
    await expect(pedir(contexto, 'aplicar')).rejects.toMatchObject({ codigo: FALLO_TRANSPORTE });
  });
});

describe('qué se puede reintentar', () => {
  it('el cerrojo y los fallos de red, sí', () => {
    expect(new ErrorBackend('ERROR_CERROJO').reintentable).toBe(true);
    expect(new ErrorBackend(FALLO_TRANSPORTE).reintentable).toBe(true);
  });

  it('un permiso o un acceso denegado, NO', () => {
    // Reintentar un rechazo de permiso es gastar cuota para que te digan lo
    // mismo. Y para el usuario, es una espera que no lleva a ninguna parte.
    expect(new ErrorBackend('PERMISO_INSUFICIENTE').reintentable).toBe(false);
    expect(new ErrorBackend('ACCESO_DENEGADO').reintentable).toBe(false);
    expect(new ErrorBackend('TOKEN_INVALIDO').reintentable).toBe(false);
  });

  it('la lista de reintentables no incluye ningún rechazo de autorización', () => {
    for (const codigo of CODIGOS_REINTENTABLES) {
      expect(codigo).not.toMatch(/PERMISO|ACCESO|TOKEN|INVITACION/);
    }
  });

  it('el mensaje lleva el código, para que sirva en un registro', () => {
    expect(new ErrorBackend('ERROR_CERROJO', 'ocupado').message).toContain('ERROR_CERROJO');
  });
});

describe('aplicar', () => {
  it('manda el lote entero en una sola petición', async () => {
    // El router valida todas las mutaciones antes de escribir ninguna: un lote
    // se acepta o se rechaza, nunca se queda a medias por permisos. Partirlo
    // en varias peticiones perdería esa garantía.
    const { contexto, espia } = contextoCon({ ok: true, data: { aplicadas: 2, revision: 7 } });
    const resultado = await aplicar(contexto, [
      { tabla: 'CITAS', fila: { id: 'c1' } },
      { tabla: 'VACUNAS', fila: { id: 'v1' } },
    ]);

    expect(espia).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ aplicadas: 2, revision: 7 });
    const cuerpo = JSON.parse(String((espia.mock.calls[0] as [string, RequestInit])[1].body));
    expect(cuerpo.payload.mutaciones).toHaveLength(2);
  });

  it('un lote vacío NO sale a la red', async () => {
    // Un guardado sin cambios no puede costar una ejecución del script. Con el
    // sondeo de G2 por delante, esas llamadas de más se acumulan.
    const { contexto, espia } = contextoCon({ ok: true, data: {} });
    await expect(aplicar(contexto, [])).resolves.toEqual({ aplicadas: 0, revision: 0 });
    expect(espia).not.toHaveBeenCalled();
  });
});

describe('obtenerRevision', () => {
  it('devuelve el número', async () => {
    const { contexto } = contextoCon({ ok: true, data: { revision: 12 } });
    await expect(obtenerRevision(contexto)).resolves.toBe(12);
  });

  it('una revisión ilegible cuenta como 0, que fuerza a recargar', async () => {
    // Al revés —dar por buena una revisión que no se entiende— dejaría al
    // cliente creyendo que está al día cuando no lo sabe.
    for (const data of [{}, { revision: 'x' }, { revision: -1 }, { revision: null }]) {
      const { contexto } = contextoCon({ ok: true, data });
      await expect(obtenerRevision(contexto), JSON.stringify(data)).resolves.toBe(0);
    }
  });
});

describe('urlDeLaHoja · el botón de Ajustes abre la hoja del Web App', () => {
  const HOJA = 'https://docs.google.com/spreadsheets/d/1HojaSinteticaDePruebas0123456789abcdef/edit';

  it('pide verHoja y devuelve la dirección', async () => {
    const { contexto, espia } = contextoCon({ ok: true, data: { url: HOJA } });
    expect(await urlDeLaHoja(contexto)).toBe(HOJA);
    expect(JSON.parse(String((espia.mock.calls[0] as [string, RequestInit])[1].body)).accion).toBe('verHoja');
  });

  it('rechaza lo que no sea una hoja de Google', async () => {
    // Lo que vuelve se abre en una pestaña: un despliegue manipulado no puede
    // mandar a nadie a otra parte con el sello de la aplicación.
    for (const mala of [
      'https://docs.google.com.evil.test/spreadsheets/d/x/edit',
      'http://docs.google.com/spreadsheets/d/abc/edit',
      'javascript:alert(1)',
      'https://docs.google.com/document/d/abc/edit',
      '',
      undefined,
    ]) {
      const { contexto } = contextoCon({ ok: true, data: { url: mala } });
      await expect(urlDeLaHoja(contexto), String(mala)).rejects.toMatchObject({ codigo: FALLO_TRANSPORTE });
    }
  });

  it('un despliegue anterior contesta ACCION_DESCONOCIDA, y se deja pasar tal cual', async () => {
    const { contexto } = contextoCon({ ok: false, error: 'ACCION_DESCONOCIDA' });
    await expect(urlDeLaHoja(contexto)).rejects.toMatchObject({ codigo: 'ACCION_DESCONOCIDA' });
  });
});
