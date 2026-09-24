/**
 * La identidad de quien usa la aplicación (Bloque G, G3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El router de E no conoce usuarios: conoce **un `id_token` de Google por
 * petición**, lo verifica contra `tokeninfo` y resuelve el acceso con el correo
 * que trae. Hasta ahora ese token solo se pedía una vez, al entrar, y quien lo
 * guardaba era Firebase Auth. G3 lo saca de ahí.
 *
 * LO QUE HAY QUE SABER ANTES DE TOCAR ESTO
 * ────────────────────────────────────────
 * **El `id_token` dura una hora y el navegador no puede renovarlo por su
 * cuenta.** Google Identity Services no expone un refresco programático: no hay
 * token de refresco en el navegador, y la propia documentación avisa de que
 * `exp` no sirve para gestionar la sesión. Lo más parecido a una renovación
 * silenciosa es volver a pedir la credencial con `auto_select`, que **funciona
 * cuando hay una sola sesión de Google ya consentida** y puede no funcionar —o
 * enseñar interfaz— en cualquier otro caso.
 *
 * Por eso este módulo no promete una renovación silenciosa. Promete lo que sí
 * se puede sostener:
 *
 *   1. **Intentarlo con antelación**, en el margen de diez minutos: si va a
 *      fallar, que falle cuando todavía quedan diez minutos de token bueno y no
 *      cuando ya no queda ninguno.
 *   2. **Aguantar con el token viejo** mientras siga siendo válido. Un fallo de
 *      red a los 50 minutos no puede echar de una consulta a medio escribir a
 *      quien todavía tiene diez minutos de sesión.
 *   3. **Pedir entrar de nuevo una sola vez**, y solo cuando ya no hay token
 *      que valga.
 *
 * EL TOKEN NO SE GUARDA EN NINGÚN SITIO
 * ─────────────────────────────────────
 * Vive en memoria del módulo y se pierde al recargar, igual que los tokens de
 * acceso en `googleTokenManager.ts`. Es una credencial: en `localStorage` la
 * lee cualquier extensión. Hay una prueba que lo fija.
 */

/** Diez minutos: se renueva a los 50 de una hora. */
export const MARGEN_RENOVACION_MS = 10 * 60 * 1000;

/**
 * Cuándo caduca un `id_token`, en milisegundos.
 *
 * Se lee del `exp` sin verificar la firma, y está bien que así sea: **esto no
 * es una comprobación de seguridad**, es saber cuándo conviene pedir otro. Quien
 * verifica de verdad es el router, contra Google, en cada petición. Un token
 * manipulado para parecer fresco no engaña a nadie: lo rechaza el backend.
 */
