/**
 * Router — la puerta única del backend (Bloque E, E6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aquí se juntan las tres piezas. Todo entra por `doPost` y pasa por la misma
 * cadena, en este orden y sin saltos:
 *
 *   1. Leer el cuerpo            → `ERROR_PAYLOAD`
 *   2. E3 · verificar el token    → `TOKEN_INVALIDO`
 *   3. E4 · resolver el acceso    → `ACCESO_DENEGADO`
 *   4. E5 · comprobar el permiso  → `PERMISO_INSUFICIENTE`
 *   5. Despachar
 *
 * Una sola puerta es una sola puerta que auditar. No hay función expuesta al
 * exterior que se salte un eslabón, y el orden no es negociable: sin identidad
 * no hay rol, y sin rol no hay permiso.
 *
 * POR QUÉ ESTE FICHERO ES PURO
 * ────────────────────────────
 * `despacharPeticion` recibe sus dependencias en un objeto. Eso permite probar
 * la cadena entera —token inválido, acceso revocado, permiso insuficiente,
 * cerrojo ocupado— con dobles y sin red, que es justo lo que no se puede hacer
 * dentro de Apps Script. `Router.gs` se limita a atarle las funciones reales.
 */

import type { Acceso } from './acceso';
import { type Verbo } from './permisos';

// ─────────────────────────────────────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Versión del contrato con la PWA. Sube cuando cambie la forma de responder.
 *
 * VIVE AQUÍ Y NO EN `Router.gs` A PROPÓSITO
 * ─────────────────────────────────────────
 * `ping` la devuelve sin token, así que cualquiera —incluida la sonda— puede
 * preguntarle a un despliegue **qué versión está sirviendo de verdad**, y
 * compararla con la que espera el repositorio.
 *
 * Eso no es cosmético. Guardar el código en el editor de Apps Script no
 * cambia lo que sirve la URL: hace falta publicar una versión nueva. Cuando no
 * se hace, el síntoma aparece lejos de la causa —una fila que se escribe a
 * medias, un correo que no sale— y nada dice que el problema sea el
 * despliegue. Teniéndola aquí, la sonda lo detecta antes de intentar nada.
 */
export const VERSION_CONTRATO = 'e7';

export const CODIGOS_ERROR = [
  'ERROR_PAYLOAD',
  'TOKEN_INVALIDO',
  'ACCESO_DENEGADO',
  'PERMISO_INSUFICIENTE',
  'ACCION_DESCONOCIDA',
  'ERROR_CERROJO',
  'ERROR_DESPACHO',
  'ERROR_INTERNO',
  // E7 · los de aceptar una invitación. Estos SÍ distinguen el motivo, y está
  // razonado en `invitaciones.ts`: para llegar hasta ellos hay que traer un
  // token, que es un secreto. Ninguno dice para quién era la invitación.
  'INVITACION_DESCONOCIDA',
  'INVITACION_EXPIRADA',
  'INVITACION_YA_USADA',
  'INVITACION_REVOCADA',
  'INVITACION_DESTINATARIO_INVALIDO',
] as const;
export type CodigoError = (typeof CODIGOS_ERROR)[number];

export interface Solicitud {
  idToken?: unknown;
  accion?: unknown;
  payload?: unknown;
}

export type Respuesta =
  | { ok: true; data: unknown }
  | { ok: false; error: CodigoError };

export interface DefinicionAccion {
  /** Verbo que exige. `null` solo para las acciones sin identidad. */
  verbo: Verbo | null;
  /** Si el verbo es por paciente, de dónde sale el identificador. */
  campoPaciente?: string;
  /** `true` cuando la acción escribe. Sirve para el registro y el cerrojo. */
  muta?: boolean;
  /**
   * Si exige un `id_token` válido. Por omisión, **sí**.
   *
   * Solo `ping` dice que no, y está razonado abajo.
   */
  exigeToken?: boolean;
  /**
   * Si exige una fila activa en `ACCESO`. Por omisión, **sí**.
   *
   * `aceptarInvitacion` es la única que dice que no, y no puede ser de otra
   * manera: quien acepta tiene identidad verificada y **todavía no tiene
   * acceso**, que es exactamente lo que viene a conseguir.
   *
   * Es la segunda excepción a la cadena y es más delicada que `ping`, así que
   * está declarada aquí en vez de vivir como un caso especial dentro del
   * despacho: una marca en una tabla se puede recorrer con una prueba, un `if`
   * escondido no.
   */
  exigeAcceso?: boolean;
}

/** Por omisión se exige todo. Lo que no se declara, se cierra. */
export const exigeToken = (d: DefinicionAccion): boolean => d.exigeToken !== false;
export const exigeAcceso = (d: DefinicionAccion): boolean => d.exigeAcceso !== false;

