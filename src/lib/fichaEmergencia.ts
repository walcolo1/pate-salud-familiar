/**
 * Ficha de emergencia (Bloque N · pendiente del documento de diagnóstico).
 *
 * Una hoja corta, imprimible, con lo que un servicio de urgencias pregunta
 * primero: grupo sanguíneo y RH, alergias, condiciones, medicamentos activos
 * y a quién llamar. Se arma solo con datos que ya están en el expediente; lo
 * que falta se dice («Sin registrar»), nunca se rellena.
 */

import type { BloodType, FamilyMember, HealthProfile, MedicationPrescription } from '@/domain/models';

export const ETIQUETA_GRUPO_SANGUINEO: Record<BloodType, string> = {
  A_POSITIVE: 'A+',
  A_NEGATIVE: 'A−',
  B_POSITIVE: 'B+',
  B_NEGATIVE: 'B−',
  AB_POSITIVE: 'AB+',
  AB_NEGATIVE: 'AB−',
  O_POSITIVE: 'O+',
  O_NEGATIVE: 'O−',
  UNKNOWN: 'Desconocido',
};

export interface MedicamentoEmergencia { nombre: string; detalle: string | null }

export interface FichaEmergencia {
  nombre: string;
  fechaNacimiento: string;
  grupoSanguineo: string | null;
  alergias: string[];
  condiciones: string[];
  medicamentos: MedicamentoEmergencia[];
  contactoEmergencia: string | null;
  medicoTratante: string | null;
  seguro: string | null;
  /** Campos vacíos que conviene completar en la ficha médica. */
  faltantes: string[];
}

const clave = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Sin vacíos ni repetidos (sin distinguir mayúsculas ni tildes); conserva el primero. */
function limpiar(xs: string[] | null | undefined): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const x of xs ?? []) {
    const t = String(x ?? '').trim();
    if (!t || vistos.has(clave(t))) continue;
    vistos.add(clave(t));
    salida.push(t);
  }
  return salida;
}

/** Activa = estado ACTIVE y sin fecha de fin pasada (comparación AAAA-MM-DD). */
export function prescripcionActiva(p: Pick<MedicationPrescription, 'status' | 'endDate'>, hoy: string): boolean {
  if (p.status !== 'ACTIVE') return false;
  return !p.endDate || String(p.endDate).slice(0, 10) >= hoy;
}

export function construirFichaEmergencia(
  familiar: Pick<FamilyMember, 'id' | 'fullName' | 'birthDate' | 'bloodType'>,
  perfil: Pick<HealthProfile, 'allergies' | 'chronicConditions' | 'currentMedications' | 'emergencyContact' | 'primaryDoctor' | 'insuranceInfo'> | null | undefined,
  prescripciones: Pick<MedicationPrescription, 'memberId' | 'name' | 'dose' | 'status' | 'endDate' | 'instructions'>[],
  hoy: string,
): FichaEmergencia {
  const medicamentos: MedicamentoEmergencia[] = [];
  const vistos = new Set<string>();
  for (const p of prescripciones) {
    if (p.memberId !== familiar.id || !prescripcionActiva(p, hoy)) continue;
    const nombre = String(p.name ?? '').trim();
    if (!nombre || vistos.has(clave(nombre))) continue;
    vistos.add(clave(nombre));
    medicamentos.push({ nombre, detalle: String(p.dose ?? '').trim() || null });
  }
  for (const m of limpiar(perfil?.currentMedications)) {
    if (vistos.has(clave(m))) continue;
    vistos.add(clave(m));
    medicamentos.push({ nombre: m, detalle: null });
  }

  const grupo = familiar.bloodType && familiar.bloodType !== 'UNKNOWN'
    ? ETIQUETA_GRUPO_SANGUINEO[familiar.bloodType]
    : null;
  const contacto = String(perfil?.emergencyContact ?? '').trim() || null;
  const alergias = limpiar(perfil?.allergies);

  const faltantes: string[] = [];
  if (!grupo) faltantes.push('Grupo sanguíneo y RH');
  if (!contacto) faltantes.push('Contacto de emergencia');
  if (!perfil) faltantes.push('Ficha médica (alergias y condiciones)');

  return {
    nombre: familiar.fullName,
    fechaNacimiento: familiar.birthDate,
    grupoSanguineo: grupo,
    alergias,
    condiciones: limpiar(perfil?.chronicConditions),
    medicamentos,
    contactoEmergencia: contacto,
    medicoTratante: String(perfil?.primaryDoctor ?? '').trim() || null,
    seguro: String(perfil?.insuranceInfo ?? '').trim() || null,
    faltantes,
  };
}
