import { describe, it, expect, vi } from 'vitest';
import { ESPERA_RENOVACION_MS, ProveedorGis, type ApiGis } from './gis';

/**
 * G3b · el propietario único de Google Identity Services.
 *
 * `google.accounts.id.initialize` es **global y tiene un solo dueño**: quien la
 * llama se queda con la devolución de llamada. Hoy la llamaban dos sitios
 * —`/login` y `/invitacion`—, y la renovación habría sido un tercero.
 *
 * El fallo que eso provoca no se ve: **no hay error**. El último en
 * inicializar se queda las credenciales y al anterior sencillamente deja de
 * llamársele. Por eso lo que más se prueba aquí es que se inicialice **una
 * vez** y que la credencial llegue **a todos**.
 */

function apiFalsa() {
  const llamadas = { initialize: 0, prompt: 0, renderButton: 0, disableAutoSelect: 0 };
  let devolucion: ((r: { credential: string }) => void) | null = null;

  const api: ApiGis = {
    accounts: {
      id: {
        initialize: (opciones) => {
          llamadas.initialize++;
          devolucion = opciones.callback;
        },
        renderButton: () => {
          llamadas.renderButton++;
        },
        prompt: () => {
          llamadas.prompt++;
        },
        disableAutoSelect: () => {
          llamadas.disableAutoSelect++;
        },
      },
    },
  };

  return {
    api,
    llamadas,
    /** Google contesta con una credencial. */
    responder: (credential: string) => devolucion?.({ credential }),
    get inicializada() {
      return devolucion !== null;
    },
  };
}

/** Un reloj de temporizadores que avanzo yo. */
function reloj() {
  const pendientes = new Map<number, () => void>();
  let siguiente = 1;
  return {
    programar: (fn: () => void) => {
      const id = siguiente++;
      pendientes.set(id, fn);
      return id;
    },
    cancelar: (id: unknown) => pendientes.delete(id as number),
    vencer: () => {
      const tareas = [...pendientes.values()];
      pendientes.clear();
      tareas.forEach((fn) => fn());
    },
    get vivos() {
      return pendientes.size;
    },
  };
}

function banco() {
  const g = apiFalsa();
  const t = reloj();
  const proveedor = new ProveedorGis(g.api, {
    clientId: 'cliente-de-pruebas.apps.googleusercontent.com',
    programar: t.programar,
    cancelar: t.cancelar,
  });
  return { ...g, reloj: t, proveedor };
}

const asentar = () => new Promise<void>((r) => setTimeout(r, 0));

describe('una sola inicialización', () => {
  it('por muchas veces que se pida', () => {
    // Cada `initialize` de más le quita la devolución de llamada al anterior.
    const b = banco();
    b.proveedor.inicializar();
    b.proveedor.inicializar();
    b.proveedor.inicializar();
    expect(b.llamadas.initialize).toBe(1);
  });

  it('dibujar un botón inicializa primero si hacía falta', () => {
    // `/login` dibuja el botón; no tiene por qué saber si alguien inicializó
    // antes. Si `renderButton` llegara primero, GIS no tendría a quién avisar.
    const b = banco();
    b.proveedor.renderizarBoton({} as HTMLElement);
    expect(b.llamadas.initialize).toBe(1);
    expect(b.llamadas.renderButton).toBe(1);
  });

  it('pide reentrada automática, que es como sobrevive a un F5', () => {
    // Decisión aprobada: la sesión vive en memoria y quien la devuelve al
    // recargar es `auto_select`. Sin esto, cada recarga sería un login a mano.
    const b = banco();
    let recibido: Record<string, unknown> = {};
    const api: ApiGis = {
      accounts: {
        id: {
          initialize: (o) => {
            recibido = o as unknown as Record<string, unknown>;
          },
          renderButton: () => {},
          prompt: () => {},
          disableAutoSelect: () => {},
        },
      },
    };
    new ProveedorGis(api, { clientId: 'x' }).inicializar();

    expect(recibido.auto_select).toBe(true);
    expect(recibido.client_id).toBe('x');
  });
});

