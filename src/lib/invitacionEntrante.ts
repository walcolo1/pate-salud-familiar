/**
 * La invitación vista desde la PWA (Bloque E, E9)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `/invitacion?t=…&backend=…` es la **única ruta pública que recibe una URL de
 * un desconocido y luego le habla**. Todo lo demás en esta aplicación se
 * conecta a sitios que decidimos nosotros; aquí el destino viene en la barra de
 * direcciones, y eso cambia el problema entero.
 *
 * Si no se valida, un enlace como
 * `…/invitacion?t=x&backend=https://malo.example/robar` haría que la PWA
 * mandara el `id_token` del usuario a donde diga quien escribió el enlace. Con
 * la marca de la aplicación en la barra, la pantalla de Google de verdad y una
 * sesión real: un phishing perfecto que no necesita imitar nada.
 *
 * Por eso `backend` se compara contra una forma exacta —el `/exec` de un Web
 * App de Apps Script y nada más— antes de tocarlo. Es una lista blanca de
 * formas, no un saneamiento.
 *
 * QUÉ SE GUARDA, Y QUÉ NO
 * ───────────────────────
 * Solo la dirección del backend de esa familia, que es lo que la aplicación
 * necesita para volver a hablar con la hoja correcta. **Ni el correo, ni el
 * `id_token`, ni el identificador de la hoja, ni el token de invitación.**
 */

import { z } from 'zod';
import { esTokenBienFormado } from './invitaciones';

// ─────────────────────────────────────────────────────────────────────────────
// La dirección del backend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La forma exacta de un despliegue de Apps Script.
 *
 * Tres cosas que el patrón hace a propósito:
 *
 *   · **Ancla los dos extremos.** Sin `^` y `$`, `https://malo.example/?x=https://script.google.com/macros/s/A/exec`
 *     pasaría.
 *   · **Exige `script.google.com` exacto**, no «que contenga». `script.google.com.malo.example`
 *     contiene la cadena y es otro dominio.
 *   · **Exige que termine en `/exec`**. `/dev` sirve la última versión guardada
 *     y pide sesión iniciada: no es lo que usa un familiar.
 */
export const PATRON_BACKEND =
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

