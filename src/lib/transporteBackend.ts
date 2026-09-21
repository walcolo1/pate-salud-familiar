/**
 * El transporte contra el router del titular (Bloque G, G0)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Una sola función habla con el backend de E6: monta la petición, la manda,
 * lee la respuesta y traduce lo que venga a algo con lo que se pueda decidir.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO
 * ─────────────────────
 * Aquí está la conversación. **No está el mapeo** de modelos a filas, que es
 * lo que se quedó parado esperando una decisión (ver `G0-BRECHA-DE-MODELO.md`).
 * Este fichero no cambia con ninguna de las tres salidas posibles, y por eso se
 * pudo escribir ya.
 *
 * EL `fetch` ENTRA POR PARÁMETRO
 * ──────────────────────────────
 * Para poder probar la traducción de errores sin red y sin un despliegue. Un
 * transporte que solo se puede ejercitar contra Google es un transporte que no
 * se prueba.
 */

import { esUrlBackendValida } from './invitacionEntrante';

/** Lo que el router puede contestar. Copiado del contrato de E6, no inventado. */
export type CodigoBackend =
  | 'ERROR_PAYLOAD'
  | 'TOKEN_INVALIDO'
  | 'ACCESO_DENEGADO'
  | 'PERMISO_INSUFICIENTE'
  | 'ACCION_DESCONOCIDA'
  | 'ERROR_CERROJO'
  | 'ERROR_DESPACHO'
  | 'ERROR_INTERNO'
  | 'INVITACION_DESCONOCIDA'
  | 'INVITACION_EXPIRADA'
  | 'INVITACION_YA_USADA'
  | 'INVITACION_REVOCADA'
  | 'INVITACION_DESTINATARIO_INVALIDO';

/** Los que se arreglan solos reintentando. El resto, no. */
export const CODIGOS_REINTENTABLES: readonly CodigoBackend[] = [
  'ERROR_CERROJO',
  'ERROR_DESPACHO',
  'ERROR_INTERNO',
];

/** Lo que no vino del router: red, CSP, o una respuesta que no se entiende. */
export const FALLO_TRANSPORTE = 'FALLO_TRANSPORTE';

export class ErrorBackend extends Error {
  readonly codigo: string;
  readonly reintentable: boolean;

  constructor(codigo: string, detalle?: string) {
    super(detalle ? `${codigo}: ${detalle}` : codigo);
    this.name = 'ErrorBackend';
    this.codigo = codigo;
    this.reintentable =
      codigo === FALLO_TRANSPORTE ||
      (CODIGOS_REINTENTABLES as readonly string[]).indexOf(codigo) !== -1;
  }
}

export interface ContextoTransporte {
  /** La `/exec` de esta familia. Se valida antes de usarse. */
  url: string;
  /** El `id_token` de quien llama. No se guarda en ninguna parte. */
  idToken: string;
  /** Inyectable para poder probar sin red. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Manda una acción y devuelve su `data`.
 *
 * SE VALIDA LA URL AUNQUE VENGA DE CASA
 * ─────────────────────────────────────
 * La dirección sale del almacenamiento local, y el almacenamiento local lo
 * puede escribir cualquier extensión del navegador. Es la misma razón por la
 * que `leerBackend` la revalida al leerla: comprobar solo al guardar convierte
 * ese almacén en la forma de saltarse la comprobación.
 *
 * UNA RESPUESTA QUE NO SE ENTIENDE NO ES UN ÉXITO
 * ───────────────────────────────────────────────
 * Se exige `ok === true`. Mirar `!error` dejaría pasar como buenos un HTML de
 * sesión caducada, una redirección o un cuerpo vacío — y el fallo aparecería
 * mucho después, cuando alguien buscara el dato que creyó haber guardado.
 */
export async function pedir<T = unknown>(
  contexto: ContextoTransporte,
  accion: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const { url, idToken } = contexto ?? ({} as ContextoTransporte);

  if (!esUrlBackendValida(url)) throw new ErrorBackend('ERROR_PAYLOAD', 'la URL no es un /exec');
  if (typeof idToken !== 'string' || idToken.length === 0) {
    // Se corta aquí en vez de dejar que el router conteste: gastar una llamada
    // de red para que nos digan lo que ya sabemos no ayuda a nadie.
    throw new ErrorBackend('TOKEN_INVALIDO', 'sin id_token');
  }

  const cuerpo = JSON.stringify(
    payload === undefined ? { idToken, accion } : { idToken, accion, payload },
  );

  const hacerPeticion = contexto.fetch ?? globalThis.fetch;
  let respuesta: Response;
  try {
    respuesta = await hacerPeticion(url, {
      method: 'POST',
      // `text/plain` por costumbre prudente: E0-bis midió que
      // `application/json` también cruza.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: cuerpo,
    });
  } catch (err) {
    throw new ErrorBackend(FALLO_TRANSPORTE, (err as Error)?.message ?? 'sin red');
  }

  if (!respuesta.ok) throw new ErrorBackend(FALLO_TRANSPORTE, `HTTP ${respuesta.status}`);

  let leido: unknown;
  try {
    leido = await respuesta.json();
  } catch {
    throw new ErrorBackend(FALLO_TRANSPORTE, 'la respuesta no es JSON');
  }

  const sobre = leido as { ok?: unknown; data?: unknown; error?: unknown };
  if (!sobre || sobre.ok !== true) {
    const codigo = typeof sobre?.error === 'string' ? sobre.error : FALLO_TRANSPORTE;
    throw new ErrorBackend(codigo);
  }

  return sobre.data as T;
}

/**
 * Una mutación del lote de `aplicar`.
 *
 * El router valida cada una contra el rol de quien la pide **antes de escribir
 * ninguna**, así que un lote entero se acepta o se rechaza: nunca se queda a
 * medias por permisos.
 */
export interface Mutacion {
  tabla: string;
  fila: Record<string, unknown>;
  pacienteId?: string;
  especie?: 'HUMANO' | 'MASCOTA';
}

export interface ResultadoAplicar {
  aplicadas: number;
  revision: number;
}

/**
 * Manda un lote.
 *
 * Un lote vacío **no se manda**. Parece una cortesía y es lo que evita que un
 * guardado sin cambios gaste una ejecución del script; con el sondeo de G2 por
 * delante, esas llamadas de más se acumulan.
 */
export async function aplicar(
  contexto: ContextoTransporte,
  mutaciones: readonly Mutacion[],
): Promise<ResultadoAplicar> {
  const lote = mutaciones ?? [];
  if (lote.length === 0) return { aplicadas: 0, revision: 0 };

  return pedir<ResultadoAplicar>(contexto, 'aplicar', { mutaciones: lote });
}

/** La revisión del documento. Barata: no lee la hoja. La usará G2. */
export async function obtenerRevision(contexto: ContextoTransporte): Promise<number> {
  const data = await pedir<{ revision?: unknown }>(contexto, 'obtenerRevision');
  const revision = Number(data?.revision);
  return Number.isFinite(revision) && revision >= 0 ? revision : 0;
}
