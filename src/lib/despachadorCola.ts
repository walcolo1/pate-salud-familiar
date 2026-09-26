/**
 * El despachador de la cola duradera (Bloque H)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vacía la cola **en orden**, un lote detrás de otro. FIFO estricto, y no por
 * prolijidad: la hoja resuelve «la última fila que habla manda», así que si
 * una edición vieja saliera después de una nueva, la pisaría. Por eso un fallo
 * pasajero **detiene** el despacho en vez de saltarse el lote.
 *
 * Qué hace con cada respuesta:
 *
 *   · llegó             → fuera de la cola
 *   · fallo pasajero    → se detiene; el lote y los siguientes esperan
 *     (sin red, cerrojo ocupado, sin hoja registrada, sin credencial)
 *   · rechazo del router → fuera de la cola, y se informa: reintentar un
 *     permiso denegado no lo concede, y bloquearía todo lo de detrás
 *
 * Nunca lanza: lo llaman efectos, oyentes y eventos del navegador.
 */

import type { ColaDuradera } from './colaDuradera';
import { paraEnviar } from './colaDuradera';
import type { Mutacion } from './transporteBackend';

export interface Rechazo {
  id: string;
  codigo: string;
}

export interface InformeDespacho {
  enviados: string[];
  rechazados: Rechazo[];
  quedan: number;
  /** El código del fallo pasajero que detuvo el despacho, si lo hubo. */
  detenidoPor?: string;
}

export interface DependenciasDespacho {
  cola: ColaDuradera;
  enviar(mutaciones: Mutacion[]): Promise<void>;
  /** Tras cada cambio de tamaño, para el contador de la interfaz. */
  alCambiar?(longitud: number): void;
}

/** Sin hoja o sin credencial no es un rechazo: es «todavía no». */
const ESPERAS = ['SIN_BACKEND', 'SIN_IDENTIDAD'];

function clasificar(err: unknown): { pasajero: boolean; codigo: string } {
  const e = err as { codigo?: unknown; reintentable?: unknown } | null;
  const codigo = typeof e?.codigo === 'string' ? e.codigo : 'ERROR_DESCONOCIDO';
  return { pasajero: e?.reintentable === true || ESPERAS.includes(codigo), codigo };
}

export class DespachadorCola {
  private enCurso: Promise<InformeDespacho> | null = null;

  constructor(private readonly deps: DependenciasDespacho) {}

  vaciar(): Promise<InformeDespacho> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.pasada().finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async pasada(): Promise<InformeDespacho> {
    const { cola } = this.deps;
    const informe: InformeDespacho = { enviados: [], rechazados: [], quedan: cola.longitud };

    // Se vuelve a mirar la cabeza en cada vuelta: lo que se encola mientras
    // tanto sale en la misma pasada, detrás de lo que ya había.
    for (let lote = cola.primero(); lote; lote = cola.primero()) {
      try {
        await this.deps.enviar(paraEnviar(lote));
        cola.quitar(lote.id);
        informe.enviados.push(lote.id);
      } catch (err) {
        const { pasajero, codigo } = clasificar(err);
        if (pasajero) {
          informe.detenidoPor = codigo;
          break;
        }
        cola.quitar(lote.id);
        informe.rechazados.push({ id: lote.id, codigo });
      } finally {
        this.deps.alCambiar?.(cola.longitud);
      }
    }

    informe.quedan = cola.longitud;
    return informe;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// La unión con el resto: la usan AppContext y la prueba del ciclo de vida
// ─────────────────────────────────────────────────────────────────────────────

/** Un repositorio que sabe abrir una transacción y enseñar su lote. */
export interface ConTransaccion<T> {
  transaccion(): T & { lote(): Mutacion[] };
}

/**
 * Construye el lote de una acción del usuario **sin enviarlo**. Lo que lance
 * aquí —un paciente que falta, algo sin pestaña— no ha tocado la red.
 */
export async function construirLote<T>(
  repo: ConTransaccion<T>,
  accion: (tx: T) => Promise<unknown>,
): Promise<Mutacion[]> {
  const tx = repo.transaccion();
  await accion(tx);
  return tx.lote();
}

/** El envío de un lote, con la sesión del repositorio. */
export function enviarConRepositorio(repo: { enviarLote(m: Mutacion[]): Promise<void> }) {
  return (mutaciones: Mutacion[]) => repo.enviarLote(mutaciones);
}

export interface Disparadores {
  sesion: { alRecibir(oyente: () => void): () => void };
  ventana: {
    addEventListener(tipo: string, oyente: () => void): void;
    removeEventListener(tipo: string, oyente: () => void): void;
  } | null;
  vaciar(): Promise<unknown>;
}

/**
 * Cuándo se intenta vaciar: al llegar una credencial —tras un F5 llega segundos
 * después de montar— y al volver la red. Devuelve la desconexión.
 */
export function conectarDisparadores({ sesion, ventana, vaciar }: Disparadores): () => void {
  const intentar = () => void vaciar();
  const bajaSesion = sesion.alRecibir(intentar);
  ventana?.addEventListener('online', intentar);
  return () => {
    bajaSesion();
    ventana?.removeEventListener('online', intentar);
  };
}
