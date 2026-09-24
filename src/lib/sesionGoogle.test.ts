import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARGEN_RENOVACION_MS,
  SesionGoogle,
  expiracionDe,
  tokenFalsoParaPruebas,
} from './sesionGoogle';

/**
 * G3 · la identidad, probada sin Google.
 *
 * El `id_token` dura una hora y **el navegador no tiene forma de renovarlo por
 * su cuenta**: Google Identity Services no expone un refresco programático
 * —lo más parecido es volver a pedir la credencial, que puede enseñar interfaz
 * o no funcionar—. Ver `G3-IDENTIDAD.md`.
 *
 * Así que lo que hay que probar aquí no es el refresco, que es de Google, sino
 * **qué hace esta capa alrededor**: cuándo lo intenta, qué devuelve mientras
 * tanto, y sobre todo qué pasa cuando falla. Esa última parte es la que decide
 * si a alguien se le corta la sesión a media consulta.
 */

const HORA = 60 * 60 * 1000;

function banco(opciones: { renovaciones?: (string | null)[]; falla?: boolean } = {}) {
  let ahora = 1_000_000;
  const cola = [...(opciones.renovaciones ?? [])];
  const avisos: number[] = [];

  const renovar = vi.fn(async () => {
    if (opciones.falla) throw new Error('interaction_required');
    return cola.length > 0 ? (cola.shift() as string | null) : tokenFalsoParaPruebas(ahora + HORA);
  });

  const sesion = new SesionGoogle({
    renovar,
    ahora: () => ahora,
    pedirEntrarDeNuevo: () => avisos.push(ahora),
    registrarFallo: () => {},
  });

  return {
    sesion,
    renovar,
    avisos,
    avanzar: (ms: number) => {
      ahora += ms;
    },
    get ahora() {
      return ahora;
    },
    nuevoToken: (dentroDeMs: number) => tokenFalsoParaPruebas(ahora + dentroDeMs),
  };
}

describe('expiracionDe', () => {
  it('lee el `exp` del token y lo devuelve en milisegundos', () => {
    const token = tokenFalsoParaPruebas(1_700_000_000_000);
    // El `exp` de un JWT va en segundos; usarlo como milisegundos daría una
    // caducidad en 1970 y una renovación en bucle.
    expect(expiracionDe(token)).toBe(1_700_000_000_000);
  });

  it('un token que no se entiende no tiene caducidad, y eso no revienta', () => {
    for (const malo of ['', 'no-es-un-jwt', 'a.b', 'a.@@@.c', null, undefined]) {
      expect(expiracionDe(malo as unknown as string), String(malo)).toBe(null);
    }
  });

  it('un token sin `exp` tampoco', () => {
    const sinExp = ['x', btoa(JSON.stringify({ sub: '1' })), 'y'].join('.');
    expect(expiracionDe(sinExp)).toBe(null);
  });
});

describe('el margen', () => {
  it('son diez minutos: se renueva a los 50 de una hora', () => {
    expect(MARGEN_RENOVACION_MS).toBe(10 * 60 * 1000);
  });
});

describe('mientras el token está fresco', () => {
  it('lo devuelve sin molestar a Google', async () => {
    const b = banco();
    const token = b.nuevoToken(HORA);
    b.sesion.recibir(token);

    await expect(b.sesion.idToken()).resolves.toBe(token);
    b.avanzar(HORA - MARGEN_RENOVACION_MS - 1_000);
    await expect(b.sesion.idToken()).resolves.toBe(token);
    expect(b.renovar).not.toHaveBeenCalled();
  });

  it('sin token no se inventa ninguno', async () => {
    // Quien no ha entrado no tiene sesión, y pedir una renovación aquí
    // enseñaría un diálogo de Google a alguien que solo abrió la aplicación.
    const b = banco();
    await expect(b.sesion.idToken()).resolves.toBe(null);
    expect(b.renovar).not.toHaveBeenCalled();
  });
});

describe('cuando entra en el margen', () => {
  it('renueva, y devuelve el nuevo', async () => {
    const b = banco();
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA - MARGEN_RENOVACION_MS + 1_000);

    const nuevo = await b.sesion.idToken();
    expect(b.renovar).toHaveBeenCalledTimes(1);
    expect(nuevo).not.toBe(null);
    expect(expiracionDe(nuevo as string)).toBeGreaterThan(b.ahora);
  });

  it('dos peticiones a la vez son UNA renovación', async () => {
    // Cada renovación puede ser un diálogo de Google. Dos a la vez es la peor
    // manera de enterarse de que la sesión iba a caducar.
    const b = banco();
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA - MARGEN_RENOVACION_MS + 1_000);

    await Promise.all([b.sesion.idToken(), b.sesion.idToken(), b.sesion.idToken()]);
    expect(b.renovar).toHaveBeenCalledTimes(1);
  });

  it('si la renovación falla pero el token AÚN sirve, se sigue con el viejo', async () => {
    // Es la decisión que evita cortar sesiones sin necesidad: a los 50 minutos
    // quedan diez de token bueno. Rendirse ahí echaría a alguien de una
    // consulta a medio escribir por un fallo de red pasajero.
    const b = banco({ falla: true });
    const viejo = b.nuevoToken(HORA);
    b.sesion.recibir(viejo);
    b.avanzar(HORA - MARGEN_RENOVACION_MS + 1_000);

    await expect(b.sesion.idToken()).resolves.toBe(viejo);
    expect(b.avisos).toEqual([]);
  });

  it('y se vuelve a intentar en la siguiente petición', async () => {
    const b = banco({ falla: true });
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA - MARGEN_RENOVACION_MS + 1_000);

    await b.sesion.idToken();
    await b.sesion.idToken();
    expect(b.renovar).toHaveBeenCalledTimes(2);
  });
});

