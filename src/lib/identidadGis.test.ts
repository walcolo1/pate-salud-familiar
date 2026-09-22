import { describe, it, expect, vi, afterEach } from 'vitest';
import { ESPERA_SCRIPT_MS, arrancarIdentidad, olvidarProveedorCompartido } from './identidadGis';
import { sesionDeLaAplicacion } from './identidad';
import { tokenFalsoParaPruebas } from './sesionGoogle';
import type { ApiGis } from './gis';

/**
 * G3b · el cableado.
 *
 * Tres piezas probadas por separado —el propietario de GIS, la sesión y los
 * enchufes— y un sitio donde se juntan. Lo que se comprueba aquí es lo que solo
 * se rompe en la unión: que la credencial acabe **en la sesión**, que la
 * renovación llegue a `prompt()`, y que al desmontar no quede nadie escuchando.
 */

afterEach(() => {
  sesionDeLaAplicacion.olvidar();
  olvidarProveedorCompartido();
});

function entorno() {
  let ahora = 0;
  const pendientes: { cuando: number; fn: () => void }[] = [];
  let devolucion: ((r: { credential: string }) => void) | null = null;
  const llamadas = { prompt: 0, initialize: 0, renderButton: 0 };
  let api: ApiGis | null = null;

  const apiReal: ApiGis = {
    accounts: {
      id: {
        initialize: (o) => {
          llamadas.initialize++;
          devolucion = o.callback;
        },
        renderButton: () => {
          llamadas.renderButton++;
        },
        prompt: () => {
          llamadas.prompt++;
        },
        disableAutoSelect: () => {},
      },
    },
  };

  return {
    llamadas,
    opciones: {
      clientId: 'x',
      obtenerApi: () => api,
      ahora: () => ahora,
      programar: (fn: () => void, ms: number) => {
        pendientes.push({ cuando: ahora + ms, fn });
        return pendientes.length - 1;
      },
      cancelar: () => {},
    },
    /** El script de Google termina de cargar. */
    cargarGis: () => {
      api = apiReal;
    },
    avanzar: (ms: number) => {
      ahora += ms;
      const vencidos = pendientes.filter((t) => t.cuando <= ahora);
      pendientes.length = 0;
      vencidos.forEach((t) => t.fn());
    },
    responder: (credential: string) => devolucion?.({ credential }),
  };
}

const fresco = () => tokenFalsoParaPruebas(Date.now() + 60 * 60 * 1000);

describe('cuando GIS ya está cargado', () => {
  it('la credencial acaba en la sesión de la aplicación', async () => {
    // Es el objetivo entero de G3b: que exista un `id_token` al alcance del
    // repositorio sin pasar por Firebase.
    const e = entorno();
    e.cargarGis();
    const { soltar } = arrancarIdentidad(e.opciones);

    const token = fresco();
    e.responder(token);

    await expect(sesionDeLaAplicacion.idToken()).resolves.toBe(token);
    soltar();
  });

  it('y también a quien la pidió', () => {
    const e = entorno();
    e.cargarGis();
    const recibir = vi.fn();
    const { soltar } = arrancarIdentidad({ ...e.opciones, alRecibirCredencial: recibir });

    const token = fresco();
    e.responder(token);
    expect(recibir).toHaveBeenCalledWith(token);
    soltar();
  });

  it('la renovación de la sesión llega a prompt()', async () => {
    // Sin este cable, `SesionGoogle` pediría renovar y no habría nadie al otro
    // lado: la sesión caducaría a la hora sin intentar nada.
    const e = entorno();
    e.cargarGis();
    const { soltar } = arrancarIdentidad(e.opciones);

    const promesa = sesionDeLaAplicacion.renovarAhora();
    expect(e.llamadas.prompt).toBe(1);

    const token = fresco();
    e.responder(token);
    await expect(promesa).resolves.toBe(token);
    soltar();
  });
});