export function esUrlBackendValida(url: unknown): boolean {
  return typeof url === 'string' && PATRON_BACKEND.test(url.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Los parámetros
// ─────────────────────────────────────────────────────────────────────────────

/** Por qué no se puede ni intentar. */
export const MOTIVOS_PARAMETRO = [
  'FALTA_TOKEN',
  'TOKEN_MAL_FORMADO',
  'FALTA_BACKEND',
  'BACKEND_NO_PERMITIDO',
] as const;
export type MotivoParametro = (typeof MOTIVOS_PARAMETRO)[number];

/**
 * El esquema de lo que puede llegar en la barra de direcciones.
 *
 * El token se valida con `esTokenBienFormado`, la misma función que usa el
 * backend: si la PWA aceptara formas que el servidor rechaza, o al revés, el
 * usuario vería un error distinto según por dónde entrara.
 */
export const esquemaParametrosInvitacion = z.object({
  t: z
    .string({ error: 'FALTA_TOKEN' })
    .min(1, { error: 'FALTA_TOKEN' })
    .refine(esTokenBienFormado, { error: 'TOKEN_MAL_FORMADO' }),
  backend: z
    .string({ error: 'FALTA_BACKEND' })
    .min(1, { error: 'FALTA_BACKEND' })
    .refine(esUrlBackendValida, { error: 'BACKEND_NO_PERMITIDO' }),
});

export type ParametrosInvitacion = z.infer<typeof esquemaParametrosInvitacion>;

export type LecturaParametros =
  | { ok: true; token: string; backend: string }
  | { ok: false; motivo: MotivoParametro };

/** Lo mínimo que necesitamos de unos parámetros de búsqueda. */
export interface FuenteParametros {
  get(clave: string): string | null;
}

/**
 * Lee y valida lo que trae la URL.
 *
 * Devuelve **un solo motivo**, el primero que falle, porque la pantalla enseña
 * un mensaje y no una lista: a quien abre un enlace roto no le sirve saber que
 * además el otro parámetro tampoco valía.
 */
export function leerParametros(fuente: FuenteParametros | null | undefined): LecturaParametros {
  const crudo = {
    t: fuente?.get('t') ?? undefined,
    backend: fuente?.get('backend') ?? undefined,
  };

  const resultado = esquemaParametrosInvitacion.safeParse(crudo);
  if (resultado.success) {
    return { ok: true, token: resultado.data.t.trim(), backend: resultado.data.backend.trim() };
  }

  const primero = resultado.error.issues[0];
  const motivo = primero?.message as MotivoParametro;
  return {
    ok: false,
    motivo: MOTIVOS_PARAMETRO.indexOf(motivo) === -1 ? 'TOKEN_MAL_FORMADO' : motivo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Qué se le dice a la persona
// ─────────────────────────────────────────────────────────────────────────────

export interface Mensaje {
  titulo: string;
  cuerpo: string;
  /** Si tiene sentido volver a pulsar el botón. */
  reintentable: boolean;
}

/**
 * Un mensaje por cada final posible.
 *
 * **Ninguno dice de quién era la invitación, ni a qué familia pertenece, ni
 * qué correo esperaba.** El de la cuenta equivocada es el que más tienta: sería
 * cómodo escribir «esta invitación es para ana@…», y sería contarle a quien
 * tenga el enlace quién está en esta familia.
 *
 * Lo que sí hace cada mensaje es decir **qué hacer ahora**. Un error que no
 * propone un siguiente paso es un callejón sin salida, y en una pantalla de
 * alta es el punto exacto donde la gente abandona.
 */
export const MENSAJES: Record<string, Mensaje> = {
  FALTA_TOKEN: {
    titulo: 'Este enlace está incompleto',
    cuerpo:
      'Le falta una parte. Suele pasar cuando se copia a mano o el programa de correo lo parte en dos líneas. Prueba a abrirlo pulsando directamente sobre el enlace del correo.',
    reintentable: false,
  },
  TOKEN_MAL_FORMADO: {
    titulo: 'Este enlace está incompleto',
    cuerpo:
      'Le falta una parte. Suele pasar cuando se copia a mano o el programa de correo lo parte en dos líneas. Prueba a abrirlo pulsando directamente sobre el enlace del correo.',
    reintentable: false,
  },
  FALTA_BACKEND: {
    titulo: 'Este enlace está incompleto',
    cuerpo:
      'No dice a qué expediente pertenece. Pide a quien te invitó que te mande el enlace otra vez.',
    reintentable: false,
  },
  BACKEND_NO_PERMITIDO: {
    titulo: 'Este enlace no es de fiar',
    cuerpo:
      'Apunta a un sitio que no es el de Paté, así que no vamos a enviar nada a esa dirección. Si te lo mandó alguien de confianza, pídele que lo genere de nuevo desde la aplicación.',
    reintentable: false,
  },

  /*
   * Este mensaje cubre DOS situaciones que el backend no puede distinguir, y
   * por eso las nombra las dos.
   *
   * Al aceptar, el token se consume: `ACEPTAR` vacía `token_hash`. Desde ese
   * momento la fila ya no se encuentra buscando por hash, así que **volver a
   * abrir un enlace ya usado no llega a `INVITACION_YA_USADA`: llega aquí.**
   *
   * Se descubrió el 20 de septiembre de 2026, abriendo por segunda vez un
   * enlace real. La primera versión decía «pide una nueva», que es
   * exactamente el consejo equivocado para quien ya está dentro y solo tiene
   * que iniciar sesión.
   */
  INVITACION_DESCONOCIDA: {
    titulo: 'Este enlace ya no sirve',
    cuerpo:
      'Si ya entraste con él, no necesitas otro: inicia sesión con normalidad desde la pantalla de acceso. Si nunca llegaste a entrar, pide una invitación nueva a quien te invitó.',
    reintentable: false,
  },
  INVITACION_EXPIRADA: {
    titulo: 'El enlace caducó',
    cuerpo:
      'Las invitaciones duran siete días. Pide una nueva a quien te invitó y ábrela cuanto antes.',
    reintentable: false,
  },
  INVITACION_YA_USADA: {
    titulo: 'Esta invitación ya se usó',
    cuerpo:
      'Cada enlace sirve una sola vez. Si ya entraste antes, inicia sesión con normalidad desde la pantalla de acceso.',
    reintentable: false,
  },
  INVITACION_REVOCADA: {
    titulo: 'Este acceso se retiró',
    cuerpo: 'Quien te invitó canceló la invitación. Si crees que es un error, habla con esa persona.',
    reintentable: false,
  },
  INVITACION_DESTINATARIO_INVALIDO: {
    titulo: 'Estás en la cuenta equivocada',
    cuerpo:
      'Esta invitación se envió a otra cuenta de Google. Cambia a la cuenta en la que recibiste el correo y vuelve a abrir el enlace.',
    reintentable: true,
  },

  TOKEN_INVALIDO: {
    titulo: 'No se pudo comprobar tu sesión',
    cuerpo: 'Vuelve a identificarte con Google. Si sigue fallando, cierra la pestaña y abre el enlace otra vez.',
    reintentable: true,
  },
  ERROR_CERROJO: {
    titulo: 'El expediente está ocupado',
    cuerpo: 'Alguien está guardando cambios en este momento. Espera unos segundos y vuelve a intentarlo.',
    reintentable: true,
  },
  SIN_RED: {
    titulo: 'No se pudo conectar',
    cuerpo: 'Comprueba tu conexión y vuelve a intentarlo.',
    reintentable: true,
  },
};

/** El mensaje por defecto: no adivina y no culpa a nadie. */
export const MENSAJE_DESCONOCIDO: Mensaje = {
  titulo: 'No se pudo aceptar la invitación',
  cuerpo: 'Ha fallado algo por el camino. Vuelve a intentarlo y, si persiste, pide una invitación nueva.',
  reintentable: true,
};

export function mensajeDe(codigo: unknown): Mensaje {
  const clave = typeof codigo === 'string' ? codigo : '';
  return Object.prototype.hasOwnProperty.call(MENSAJES, clave)
    ? MENSAJES[clave]
    : MENSAJE_DESCONOCIDO;
}

// ─────────────────────────────────────────────────────────────────────────────
// La petición
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El cuerpo que se manda al backend.
 *
 * `text/plain` por costumbre prudente: E0-bis midió que `application/json`
 * también cruza, pero lo que funciona con seguridad no cuesta nada.
 */
export function cuerpoAceptacion(idToken: string, token: string): string {
  return JSON.stringify({
    idToken,
    accion: 'aceptarInvitacion',
    payload: { t: token },
  });
}

export type RespuestaBackend = { ok?: unknown; error?: unknown; data?: unknown };

export type Desenlace =
  | { estado: 'ACEPTADA' }
  | { estado: 'RECHAZADA'; mensaje: Mensaje };

/**
 * Qué ha pasado, a partir de lo que devolvió el backend.
 *
 * Una respuesta que no se entiende **no es un éxito**. Parece obvio y es el
 * fallo clásico de este tipo de pantallas: comprobar `!data.error` en vez de
 * `data.ok === true` deja pasar un HTML de error, una redirección o un cuerpo
 * vacío como si fueran una bienvenida.
 */
export function interpretarRespuesta(cuerpo: RespuestaBackend | null | undefined): Desenlace {
  if (cuerpo && cuerpo.ok === true) return { estado: 'ACEPTADA' };
  return { estado: 'RECHAZADA', mensaje: mensajeDe(cuerpo?.error) };
}

// ─────────────────────────────────────────────────────────────────────────────
// La sesión familiar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dónde se recuerda con qué expediente habla esta instalación.
 *
 * **Solo la dirección del backend.** Nada de correo, nada de `id_token`, nada
 * de identificadores de hoja: la regla de A6-F3 sigue en pie y esto es la única
 * excepción, porque sin ella la aplicación no sabría a qué hoja hablar en la
 * siguiente visita y habría que pegar el enlace cada vez.
 *
 * Aun así es una URL con capacidad: quien la tenga puede llamar al endpoint.
 * Vive en el mismo sitio que la sesión del navegador y desaparece con ella.
 */
export const CLAVE_SESION_FAMILIAR = 'pate:familia:v1';

/** Lo mínimo de `Storage`. Inyectable para poder probarlo sin navegador. */
export interface AlmacenSimple {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/**
 * Guarda la dirección del backend, si es una de las que aceptamos.
 *
 * Se revalida al guardar **y** al leer. Guardar sin comprobar convertiría el
 * almacenamiento local —que cualquier extensión puede escribir— en una forma de
 * saltarse la validación de la URL.
 */
export function guardarBackend(url: unknown, almacen: AlmacenSimple | null | undefined): boolean {
  if (!esUrlBackendValida(url) || !almacen) return false;
  try {
    almacen.setItem(CLAVE_SESION_FAMILIAR, String(url).trim());
    return true;
  } catch {
    // Modo privado, cuota llena, almacenamiento bloqueado. No es motivo para
    // tumbar un alta que por lo demás fue bien.
    return false;
  }
}

export function leerBackend(almacen: AlmacenSimple | null | undefined): string | null {
  if (!almacen) return null;
  try {
    const guardado = almacen.getItem(CLAVE_SESION_FAMILIAR);
    return esUrlBackendValida(guardado) ? String(guardado).trim() : null;
  } catch {
    return null;
  }
}

export function olvidarBackend(almacen: AlmacenSimple | null | undefined): void {
  try {
    almacen?.removeItem(CLAVE_SESION_FAMILIAR);
  } catch {
    /* si no se puede borrar, tampoco se puede hacer nada mejor */
  }
}
