/**
 * El sondeo híbrido de revisión (Bloque G, G2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La hoja no avisa cuando cambia. Firestore sí lo hacía, y perder eso es el
 * precio de que cada familia tenga su propio backend. Lo que queda es
 * preguntar, y preguntar bien.
 *
 * LO ACORDADO
 * ───────────
 *   · **Disparador primario: el foco.** Quien vuelve a la pestaña espera ver lo
 *     que hay, no lo que había hace dos minutos.
 *   · **Sondeo pasivo cada 120 s** con la pestaña delante.
 *   · **En segundo plano, nada.** Ni una petición. El temporizador se para.
 *
 * POR QUÉ SOLO `obtenerRevision`
 * ──────────────────────────────
 * Es la única acción del router que **no lee la hoja**: devuelve un número de
 * una propiedad del script. Sondear con `exportar` traería el expediente
 * entero cada dos minutos para descubrir, casi siempre, que no había cambiado
 * nada.
 *
 * LA CUOTA, CON LA CIFRA DELANTE
 * ──────────────────────────────
 * Una cuenta @gmail.com gratuita tiene **20.000 llamadas al día** y 90 minutos
 * de cómputo. Ocho horas con la pestaña visible a 120 s son **240 peticiones**
 * —el 1,2 %—, y un día entero sin cerrarla, 720. El margen no lo gasta el
 * sondeo: lo gastarían los guardados, y esos van por lote.
 *
 * QUÉ HACER CUANDO CAMBIA: NO LO DECIDE ESTE MÓDULO
 * ─────────────────────────────────────────────────
 * `alCambiar` es una llamada de vuelta a propósito. Recargar sin más es
 * sencillo y **tira lo que el usuario estuviera escribiendo**; avisar y dejarle
 * elegir es más amable y más trabajo. Es una decisión de producto y está
 * abierta: ver `G2-SINCRONIZACION.md`.
 */

/** Lo acordado: dos minutos con la pestaña delante. */
export const INTERVALO_SONDEO_MS = 120_000;

/** Peticiones al día con la pestaña visible tantas horas. Para mirar la cuota. */
export function presupuestoDiario(horasVisible: number): number {
  const porHora = 3_600_000 / INTERVALO_SONDEO_MS;
  return Math.round(Math.max(0, horasVisible) * porHora);
}

/**
 * Todo lo de fuera, por parámetro.
 *
 * El reloj y la visibilidad entran inyectados porque un sondeo probado con
 * esperas reales tarda dos minutos en probarse, y entonces no se prueba.
 */
export interface EntornoSondeo {
  /** La consulta ligera. Nada más que esta. */
  obtenerRevision(): Promise<number>;
  /** Si la pestaña está delante ahora mismo. */
  visible(): boolean;
  programar(fn: () => void, ms: number): unknown;
  cancelar(id: unknown): void;
  /** La revisión cambió. Qué se hace con eso no es cosa de aquí. */
  alCambiar(revision: number): void;
  /** Un fallo del sondeo. No interrumpe el bucle. */
  registrarFallo(error: unknown): void;
}

export class SondeoRevision {
  private readonly entorno: EntornoSondeo;
  /** La última revisión conocida. `null` mientras no se sepa ninguna. */
  private conocida: number | null = null;
  private temporizador: unknown = null;
  private enVuelo: Promise<void> | null = null;
  private activo = false;

  constructor(entorno: EntornoSondeo) {
    this.entorno = entorno;
  }

  /**
   * Empieza a sondear.
   *
   * **No pregunta al arrancar**: la copia acaba de llegar. Y si no se sabe la
   * revisión de partida, la primera respuesta no se anuncia como cambio —sería
   * una recarga garantizada nada más abrir.
   */
  arrancar(revisionConocida?: number): void {
    this.conocida = typeof revisionConocida === 'number' ? revisionConocida : null;
    this.activo = true;
    this.reprogramar();
  }

  /** Para del todo. El temporizador queda muerto, no dormido. */
  parar(): void {
    this.activo = false;
    this.cancelarTemporizador();
  }

  /**
   * La pestaña cambió de estado.
   *
   * Al volver se comprueba **en el acto** y el intervalo vuelve a contar desde
   * cero: si no se reprogramara, una comprobación por foco y otra a los pocos
   * segundos serían dos peticiones casi seguidas.
   */
  alCambiarVisibilidad(): void {
    if (!this.activo) return;

    if (!this.entorno.visible()) {
      this.cancelarTemporizador();
      return;
    }

    void this.comprobarAhora();
    this.reprogramar();
  }