export function expiracionDe(idToken: unknown): number | null {
  const partes = String(idToken ?? '').split('.');
  if (partes.length < 2 || partes[1].length === 0) return null;

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const crudo =
      typeof atob === 'function'
        ? atob(relleno)
        : Buffer.from(relleno, 'base64').toString('binary');

    const carga = JSON.parse(crudo) as { exp?: unknown };
    const exp = Number(carga?.exp);
    // El `exp` de un JWT va en **segundos**. Tratarlo como milisegundos daría
    // una caducidad en 1970 y una renovación en bucle.
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export interface EntornoSesion {
  /**
   * Pide una credencial nueva a Google.
   *
   * Devuelve el `id_token`, o `null` si no se pudo sin molestar al usuario.
   * Puede lanzar: un `interaction_required` de GIS es lo normal, no una
   * anomalía.
   */
  renovar(): Promise<string | null>;
  ahora(): number;
  /** Ya no hay sesión y hay que volver a entrar. Se llama **una vez**. */
  pedirEntrarDeNuevo(): void;
  registrarFallo(error: unknown): void;
}

export class SesionGoogle {
  private readonly entorno: EntornoSesion;
  private token: string | null = null;
  private expira: number | null = null;
  private renovando: Promise<void> | null = null;
  private yaPedido = false;
  private readonly oyentes = new Set<() => void>();

  constructor(entorno: EntornoSesion) {
    this.entorno = entorno;
  }

  /** Llega una credencial: del inicio de sesión, o de una renovación. */
  recibir(idToken: string | null): void {
    const expira = expiracionDe(idToken);
    if (!idToken || expira === null) return;

    this.token = idToken;
    this.expira = expira;
    // Vuelve a armarse el aviso: si esta sesión caduca, habrá que decirlo otra
    // vez.
    this.yaPedido = false;
    this.avisarLlegada();
  }

  /**
   * Avisa cada vez que llega una credencial válida, del inicio o de una
   * renovación. Lo usa la carga al entrar: tras un F5 la credencial llega
   * segundos después de montar, y hay que enterarse entonces. Devuelve la baja.
   */
  alRecibir(oyente: () => void): () => void {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  }

  private avisarLlegada(): void {
    for (const oyente of [...this.oyentes]) {
      try {
        oyente();
      } catch {
        // Un oyente roto no puede costar la sesión.
      }
    }
  }

  /** Cierre de sesión. No es una caducidad, así que no se avisa de nada. */
  olvidar(): void {
    this.token = null;
    this.expira = null;
    this.renovando = null;
    this.yaPedido = false;
  }

  /** ¿Queda sesión utilizable, sin salir a pedir nada? */
  get vigente(): boolean {
    return this.token !== null && this.expira !== null && this.entorno.ahora() < this.expira;
  }

  /**
   * El token con el que firmar la siguiente petición, o `null` si ya no hay
   * sesión.
   *
   * Nunca devuelve un token caducado: mandarlo sería gastar una petición para
   * que el router conteste `TOKEN_INVALIDO`, y quien usa la aplicación vería un
   * error donde debería ver una invitación a entrar.
   */
  async idToken(): Promise<string | null> {
    if (this.token === null || this.expira === null) return null;

    const restante = this.expira - this.entorno.ahora();
    if (restante > MARGEN_RENOVACION_MS) return this.token;

    await this.renovacion();

    if (this.vigente) return this.token;

    // Aquí ya no hay nada que hacer con lo que tenemos.
    if (!this.yaPedido) {
      this.yaPedido = true;
      this.entorno.pedirEntrarDeNuevo();
    }
    return null;
  }

  /**
   * Fuerza una renovación aunque el token parezca fresco.
   *
   * La usa el repositorio cuando el router contesta `TOKEN_INVALIDO`: un token
   * puede dejar de valer antes de su `exp` —el titular revocó el acceso, el
   * reloj del dispositivo va adelantado— y el `exp` no se entera.
   */
  async renovarAhora(): Promise<string | null> {
    await this.renovacion();
    return this.vigente ? this.token : null;
  }

  /**
   * Una renovación a la vez.
   *
   * Cada una puede ser un diálogo de Google. Tres peticiones simultáneas
   * pidiendo tres credenciales es la peor manera posible de enterarse de que la
   * sesión iba a caducar.
   */
  private renovacion(): Promise<void> {
    if (this.renovando) return this.renovando;

    this.renovando = this.pedirCredencial().finally(() => {
      this.renovando = null;
    });
    return this.renovando;
  }

  private async pedirCredencial(): Promise<void> {
    try {
      const nuevo = await this.entorno.renovar();
      const expira = expiracionDe(nuevo);

      // Una credencial que no mejora lo que ya había no es una renovación. GIS
      // puede contestar con la misma que tenía, y darla por buena dejaría un
      // bucle de renovaciones que no renuevan nada.
      if (nuevo && expira !== null && expira > this.entorno.ahora()) {
        this.token = nuevo;
        this.expira = expira;
        this.avisarLlegada();
      }
    } catch (error) {
      // Que no se pueda renovar en silencio es lo esperado en más navegadores
      // de los que gustaría. No es una excepción: es el caso que este módulo
      // existe para sobrevivir.
      this.entorno.registrarFallo(error);
    }
  }
}

/**
 * Un `id_token` de mentira con la caducidad que se le pida.
 *
 * Vive aquí y no en el fichero de pruebas porque lo usan varias suites, y
 * **no tiene firma**: no sirve contra Google ni contra el router, que verifica
 * cada token contra `tokeninfo`. Solo sirve para mover el reloj.
 */
export function tokenFalsoParaPruebas(expiraEnMs: number): string {
  const carga = JSON.stringify({ sub: 'pruebas', exp: Math.floor(expiraEnMs / 1000) });
  const base64 =
    typeof btoa === 'function' ? btoa(carga) : Buffer.from(carga, 'binary').toString('base64');
  return ['cabecera', base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'firma'].join(
    '.',
  );
}
