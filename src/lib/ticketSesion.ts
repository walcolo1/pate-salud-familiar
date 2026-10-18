/**
 * La sesión persistente, del lado del navegador
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `sesionGoogle.ts` sabe cuándo usar un ticket y cuándo pedir otro, pero no
 * toca ni el almacén ni la red: los dos entran por `PuertoTicket`. Aquí está
 * ese puerto.
 *
 * QUÉ SE GUARDA, Y QUÉ NO
 * ───────────────────────
 * Se guarda **solo el ticket**: una cadena opaca que firma el backend de la
 * familia con una clave que nunca sale de allí. Su carga es la huella HMAC de
 * la cuenta, la fecha de emisión y la de caducidad. **Ni correo, ni nombre, ni
 * `sub`**, y el `id_token` de Google sigue sin guardarse en ningún sitio. Hay
 * una prueba que lo fija.
 *
 * Un ticket robado vale lo que vale en la familia que lo emitió, y deja de
 * valer en cuanto la cuenta sale de `ACCESO` o se rota `SESION_SECRETO`. El
 * cierre de sesión lo borra (la purga se lleva todo lo que empieza por
 * `pate`).
 */

import { esTicketSesion, cargaDeTicket } from './autenticacion';
import { leerBackend } from './invitacionEntrante';
import { ErrorBackend, pedir } from './transporteBackend';
import type { PuertoTicket } from './sesionGoogle';

/** Una sola clave, con versión, como el resto de la aplicación. */
export const CLAVE_TICKET = 'pate:sesion:v1';

/** Lo mínimo de `Storage` que hace falta. Inyectable para las pruebas. */
export interface AlmacenTicketLike {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/**
 * Lo que el backend contesta cuando **no** va a dar un ticket, haga lo que haga
 * el cliente: un backend anterior a esta versión, una cuenta sin acceso, una
 * credencial que no vale. Insistir no cambia nada.
 */
const RECHAZOS_DEFINITIVOS = ['ACCION_DESCONOCIDA', 'TOKEN_INVALIDO', 'ACCESO_DENEGADO', 'PERMISO_INSUFICIENTE'];

export interface OpcionesPuerto {
  almacen?: () => AlmacenTicketLike | null;
  url?: () => string | null;
  fetch?: typeof globalThis.fetch;
}

function almacenDelNavegador(): AlmacenTicketLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Lee el ticket guardado. Lo que no tenga forma de ticket, no se devuelve. */
export function leerTicketGuardado(almacen: AlmacenTicketLike | null): string | null {
  if (!almacen) return null;
  let crudo: string | null = null;
  try {
    crudo = almacen.getItem(CLAVE_TICKET);
  } catch {
    return null;
  }
  if (!crudo) return null;
  try {
    const registro = JSON.parse(crudo) as { v?: unknown; t?: unknown } | null;
    if (!registro || registro.v !== 1 || !esTicketSesion(registro.t)) return null;
    return cargaDeTicket(registro.t) ? (registro.t as string) : null;
  } catch {
    return null;
  }
}

export function puertoTicket(opciones: OpcionesPuerto = {}): PuertoTicket {
  const almacen = opciones.almacen ?? almacenDelNavegador;
  const url =
    opciones.url ?? (() => leerBackend(typeof window === 'undefined' ? null : window.localStorage));

  return {
    leer: () => leerTicketGuardado(almacen()),

    guardar: (ticket) => {
      const a = almacen();
      if (!a || !esTicketSesion(ticket)) return;
      // Un objeto con versión y el ticket. Nada más: ni quién, ni cuándo entró.
      a.setItem(CLAVE_TICKET, JSON.stringify({ v: 1, t: ticket }));
    },

    borrar: () => {
      const a = almacen();
      if (a) a.removeItem(CLAVE_TICKET);
    },

    canjear: async (credencial) => {
      const direccion = url();
      // Sin hoja registrada todavía (el titular a mitad de la instalación): no
      // es un rechazo, es «más tarde».
      if (!direccion) throw new ErrorBackend('SIN_BACKEND', 'sin hoja registrada');

      try {
        const data = await pedir<{ ticket?: unknown }>(
          { url: direccion, idToken: credencial, fetch: opciones.fetch },
          'abrirSesion',
        );
        return esTicketSesion(data?.ticket) && cargaDeTicket(data?.ticket) ? (data.ticket as string) : null;
      } catch (error) {
        const codigo = (error as ErrorBackend | null)?.codigo;
        if (typeof codigo === 'string' && RECHAZOS_DEFINITIVOS.indexOf(codigo) !== -1) return null;
        throw error;
      }
    },
  };
}