  /**
   * Una comprobación, ahora.
   *
   * **Dos no se solapan**: con la red lenta, el temporizador y un foco podrían
   * dejar varias peticiones en vuelo preguntando lo mismo. La segunda espera a
   * la primera.
   */
  comprobarAhora(): Promise<void> {
    if (this.enVuelo) return this.enVuelo;

    this.enVuelo = this.preguntar().finally(() => {
      this.enVuelo = null;
    });
    return this.enVuelo;
  }

  private async preguntar(): Promise<void> {
    try {
      const revision = await this.entorno.obtenerRevision();

      // La primera respuesta sin revisión de partida solo sirve para fijarla.
      // Y una revisión que **baja** también es un cambio: pasa si el titular
      // restaura una copia de la hoja, y darlo por bueno dejaría al cliente
      // creyendo que está al día sobre un documento que ya no es el mismo.
      const habiaCambio = this.conocida !== null && revision !== this.conocida;
      this.conocida = revision;
      if (habiaCambio) this.entorno.alCambiar(revision);
    } catch (error) {
      // Un sondeo que se rinde con el primer túnel deja de sincronizar el resto
      // de la sesión, y nadie se entera hasta que falta un dato.
      this.entorno.registrarFallo(error);
    }
  }

  private reprogramar(): void {
    this.cancelarTemporizador();
    if (!this.activo) return;

    this.temporizador = this.entorno.programar(() => {
      this.temporizador = null;
      if (!this.activo) return;

      // La comprobación de visibilidad va **aquí**, al vencer, y no al
      // programar: la pestaña pudo ocultarse por el camino.
      if (this.entorno.visible()) void this.comprobarAhora();
      this.reprogramar();
    }, INTERVALO_SONDEO_MS);
  }

  private cancelarTemporizador(): void {
    if (this.temporizador === null) return;
    this.entorno.cancelar(this.temporizador);
    this.temporizador = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// El enchufe al navegador
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo de `document` y `window`. Inyectable para poder probarlo. */
export interface VentanaSondeo {
  oculto(): boolean;
  escuchar(evento: string, fn: () => void): void;
  olvidar(evento: string, fn: () => void): void;
}

/**
 * Los dos eventos, y por qué hacen falta los dos.
 *
 * `visibilitychange` cubre cambiar de pestaña y minimizar; `focus` cubre volver
 * desde otra ventana con la pestaña siempre visible, que en un escritorio con
 * dos monitores es lo normal. Con uno solo, media parte de los regresos no
 * dispararía nada.
 *
 * Los dos llaman a lo mismo, y `comprobarAhora` no se solapa consigo misma, así
 * que un regreso que dispare los dos eventos sigue siendo **una** petición.
 */
export const EVENTOS_DE_REGRESO = ['visibilitychange', 'focus'] as const;

/**
 * Ata un sondeo a una ventana. Devuelve cómo soltarlo.
 *
 * Soltarlo importa: sin quitar los oyentes, cada montaje dejaría uno más y al
 * cabo de unas navegaciones un solo regreso dispararía media docena de
 * comprobaciones.
 */
export function conectarSondeo(
  ventana: VentanaSondeo,
  entorno: Omit<EntornoSondeo, 'visible'>,
  revisionConocida?: number,
): { sondeo: SondeoRevision; desconectar: () => void } {
  const sondeo = new SondeoRevision({ ...entorno, visible: () => !ventana.oculto() });
  const alVolver = () => sondeo.alCambiarVisibilidad();

  for (const evento of EVENTOS_DE_REGRESO) ventana.escuchar(evento, alVolver);
  sondeo.arrancar(revisionConocida);

  return {
    sondeo,
    desconectar: () => {
      for (const evento of EVENTOS_DE_REGRESO) ventana.olvidar(evento, alVolver);
      sondeo.parar();
    },
  };
}

/** La ventana de verdad. `null` fuera del navegador: esto no corre en el servidor. */
export function ventanaDelNavegador(): VentanaSondeo | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return {
    oculto: () => document.hidden === true,
    escuchar: (evento, fn) => window.addEventListener(evento, fn),
    olvidar: (evento, fn) => window.removeEventListener(evento, fn),
  };
}
