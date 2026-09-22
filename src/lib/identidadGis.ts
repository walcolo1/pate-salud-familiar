/**
 * Enchufar GIS a la sesión de la aplicación (Bloque G, G3b)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `gis.ts` es el propietario único de `google.accounts.id`. `sesionGoogle.ts`
 * sabe cuándo renovar y qué hacer si no puede. `identidad.ts` tiene los dos
 * enchufes sueltos. Esto los une, y es lo único que hacía falta para que G0 y
 * G2 dejen de estar en el aire.
 *
 * EL SCRIPT DE GOOGLE LLEGA TARDE
 * ───────────────────────────────
 * Se carga de forma asíncrona desde el armazón, así que al montar una pantalla
 * `window.google` puede no existir todavía. Se sondea, con un plazo: si no
 * llega, **no se finge una sesión**. Ese caso es real y conocido —con
 * `npm run dev` la CSP de la aplicación impide cargarlo, y ahí no hay GIS
 * nunca—, así que rendirse en silencio dejaría una pantalla esperando para
 * siempre.
 */

import { ProveedorGis, apiGisDelNavegador, type ApiGis } from './gis';
import { configurarAvisoDeSesion, configurarRenovacion, sesionDeLaAplicacion } from './identidad';

/** Cuánto se espera al script de Google antes de darlo por ausente. */
export const ESPERA_SCRIPT_MS = 10_000;
const PASO_SONDEO_MS = 100;

/**
 * El proveedor compartido de esta pestaña.
 *
 * `arrancarIdentidad` se llama desde más de un sitio —`/login` monta el suyo y
 * `AppContext` arranca el de la aplicación—, y **crear un `ProveedorGis` por
 * llamada sería volver al problema**: dos instancias son dos `initialize`, y el
 * segundo le quita la devolución de llamada al primero.
 *
 * Así que se comparte por `clientId`. El primero en llegar fija si hay
 * reentrada automática, y por eso `/invitacion` —que la necesita apagada— no
 * puede convivir con el arranque de la aplicación: `AppContext` no lo enciende
 * en esa ruta, y está escrito allí con su motivo.
 */
let compartido: { clientId: string; proveedor: ProveedorGis } | null = null;

/**
 * Cuántos arranques siguen vivos.
 *
 * La renovación y el aviso de sesión son **globales**: los usa la aplicación
 * entera. Cuando `/login` se desmonta al entrar, su `soltar()` no puede
 * desenchufarlos, porque `AppContext` sigue contando con ellos. Sin esta
 * cuenta, la sesión dejaba de renovarse en cuanto se salía de `/login`, y a
 * los 50 minutos nadie lo habría visto hasta que caducara.
 */
let arranquesVivos = 0;

/** Para las pruebas: olvida el proveedor compartido. */
export function olvidarProveedorCompartido(): void {
  compartido = null;
  arranquesVivos = 0;
}

export interface OpcionesArranque {
  clientId: string;
  /** `false` en `/invitacion`. Ver `ProveedorGis.inicializar`. */
  autoSeleccionar?: boolean;
  /** Cada credencial que llegue, venga de donde venga. */
  alRecibirCredencial?: (credencial: string) => void;
  /** No hay GIS con el que hablar. La pantalla decide qué enseñar. */
  alFaltarGis?: () => void;
  /** Ya no hay sesión y hay que volver a entrar. */
  alPedirEntrada?: () => void;

  // Inyectables para poder probar esto sin navegador y sin Google.
  obtenerApi?: () => ApiGis | null;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
  ahora?: () => number;
}

export interface Identidad {
  /** Suelta los oyentes y el sondeo. Hay que llamarla al desmontar. */
  soltar(): void;
  /**
   * Dibuja el botón de Google.
   *
   * Se puede pedir **antes** de que el script haya cargado: la petición se
   * guarda y se atiende al conectar. Sin esto, cada pantalla tendría que
   * sondear por su cuenta, que es justo lo que G3b vino a quitar.
   */
  renderizarBoton(destino: HTMLElement | null, opciones?: Record<string, unknown>): void;
}

/**
 * Arranca la identidad. Devuelve cómo pararla y cómo dibujar el botón.
 *
 * Soltarla importa: sin darse de baja, cada montaje dejaría un suscriptor más
 * y una credencial acabaría procesándose media docena de veces.
 */
export function arrancarIdentidad(opciones: OpcionesArranque): Identidad {
  const obtenerApi = opciones.obtenerApi ?? apiGisDelNavegador;
  const programar = opciones.programar ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelar = opciones.cancelar ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const ahora = opciones.ahora ?? (() => Date.now());

  let vivo = true;
  let sondeo: unknown = null;
  let bajaOyente: (() => void) | null = null;
  let proveedor: ProveedorGis | null = null;
  /** Un botón pedido antes de que GIS cargara. */
  let botonPendiente: { destino: HTMLElement; opciones: Record<string, unknown> } | null = null;
  const desde = ahora();

  let contado = false;

  const soltar = () => {
    if (!vivo) return;
    vivo = false;
    if (sondeo !== null) cancelar(sondeo);
    sondeo = null;
    bajaOyente?.();
    bajaOyente = null;

    if (contado) {
      contado = false;
      arranquesVivos = Math.max(0, arranquesVivos - 1);
    }
    // Solo el último apaga la luz.
    if (arranquesVivos === 0) {
      configurarRenovacion(null);
      configurarAvisoDeSesion(null);
    }
  };

  const conectar = (api: ApiGis) => {
    if (!compartido || compartido.clientId !== opciones.clientId) {
      compartido = {
        clientId: opciones.clientId,
        proveedor: new ProveedorGis(api, {
          clientId: opciones.clientId,
          autoSeleccionar: opciones.autoSeleccionar,
        }),
      };
    }

    const nuevo = compartido.proveedor;
    proveedor = nuevo;
    contado = true;
    arranquesVivos += 1;

    bajaOyente = nuevo.alRecibir((credencial) => {
      // La sesión primero: si la pantalla hace algo con la credencial, ya la
      // encuentra guardada.
      sesionDeLaAplicacion.recibir(credencial);
      opciones.alRecibirCredencial?.(credencial);
    });

    configurarRenovacion(() => nuevo.renovar());
    if (opciones.alPedirEntrada) configurarAvisoDeSesion(opciones.alPedirEntrada);

    nuevo.inicializar({ autoSeleccionar: opciones.autoSeleccionar });

    if (botonPendiente) {
      nuevo.renderizarBoton(botonPendiente.destino, botonPendiente.opciones);
      botonPendiente = null;
    }
  };

  const intentar = () => {
    if (!vivo) return;

    const api = obtenerApi();
    if (api) {
      sondeo = null;
      conectar(api);
      return;
    }

    if (ahora() - desde >= ESPERA_SCRIPT_MS) {
      sondeo = null;
      // No se finge nada. Quien llamó decide qué enseñar.
      opciones.alFaltarGis?.();
      return;
    }

    sondeo = programar(intentar, PASO_SONDEO_MS);
  };

  intentar();

  return {
    soltar,
    renderizarBoton: (destino, opcionesBoton = {}) => {
      if (!destino || !vivo) return;
      if (proveedor) {
        proveedor.renderizarBoton(destino, opcionesBoton);
        return;
      }
      botonPendiente = { destino, opciones: opcionesBoton };
    },
  };
}
