/**
 * La cola de reenvío, en el disco (Bloque H)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta G4 la cola guardaba **funciones** en memoria. Un F5, o cerrar el
 * navegador sin conexión, perdía los cambios pendientes: seguían en pantalla
 * porque el estado local sí se guarda, pero nunca llegaban a la hoja.
 *
 * Ahora se guardan los lotes de mutaciones **ya construidos**, en JSON, y se
 * guardan ANTES de enviarlos. Si la pestaña muere a mitad de la petición, el
 * lote sigue en el disco y sale en la siguiente ocasión. Reenviar algo que sí
 * llegó es inofensivo: la hoja solo anexa y la última fila manda, así que una
 * fila repetida dice exactamente lo mismo.
 *
 * DÓNDE, Y POR QUÉ ESTO NO ES UNA EXCEPCIÓN NUEVA
 * ──────────────────────────────────────────────
 * En `localStorage`, bajo `pate:cola:v1`. Contiene datos clínicos, igual que
 * el estado local (`pate-salud-state:*`) que ya vive ahí, y los trata igual:
 * la purga del cierre de sesión lo borra. La única diferencia la decide quien
 * cierra: ver `motivosCierre` en `cierreSesion.ts`.
 *
 * LO QUE HAY EN EL DISCO NO SE CREE A CIEGAS
 * ──────────────────────────────────────────
 * Cualquier extensión del navegador puede escribir en este almacén. Al leer se
 * valida cada lote, y uno que intente escribir en una pestaña que `aplicar` no
 * acepta —`ACCESO`, `AUDITORIA`— se descarta aquí, antes de llegar al router
 * que de todos modos lo rechazaría.
 */

import { nuevaSal } from './huellaCuenta';
import { verboDeTabla } from './router';
import type { Mutacion } from './transporteBackend';

export const CLAVE_COLA = 'pate:cola:v1';
/**
 * v1 (Bloque H): lotes sin dueño. v2 (Bloque I): cada lote lleva la huella de
 * la cuenta que lo hizo, y la cola guarda la sal con la que se calcula. Se
 * leen las dos; se escribe siempre la 2.
 */
const VERSION = 2;

