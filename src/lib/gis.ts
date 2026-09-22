/**
 * El propietario único de Google Identity Services (Bloque G, G3b)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `google.accounts.id.initialize` es **global y tiene un solo dueño**: quien la
 * llama se queda con la devolución de llamada. Hasta G3b la llamaban dos sitios
 * —`/login` y `/invitacion`— y la renovación de G3 habría sido un tercero.
 *
 * EL FALLO QUE ESO PROVOCA NO SE VE
 * ─────────────────────────────────
 * **No hay error.** El último en inicializar se queda las credenciales y al
 * anterior sencillamente deja de llamársele. La pantalla se queda esperando un
 * inicio de sesión que ya ocurrió, en otra parte, para otro.
 *
 * Por eso aquí hay un solo `initialize` y un reparto a **todos** los
 * interesados. Quien quiera credenciales se suscribe; nadie vuelve a
 * inicializar.
 *
 * LA API ENTRA POR PARÁMETRO
 * ──────────────────────────
 * Para poder probar el reparto, el plazo de espera y la doble renovación sin un
 * navegador y sin Google. Lo que no se puede probar así es que Google conteste,
 * y eso es de la comprobación en vivo.
 */

/** Lo que se usa de `window.google`. Solo esto. */
export interface ApiGis {
  accounts: {
    id: {
      initialize(opciones: {
        client_id: string;
        callback: (respuesta: { credential: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(destino: HTMLElement, opciones: Record<string, unknown>): void;
      prompt(): void;
      disableAutoSelect(): void;
    };
  };
}

/**
 * Cuánto se espera una credencial antes de rendirse.
 *
 * Bastante para una respuesta real y poco para que alguien crea que se colgó el
 * guardado que la estaba esperando.
 */
export const ESPERA_RENOVACION_MS = 8_000;

type Oyente = (credencial: string) => void;

interface OpcionesProveedor {
  clientId: string;
  /** `false` en `/invitacion`. Ver `inicializar`. */
  autoSeleccionar?: boolean;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

export class ProveedorGis {
  private readonly api: ApiGis | null;
  private readonly clientId: string;
  private readonly programar: (fn: () => void, ms: number) => unknown;
  private readonly cancelar: (id: unknown) => void;

  private inicializado = false;
  /** Lo que usará una inicialización implícita, desde `renderizarBoton`. */
  private autoSeleccionPorOmision = true;
  private readonly oyentes = new Set<Oyente>();
  /** La renovación en curso, si la hay. */
  private espera: { resolver: (c: string | null) => void; plazo: unknown } | null = null;

  constructor(api: ApiGis | null, opciones: OpcionesProveedor) {
    this.api = api;
    this.autoSeleccionPorOmision = opciones.autoSeleccionar !== false;
    this.clientId = opciones.clientId;
    this.programar = opciones.programar ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancelar = opciones.cancelar ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  /** Si hay un GIS con el que hablar. */
  get listo(): boolean {
    return this.api !== null;
  }

  /**
   * Inicializa, una sola vez.
   *
   * `auto_select` es lo que hace que la sesión sobreviva a un F5: la decisión
   * de G3b fue no guardar el token en ningún sitio, así que quien lo devuelve
   * al recargar es Google. Funciona cuando hay una sola cuenta ya consentida;
   * cuando no, se ve el botón, que es el peor caso aceptado.
   *
   * SALVO EN `/invitacion`, Y NO ES UN DETALLE
   * ──────────────────────────────────────────
   * Ahí se pide **sin** reentrada automática. Una invitación es para una
   * cuenta concreta, y entrar con la que hubiera abierta es el error más
   * probable de todo el flujo: E9 lo cerró a propósito y está comprobado en
   * vivo. Un propietario único que impusiera `auto_select` a todos volvería a
   * abrir justo ese agujero.
   */
  inicializar(opciones: { autoSeleccionar?: boolean } = {}): void {
    if (this.inicializado || !this.api) return;
    this.inicializado = true;

    const autoSeleccionar = opciones.autoSeleccionar !== false;

    this.api.accounts.id.initialize({
      client_id: this.clientId,
      auto_select: autoSeleccionar,
      // Que un clic fuera no cancele: quien está rellenando un formulario no
      // debería perder la reentrada por tocar la pantalla.
      cancel_on_tap_outside: false,
      callback: (respuesta) => this.repartir(respuesta?.credential),
    });

    // `auto_select: false` dice «no elijas por mí ahora»; `disableAutoSelect`
    // borra la elección recordada. Hacen falta las dos, y es lo que hacía
    // `/invitacion` antes de este módulo.
    if (!autoSeleccionar) this.api.accounts.id.disableAutoSelect();
  }

  /** Suscribe a las credenciales. Devuelve cómo darse de baja. */
  alRecibir(oyente: Oyente): () => void {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  }

  /** Dibuja el botón de Google. Inicializa antes si hacía falta. */
  renderizarBoton(destino: HTMLElement, opciones: Record<string, unknown> = {}): void {
    this.inicializar({ autoSeleccionar: this.autoSeleccionPorOmision });
    if (!this.api || !destino) return;
    this.api.accounts.id.renderButton(destino, opciones);
  }

  /**
   * Pide una credencial nueva.
   *
   * Devuelve `null` si Google no contesta a tiempo, que es lo normal en más
   * navegadores de los que gustaría: sin sesión, con varias cuentas, con las
   * cookies de terceros bloqueadas. Sin el plazo, la promesa se quedaría
   * colgada y con ella el guardado que la esperaba.
   */
  renovar(): Promise<string | null> {
    this.inicializar({ autoSeleccionar: this.autoSeleccionPorOmision });
    if (!this.api) return Promise.resolve(null);

    // Una a la vez: cada `prompt()` puede enseñar interfaz, y dos seguidos son
    // la peor manera de avisar de que la sesión caducaba.
    if (this.espera) return this.promesaEnCurso();

    const promesa = new Promise<string | null>((resolver) => {
      const plazo = this.programar(() => this.cerrarEspera(null), ESPERA_RENOVACION_MS);
      this.espera = { resolver, plazo };
    });

    this.pendiente = promesa;
    this.api.accounts.id.prompt();
    return promesa;
  }

  /** Cierre de sesión: que no vuelva a entrar solo en la siguiente carga. */
  olvidarSesion(): void {
    this.cerrarEspera(null);
    if (!this.api) return;
    this.api.accounts.id.disableAutoSelect();
  }

  // ── Dentro ────────────────────────────────────────────────────────────────

  private pendiente: Promise<string | null> | null = null;

  private promesaEnCurso(): Promise<string | null> {
    return this.pendiente ?? Promise.resolve(null);
  }

  private repartir(credencial: unknown): void {
    const token = typeof credencial === 'string' ? credencial : '';
    if (token.length === 0) return;

    // Primero se cierra la renovación que la esperaba, y **además** se
    // reparte: una credencial de renovación también es un inicio de sesión, y
    // no repartirla dejaría la pantalla enseñando los datos de la anterior.
    this.cerrarEspera(token);

    for (const oyente of [...this.oyentes]) {
      try {
        oyente(token);
      } catch {
        // Una pantalla con un fallo al pintar no puede tumbar el inicio de
        // sesión de la aplicación entera.
      }
    }
  }

  private cerrarEspera(credencial: string | null): void {
    const espera = this.espera;
    if (!espera) return;

    this.espera = null;
    this.pendiente = null;
    this.cancelar(espera.plazo);
    espera.resolver(credencial);
  }
}

/** El `window.google` de verdad, o `null` si todavía no ha cargado. */
export function apiGisDelNavegador(): ApiGis | null {
  if (typeof window === 'undefined') return null;
  const google = (window as unknown as { google?: { accounts?: { id?: unknown } } }).google;
  return google?.accounts?.id ? (google as unknown as ApiGis) : null;
}
