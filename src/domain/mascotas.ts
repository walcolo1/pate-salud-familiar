/**
 * Mascotas — Paté · Salud Familiar (Bloque D, paso D1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Una mascota **pertenece a un familiar**, no a la familia en abstracto. Ese
 * `memberId` no es decorativo: es lo que permite que las reglas de Firestore
 * decidan quién puede verla reutilizando el modelo de roles que ya existe. Un
 * cuidador asignado a un familiar ve las mascotas de ese familiar y ninguna
 * otra, sin escribir una sola regla nueva de permisos.
 *
 * POR QUÉ VALIDAR AQUÍ Y NO EN EL FORMULARIO
 * ──────────────────────────────────────────
 * El formulario no es la única puerta: también entran datos por la restauración
 * de un respaldo y, en el Bloque G, desde Firestore. Validar en el formulario
 * deja las otras dos abiertas. Estas funciones son puras y se prueban solas.
 *
 * QUÉ NO ES ESTO
 * ──────────────
 * No es un expediente clínico humano. Un peso de mascota va de decenas de
 * gramos (un hámster) a más de ochenta kilos (un mastín), y esa horquilla es la
 * que fija los límites de abajo. No se comparten tipos con `models.ts` a
 * propósito: parecerse no es ser lo mismo, y un `FamilyMember` con patas
 * acabaría arrastrando campos que no significan nada aquí.
 */

/** Especies que la aplicación sabe manejar. */
export const ESPECIES = ['PERRO', 'GATO', 'AVE', 'CONEJO', 'ROEDOR', 'REPTIL', 'PEZ', 'OTRO'] as const;
export type Especie = (typeof ESPECIES)[number];

export const NOMBRE_ESPECIE: Record<Especie, string> = {
  PERRO: 'Perro',
  GATO: 'Gato',
  AVE: 'Ave',
  CONEJO: 'Conejo',
  ROEDOR: 'Roedor',
  REPTIL: 'Reptil',
  PEZ: 'Pez',
  OTRO: 'Otra especie',
};

export const SEXOS = ['MACHO', 'HEMBRA', 'DESCONOCIDO'] as const;
export type SexoMascota = (typeof SEXOS)[number];

export const NOMBRE_SEXO: Record<SexoMascota, string> = {
  MACHO: 'Macho',
  HEMBRA: 'Hembra',
  DESCONOCIDO: 'Sin determinar',
};

/**
 * Horquilla de peso admitida, en kilogramos.
 *
 * El mínimo cubre a un jilguero (unos 15 g) y el máximo a un mastín grande.
 * Fuera de ahí es casi seguro un error de unidades —gramos escritos como
 * kilos— y aceptarlo dibujaría una gráfica de peso ilegible en D2.
 */
export const PESO_MINIMO_KG = 0.01;
export const PESO_MAXIMO_KG = 120;

/** Tipos de entrada del historial veterinario. */
export const TIPOS_HISTORIAL = [
  'CONSULTA',
  'URGENCIA',
  'CIRUGIA',
  'DESPARASITACION',
  'REVISION',
  'OTRO',
] as const;
export type TipoHistorialVet = (typeof TIPOS_HISTORIAL)[number];

export const NOMBRE_TIPO_HISTORIAL: Record<TipoHistorialVet, string> = {
  CONSULTA: 'Consulta',
  URGENCIA: 'Urgencia',
  CIRUGIA: 'Cirugía',
  DESPARASITACION: 'Desparasitación',
  REVISION: 'Revisión',
  OTRO: 'Otro',
};

/** Campos de sincronización comunes, iguales a los del expediente humano. */
interface Sincronizable {
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
}

export interface Pet extends Sincronizable {
  id: string;
  /** Familia a la que pertenece. */
  familyId: string;
  /** Familiar responsable. Es la clave del control de acceso. */
  memberId: string;
  nombre: string;
  especie: Especie;
  raza?: string | null;
  /** `YYYY-MM-DD`. Opcional: de un animal adoptado no siempre se sabe. */
  fechaNacimiento?: string | null;
  sexo: SexoMascota;
  /** Último peso conocido, en kilogramos. Lo mantiene D2. */
  pesoActualKg?: number | null;
  /** Peso objetivo acordado con el veterinario, en kilogramos. */
  pesoIdealKg?: number | null;
  /** Se marca en falso en lugar de borrar: el historial se conserva. */
  activo: boolean;
  notas?: string | null;
}

export interface WeightEntry extends Sincronizable {
  id: string;
  petId: string;
  /** Denormalizado desde la mascota para que las reglas no lean el padre. */
  memberId: string;
  fecha: string; // YYYY-MM-DD
  pesoKg: number;
  nota?: string | null;
}