describe('la invitación no puede entrar sola', () => {
  /** Lo que se le pasó a `initialize`, más las llamadas sueltas. */
  function espiarInicializacion() {
    let recibido: Record<string, unknown> = {};
    const llamadas = { disableAutoSelect: 0 };
    const api: ApiGis = {
      accounts: {
        id: {
          initialize: (o) => {
            recibido = o as unknown as Record<string, unknown>;
          },
          renderButton: () => {},
          prompt: () => {},
          disableAutoSelect: () => {
            llamadas.disableAutoSelect++;
          },
        },
      },
    };
    return { api, llamadas, get: () => recibido };
  }

  it('sin reentrada automática cuando se pide así', () => {
    // Una invitación es para una cuenta concreta, y entrar con la que hubiera
    // abierta es el error más probable de todo el flujo. E9 lo cerró y está
    // comprobado en vivo; un propietario único que impusiera `auto_select` a
    // todos volvería a abrir justo ese agujero.
    const e = espiarInicializacion();
    new ProveedorGis(e.api, { clientId: 'x' }).inicializar({ autoSeleccionar: false });

    expect(e.get().auto_select).toBe(false);
    // Y además se borra la elección recordada: las dos cosas hacen falta.
    expect(e.llamadas.disableAutoSelect).toBe(1);
  });

  it('el proveedor de la invitación tampoco autoselecciona al dibujar el botón', () => {
    // `renderizarBoton` inicializa si hacía falta, y esa inicialización
    // implícita no puede colar una reentrada automática por la puerta de
    // atrás.
    const e = espiarInicializacion();
    const proveedor = new ProveedorGis(e.api, { clientId: 'x', autoSeleccionar: false });
    proveedor.renderizarBoton({} as HTMLElement);

    expect(e.get().auto_select).toBe(false);
  });

  it('y el de la aplicación sí', () => {
    const e = espiarInicializacion();
    new ProveedorGis(e.api, { clientId: 'x' }).renderizarBoton({} as HTMLElement);
    expect(e.get().auto_select).toBe(true);
    expect(e.llamadas.disableAutoSelect).toBe(0);
  });
});

describe('la credencial llega a todos', () => {
  it('a los dos suscriptores, no solo al último', () => {
    // Es exactamente el fallo que este módulo existe para hacer imposible.
    const b = banco();
    const uno = vi.fn();
    const dos = vi.fn();
    b.proveedor.alRecibir(uno);
    b.proveedor.alRecibir(dos);
    b.proveedor.inicializar();

    b.responder('token.uno');
    expect(uno).toHaveBeenCalledWith('token.uno');
    expect(dos).toHaveBeenCalledWith('token.uno');
  });

  it('darse de baja deja de recibir, y no afecta a los demás', () => {
    const b = banco();
    const uno = vi.fn();
    const dos = vi.fn();
    const baja = b.proveedor.alRecibir(uno);
    b.proveedor.alRecibir(dos);
    b.proveedor.inicializar();

    baja();
    b.responder('token');
    expect(uno).not.toHaveBeenCalled();
    expect(dos).toHaveBeenCalledTimes(1);
  });

  it('un suscriptor que revienta no deja sin credencial a los otros', () => {
    // Una pantalla con un fallo no puede tumbar el inicio de sesión de la
    // aplicación entera.
    const b = banco();
    b.proveedor.alRecibir(() => {
      throw new Error('algo se rompió al pintar');
    });
    const sano = vi.fn();
    b.proveedor.alRecibir(sano);
    b.proveedor.inicializar();

    expect(() => b.responder('token')).not.toThrow();
    expect(sano).toHaveBeenCalledWith('token');
  });

  it('una respuesta sin credencial no se reparte', () => {
    const b = banco();
    const oyente = vi.fn();
    b.proveedor.alRecibir(oyente);
    b.proveedor.inicializar();

    b.responder('');
    expect(oyente).not.toHaveBeenCalled();
  });
});