/**
 * El catálogo de acciones.
 *
 * Una acción que no esté aquí devuelve `ACCION_DESCONOCIDA`. Igual que con los
 * verbos en E5: lo que no está escrito no existe.
 */
export const ACCIONES: Record<string, DefinicionAccion> = {
  /**
   * La única acción anónima, y la excepción está medida.
   *
   * `ping` no lee nada y no dice nada: responde que el endpoint está vivo y
   * habla JSON. **No devuelve el correo del titular, ni el identificador de la
   * hoja, ni la revisión**, porque el endpoint es público y cualquiera puede
   * llamarlo. Existe para que la PWA compruebe la URL que acaba de pegar el
   * titular antes de registrarla, y para que la sonda de E0-bis siga sirviendo
   * como prueba de vida.
   */
  ping: { verbo: null, exigeToken: false, exigeAcceso: false },

  obtenerRevision: { verbo: 'LISTAR_PACIENTES' },
  listarPacientes: { verbo: 'LISTAR_PACIENTES' },
  verCatalogos: { verbo: 'VER_CATALOGOS' },
  consultar: { verbo: 'LEER_HISTORIA', campoPaciente: 'pacienteId' },
  aplicar: { verbo: 'LISTAR_PACIENTES', muta: true },
  invitar: { verbo: 'ADMINISTRAR_ACCESOS', muta: true },
  cambiarRol: { verbo: 'ADMINISTRAR_ACCESOS', muta: true },
  revocar: { verbo: 'ADMINISTRAR_ACCESOS', muta: true },
  /**
   * Canjear una invitación. La única acción con identidad y sin acceso.
   *
   * No lleva verbo porque no hay rol contra el que comprobarlo: el rol es el
   * resultado de esta llamada, no su requisito. Lo que la protege no es la
   * matriz de E5 sino el token, que es un secreto de 244 bits con caducidad y
   * un solo uso.
   */
  aceptarInvitacion: { verbo: null, exigeAcceso: false, muta: true },

  verAuditoria: { verbo: 'VER_AUDITORIA' },
  exportar: { verbo: 'EXPORTAR_EXPEDIENTE' },
};

export const esAccion = (v: unknown): boolean =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACCIONES, v);

// ─────────────────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────────────────

export interface Mutacion {
  /** Pestaña de destino. */
  tabla?: unknown;
  /** A quién afecta, si la tabla cuelga de un paciente. */
  pacienteId?: unknown;
  /** `HUMANO` o `MASCOTA`, para los verbos que distinguen especie. */
  especie?: unknown;
  /** La fila, ya como objeto. El router no interpreta su contenido. */
  fila?: unknown;
}

/**
 * Qué verbo exige escribir en cada pestaña.
 *
 * Una pestaña que no esté aquí **no se puede escribir por `aplicar`**. Es
 * deliberado: `ACCESO` se muta solo por `mutarAcceso`, que lleva su cerrojo y
 * sube la versión, y `AUDITORIA` solo se añade desde dentro. Dejar que el
 * cliente escribiera en cualquiera de las dos sería regalar la llave.
 */
export const VERBO_POR_TABLA: Record<string, Verbo> = {
  PACIENTES: 'EDITAR_PACIENTE',
  PERFIL_HUMANO: 'EDITAR_PACIENTE',
  PERFIL_MASCOTA: 'EDITAR_PACIENTE',
  CITAS: 'ESCRIBIR_CITA',
  VACUNAS: 'ESCRIBIR_VACUNA',
  EXAMENES: 'ESCRIBIR_CONTROL',
  EXAMENES_RESULTADOS: 'ESCRIBIR_CONTROL',
  CONTROLES: 'ESCRIBIR_CONTROL',
  PESOS: 'ESCRIBIR_CONTROL',
  DOCUMENTOS: 'SUBIR_DOCUMENTO',
  MEDICAMENTOS: 'ESCRIBIR_MEDICACION',
  DOSIS: 'MARCAR_DOSIS',
  ORDENES: 'ESCRIBIR_ORDEN',
  RECORDATORIOS: 'ESCRIBIR_CITA',
  HISTORIAL: 'ESCRIBIR_HISTORIAL_VET',
};

/** Pestañas que `aplicar` nunca toca, por mucho permiso que se tenga. */
export const TABLAS_PROHIBIDAS = ['ACCESO', 'AUDITORIA', 'CONFIG'];

export function verboDeTabla(tabla: unknown): Verbo | null {
  if (typeof tabla !== 'string') return null;
  if (TABLAS_PROHIBIDAS.indexOf(tabla) !== -1) return null;
  return Object.prototype.hasOwnProperty.call(VERBO_POR_TABLA, tabla)
    ? VERBO_POR_TABLA[tabla]
    : null;
}

