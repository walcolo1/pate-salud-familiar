/**
 * Ficha ampliada de la mascota (Bloque O).
 *
 * DÓNDE SE GUARDA
 * ───────────────
 * Sin pestañas ni columnas nuevas. `PERFIL_MASCOTA` ya lleva lo que se busca y
 * se filtra (especie, raza, nacimiento, sexo, pesos, responsable); el resto de
 * la ficha —esterilización, microchip, veterinario, alimentación, rutina— es
 * información que solo se lee con la mascota delante, y viaja en la columna
 * `notas` de su fila de `PACIENTES` dentro de un sobre versionado:
 *
 *   {"pate":"ficha-mascota","v":1,"notas":"texto libre","ficha":{…}}
 *
 * Retrocompatible en los dos sentidos: unas notas antiguas (texto plano) se
 * leen como notas sin ficha, y lo que no entienda una versión futura se
 * conserva tal cual (`extra`). La foto va en `foto_url`, que ya existía.
 */

export const ETIQUETA_SOBRE = 'ficha-mascota';
export const VERSION_SOBRE = 1;

export const TAMANOS = ['MINI', 'PEQUENO', 'MEDIANO', 'GRANDE'] as const;
export type Tamano = (typeof TAMANOS)[number];
export const NOMBRE_TAMANO: Record<Tamano, string> = {
  MINI: 'Mini', PEQUENO: 'Pequeño', MEDIANO: 'Mediano', GRANDE: 'Grande',
};

export const ESTADOS_MASCOTA = ['ACTIVO', 'EN_TRATAMIENTO', 'ADOPTADO', 'FALLECIDO'] as const;
export type EstadoMascota = (typeof ESTADOS_MASCOTA)[number];
export const NOMBRE_ESTADO_MASCOTA: Record<EstadoMascota, string> = {
  ACTIVO: 'Activo', EN_TRATAMIENTO: 'En tratamiento', ADOPTADO: 'Adoptado', FALLECIDO: 'Fallecido',
};
/** Adoptado (dado en adopción) y fallecido dejan de estar activos; el historial se conserva. */
export const estadoEsActivo = (e: EstadoMascota) => e === 'ACTIVO' || e === 'EN_TRATAMIENTO';

export const PRESENTACIONES_ALIMENTO = ['SECO', 'HUMEDO', 'BARF', 'CASERO', 'MIXTO'] as const;
export type PresentacionAlimento = (typeof PRESENTACIONES_ALIMENTO)[number];
export const NOMBRE_PRESENTACION: Record<PresentacionAlimento, string> = {
  SECO: 'Seco', HUMEDO: 'Húmedo', BARF: 'BARF / Natural', CASERO: 'Casero', MIXTO: 'Mixto',
};

export interface FichaMascota {
  estado?: EstadoMascota | null;
  esterilizado?: boolean | null;
  fechaEsterilizacion?: string | null;
  microchip?: string | null;
  color?: string | null;
  senas?: string | null;
  tamano?: Tamano | null;
  /** La fecha de nacimiento es una estimación a partir de la edad aproximada. */
  nacimientoAproximado?: boolean | null;
  contacto?: { telefono?: string | null; correo?: string | null } | null;
  veterinario?: { nombre?: string | null; clinica?: string | null; telefono?: string | null; direccion?: string | null } | null;
  cuidadosEspeciales?: {
    alergias?: string | null;
    miedos?: string | null;
    comportamiento?: string | null;
    restricciones?: string | null;
  } | null;
  alimentacion?: {
    marca?: string | null;
    tipo?: string | null;
    presentacion?: PresentacionAlimento | null;
    porcion?: string | null;
    vecesAlDia?: number | null;
    restricciones?: string | null;
  } | null;
  rutina?: {
    paseo?: string | null;
    banoCadaDias?: number | null;
    unasCadaDias?: number | null;
    dentalCadaDias?: number | null;
  } | null;
}

export interface NotasDecodificadas {
  notas: string | null;
  ficha: FichaMascota;
  /** Claves de un sobre más nuevo que esta versión no sabe leer: se conservan. */
  extra?: Record<string, unknown>;
}

/** Quita lo vacío para que el sobre no crezca con claves sin dato. */
function compactar<T>(v: T): T | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return (v.trim() ? v.trim() : undefined) as T | undefined;
  if (typeof v === 'number') return (Number.isFinite(v) ? v : undefined) as T | undefined;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v as T;
  if (typeof v === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const c = compactar(x);
      if (c !== undefined) salida[k] = c;
    }
    return (Object.keys(salida).length ? salida : undefined) as T | undefined;
  }
  return undefined;
}

export function codificarNotasMascota(notas: string | null | undefined, ficha: FichaMascota | null | undefined, extra?: Record<string, unknown>): string {
  const f = compactar(ficha ?? {}) as FichaMascota | undefined;
  const n = (notas ?? '').trim();
  if (!f && !extra) return n; // Sin ficha: las notas quedan como siempre, en texto plano.
  return JSON.stringify({ ...(extra ?? {}), pate: ETIQUETA_SOBRE, v: VERSION_SOBRE, notas: n || undefined, ficha: f ?? {} });
}

export function decodificarNotasMascota(crudo: unknown): NotasDecodificadas {
  const t = typeof crudo === 'string' ? crudo : crudo == null ? '' : String(crudo);
  if (t.trimStart().startsWith('{')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      if (o && o.pate === ETIQUETA_SOBRE) {
        const { pate: _p, v: _v, notas, ficha, ...resto } = o;
        void _p; void _v;
        return {
          notas: typeof notas === 'string' && notas.trim() ? notas : null,
          ficha: (ficha && typeof ficha === 'object' ? ficha : {}) as FichaMascota,
          ...(Object.keys(resto).length ? { extra: resto } : {}),
        };
      }
    } catch {
      // No es un sobre: son notas que empiezan por «{». Se leen como texto.
    }
  }
  return { notas: t.trim() ? t : null, ficha: {} };
}

