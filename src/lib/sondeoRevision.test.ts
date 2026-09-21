import { describe, it, expect, vi } from 'vitest';
import {
  EVENTOS_DE_REGRESO,
  INTERVALO_SONDEO_MS,
  SondeoRevision,
  conectarSondeo,
  presupuestoDiario,
  type EntornoSondeo,
  type VentanaSondeo,
} from './sondeoRevision';

/**
 * G2 · el sondeo, probado con reloj y visibilidad de mentira.
 *
 * Lo que hay que demostrar aquí no es que pregunte —eso es fácil— sino las tres
 * cosas que cuestan cuota, batería o datos si salen mal:
 *
 *   · que **en segundo plano no salga ni una petición**;
 *   · que al volver el foco pregunte **una vez**, no una por evento;
 *   · que un fallo no mate el bucle ni se disfrace de cambio.
 *
 * El reloj entra por parámetro porque un sondeo probado con esperas reales es
 * un sondeo que tarda dos minutos en probarse, y entonces no se prueba.
 */

/** Un reloj y una cola de temporizadores que avanzan cuando yo digo. */
function relojFalso() {
  let ahora = 0;
  let siguiente = 1;
  const pendientes = new Map<number, { cuando: number; fn: () => void }>();

  return {
    ahora: () => ahora,
    programar(fn: () => void, ms: number) {
      const id = siguiente++;
      pendientes.set(id, { cuando: ahora + ms, fn });
      return id;
    },
    cancelar(id: unknown) {
      pendientes.delete(id as number);
    },
    /**
     * Avanza el reloj y dispara lo que venciera por el camino.
     *
     * Es `async` y deja asentar las promesas entre disparo y disparo: el
     * sondeo comprueba de forma asíncrona, y disparar cuatro temporizadores
     * seguidos sin dejar resolver ninguno mediría el antirrebote, no el
     * intervalo.
     */
    async avanzar(ms: number) {
      const destino = ahora + ms;
      for (;;) {
        const vencidos = [...pendientes.entries()]
          .filter(([, t]) => t.cuando <= destino)
          .sort((a, b) => a[1].cuando - b[1].cuando);
        if (vencidos.length === 0) break;

        const [id, tarea] = vencidos[0];
        pendientes.delete(id);
        ahora = tarea.cuando;
        tarea.fn();
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      ahora = destino;
    },
    get vivos() {
      return pendientes.size;
    },
  };
}

function banco(opciones: { revisiones?: number[]; visible?: boolean } = {}) {
  const reloj = relojFalso();
  const cola = [...(opciones.revisiones ?? [])];
  let ultima = 1;

  const preguntar = vi.fn(async () => {
    if (cola.length > 0) ultima = cola.shift() as number;
    return ultima;
  });

  const estado = { visible: opciones.visible !== false };
  const cambios: number[] = [];
  const fallos: unknown[] = [];

  const entorno: EntornoSondeo = {
    obtenerRevision: preguntar,
    visible: () => estado.visible,
    programar: reloj.programar,
    cancelar: reloj.cancelar,
    alCambiar: (revision) => cambios.push(revision),
    registrarFallo: (err) => fallos.push(err),
  };

  return { reloj, preguntar, estado, cambios, fallos, sondeo: new SondeoRevision(entorno) };
}

/** Deja correr las promesas pendientes sin avanzar el reloj. */
const asentar = () => new Promise<void>((r) => setTimeout(r, 0));

describe('el intervalo', () => {
  it('son 120 segundos, la cifra acordada', () => {
    expect(INTERVALO_SONDEO_MS).toBe(120_000);
  });

  it('pregunta una vez por intervalo, ni más ni menos', async () => {
    const { sondeo, reloj, preguntar } = banco();
    sondeo.arrancar(1);
    await asentar();

    // Arrancar no pregunta: la copia acaba de llegar.
    expect(preguntar).toHaveBeenCalledTimes(0);

    await reloj.avanzar(INTERVALO_SONDEO_MS);
    await asentar();
    expect(preguntar).toHaveBeenCalledTimes(1);

    await reloj.avanzar(INTERVALO_SONDEO_MS * 3);
    await asentar();
    expect(preguntar).toHaveBeenCalledTimes(4);
  });

  it('parar deja el temporizador muerto, no dormido', async () => {
    const { sondeo, reloj, preguntar } = banco();
    sondeo.arrancar(1);
    sondeo.parar();

    expect(reloj.vivos).toBe(0);
    await reloj.avanzar(INTERVALO_SONDEO_MS * 5);
    await asentar();
    expect(preguntar).not.toHaveBeenCalled();
  });
});

describe('en segundo plano no se gasta nada', () => {
  it('con la pestaña oculta no sale ni una petición', async () => {
    // Es la mitad de la razón de ser del sondeo híbrido. Una pestaña olvidada
    // ocho horas en segundo plano no puede seguir consumiendo cuota ni
    // despertando la radio del teléfono.
    const { sondeo, reloj, estado, preguntar } = banco();
    sondeo.arrancar(1);
    estado.visible = false;

    await reloj.avanzar(INTERVALO_SONDEO_MS * 10);
    await asentar();
    expect(preguntar).not.toHaveBeenCalled();
  });

  it('y el temporizador no se queda suelto mientras tanto', async () => {
    // Si al ocultarse siguiera reprogramándose, al volver habría una avalancha
    // de comprobaciones vencidas.
    const { sondeo, reloj, estado } = banco();
    sondeo.arrancar(1);
    estado.visible = false;
    await reloj.avanzar(INTERVALO_SONDEO_MS * 3);
    await asentar();

    expect(reloj.vivos).toBeLessThanOrEqual(1);
  });

  it('al volver a primer plano pregunta en el acto', async () => {
    // El disparador primario es el foco: quien vuelve a la pestaña espera ver
    // lo que hay, no lo que había hace dos minutos.
    const { sondeo, estado, preguntar } = banco();
    sondeo.arrancar(1);
    estado.visible = false;
    await asentar();

    estado.visible = true;
    sondeo.alCambiarVisibilidad();
    await asentar();

    expect(preguntar).toHaveBeenCalledTimes(1);
  });

  it('volverse a ocultar no pregunta', async () => {
    const { sondeo, estado, preguntar } = banco();
    sondeo.arrancar(1);
    estado.visible = false;
    sondeo.alCambiarVisibilidad();
    await asentar();
    expect(preguntar).not.toHaveBeenCalled();
  });

  it('y después del foco el intervalo sigue contando desde cero', async () => {
    // Si no se reprogramara, una comprobación por foco y otra a los pocos
    // segundos serían dos peticiones casi seguidas.
    const { sondeo, reloj, preguntar } = banco();
    sondeo.arrancar(1);
    await reloj.avanzar(INTERVALO_SONDEO_MS - 1_000);

    sondeo.alCambiarVisibilidad();
    await asentar();
    expect(preguntar).toHaveBeenCalledTimes(1);

    await reloj.avanzar(2_000);
    await asentar();
    expect(preguntar).toHaveBeenCalledTimes(1);
  });
});

describe('qué se avisa y cuándo', () => {
  it('una revisión igual no avisa a nadie', async () => {
    // Avisar sin cambio haría que la aplicación recargara —o interrumpiera a
    // quien escribe— cada dos minutos y sin motivo.
    const { sondeo, reloj, cambios } = banco({ revisiones: [7, 7, 7] });
    sondeo.arrancar(7);
    await reloj.avanzar(INTERVALO_SONDEO_MS * 3);
    await asentar();
    expect(cambios).toEqual([]);
  });

  it('un cambio avisa una vez, con el número nuevo', async () => {
    const { sondeo, reloj, cambios } = banco({ revisiones: [7, 8, 8, 9] });
    sondeo.arrancar(7);
    await reloj.avanzar(INTERVALO_SONDEO_MS * 4);
    await asentar();
    expect(cambios).toEqual([8, 9]);
  });

  it('una revisión que baja también es un cambio', async () => {
    // Pasa si el titular restaura una copia de la hoja. Ignorarlo dejaría al
    // cliente creyendo que está al día sobre un documento que ya no es el
    // mismo.
    const { sondeo, reloj, cambios } = banco({ revisiones: [3] });
    sondeo.arrancar(9);
    await reloj.avanzar(INTERVALO_SONDEO_MS);
    await asentar();
    expect(cambios).toEqual([3]);
  });

  it('sin revisión de partida, la primera respuesta no se anuncia como cambio', async () => {
    // Arrancar sin saber en qué revisión estamos y avisar de la primera que
    // llegue sería una recarga garantizada nada más abrir.
    const { sondeo, reloj, cambios } = banco({ revisiones: [5, 5] });
    sondeo.arrancar();
    await reloj.avanzar(INTERVALO_SONDEO_MS * 2);
    await asentar();
    expect(cambios).toEqual([]);
  });
});

describe('cuando falla', () => {
  it('un fallo no se cuenta como cambio', async () => {
    const entorno = {
      obtenerRevision: async () => {
        throw new Error('sin red');
      },
      visible: () => true,
      programar: (fn: () => void, ms: number) => setTimeout(fn, ms),
      cancelar: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
      alCambiar: vi.fn(),
      registrarFallo: vi.fn(),
    } satisfies EntornoSondeo;

    const sondeo = new SondeoRevision(entorno);
    await sondeo.comprobarAhora();

    expect(entorno.alCambiar).not.toHaveBeenCalled();
    expect(entorno.registrarFallo).toHaveBeenCalled();
    sondeo.parar();
  });

  it('y no mata el bucle: se sigue preguntando', async () => {
    // Un sondeo que se rinde con el primer túnel deja de sincronizar para el
    // resto de la sesión, y nadie se entera hasta que falta un dato.
    const reloj = relojFalso();
    let fallar = true;
    const preguntar = vi.fn(async () => {
      if (fallar) throw new Error('sin red');
      return 9;
    });

    const cambios: number[] = [];
    const sondeo = new SondeoRevision({
      obtenerRevision: preguntar,
      visible: () => true,
      programar: reloj.programar,
      cancelar: reloj.cancelar,
      alCambiar: (r) => cambios.push(r),
      registrarFallo: () => {},
    });

    sondeo.arrancar(1);
    await reloj.avanzar(INTERVALO_SONDEO_MS);
    await asentar();
    expect(preguntar).toHaveBeenCalledTimes(1);

    fallar = false;
    await reloj.avanzar(INTERVALO_SONDEO_MS);
    await asentar();
    expect(preguntar).toHaveBeenCalledTimes(2);
    expect(cambios).toEqual([9]);
  });

  it('dos comprobaciones no se solapan', async () => {
    // Con la red lenta, un temporizador cada dos minutos y un foco podrían
    // dejar varias peticiones en vuelo preguntando lo mismo.
    const pendiente: { resolver: (n: number) => void } = { resolver: () => {} };
    const preguntar = vi.fn(
      () =>
        new Promise<number>((r) => {
          pendiente.resolver = r;
        }),
    );

    const sondeo = new SondeoRevision({
      obtenerRevision: preguntar,
      visible: () => true,
      programar: () => 0,
      cancelar: () => {},
      alCambiar: () => {},
      registrarFallo: () => {},
    });

    const primera = sondeo.comprobarAhora();
    const segunda = sondeo.comprobarAhora();
    expect(preguntar).toHaveBeenCalledTimes(1);

    pendiente.resolver(4);
    await Promise.all([primera, segunda]);
  });
});

describe('la cuota', () => {
  it('el presupuesto diario cabe de sobra en las 20.000 llamadas', () => {
    // La cifra oficial para una cuenta @gmail.com. Ocho horas con la pestaña
    // delante a 120 s son 240 peticiones; el resto del día, cero.
    expect(presupuestoDiario(8)).toBe(240);
    expect(presupuestoDiario(8)).toBeLessThan(20_000);
  });

  it('ni siquiera un día entero con la pestaña visible se acerca', () => {
    expect(presupuestoDiario(24)).toBe(720);
    expect(presupuestoDiario(24)).toBeLessThan(20_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El enchufe al navegador
// ─────────────────────────────────────────────────────────────────────────────

function ventanaFalsa(oculto = false) {
  const oyentes = new Map<string, Set<() => void>>();
  const estado = { oculto };

  const ventana: VentanaSondeo = {
    oculto: () => estado.oculto,
    escuchar: (evento, fn) => {
      if (!oyentes.has(evento)) oyentes.set(evento, new Set());
      oyentes.get(evento)!.add(fn);
    },
    olvidar: (evento, fn) => {
      oyentes.get(evento)?.delete(fn);
    },
  };

  return {
    ventana,
    estado,
    disparar: (evento: string) => oyentes.get(evento)?.forEach((fn) => fn()),
    get atados() {
      return [...oyentes.values()].reduce((n, s) => n + s.size, 0);
    },
  };
}

describe('conectarSondeo', () => {
  const entorno = (preguntar: () => Promise<number>) => ({
    obtenerRevision: preguntar,
    programar: () => 0,
    cancelar: () => {},
    alCambiar: () => {},
    registrarFallo: () => {},
  });

  it('escucha los dos eventos de regreso', () => {
    // `visibilitychange` cubre cambiar de pestaña; `focus` cubre volver desde
    // otra ventana con la pestaña siempre visible, que con dos monitores es lo
    // normal. Con uno solo, media parte de los regresos no dispararía nada.
    const v = ventanaFalsa();
    const { desconectar } = conectarSondeo(v.ventana, entorno(async () => 1), 1);

    expect(v.atados).toBe(EVENTOS_DE_REGRESO.length);
    desconectar();
  });

  it('un regreso que dispara los dos eventos sigue siendo UNA petición', async () => {
    const preguntar = vi.fn(async () => 1);
    const v = ventanaFalsa();
    const { desconectar } = conectarSondeo(v.ventana, entorno(preguntar), 1);

    v.disparar('visibilitychange');
    v.disparar('focus');
    await asentar();

    expect(preguntar).toHaveBeenCalledTimes(1);
    desconectar();
  });

  it('desconectar suelta los oyentes', async () => {
    // Sin esto, cada montaje dejaría uno más y al cabo de unas navegaciones un
    // solo regreso dispararía media docena de comprobaciones.
    const preguntar = vi.fn(async () => 1);
    const v = ventanaFalsa();
    const { desconectar } = conectarSondeo(v.ventana, entorno(preguntar), 1);

    desconectar();
    expect(v.atados).toBe(0);

    v.disparar('focus');
    await asentar();
    expect(preguntar).not.toHaveBeenCalled();
  });
});
