import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

/**
 * El Service Worker, ejecutado de verdad.
 *
 * La validación en vivo de G4b vio esto en consola al navegar:
 *
 *   The FetchEvent for ".../appts" resulted in a network error response:
 *   the promise was rejected.
 *   Uncaught (in promise) TypeError: Failed to convert value to 'Response'.
 *
 * `respondWith` exige una `Response`. Cuando la red fallaba y no había copia
 * en caché, el manejador devolvía `undefined`, y el navegador lo convertía en
 * ese error. Aquí se carga `public/sw.js` tal cual, con un `self`, unas cachés
 * y un `fetch` de mentira, y se comprueba que **toda salida es una Response**.
 *
 * Y se fija lo que el SW NO hace, que es lo que se preguntó: **no toca las
 * peticiones al router**. Son `POST` y de otro origen.
 */

type Manejador = (evento: {
  request: Request;
  respondWith: (p: Promise<unknown> | unknown) => void;
}) => void;

function cargarSw(opciones: { red: 'ok' | 'falla'; enCache?: Record<string, Response> }) {
  const oyentes: Record<string, Manejador> = {};
  const cache = new Map(Object.entries(opciones.enCache ?? {}));

  const self = {
    location: { origin: 'https://pate.example' },
    addEventListener: (tipo: string, fn: Manejador) => {
      oyentes[tipo] = fn;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [], openWindow: async () => null },
    registration: { showNotification: async () => {} },
  };

  const contexto = {
    self,
    caches: {
      match: async (r: Request | string) => cache.get(typeof r === 'string' ? r : new URL(r.url).pathname),
      open: async () => ({ put: async () => {}, addAll: async () => {} }),
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => {
      if (opciones.red === 'falla') throw new TypeError('Failed to fetch');
      return new Response('red', { status: 200 });
    },
    Response,
    Request,
    URL,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise,
  };

  runInNewContext(readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8'), contexto);
  return oyentes.fetch;
}

/** Lanza un fetch contra el SW y devuelve lo que entregó a `respondWith`. */
async function pedir(manejador: Manejador, request: Request): Promise<{ atendio: boolean; valor: unknown }> {
  let entregado: unknown = undefined;
  let atendio = false;
  manejador({
    request,
    respondWith: (p) => {
      atendio = true;
      entregado = p;
    },
  });
  return { atendio, valor: atendio ? await entregado : undefined };
}

const navegacion = (ruta: string) =>
  new Request(`https://pate.example${ruta}`, { headers: { accept: 'text/html' } });

describe('toda salida del SW es una Response', () => {
  it('sin red y sin copia de la página, NO devuelve undefined', async () => {
    // El caso exacto de la consola.
    const sw = cargarSw({ red: 'falla' });
    const { atendio, valor } = await pedir(sw, navegacion('/members/x/appts'));

    expect(atendio).toBe(true);
    expect(valor, 'respondWith recibió algo que no es una Response').toBeInstanceOf(Response);
  });

  it('sin red y sin copia de un recurso que no es HTML, tampoco', async () => {
    const sw = cargarSw({ red: 'falla' });
    const { valor } = await pedir(sw, new Request('https://pate.example/_next/static/x.js'));
    expect(valor).toBeInstanceOf(Response);
  });

  it('sin red y CON la portada en caché, sirve la portada', async () => {
    const portada = new Response('<html>portada</html>', { status: 200 });
    const sw = cargarSw({ red: 'falla', enCache: { '/': portada } });
    const { valor } = await pedir(sw, navegacion('/members/x/appts'));
    expect(await (valor as Response).text()).toContain('portada');
  });

  it('con red, contesta la red', async () => {
    const sw = cargarSw({ red: 'ok' });
    const { valor } = await pedir(sw, navegacion('/dashboard'));
    expect(await (valor as Response).text()).toBe('red');
  });
});

describe('lo que el SW no toca', () => {
  it('las escrituras al router: POST y de otro origen', async () => {
    // La pregunta de la validación en vivo. La respuesta es no, y esto la fija.
    const sw = cargarSw({ red: 'ok' });
    const { atendio } = await pedir(
      sw,
      new Request('https://script.google.com/macros/s/AKfyc/exec', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(atendio).toBe(false);
  });

  it('ni siquiera un GET a otro origen', async () => {
    const sw = cargarSw({ red: 'ok' });
    const { atendio } = await pedir(sw, new Request('https://accounts.google.com/gsi/client'));
    expect(atendio).toBe(false);
  });
});