export interface VaccineEntry extends Sincronizable {
  id: string;
  petId: string;
  memberId: string;
  vacuna: string;
  fecha: string; // YYYY-MM-DD
  proximaDosis?: string | null; // YYYY-MM-DD
  laboratorio?: string | null;
  lote?: string | null;
  veterinario?: string | null;
}

export interface MedicalHistoryEntry extends Sincronizable {
  id: string;
  petId: string;
  memberId: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoHistorialVet;
  diagnostico: string;
  tratamiento?: string | null;
  veterinario?: string | null;
  /** Identificador de un documento ya subido. Nunca el archivo en sí. */
  documentoId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un problema encontrado.
 *
 * `campo` permite llevar el foco al control que lo provocó, en vez de enseñar
 * una lista de errores y dejar que alguien los busque.
 */
export interface ProblemaValidacion {
  campo: string;
  mensaje: string;
}

export type Validacion = { valido: true } | { valido: false; problemas: ProblemaValidacion[] };

const esFechaISO = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** `YYYY-MM-DD` de hoy, en hora local. Nunca `toISOString`, que pasa por UTC. */
export function hoyLocal(ahora: Date = new Date()): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dd(ahora.getMonth() + 1)}-${dd(ahora.getDate())}`;
}

export const esEspecie = (v: unknown): v is Especie => ESPECIES.includes(v as Especie);
export const esSexo = (v: unknown): v is SexoMascota => SEXOS.includes(v as SexoMascota);
export const esTipoHistorial = (v: unknown): v is TipoHistorialVet =>
  TIPOS_HISTORIAL.includes(v as TipoHistorialVet);

/**
 * Un peso utilizable: número real, positivo y dentro de la horquilla.
 *
 * `NaN` entra por aquí más de lo que parece: `Number('')` es `0`, pero
 * `Number('abc')` es `NaN`, y un `NaN` guardado rompe cualquier gráfica sin
 * decir por qué.
 */
export function esPesoValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= PESO_MINIMO_KG && v <= PESO_MAXIMO_KG;
}

/** Datos de una mascota tal y como llegan del formulario. */
export type BorradorMascota = Partial<
  Pick<
    Pet,
    | 'nombre'
    | 'especie'
    | 'raza'
    | 'fechaNacimiento'
    | 'sexo'
    | 'pesoActualKg'
    | 'pesoIdealKg'
    | 'memberId'
    | 'notas'
  >
>;

export function validarMascota(
  borrador: BorradorMascota,
  ahora: Date = new Date(),
): Validacion {
  const problemas: ProblemaValidacion[] = [];

  const nombre = (borrador.nombre ?? '').trim();
  if (nombre.length === 0) {
    problemas.push({ campo: 'nombre', mensaje: 'La mascota necesita un nombre.' });
  } else if (nombre.length > 60) {
    problemas.push({ campo: 'nombre', mensaje: 'El nombre no puede pasar de 60 caracteres.' });
  }

  if (!esEspecie(borrador.especie)) {
    problemas.push({ campo: 'especie', mensaje: 'Elige una especie de la lista.' });
  }

  if (!esSexo(borrador.sexo)) {
    problemas.push({ campo: 'sexo', mensaje: 'Elige una opción de sexo.' });
  }

  if (!(borrador.memberId ?? '').trim()) {
    problemas.push({ campo: 'memberId', mensaje: 'Falta el familiar responsable.' });
  }

  // La fecha de nacimiento es opcional: de un animal adoptado no siempre se
  // sabe. Pero si viene, tiene que ser una fecha, y no del futuro.
  if (borrador.fechaNacimiento) {
    if (!esFechaISO(borrador.fechaNacimiento)) {
      problemas.push({ campo: 'fechaNacimiento', mensaje: 'La fecha no tiene el formato esperado.' });
    } else if (borrador.fechaNacimiento > hoyLocal(ahora)) {
      problemas.push({
        campo: 'fechaNacimiento',
        mensaje: 'La fecha de nacimiento no puede estar en el futuro.',
      });
    }
  }

  for (const [campo, valor] of [
    ['pesoActualKg', borrador.pesoActualKg],
    ['pesoIdealKg', borrador.pesoIdealKg],
  ] as const) {
    if (valor === undefined || valor === null) continue;
    if (!esPesoValido(valor)) {
      problemas.push({
        campo,
        mensaje: `El peso debe estar entre ${PESO_MINIMO_KG} y ${PESO_MAXIMO_KG} kg. Si lo tienes en gramos, divídelo entre 1000.`,
      });
    }
  }

  return problemas.length === 0 ? { valido: true } : { valido: false, problemas };
}

export function validarPeso(
  entrada: Partial<Pick<WeightEntry, 'fecha' | 'pesoKg' | 'petId'>>,
  ahora: Date = new Date(),
): Validacion {
  const problemas: ProblemaValidacion[] = [];

  if (!(entrada.petId ?? '').trim()) {
    problemas.push({ campo: 'petId', mensaje: 'Falta la mascota.' });
  }
  if (!esFechaISO(entrada.fecha)) {
    problemas.push({ campo: 'fecha', mensaje: 'Indica la fecha del pesaje.' });
  } else if (entrada.fecha! > hoyLocal(ahora)) {
    problemas.push({ campo: 'fecha', mensaje: 'No se puede registrar un pesaje futuro.' });
  }
  if (!esPesoValido(entrada.pesoKg)) {
    problemas.push({
      campo: 'pesoKg',
      mensaje: `El peso debe estar entre ${PESO_MINIMO_KG} y ${PESO_MAXIMO_KG} kg.`,
    });
  }

  return problemas.length === 0 ? { valido: true } : { valido: false, problemas };
}

export function validarVacunaMascota(
  entrada: Partial<Pick<VaccineEntry, 'vacuna' | 'fecha' | 'proximaDosis' | 'petId'>>,
  ahora: Date = new Date(),
): Validacion {
  const problemas: ProblemaValidacion[] = [];

  if (!(entrada.petId ?? '').trim()) {
    problemas.push({ campo: 'petId', mensaje: 'Falta la mascota.' });
  }
  if (!(entrada.vacuna ?? '').trim()) {
    problemas.push({ campo: 'vacuna', mensaje: 'Indica qué vacuna se aplicó.' });
  }

  // Se registra lo que YA se puso. Una vacuna con fecha de la semana que viene
  // no es un registro, es un plan, y un plan mal guardado aquí acabaría
  // contando como puesta.
  if (!esFechaISO(entrada.fecha)) {
    problemas.push({ campo: 'fecha', mensaje: 'Indica la fecha de aplicación.' });
  } else if (entrada.fecha! > hoyLocal(ahora)) {
    problemas.push({
      campo: 'fecha',
      mensaje: 'La fecha de aplicación no puede estar en el futuro. Para lo que viene, usa el refuerzo.',
    });
  }

  if (entrada.proximaDosis) {
    if (!esFechaISO(entrada.proximaDosis)) {
      problemas.push({ campo: 'proximaDosis', mensaje: 'La fecha no tiene el formato esperado.' });
    } else if (esFechaISO(entrada.fecha) && entrada.proximaDosis <= entrada.fecha!) {
      // Estrictamente posterior: un refuerzo el mismo día que la dosis es un
      // error de captura, no una pauta.
      problemas.push({
        campo: 'proximaDosis',
        mensaje: 'El refuerzo tiene que ser posterior a la dosis aplicada.',
      });
    }
  }

  return problemas.length === 0 ? { valido: true } : { valido: false, problemas };
}

export function validarHistorialVet(
  entrada: Partial<Pick<MedicalHistoryEntry, 'fecha' | 'tipo' | 'diagnostico' | 'petId'>>,
  ahora: Date = new Date(),
): Validacion {
  const problemas: ProblemaValidacion[] = [];

  if (!(entrada.petId ?? '').trim()) {
    problemas.push({ campo: 'petId', mensaje: 'Falta la mascota.' });
  }
  if (!esFechaISO(entrada.fecha)) {
    problemas.push({ campo: 'fecha', mensaje: 'Indica la fecha de la atención.' });
  } else if (entrada.fecha! > hoyLocal(ahora)) {
    problemas.push({ campo: 'fecha', mensaje: 'No se puede registrar una atención futura.' });
  }
  if (!esTipoHistorial(entrada.tipo)) {
    problemas.push({ campo: 'tipo', mensaje: 'Elige un tipo de atención.' });
  }
  if (!(entrada.diagnostico ?? '').trim()) {
    problemas.push({ campo: 'diagnostico', mensaje: 'Escribe el diagnóstico o el motivo.' });
  }

  return problemas.length === 0 ? { valido: true } : { valido: false, problemas };
}

/** Mensaje del primer problema, o `null`. Para enseñar uno y no una lista. */
export function primerProblema(v: Validacion): ProblemaValidacion | null {
  return v.valido ? null : v.problemas[0];
}

/** Las mascotas vivas de un familiar, en orden alfabético. */
export function mascotasDe(pets: Pet[], memberId: string): Pet[] {
  return (pets ?? [])
    .filter((p) => p.memberId === memberId && !p.deletedAt)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