export interface ResultadoValidacion {
  ok: boolean;
  /** Índice de la mutación que falló. `-1` si el lote entero está bien. */
  indice: number;
  error?: CodigoError;
}

/**
 * Valida el lote **entero antes de escribir nada**.
 *
 * Es la parte transaccional que de verdad importa. Escribir las tres primeras
 * mutaciones y descubrir en la cuarta que falta permiso deja el expediente a
 * medias, y un expediente a medias es peor que uno sin cambiar: nadie sabe qué
 * entró y qué no.
 */
export function validarLote(
  acceso: Acceso,
  mutaciones: readonly Mutacion[],
  puede: (a: Acceso, v: Verbo, p?: unknown, e?: unknown) => boolean,
): ResultadoValidacion {
  if (!Array.isArray(mutaciones) || mutaciones.length === 0) {
    return { ok: false, indice: -1, error: 'ERROR_PAYLOAD' };
  }

  for (let i = 0; i < mutaciones.length; i++) {
    const m = mutaciones[i] || {};
    const verbo = verboDeTabla(m.tabla);
    if (!verbo) return { ok: false, indice: i, error: 'ERROR_PAYLOAD' };
    if (!puede(acceso, verbo, m.pacienteId, m.especie)) {
      return { ok: false, indice: i, error: 'PERMISO_INSUFICIENTE' };
    }
  }

  return { ok: true, indice: -1 };
}

/** Propiedad donde vive la revisión del documento. */
export const CLAVE_REVISION = 'REVISION_DOCUMENTO';