describe('cuando GIS llega tarde', () => {
  it('se espera y se conecta en cuanto aparece', () => {
    const e = entorno();
    const { soltar } = arrancarIdentidad(e.opciones);
    expect(e.llamadas.initialize).toBe(0);

    e.avanzar(300);
    e.cargarGis();
    e.avanzar(100);

    expect(e.llamadas.initialize).toBe(1);
    soltar();
  });

  it('si no llega nunca, se dice: no se finge una sesión', () => {
    // Pasa de verdad: con `npm run dev` la CSP de la aplicación impide cargar
    // el script, y ahí no hay GIS nunca. Rendirse en silencio dejaría una
    // pantalla esperando para siempre.
    const e = entorno();
    const faltar = vi.fn();
    const { soltar } = arrancarIdentidad({ ...e.opciones, alFaltarGis: faltar });

    e.avanzar(ESPERA_SCRIPT_MS + 100);
    expect(faltar).toHaveBeenCalledTimes(1);
    soltar();
  });

  it('y el aviso de que falta se da una sola vez', () => {
    const e = entorno();
    const faltar = vi.fn();
    const { soltar } = arrancarIdentidad({ ...e.opciones, alFaltarGis: faltar });

    e.avanzar(ESPERA_SCRIPT_MS + 100);
    e.avanzar(ESPERA_SCRIPT_MS + 100);
    expect(faltar).toHaveBeenCalledTimes(1);
    soltar();
  });
});

describe('el botón', () => {
  it('se puede pedir antes de que cargue GIS, y se dibuja al conectar', () => {
    // Sin esto, cada pantalla tendría que sondear por su cuenta el script de
    // Google, que es exactamente lo que G3b vino a quitar.
    const e = entorno();
    const identidad = arrancarIdentidad(e.opciones);

    identidad.renderizarBoton({} as HTMLElement);
    expect(e.llamadas.renderButton).toBe(0);

    e.cargarGis();
    e.avanzar(100);
    expect(e.llamadas.renderButton).toBe(1);
    identidad.soltar();
  });
});

describe('soltar', () => {
  it('deja de escuchar credenciales', () => {
    // Sin darse de baja, cada montaje dejaría un suscriptor más y una
    // credencial acabaría procesándose media docena de veces.
    const e = entorno();
    e.cargarGis();
    const recibir = vi.fn();
    const { soltar } = arrancarIdentidad({ ...e.opciones, alRecibirCredencial: recibir });

    soltar();
    e.responder(fresco());
    expect(recibir).not.toHaveBeenCalled();
  });

  it('y desconecta la renovación, que si no apuntaría a un GIS muerto', async () => {
    const e = entorno();
    e.cargarGis();
    const { soltar } = arrancarIdentidad(e.opciones);
    soltar();

    await expect(sesionDeLaAplicacion.renovarAhora()).resolves.toBe(null);
    expect(e.llamadas.prompt).toBe(0);
  });

  it('soltar antes de que cargue GIS no deja el sondeo corriendo', () => {
    const e = entorno();
    const { soltar } = arrancarIdentidad(e.opciones);
    soltar();

    e.cargarGis();
    e.avanzar(1_000);
    expect(e.llamadas.initialize).toBe(0);
  });
});

describe('dos arranques no son dos inicializaciones', () => {
  it('`/login` y la aplicación comparten el mismo propietario', () => {
    // Es el problema original con otra cara: dos `ProveedorGis` serían dos
    // `initialize`, y el segundo le quitaría la devolución de llamada al
    // primero. Sin error, como siempre.
    const e = entorno();
    e.cargarGis();

    const uno = arrancarIdentidad(e.opciones);
    const dos = arrancarIdentidad(e.opciones);

    expect(e.llamadas.initialize).toBe(1);
    uno.soltar();
    dos.soltar();
  });

  it('y la credencial llega a los dos', () => {
    const e = entorno();
    e.cargarGis();
    const a = vi.fn();
    const b = vi.fn();

    const uno = arrancarIdentidad({ ...e.opciones, alRecibirCredencial: a });
    const dos = arrancarIdentidad({ ...e.opciones, alRecibirCredencial: b });

    e.responder(fresco());
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    uno.soltar();
    dos.soltar();
  });
});
