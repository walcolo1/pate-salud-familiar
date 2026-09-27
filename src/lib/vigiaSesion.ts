/**
 * El vigía de la sesión (cierre del Bloque H)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decide cuándo hay que pedir a alguien que vuelva a entrar con Google, y
 * cuándo deja de hacer falta.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * El `id_token` solo vive en memoria (G3b). Cualquier recarga lo tira, y tras
 * ella el usuario sigue «dentro» —está en el almacenamiento local— mientras GIS
 * intenta devolver la credencial en silencio. Si no lo consigue —FedCM limita
 * la reentrada automática, hay varias cuentas, se cerró el aviso—, la
 * aplicación se quedaba sin credencial **y sin decirlo**: «La sesión caducó»
 * al pulsar cualquier cosa, «Mi familia (0)» y ningún botón para salir del
 * paso. El aviso de volver a entrar existía en `identidadGis`, pero AppContext
 * no lo conectaba a nada.
 *
 * Se pide entrar cuando hay un usuario de Google activo y:
 *   · no llega credencial en `PLAZO_CREDENCIAL_MS`,
 *   · GIS avisa de que no pudo renovar, o
 *   · una llamada falla por falta de identidad.
 *
 * Y se deja de pedir en cuanto llega una credencial, o al cerrar sesión.
 */

/** Lo que se le da a GIS para devolver la credencial en silencio tras un F5. */
export const PLAZO_CREDENCIAL_MS = 10_000;

export interface DependenciasVigia {
  programar(fn: () => void, ms: number): unknown;
  cancelar(id: unknown): void;
  hayCredencial(): boolean;
  alCambiar(hayQueEntrar: boolean): void;
}

export class VigiaSesion {
  private activo = false;
  private pedir = false;
  private espera: unknown = null;

  constructor(private readonly deps: DependenciasVigia) {}

  get hayQueEntrar(): boolean {
    return this.pedir;
  }

  /** Entra o sale un usuario de Google. */
  usuarioActivo(activo: boolean): void {
    this.activo = activo;
    this.cancelarEspera();
    if (!activo) {
      this.fijar(false);
      return;
    }
    if (this.deps.hayCredencial()) return;
    this.espera = this.deps.programar(() => {
      this.espera = null;
      if (this.activo && !this.deps.hayCredencial()) this.fijar(true);
    }, PLAZO_CREDENCIAL_MS);
  }

  /** Llegó una credencial válida: del botón, del regreso silencioso o de una renovación. */
  llegoCredencial(): void {
    this.cancelarEspera();
    this.fijar(false);
  }

  /** GIS no pudo renovar una sesión a punto de caducar. */
  sesionPerdida(): void {
    if (this.activo) this.fijar(true);
  }

  /** Una llamada al Web App falló porque no había con qué firmarla. */
  faltoIdentidad(): void {
    if (this.activo && !this.deps.hayCredencial()) this.fijar(true);
  }

  private cancelarEspera(): void {
    if (this.espera !== null) this.deps.cancelar(this.espera);
    this.espera = null;
  }

  private fijar(valor: boolean): void {
    if (this.pedir === valor) return;
    this.pedir = valor;
    try {
      this.deps.alCambiar(valor);
    } catch {
      // Un oyente roto no puede dejar el vigía a medias.
    }
  }
}