export function revisionDesde(crudo: unknown): number {
  const n = typeof crudo === 'number' ? crudo : Number(String(crudo ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * La siguiente revisión.
 *
 * Sube **una vez por lote**, no una por mutación: la revisión sirve para que un
 * cliente sepa si su copia se quedó vieja, y un lote es un solo cambio desde
 * fuera.
 */
export function siguienteRevision(crudo: unknown): number {
  return revisionDesde(crudo) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// El despacho
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que devuelve E3: quién llama, según Google. */
export interface Identidad {
  email: string;
  sub: string;
}

export interface Dependencias {
  /** E3. Lanza si el token no vale. */
  verificarIdentidad: (idToken: unknown) => Identidad;
  /** E4. Lanza si el correo no tiene acceso activo. */
  resolverAcceso: (email: string) => Acceso;
  /** E5. */
  puede: (a: Acceso, v: Verbo, p?: unknown, e?: unknown) => boolean;
  /**
   * Lo que hace cada acción, ya autorizada.
   *
   * Reciben también la **identidad**, porque `aceptarInvitacion` no tiene
   * acceso del que sacar el correo: el suyo sale del `id_token` y de ningún
   * otro sitio. Los demás manejadores la ignoran.
   */
  manejadores: Record<
    string,
    (payload: Record<string, unknown>, acceso: Acceso, identidad: Identidad | null) => unknown
  >;
  /** Para dejar constancia. Si lanza, se ignora: ver `despacharPeticion`. */
  registrar?: (evento: string, detalle: string) => void;
}

const respuestaError = (error: CodigoError): Respuesta => ({ ok: false, error });

/**
 * La cadena completa, de la solicitud a la respuesta.
 *
 * Nunca lanza: cualquier fallo sale como `{ ok: false, error }`. Una excepción
 * que se escapara dejaría que Apps Script respondiera con su propia página de
 * error, que además de inútil para el cliente enseña la traza.
 */
export function despacharPeticion(solicitud: Solicitud, deps: Dependencias): Respuesta {
  // El registro es lo menos importante de la cadena y no puede tumbar una
  // petición. Se envuelve en vez de confiar en que quien lo pase se porte
  // bien: `console.warn` no falla, pero un día alguien inyectará algo que
  // escribe en la hoja, y ese día sí.
  const anotar = (evento: string, detalle: string): void => {
    if (!deps.registrar) return;
    try {
      deps.registrar(evento, detalle);
    } catch {
      /* que un registro roto no cueste una respuesta */
    }
  };

  // 1 · El cuerpo.
  if (!solicitud || typeof solicitud !== 'object') return respuestaError('ERROR_PAYLOAD');

  const nombre = solicitud.accion;
  if (!esAccion(nombre)) {
    anotar('accion_desconocida', String(nombre));
    return respuestaError('ACCION_DESCONOCIDA');
  }
  const definicion = ACCIONES[nombre as string];

  const payload =
    solicitud.payload && typeof solicitud.payload === 'object' && !Array.isArray(solicitud.payload)
      ? (solicitud.payload as Record<string, unknown>)
      : {};

  // 2 · Identidad. `ping` se salta esto, y al saltárselo se salta también los
  //     dos pasos siguientes: no hay forma de tener verbo sin identidad.
  let acceso: Acceso | null = null;
  let identidad: Identidad | null = null;

  if (exigeToken(definicion)) {
    try {
      identidad = deps.verificarIdentidad(solicitud.idToken);
    } catch {
      anotar('token_rechazado', nombre as string);
      return respuestaError('TOKEN_INVALIDO');
    }
  }

  // 3 · Acceso. `aceptarInvitacion` se salta ESTE paso y solo este: llegó con
  //     identidad verificada y viene justo a conseguir el acceso que no tiene.
  if (exigeAcceso(definicion)) {
    if (!identidad) {
      // Imposible por construcción —una prueba lo fija—, pero el orden de la
      // cadena no puede depender de que nadie se equivoque editando la tabla.
      anotar('configuracion_incoherente', nombre as string);
      return respuestaError('TOKEN_INVALIDO');
    }
    try {
      acceso = deps.resolverAcceso(identidad.email);
    } catch {
      anotar('acceso_denegado', nombre as string);
      return respuestaError('ACCESO_DENEGADO');
    }

    // 4 · Permiso.
    if (definicion.verbo) {
      const pacienteId = definicion.campoPaciente ? payload[definicion.campoPaciente] : undefined;
      const especie = definicion.campoPaciente ? payload.especie : undefined;
      if (!deps.puede(acceso, definicion.verbo, pacienteId, especie)) {
        anotar('permiso_insuficiente', nombre as string);
        return respuestaError('PERMISO_INSUFICIENTE');
      }
    }
  }

  // 5 · Despacho.
  const manejador = deps.manejadores ? deps.manejadores[nombre as string] : undefined;
  if (typeof manejador !== 'function') {
    anotar('sin_manejador', nombre as string);
    return respuestaError('ACCION_DESCONOCIDA');
  }

  try {
    return { ok: true, data: manejador(payload, acceso as Acceso, identidad) };
  } catch (err) {
    const codigo = codigoDeExcepcion(err);
    anotar('fallo_manejador', (nombre as string) + ':' + codigo);
    return respuestaError(codigo);
  }
}

/**
 * Traduce una excepción a un código del contrato.
 *
 * Nunca devuelve el mensaje original: una traza de Apps Script puede llevar
 * nombres de función, identificadores de hoja y trozos de datos. Lo que sale es
 * una palabra; el detalle se queda en el registro de ejecuciones.
 */
export function codigoDeExcepcion(err: unknown): CodigoError {
  const mensaje = err && (err as Error).message ? String((err as Error).message) : '';

  // Los de invitación van primero: `INVITACION_DESTINATARIO_INVALIDO` no debe
  // caer en ninguna de las reglas de abajo por contener una subcadena suya.
  for (const codigo of CODIGOS_ERROR) {
    if (codigo.indexOf('INVITACION_') === 0 && mensaje.indexOf(codigo) !== -1) return codigo;
  }

  if (mensaje.indexOf('OCUPADO') !== -1 || mensaje.indexOf('Lock') !== -1) return 'ERROR_CERROJO';
  if (mensaje.indexOf('ACCESO_DENEGADO') !== -1) return 'ACCESO_DENEGADO';
  if (mensaje.indexOf('TOKEN_INVALIDO') !== -1) return 'TOKEN_INVALIDO';
  if (mensaje.indexOf('PERMISO') !== -1) return 'PERMISO_INSUFICIENTE';
  if (mensaje.indexOf('PAYLOAD') !== -1) return 'ERROR_PAYLOAD';
  return 'ERROR_DESPACHO';
}

/**
 * Lee el cuerpo de la petición.
 *
 * Llega como `text/plain` por costumbre prudente —E0-bis midió que
 * `application/json` también cruza—, así que el contenido es JSON de todas
 * formas y se lee igual.
 */
export function leerSolicitud(crudo: unknown): Solicitud | null {
  if (typeof crudo !== 'string' || crudo.length === 0) return null;
  try {
    const objeto = JSON.parse(crudo) as unknown;
    if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) return null;
    return objeto as Solicitud;
  } catch {
    return null;
  }
}

/**
 * Traza anonimizada para `AUDITORIA`.
 *
 * Deja qué se tocó y cuántas filas, **nunca el contenido**. Una auditoría que
 * copia los datos que audita duplica el problema que intenta vigilar.
 */
export function trazaDeLote(mutaciones: readonly Mutacion[]): string {
  const cuenta: Record<string, number> = {};
  for (let i = 0; i < (mutaciones || []).length; i++) {
    const tabla = String((mutaciones[i] || {}).tabla || 'DESCONOCIDA');
    cuenta[tabla] = (cuenta[tabla] || 0) + 1;
  }
  const partes: string[] = [];
  const tablas = Object.keys(cuenta).sort();
  for (let j = 0; j < tablas.length; j++) partes.push(tablas[j] + ':' + cuenta[tablas[j]]);
  return partes.join(' ');
}
