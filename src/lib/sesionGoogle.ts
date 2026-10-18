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

import { cargaDeTicket, esTicketSesion, RENOVAR_TICKET_ANTES_MS } from './autenticacion';

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
/** La carga de un JWT, sin verificar la firma. `null` si no se puede leer. */
function cargaDe(idToken: unknown): Record<string, unknown> | null {
  const partes = String(idToken ?? '').split('.');
  if (partes.length < 2 || partes[1].length === 0) return null;

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const crudo =
      typeof atob === 'function'
        ? atob(relleno)
        : Buffer.from(relleno, 'base64').toString('binary');
    const carga = JSON.parse(crudo) as unknown;
    return carga && typeof carga === 'object' && !Array.isArray(carga) ? (carga as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function expiracionDe(idToken: unknown): number | null {
  const exp = Number(cargaDe(idToken)?.exp);
  // El `exp` de un JWT va en **segundos**. Tratarlo como milisegundos daría
  // una caducidad en 1970 y una renovación en bucle.
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

/**
 * Bloque I · la cuenta de una credencial: su `sub`, el identificador estable de
 * Google. Tampoco es una comprobación de seguridad —la hace el router—: sirve
 * para que la cola no envíe los cambios de una cuenta con la credencial de
 * otra. Nunca se guarda: se compara su huella (`huellaCuenta.ts`).
 */
export function sujetoDe(idToken: unknown): string | null {
  const sub = cargaDe(idToken)?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
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
  /**
   * Sesión persistente (opcional). Sin él, todo funciona como antes: solo
   * `id_token` en memoria.
   */
  ticket?: PuertoTicket;
}

/**
 * Lo que la sesión necesita para no depender de un `id_token` de una hora.
 *
 * El almacén y la red entran por aquí para que este fichero siga sin tocar
 * ninguno de los dos: el `id_token` **sigue sin guardarse en ningún sitio**.
 * Lo que se guarda —fuera de aquí— es el ticket que firma el backend, que no
 * lleva correo, ni nombre, ni `sub`.
 */
export interface PuertoTicket {
  leer(): string | null;
  guardar(ticket: string): void;
  borrar(): void;
  /**
   * Cambia una credencial (un `id_token` recién llegado, o un ticket a punto
   * de caducar) por un ticket nuevo.
   *
   * Devuelve `null` si el backend no lo ofrece o no lo concede: no se vuelve a
   * intentar con esa credencial. **Lanza** si fue algo pasajero (sin red, sin
   * hoja registrada todavía): se reintenta más tarde.
   */
  canjear(credencial: string): Promise<string | null>;
}

/** Tras un fallo pasajero del canje, cuánto se espera para reintentar. */
export const ESPERA_REINTENTO_CANJE_MS = 60_000;

/** Cuándo caduca un ticket, en milisegundos. `null` si no es un ticket. */
export function expiracionDeTicket(ticket: unknown): number | null {
  const carga = cargaDeTicket(ticket);
  return carga ? carga.exp : null;
}

export class SesionGoogle {
  private readonly entorno: EntornoSesion;
  private token: string | null = null;
  private expira: number | null = null;
  private renovando: Promise<void> | null = null;
  private yaPedido = false;
  private readonly oyentes = new Set<() => void>();

  // Sesión persistente.
  private ticket: string | null = null;
  private ticketExpira: number | null = null;
  private canje: Promise<void> | null = null;
  /** La credencial cuyo canje el backend no concedió: no se insiste. */
  private canjeDescartadoPara: string | null = null;
  private reintentarCanjeDesde = 0;
  /**
   * Sube con cada cierre de sesión y con cada credencial nueva. Un canje que
   * termina después no puede dejar guardado el ticket de quien ya se fue.
   */
  private generacion = 0;

  constructor(entorno: EntornoSesion) {
    this.entorno = entorno;
    this.cargarTicket();
  }

  /** Lo que dejó la visita anterior. Un ticket caducado se borra al leerlo. */
  private cargarTicket(): void {
    const puerto = this.entorno.ticket;
    if (!puerto) return;
    let guardado: string | null = null;
    try {
      guardado = puerto.leer();
    } catch {
      guardado = null;
    }
    if (guardado !== null) this.fijarTicket(guardado, false);
  }

  /** Acepta un ticket si es uno y sigue vivo. Si no, lo quita de en medio. */
  private fijarTicket(ticket: string | null, guardar: boolean): boolean {
    const expira = expiracionDeTicket(ticket);
    if (!ticket || !esTicketSesion(ticket) || expira === null || expira <= this.entorno.ahora()) {
      this.descartarTicket();
      return false;
    }
    this.ticket = ticket;
    this.ticketExpira = expira;
    if (guardar) {
      try {
        this.entorno.ticket?.guardar(ticket);
      } catch {
        // Sin almacén la sesión dura lo que la pestaña: como antes.
      }
    }
    return true;
  }

  private descartarTicket(): void {
    this.ticket = null;
    this.ticketExpira = null;
    if (!this.entorno.ticket) return;
    try {
      this.entorno.ticket.borrar();
    } catch {
      /* nada que hacer */
    }
  }

  /** ¿Hay un ticket de sesión utilizable? */
  get conTicket(): boolean {
    return this.ticket !== null && this.ticketExpira !== null && this.entorno.ahora() < this.ticketExpira;
  }

  /** Hasta cuándo dura la sesión guardada en este dispositivo, o `null`. */
  get ticketCaduca(): number | null {
    return this.conTicket ? this.ticketExpira : null;
  }

  /** ¿Hay un `id_token` utilizable? */
  private get tokenVigente(): boolean {
    return this.token !== null && this.expira !== null && this.entorno.ahora() < this.expira;
  }

  /**
   * Cambia una credencial por un ticket. Uno a la vez, y sin insistir con lo
   * que el backend ya rechazó.
   */
  private canjear(credencial: string): Promise<void> {
    const puerto = this.entorno.ticket;
    if (!puerto) return Promise.resolve();
    if (this.canje) return this.canje;
    if (credencial === this.canjeDescartadoPara) return Promise.resolve();
    if (this.entorno.ahora() < this.reintentarCanjeDesde) return Promise.resolve();

    const generacion = this.generacion;
    this.canje = (async () => {
      try {
        const nuevo = await puerto.canjear(credencial);
        if (generacion !== this.generacion) return;
        if (!nuevo || !this.fijarTicket(nuevo, true)) this.canjeDescartadoPara = credencial;
      } catch (error) {
        if (generacion !== this.generacion) return;
        this.reintentarCanjeDesde = this.entorno.ahora() + ESPERA_REINTENTO_CANJE_MS;
        this.entorno.registrarFallo(error);
      }
    })().finally(() => {
      this.canje = null;
    });
    return this.canje;
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

    // Una credencial de Google nueva manda sobre cualquier ticket anterior: si
    // entró otra cuenta, el ticket viejo no puede seguir firmando por ella.
    if (this.entorno.ticket) {
      this.generacion += 1;
      this.descartarTicket();
      this.canjeDescartadoPara = null;
      this.reintentarCanjeDesde = 0;
      void this.canjear(idToken);
    }

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
    this.generacion += 1;
    this.canjeDescartadoPara = null;
    this.reintentarCanjeDesde = 0;
    this.descartarTicket();
  }

  /** ¿Queda sesión utilizable, sin salir a pedir nada? */
  get vigente(): boolean {
    return this.conTicket || this.tokenVigente;
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
    // 1 · Sesión persistente. Se renueva sola, sin esperar a nadie, cuando le
    //     quedan menos de quince días.
    if (this.conTicket) {
      if ((this.ticketExpira as number) - this.entorno.ahora() < RENOVAR_TICKET_ANTES_MS) {
        void this.canjear(this.ticket as string);
      }
      return this.ticket;
    }
    if (this.canje) {
      await this.canje;
      if (this.conTicket) return this.ticket;
    }

    // 2 · El `id_token` de siempre.
    const token = await this.idTokenDeGoogle();

    // 3 · Con un `id_token` en la mano, se intenta conseguir el ticket para no
    //     depender de él dentro de una hora.
    if (token && this.entorno.ticket) {
      await this.canjear(token);
      if (this.conTicket) return this.ticket;
    }
    return token;
  }

  private async idTokenDeGoogle(): Promise<string | null> {
    if (this.token === null || this.expira === null) return null;

    const restante = this.expira - this.entorno.ahora();
    if (restante > MARGEN_RENOVACION_MS) return this.token;

    await this.renovacion();

    if (this.tokenVigente) return this.token;

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
    // Si el que se rechazó fue el ticket —clave rotada, cuenta fuera de
    // ACCESO—, se tira y se vuelve al `id_token` si queda uno bueno.
    if (this.ticket !== null) {
      this.generacion += 1;
      this.descartarTicket();
      if (this.tokenVigente) return this.token;
    }
    await this.renovacion();
    return this.tokenVigente ? this.token : null;
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
export function tokenFalsoParaPruebas(expiraEnMs: number, sub = 'pruebas'): string {
  const carga = JSON.stringify({ sub, exp: Math.floor(expiraEnMs / 1000) });
  const base64 =
    typeof btoa === 'function' ? btoa(carga) : Buffer.from(carga, 'binary').toString('base64');
  return ['cabecera', base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'firma'].join(
    '.',
  );
}