describe('cuando ya caducó', () => {
  it('no se devuelve un token muerto', async () => {
    // Mandarlo sería gastar una petición para que el router conteste
    // `TOKEN_INVALIDO`, y el usuario vería un error en vez de una sesión.
    const b = banco({ falla: true });
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA + 1_000);

    await expect(b.sesion.idToken()).resolves.toBe(null);
  });

  it('y se pide entrar de nuevo, UNA vez', async () => {
    // Un aviso por petición fallida serían cinco diálogos seguidos.
    const b = banco({ falla: true });
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA + 1_000);

    await b.sesion.idToken();
    await b.sesion.idToken();
    await b.sesion.idToken();
    expect(b.avisos).toHaveLength(1);
  });

  it('una renovación que devuelve un token ya caducado no cuenta', async () => {
    // GIS puede contestar con la credencial que ya tenía. Darla por buena
    // dejaría una sesión que se cree viva y un bucle de renovaciones que no
    // renuevan nada.
    const b = banco({ renovaciones: [tokenFalsoParaPruebas(1_000_000 - 1)] });
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA + 1_000);

    await expect(b.sesion.idToken()).resolves.toBe(null);
    expect(b.renovar).toHaveBeenCalledTimes(1);
    expect(b.avisos).toHaveLength(1);
  });

  it('y una renovación que devuelve null tampoco', async () => {
    const b = banco({ renovaciones: [null] });
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA + 1_000);
    await expect(b.sesion.idToken()).resolves.toBe(null);
  });

  it('recibir un token nuevo vuelve a abrir la sesión y rearma el aviso', async () => {
    const b = banco({ falla: true });
    b.sesion.recibir(b.nuevoToken(HORA));
    b.avanzar(HORA + 1_000);
    await b.sesion.idToken();
    expect(b.avisos).toHaveLength(1);

    b.sesion.recibir(b.nuevoToken(HORA));
    await expect(b.sesion.idToken()).resolves.not.toBe(null);

    b.avanzar(HORA + 1_000);
    await b.sesion.idToken();
    expect(b.avisos).toHaveLength(2);
  });
});

describe('olvidar', () => {
  it('deja la sesión sin token y sin avisar a nadie', async () => {
    // Cerrar sesión no es una caducidad: pedir entrar de nuevo justo después
    // de salir sería pelearse con quien acaba de irse a propósito.
    const b = banco();
    b.sesion.recibir(b.nuevoToken(HORA));
    b.sesion.olvidar();

    await expect(b.sesion.idToken()).resolves.toBe(null);
    expect(b.avisos).toEqual([]);
    expect(b.renovar).not.toHaveBeenCalled();
  });
});

describe('lo que NUNCA hace', () => {
  /**
   * El código, sin comentarios.
   *
   * Sin desnudar, esta comprobación la rompería el propio comentario que
   * explica por qué el token no va a `localStorage` — y la salida fácil sería
   * borrar la explicación.
   */
  const CODIGO = readFileSync(join(process.cwd(), 'src', 'lib', 'sesionGoogle.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');

  it('no guarda el token en ningún almacén del navegador', () => {
    // Es una credencial: en `localStorage` la lee cualquier extensión. Vive en
    // memoria del módulo y se pierde al recargar, que es lo que se quiere.
    expect(CODIGO).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it('no escribe el token en la consola', () => {
    expect(CODIGO).not.toMatch(/console\.(log|info|debug|warn)/);
  });
});

describe('avisar de que llegó una credencial', () => {
  // Lo necesita la carga al entrar: tras un F5, la credencial de GIS llega
  // segundos después de montar, y quien quiere cargar el expediente tiene que
  // enterarse en ese momento, no adivinarlo con un temporizador.
  it('avisa a quien escucha cuando llega una credencial válida', () => {
    const b = banco();
    const oyente = vi.fn();
    b.sesion.alRecibir(oyente);
    b.sesion.recibir(b.nuevoToken(HORA));
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('no avisa de una credencial que no sirve', () => {
    const b = banco();
    const oyente = vi.fn();
    b.sesion.alRecibir(oyente);
    b.sesion.recibir('no-es-un-token');
    b.sesion.recibir(null);
    expect(oyente).not.toHaveBeenCalled();
  });

  it('avisa también de las renovaciones silenciosas', async () => {
    const b = banco();
    b.sesion.recibir(b.nuevoToken(5 * 60 * 1000)); // a punto de caducar
    const oyente = vi.fn();
    b.sesion.alRecibir(oyente);
    await b.sesion.idToken();
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('se puede dejar de escuchar, y un oyente que falla no rompe la sesión', () => {
    const b = banco();
    const baja = b.sesion.alRecibir(() => {
      throw new Error('oyente roto');
    });
    expect(() => b.sesion.recibir(b.nuevoToken(HORA))).not.toThrow();
    expect(b.sesion.vigente).toBe(true);

    const oyente = vi.fn();
    const bajaOyente = b.sesion.alRecibir(oyente);
    baja();
    bajaOyente();
    b.sesion.recibir(b.nuevoToken(HORA));
    expect(oyente).not.toHaveBeenCalled();
  });
});