/** Lo mínimo de `Storage`. */
export interface AlmacenCola {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** Qué hace una mutación. Se guarda para quien lea la cola; no viaja. */
export type AccionMutacion = 'ESCRIBIR' | 'DAR_DE_BAJA';

/** Una mutación tal como se guarda: entidad, acción y carga. */
export interface MutacionGuardada extends Mutacion {
  accion: AccionMutacion;
}

export interface LotePendiente {
  id: string;
  /**
   * Bloque I · la huella de la cuenta que hizo el cambio (`huellaCuenta.ts`),
   * nunca el identificador. `null` en los lotes que vienen de la cola v1:
   * esos no los envía nadie hasta que se atribuyan.
   */
  cuenta: string | null;
  /** Cuándo se hizo el cambio. ISO 8601. */
  creadoEn: string;
  mutaciones: MutacionGuardada[];
}

function accionDe(m: Mutacion): AccionMutacion {
  const baja = m.fila?.borrado_en;
  return baja !== undefined && baja !== null && baja !== '' ? 'DAR_DE_BAJA' : 'ESCRIBIR';
}

/** Lo que se manda al router: la mutación exacta, sin la acción. */
export function paraEnviar(lote: LotePendiente): Mutacion[] {
  return lote.mutaciones.map((m) => {
    const salida: Mutacion = { tabla: m.tabla, fila: m.fila };
    if (m.pacienteId !== undefined) salida.pacienteId = m.pacienteId;
    if (m.especie !== undefined) salida.especie = m.especie;
    return salida;
  });
}

const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function mutacionValida(v: unknown): v is MutacionGuardada {
  if (!esObjetoPlano(v)) return false;
  if (typeof v.tabla !== 'string' || verboDeTabla(v.tabla) === null) return false;
  if (!esObjetoPlano(v.fila)) return false;
  if (v.accion !== 'ESCRIBIR' && v.accion !== 'DAR_DE_BAJA') return false;
  if (v.pacienteId !== undefined && typeof v.pacienteId !== 'string') return false;
  if (v.especie !== undefined && v.especie !== 'HUMANO' && v.especie !== 'MASCOTA') return false;
  return true;
}

function loteValido(v: unknown): v is LotePendiente {
  if (!esObjetoPlano(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (v.cuenta !== undefined && v.cuenta !== null && (typeof v.cuenta !== 'string' || v.cuenta.length === 0)) return false;
  if (typeof v.creadoEn !== 'string' || Number.isNaN(Date.parse(v.creadoEn))) return false;
  if (!Array.isArray(v.mutaciones) || v.mutaciones.length === 0) return false;
  return v.mutaciones.every(mutacionValida);
}

interface Leido {
  sal: string | null;
  lotes: LotePendiente[];
}

function leer(almacen: AlmacenCola | null | undefined): Leido {
  const vacio: Leido = { sal: null, lotes: [] };
  if (!almacen) return vacio;
  try {
    const crudo = almacen.getItem(CLAVE_COLA);
    if (!crudo) return vacio;
    const datos = JSON.parse(crudo) as { version?: unknown; sal?: unknown; lotes?: unknown };
    if ((datos?.version !== 1 && datos?.version !== VERSION) || !Array.isArray(datos.lotes)) return vacio;
    const sal = datos.version === VERSION && typeof datos.sal === 'string' && /^[0-9a-f]{32}$/.test(datos.sal) ? datos.sal : null;
    // Un lote v1 no tiene dueño: se lee como `null` y espera a que se atribuya.
    const lotes = datos.lotes.filter(loteValido).map((l) => ({ ...l, cuenta: datos.version === VERSION ? (l.cuenta ?? null) : null }));
    return { sal, lotes };
  } catch {
    return vacio;
  }
}

/** Lee y valida lo que hay en el disco. Nunca lanza. */
export function leerCola(almacen: AlmacenCola | null | undefined): LotePendiente[] {
  return leer(almacen).lotes;
}

function idAleatorio(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `lote-${c.randomUUID()}`;
  return `lote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface OpcionesCola {
  ahora?: () => string;
  generarId?: () => string;
}

export class ColaDuradera {
  private enMemoria: LotePendiente[];
  private salActual: string | null;
  private escrituraFallida = false;
  private readonly ahora: () => string;
  private readonly generarId: () => string;

  constructor(
    private readonly almacen: AlmacenCola | null,
    opciones: OpcionesCola = {},
  ) {
    this.ahora = opciones.ahora ?? (() => new Date().toISOString());
    this.generarId = opciones.generarId ?? idAleatorio;
    const leido = leer(almacen);
    this.enMemoria = leido.lotes;
    this.salActual = leido.sal;
  }

  /**
   * La sal de las huellas de este navegador. Se crea la primera vez que hace
   * falta y se guarda con la cola; si la cola se purga, se va con ella.
   */
  get sal(): string {
    if (this.salActual === null) {
      this.salActual = nuevaSal();
      this.persistir();
    }
    return this.salActual;
  }

  /** El primer lote de una cuenta: el orden se respeta dentro de cada una. */
  primeroDe(cuenta: string): LotePendiente | null {
    return this.enMemoria.find((l) => l.cuenta === cuenta) ?? null;
  }

  longitudDe(cuenta: string): number {
    return this.enMemoria.filter((l) => l.cuenta === cuenta).length;
  }

  /**
   * Migración de la cola v1: da dueño a los lotes que no lo tenían. Solo debe
   * llamarse con la cuenta que estaba dentro cuando se crearon. Devuelve
   * cuántos atribuyó.
   */
  atribuirSinCuenta(cuenta: string): number {
    let n = 0;
    this.enMemoria = this.enMemoria.map((l) => {
      if (l.cuenta !== null) return l;
      n++;
      return { ...l, cuenta };
    });
    if (n > 0) this.persistir();
    return n;
  }

  get longitud(): number {
    return this.enMemoria.length;
  }

  /** ¿Sobrevive lo encolado a una recarga? Falso sin almacén o si se llenó. */
  get duradera(): boolean {
    return this.almacen !== null && !this.escrituraFallida;
  }

  lotes(): readonly LotePendiente[] {
    return this.enMemoria;
  }

  primero(): LotePendiente | null {
    return this.enMemoria[0] ?? null;
  }

  /** Guarda un lote al final. Devuelve `null` si no había nada que guardar. */
  encolar(mutaciones: readonly Mutacion[], cuenta: string | null): LotePendiente | null {
    if (mutaciones.length === 0) return null;
    const lote: LotePendiente = {
      id: this.generarId(),
      cuenta,
      creadoEn: this.ahora(),
      mutaciones: mutaciones.map((m) => ({ ...m, accion: accionDe(m) })),
    };
    this.enMemoria = [...this.enMemoria, lote];
    this.persistir();
    return lote;
  }

  quitar(id: string): void {
    this.enMemoria = this.enMemoria.filter((l) => l.id !== id);
    this.persistir();
  }

  /** Solo tras un descarte explícito de quien usa la aplicación. */
  descartarTodo(): void {
    this.enMemoria = [];
    this.persistir();
  }

  private persistir(): void {
    if (!this.almacen) return;
    try {
      if (this.enMemoria.length === 0) {
        // Vacía, la clave desaparece: nada clínico se queda en el disco sin
        // motivo.
        this.almacen.removeItem(CLAVE_COLA);
      } else {
        if (this.salActual === null) this.salActual = nuevaSal();
        this.almacen.setItem(CLAVE_COLA, JSON.stringify({ version: VERSION, sal: this.salActual, lotes: this.enMemoria }));
      }
      this.escrituraFallida = false;
    } catch {
      // Almacén lleno o bloqueado. El lote sigue en memoria y se reenviará
      // mientras la pestaña viva; `duradera` lo dice para poder avisar.
      this.escrituraFallida = true;
    }
  }
}