// ─── Edad y etapa ──────────────────────────────────────────────────────────

export type EtapaVida = 'CACHORRO' | 'JOVEN' | 'ADULTO' | 'SENIOR';
export const NOMBRE_ETAPA: Record<EtapaVida, string> = {
  CACHORRO: 'Cachorro', JOVEN: 'Joven', ADULTO: 'Adulto', SENIOR: 'Senior',
};

/** Meses completos entre dos fechas AAAA-MM-DD. */
export function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  return Math.max(0, meses);
}

/**
 * Etapa por especie y tamaño. Umbrales orientativos de las guías de etapas de
 * vida (AAHA/AAFP): un perro grande envejece antes que uno pequeño.
 */
export function etapaDeVida(especie: string, meses: number, tamano?: Tamano | null): EtapaVida {
  if (especie === 'GATO') {
    if (meses < 12) return 'CACHORRO';
    if (meses < 36) return 'JOVEN';
    return meses >= 120 ? 'SENIOR' : 'ADULTO';
  }
  if (especie === 'PERRO') {
    if (meses < 12) return 'CACHORRO';
    if (meses < 36) return 'JOVEN';
    const senior = tamano === 'GRANDE' ? 72 : tamano === 'MEDIANO' ? 96 : 120;
    return meses >= senior ? 'SENIOR' : 'ADULTO';
  }
  if (meses < 6) return 'CACHORRO';
  if (meses < 24) return 'JOVEN';
  return meses >= 72 ? 'SENIOR' : 'ADULTO';
}

export function describirEdadMascota(meses: number, aproximada = false): string {
  const pre = aproximada ? 'aprox. ' : '';
  if (meses < 12) return `${pre}${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  return `${pre}${anios} ${anios === 1 ? 'año' : 'años'}${resto ? ` y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : ''}`;
}

/** Fecha de nacimiento estimada desde una edad aproximada (años, admite decimales). */
export function nacimientoDesdeEdad(anios: number, hoy: string): string | null {
  if (!Number.isFinite(anios) || anios < 0 || anios > 40) return null;
  const [a, m, d] = hoy.split('-').map(Number);
  const meses = Math.round(anios * 12);
  const f = new Date(Date.UTC(a, m - 1 - meses, Math.min(d, 28)));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

// ─── Peso ──────────────────────────────────────────────────────────────────

export const UMBRAL_ALERTA_PESO = 0.1;

export interface AlertaPeso { desviacion: number; sentido: 'SOBRE' | 'BAJO' | 'EN_RANGO' }

/** Desviación relativa frente al peso ideal; alerta por encima del ±10 %. */
export function evaluarPeso(actual: number | null | undefined, ideal: number | null | undefined): AlertaPeso | null {
  if (!actual || !ideal || ideal <= 0) return null;
  const desviacion = (actual - ideal) / ideal;
  const sentido = desviacion > UMBRAL_ALERTA_PESO ? 'SOBRE' : desviacion < -UMBRAL_ALERTA_PESO ? 'BAJO' : 'EN_RANGO';
  return { desviacion: Math.round(desviacion * 1000) / 1000, sentido };
}

// ─── Validación de la ficha ────────────────────────────────────────────────

export interface ProblemaFicha { campo: string; mensaje: string }

export function validarFicha(f: FichaMascota, hoy: string, nacimiento?: string | null): ProblemaFicha[] {
  const p: ProblemaFicha[] = [];
  const fecha = (v?: string | null) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!fecha(f.fechaEsterilizacion)) p.push({ campo: 'fechaEsterilizacion', mensaje: 'La fecha de esterilización no es válida.' });
  else if (f.fechaEsterilizacion && f.fechaEsterilizacion > hoy) p.push({ campo: 'fechaEsterilizacion', mensaje: 'La esterilización no puede ser futura.' });
  else if (f.fechaEsterilizacion && nacimiento && f.fechaEsterilizacion < nacimiento) p.push({ campo: 'fechaEsterilizacion', mensaje: 'La esterilización no puede ser anterior al nacimiento.' });
  if (f.fechaEsterilizacion && f.esterilizado === false) p.push({ campo: 'esterilizado', mensaje: 'Hay fecha de cirugía pero dice «no esterilizado».' });
  if (f.microchip && !/^[0-9A-Za-z-]{9,20}$/.test(f.microchip.replace(/\s+/g, ''))) {
    p.push({ campo: 'microchip', mensaje: 'El microchip suele tener 15 dígitos (ISO 11784); revisa el número.' });
  }
  if (f.contacto?.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contacto.correo)) p.push({ campo: 'correo', mensaje: 'El correo no es válido.' });
  const veces = f.alimentacion?.vecesAlDia;
  if (veces != null && (!Number.isInteger(veces) || veces < 1 || veces > 12)) p.push({ campo: 'vecesAlDia', mensaje: 'Las comidas al día van de 1 a 12.' });
  for (const [campo, v] of [['banoCadaDias', f.rutina?.banoCadaDias], ['unasCadaDias', f.rutina?.unasCadaDias], ['dentalCadaDias', f.rutina?.dentalCadaDias]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 365)) p.push({ campo, mensaje: 'La frecuencia va de 1 a 365 días.' });
  }
  return p;
}