describe('renovar', () => {
  it('pide una credencial y resuelve con la que llegue', async () => {
    const b = banco();
    b.proveedor.inicializar();

    const promesa = b.proveedor.renovar();
    expect(b.llamadas.prompt).toBe(1);

    b.responder('token.fresco');
    await expect(promesa).resolves.toBe('token.fresco');
  });

  it('la credencial de una renovación TAMBIÉN llega a los suscriptores', () => {
    // Si no, la sesión se renovaría y la pantalla seguiría enseñando los datos
    // de la anterior.
    const b = banco();
    const oyente = vi.fn();
    b.proveedor.alRecibir(oyente);
    b.proveedor.inicializar();

    void b.proveedor.renovar();
    b.responder('token.fresco');
    expect(oyente).toHaveBeenCalledWith('token.fresco');
  });

  it('si Google no contesta, se rinde y devuelve null', async () => {
    // GIS puede no llamar nunca a la devolución: sin sesión, con varias
    // cuentas, con las cookies de terceros bloqueadas. Sin este plazo, la
    // promesa se quedaría colgada y con ella el guardado que la esperaba.
    const b = banco();
    b.proveedor.inicializar();

    const promesa = b.proveedor.renovar();
    b.reloj.vencer();
    await expect(promesa).resolves.toBe(null);
  });

  it('una credencial que llega tarde no resucita la renovación', async () => {
    const b = banco();
    b.proveedor.inicializar();
    const promesa = b.proveedor.renovar();
    b.reloj.vencer();
    await expect(promesa).resolves.toBe(null);

    // Y que llegue después no puede romper nada ni resolver dos veces.
    expect(() => b.responder('tarde')).not.toThrow();
  });

  it('dos renovaciones a la vez son UN prompt', async () => {
    // Cada `prompt()` puede enseñar interfaz. Dos seguidos es la peor manera
    // de avisar de que la sesión caducaba.
    const b = banco();
    b.proveedor.inicializar();

    const a = b.proveedor.renovar();
    const c = b.proveedor.renovar();
    expect(b.llamadas.prompt).toBe(1);

    b.responder('token');
    expect(await a).toBe('token');
    expect(await c).toBe('token');
  });

  it('y después de una, se puede volver a renovar', async () => {
    const b = banco();
    b.proveedor.inicializar();

    const a = b.proveedor.renovar();
    b.responder('uno');
    await a;

    const c = b.proveedor.renovar();
    expect(b.llamadas.prompt).toBe(2);
    b.responder('dos');
    await expect(c).resolves.toBe('dos');
  });

  it('el plazo se cancela cuando la credencial sí llega', async () => {
    // Un temporizador suelto por renovación acabaría despertando al navegador
    // sin motivo.
    const b = banco();
    b.proveedor.inicializar();
    const promesa = b.proveedor.renovar();
    b.responder('token');
    await promesa;
    expect(b.reloj.vivos).toBe(0);
  });

  it('renovar sin haber inicializado inicializa primero', async () => {
    const b = banco();
    void b.proveedor.renovar();
    expect(b.llamadas.initialize).toBe(1);
    await asentar();
  });

  it('el plazo son ocho segundos', () => {
    // Bastante para una respuesta real y poco para que alguien crea que se
    // colgó el guardado.
    expect(ESPERA_RENOVACION_MS).toBe(8_000);
  });
});

describe('cerrar sesión', () => {
  it('desactiva la reentrada automática', async () => {
    // Sin esto, quien cierra sesión volvería a entrar solo en la siguiente
    // carga: la aplicación pelearía con alguien que se fue a propósito.
    const b = banco();
    b.proveedor.inicializar();
    b.proveedor.olvidarSesion();
    expect(b.llamadas.disableAutoSelect).toBe(1);
  });

  it('y una renovación en curso deja de esperar', async () => {
    const b = banco();
    b.proveedor.inicializar();
    const promesa = b.proveedor.renovar();

    b.proveedor.olvidarSesion();
    await expect(promesa).resolves.toBe(null);
  });
});

describe('sin GIS cargado', () => {
  it('no se finge una sesión: se devuelve null y no se lanza', async () => {
    // El script de Google puede no haber cargado todavía, o no cargar nunca
    // —pasa con `npm run dev`, donde la CSP de la aplicación lo impide—.
    const proveedor = new ProveedorGis(null, { clientId: 'x' });

    expect(() => proveedor.inicializar()).not.toThrow();
    await expect(proveedor.renovar()).resolves.toBe(null);
    expect(() => proveedor.olvidarSesion()).not.toThrow();
    expect(proveedor.listo).toBe(false);
  });
});
