import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  PREFIJO_TICKET,
  RENOVAR_TICKET_ANTES_MS,
  VIGENCIA_TICKET_MS,
  asciiABase64Url,
  cargaDeTicket,
  correoDeHuella,
  emitirTicket,
  esTicketSesion,
  firmasIguales,
  huellaDeCorreo,
  verificarTicket,
} from './autenticacion';
import { SesionGoogle, tokenFalsoParaPruebas, type PuertoTicket } from './sesionGoogle';
import { CLAVE_TICKET, leerTicketGuardado, puertoTicket } from './ticketSesion';
import { debeEliminarse } from './purgaLocal';
import { ACCIONES } from './router';

/** El mismo HMAC que hace `Auth.gs` con `Utilities.computeHmacSha256Signature`. */
const firmador = (clave: string) => (texto: string) =>
  createHmac('sha256', clave).update(texto, 'utf8').digest('base64url');

const FIRMAR = firmador('clave-de-pruebas');
const AHORA = Date.UTC(2026, 9, 17, 12, 0, 0);
const TITULAR = 'walter.colorado@gmail.com';

// ─────────────────────────────────────────────────────────────────────────────
// Servidor (lo que se genera a Autenticacion.gs)
// ─────────────────────────────────────────────────────────────────────────────

describe('ticket de sesión · servidor', () => {
  it('base64url coincide con la de Node', () => {
    for (const t of ['', 'a', 'ab', 'abc', '{"v":1,"h":"x","iat":1,"exp":2}', 'pate:cuenta:a+b/c']) {
      expect(asciiABase64Url(t)).toBe(Buffer.from(t, 'utf8').toString('base64url'));
    }
  });

  it('emite un ticket que se verifica con la misma clave', () => {
    const { ticket, expira } = emitirTicket(TITULAR, FIRMAR, AHORA);
    expect(ticket.startsWith(PREFIJO_TICKET)).toBe(true);
    expect(expira).toBe(AHORA + VIGENCIA_TICKET_MS);
    const carga = verificarTicket(ticket, FIRMAR, AHORA + 1000);
    expect(carga.h).toBe(huellaDeCorreo(TITULAR, FIRMAR));
  });

  it('la carga no lleva el correo, ni partes de él', () => {
    const { ticket } = emitirTicket(TITULAR, FIRMAR, AHORA);
    const carga = cargaDeTicket(ticket);
    expect(Object.keys(carga ?? {}).sort()).toEqual(['exp', 'h', 'iat', 'v']);
    const legible = Buffer.from(ticket.slice(PREFIJO_TICKET.length).split('.')[0], 'base64url').toString();
    expect(legible).not.toMatch(/walter|colorado|gmail|@/i);
  });

  it('la huella no depende de los alias de Gmail', () => {
    expect(huellaDeCorreo('Walter.Colorado+eps@gmail.com', FIRMAR)).toBe(huellaDeCorreo(TITULAR, FIRMAR));
  });

  it('otra clave no lo verifica', () => {
    const { ticket } = emitirTicket(TITULAR, FIRMAR, AHORA);
    expect(() => verificarTicket(ticket, firmador('otra-clave'), AHORA)).toThrow('TOKEN_INVALIDO');
  });

  it('una carga manipulada no se verifica', () => {
    const { ticket } = emitirTicket(TITULAR, FIRMAR, AHORA);
    const [cuerpo, firma] = ticket.slice(PREFIJO_TICKET.length).split('.');
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    carga.exp += VIGENCIA_TICKET_MS;
    const falso = PREFIJO_TICKET + Buffer.from(JSON.stringify(carga)).toString('base64url') + '.' + firma;
    expect(() => verificarTicket(falso, FIRMAR, AHORA)).toThrow('TOKEN_INVALIDO');
  });

  it('caduca a los 30 días, sin margen', () => {
    const { ticket, expira } = emitirTicket(TITULAR, FIRMAR, AHORA);
    expect(() => verificarTicket(ticket, FIRMAR, expira - 1)).not.toThrow();
    expect(() => verificarTicket(ticket, FIRMAR, expira)).toThrow('TOKEN_INVALIDO');
  });

  it('no acepta tickets emitidos en el futuro', () => {
    const { ticket } = emitirTicket(TITULAR, FIRMAR, AHORA + 60 * 60 * 1000);
    expect(() => verificarTicket(ticket, FIRMAR, AHORA)).toThrow('TOKEN_INVALIDO');
  });

  it('rechaza lo que no es un ticket', () => {
    for (const malo of [null, '', 'eyJ.abc.def', 'pt1.', 'pt1.abc', 'pt1..firma', PREFIJO_TICKET + 'e30.x']) {
      expect(() => verificarTicket(malo, FIRMAR, AHORA)).toThrow('TOKEN_INVALIDO');
    }
  });

  it('un id_token no se confunde con un ticket', () => {
    expect(esTicketSesion(tokenFalsoParaPruebas(AHORA + 1000))).toBe(false);
    expect(esTicketSesion('pt1.x.y')).toBe(true);
  });

  it('resuelve el correo por la huella entre los que tienen acceso', () => {
    const h = huellaDeCorreo('ana@ejemplo.com', FIRMAR);
    expect(correoDeHuella(h, [TITULAR, 'ANA@ejemplo.com ', 'otro@ejemplo.com'], FIRMAR)).toBe('ana@ejemplo.com');
  });

  it('quien sale de ACCESO deja de resolverse', () => {
    const h = huellaDeCorreo('ana@ejemplo.com', FIRMAR);
    expect(correoDeHuella(h, [TITULAR, 'otro@ejemplo.com', '', null], FIRMAR)).toBeNull();
  });

  it('compara firmas sin atajos y sin aceptar vacíos', () => {
    expect(firmasIguales('abc', 'abc')).toBe(true);
    expect(firmasIguales('abc', 'abd')).toBe(false);
    expect(firmasIguales('', '')).toBe(false);
    expect(firmasIguales('abc', 'abcd')).toBe(false);
  });

  it('abrirSesion exige token y acceso, con el verbo que tiene cualquier rol', () => {
    expect(ACCIONES.abrirSesion).toEqual({ verbo: 'LISTAR_PACIENTES' });
  });

  it('Auth.gs acepta tickets y Router.gs expone abrirSesion', () => {
    const auth = readFileSync(join(process.cwd(), 'apps-script', 'plantilla', 'Auth.gs'), 'utf8');
    const router = readFileSync(join(process.cwd(), 'apps-script', 'plantilla', 'Router.gs'), 'utf8');
    expect(auth).toMatch(/if \(esTicketSesion\(idToken\)\) return verificarTicketSesion_\(idToken\);/);
    expect(auth).toMatch(/computeHmacSha256Signature/);
    expect(router).toMatch(/abrirSesion: function \(payload, acceso, identidad\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cliente · la sesión con ticket
// ─────────────────────────────────────────────────────────────────────────────

function puertoEnMemoria(inicial: string | null = null) {
  let guardado = inicial;
  const canjes: string[] = [];
  let respuesta: () => Promise<string | null> = async () => emitirTicket(TITULAR, FIRMAR, reloj.ahora).ticket;
  const puerto: PuertoTicket = {
    leer: () => guardado,
    guardar: (t) => {
      guardado = t;
    },
    borrar: () => {
      guardado = null;
    },
    canjear: async (c) => {
      canjes.push(c);
      return respuesta();
    },
  };
  return {
    puerto,
    canjes,
    guardado: () => guardado,
    responder: (fn: () => Promise<string | null>) => {
      respuesta = fn;
    },
  };
}

const reloj = { ahora: AHORA };

function sesion(puerto: PuertoTicket) {
  const avisos: string[] = [];
  const renovar = vi.fn(async () => null);
  const s = new SesionGoogle({
    renovar,
    ahora: () => reloj.ahora,
    pedirEntrarDeNuevo: () => avisos.push('entrar'),
    registrarFallo: () => {},
    ticket: puerto,
  });
  return { s, avisos, renovar };
}

describe('ticket de sesión · cliente', () => {
  it('tras un F5, el ticket guardado basta: no hay que volver a entrar', async () => {
    reloj.ahora = AHORA;
    const guardado = emitirTicket(TITULAR, FIRMAR, AHORA - 24 * 60 * 60 * 1000).ticket;
    const m = puertoEnMemoria(guardado);
    const { s, avisos, renovar } = sesion(m.puerto);

    expect(s.vigente).toBe(true);
    expect(s.conTicket).toBe(true);
    expect(await s.idToken()).toBe(guardado);
    expect(avisos).toEqual([]);
    expect(renovar).not.toHaveBeenCalled();
  });

  it('al entrar con Google se canjea el id_token por un ticket y se guarda', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    const { s } = sesion(m.puerto);
    const idToken = tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000);

    s.recibir(idToken);
    const credencial = await s.idToken();

    expect(m.canjes).toEqual([idToken]);
    expect(esTicketSesion(credencial)).toBe(true);
    expect(m.guardado()).toBe(credencial);
  });

  it('una hora después sigue habiendo sesión, sin pedir nada a Google', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    const { s, avisos, renovar } = sesion(m.puerto);
    s.recibir(tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000));
    await s.idToken();

    reloj.ahora = AHORA + 3 * 60 * 60 * 1000;
    expect(s.vigente).toBe(true);
    expect(esTicketSesion(await s.idToken())).toBe(true);
    expect(renovar).not.toHaveBeenCalled();
    expect(avisos).toEqual([]);
  });

  it('se renueva solo cuando le quedan menos de quince días', async () => {
    reloj.ahora = AHORA;
    const viejo = emitirTicket(TITULAR, FIRMAR, AHORA - (VIGENCIA_TICKET_MS - RENOVAR_TICKET_ANTES_MS) - 1000).ticket;
    const m = puertoEnMemoria(viejo);
    const { s } = sesion(m.puerto);

    expect(await s.idToken()).toBe(viejo); // no espera a la renovación
    await new Promise((r) => setTimeout(r, 0));
    expect(m.canjes).toEqual([viejo]);
    expect(m.guardado()).not.toBe(viejo);
    expect(esTicketSesion(m.guardado())).toBe(true);
  });

  it('un ticket caducado se descarta al leerlo', () => {
    reloj.ahora = AHORA;
    const caducado = emitirTicket(TITULAR, FIRMAR, AHORA - VIGENCIA_TICKET_MS - 1).ticket;
    const m = puertoEnMemoria(caducado);
    const { s } = sesion(m.puerto);
    expect(s.vigente).toBe(false);
    expect(m.guardado()).toBeNull();
  });

  it('cerrar sesión borra el ticket', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria(emitirTicket(TITULAR, FIRMAR, AHORA).ticket);
    const { s } = sesion(m.puerto);
    s.olvidar();
    expect(s.vigente).toBe(false);
    expect(m.guardado()).toBeNull();
    expect(await s.idToken()).toBeNull();
  });

  it('un canje que termina después del cierre de sesión no deja nada guardado', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    let soltar: (t: string | null) => void = () => {};
    m.responder(() => new Promise((r) => (soltar = r)));
    const { s } = sesion(m.puerto);
    s.recibir(tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000));
    s.olvidar();
    soltar(emitirTicket(TITULAR, FIRMAR, AHORA).ticket);
    await new Promise((r) => setTimeout(r, 0));
    expect(m.guardado()).toBeNull();
    expect(s.vigente).toBe(false);
  });

  it('una credencial nueva de Google sustituye al ticket anterior', async () => {
    reloj.ahora = AHORA;
    const anterior = emitirTicket('otra@ejemplo.com', FIRMAR, AHORA).ticket;
    const m = puertoEnMemoria(anterior);
    const { s } = sesion(m.puerto);
    s.recibir(tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000));
    const credencial = await s.idToken();
    expect(credencial).not.toBe(anterior);
    expect(cargaDeTicket(credencial)?.h).toBe(huellaDeCorreo(TITULAR, FIRMAR));
  });

  it('si el backend no ofrece tickets, sigue con el id_token y no insiste', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    m.responder(async () => null);
    const { s } = sesion(m.puerto);
    const idToken = tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000);
    s.recibir(idToken);
    expect(await s.idToken()).toBe(idToken);
    expect(await s.idToken()).toBe(idToken);
    expect(m.canjes).toEqual([idToken]);
  });

  it('un fallo pasajero del canje se reintenta pasado un minuto', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    let intentos = 0;
    m.responder(async () => {
      intentos += 1;
      if (intentos === 1) throw new Error('sin red');
      return emitirTicket(TITULAR, FIRMAR, reloj.ahora).ticket;
    });
    const { s } = sesion(m.puerto);
    const idToken = tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000);
    s.recibir(idToken);
    expect(await s.idToken()).toBe(idToken);
    expect(await s.idToken()).toBe(idToken);
    expect(intentos).toBe(1);

    reloj.ahora = AHORA + 61_000;
    expect(esTicketSesion(await s.idToken())).toBe(true);
  });

  it('si el router rechaza el ticket, se tira y se vuelve al id_token', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    const { s } = sesion(m.puerto);
    const idToken = tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000);
    s.recibir(idToken);
    expect(esTicketSesion(await s.idToken())).toBe(true);

    expect(await s.renovarAhora()).toBe(idToken);
    expect(m.guardado()).toBeNull();
  });

  it('sin ticket ni id_token, pide entrar una sola vez', async () => {
    reloj.ahora = AHORA;
    const m = puertoEnMemoria();
    const { s, avisos } = sesion(m.puerto);
    s.recibir(tokenFalsoParaPruebas(AHORA + 60 * 60 * 1000));
    s.olvidar();
    m.responder(async () => null);
    s.recibir(tokenFalsoParaPruebas(AHORA + 5 * 60 * 1000));
    reloj.ahora = AHORA + 6 * 60 * 1000;
    expect(await s.idToken()).toBeNull();
    expect(await s.idToken()).toBeNull();
    expect(avisos).toEqual(['entrar']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cliente · el almacén
// ─────────────────────────────────────────────────────────────────────────────

function almacen(datos: Record<string, string> = {}) {
  return {
    datos,
    getItem: (k: string) => (k in datos ? datos[k] : null),
    setItem: (k: string, v: string) => {
      datos[k] = v;
    },
    removeItem: (k: string) => {
      delete datos[k];
    },
  };
}

describe('ticket de sesión · almacén del navegador', () => {
  const URL = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';

  it('guarda solo el ticket, con versión, bajo una clave que la purga se lleva', () => {
    const a = almacen();
    const p = puertoTicket({ almacen: () => a });
    const { ticket } = emitirTicket(TITULAR, FIRMAR, AHORA);
    p.guardar(ticket);
    expect(Object.keys(a.datos)).toEqual([CLAVE_TICKET]);
    expect(JSON.parse(a.datos[CLAVE_TICKET])).toEqual({ v: 1, t: ticket });
    expect(a.datos[CLAVE_TICKET]).not.toMatch(/walter|colorado|gmail|@/i);
    expect(debeEliminarse(CLAVE_TICKET)).toBe(true);
    expect(p.leer()).toBe(ticket);
    p.borrar();
    expect(a.datos).toEqual({});
  });

  it('no guarda nada que no sea un ticket, como un id_token', () => {
    const a = almacen();
    puertoTicket({ almacen: () => a }).guardar(tokenFalsoParaPruebas(AHORA));
    expect(a.datos).toEqual({});
  });

  it('lo que no tiene forma de ticket no se lee', () => {
    expect(leerTicketGuardado(almacen({ [CLAVE_TICKET]: 'basura' }))).toBeNull();
    expect(leerTicketGuardado(almacen({ [CLAVE_TICKET]: JSON.stringify({ v: 1, t: 'eyJ.a.b' }) }))).toBeNull();
    expect(leerTicketGuardado(null)).toBeNull();
  });

  it('canjea contra abrirSesion con la credencial como idToken', async () => {
    const { ticket } = emitirTicket(TITULAR, FIRMAR, AHORA);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { ticket, expira: 1 } })));
    const p = puertoTicket({ almacen: () => almacen(), url: () => URL, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await p.canjear('cred')).toBe(ticket);
    const cuerpo = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(cuerpo).toEqual({ idToken: 'cred', accion: 'abrirSesion' });
  });

  it('un backend anterior (ACCION_DESCONOCIDA) devuelve null: no se insiste', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'ACCION_DESCONOCIDA' })));
    const p = puertoTicket({ almacen: () => almacen(), url: () => URL, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await p.canjear('cred')).toBeNull();
  });

  it('sin red o sin hoja, lanza: se reintentará', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const p = puertoTicket({ almacen: () => almacen(), url: () => URL, fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(p.canjear('cred')).rejects.toThrow();
    await expect(puertoTicket({ almacen: () => almacen(), url: () => null }).canjear('cred')).rejects.toThrow();
  });

  it('una respuesta sin ticket válido no se acepta', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { ticket: 'eyJ.a.b' } })));
    const p = puertoTicket({ almacen: () => almacen(), url: () => URL, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await p.canjear('cred')).toBeNull();
  });
});
