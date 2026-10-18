/**
 * Mascotas: la hoja manda, pero no se pierde lo que solo estaba aquí (v6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta el esquema v6 las mascotas vivían solo en el navegador. Al empezar a
 * leerlas de la hoja, aplicar lo leído sin más **borraría de la pantalla las
 * que nunca llegaron a subir**, y con ellas sus pesos, vacunas e historial.
 *
 * La regla:
 *
 *   · Lo que está en la hoja manda (es la copia compartida).
 *   · Lo que solo está en este navegador se conserva **y se sube**. La próxima
 *     lectura ya lo trae de la hoja y deja de ser «solo local».
 *   · Un peso, una vacuna o un historial de una mascota que no existe en
 *     ningún lado no se sube: no tendría paciente al que colgar.
 *
 * Es conservadora a propósito: subir de más deja una fila repetida que la
 * lectura colapsa por `id`; no subir pierde datos clínicos.
 */

import type { MedicalHistoryEntry, Pet, VaccineEntry, WeightEntry } from '@/domain/mascotas';

export interface ColeccionesMascota {
  pets: Pet[];
  petWeights: WeightEntry[];
  petVaccines: VaccineEntry[];
  petHistory: MedicalHistoryEntry[];
}

export interface Fusion {
  resultado: ColeccionesMascota;
  /** Lo que solo estaba en este navegador: hay que subirlo. */
  porSubir: ColeccionesMascota;
}

const vacias = (): ColeccionesMascota => ({ pets: [], petWeights: [], petVaccines: [], petHistory: [] });

export const hayAlgo = (c: ColeccionesMascota): boolean =>
  c.pets.length + c.petWeights.length + c.petVaccines.length + c.petHistory.length > 0;

export function fusionarMascotas(
  remoto: Partial<ColeccionesMascota> | null | undefined,
  local: Partial<ColeccionesMascota> | null | undefined,
): Fusion {
  const r = { ...vacias(), ...(remoto ?? {}) } as ColeccionesMascota;
  const l = { ...vacias(), ...(local ?? {}) } as ColeccionesMascota;
  const porSubir = vacias();

  const idsRemotos = new Set(r.pets.map((p) => p.id));
  const pets = [...r.pets];
  for (const p of l.pets) {
    if (!p || idsRemotos.has(p.id) || p.deletedAt) continue;
    pets.push(p);
    porSubir.pets.push(p);
  }
  const existe = new Set(pets.map((p) => p.id));

  const unir = <T extends { id: string; petId: string; deletedAt?: string | null }>(
    remotos: T[],
    locales: T[],
    destino: T[],
  ): T[] => {
    const ids = new Set(remotos.map((x) => x.id));
    const salida = [...remotos];
    for (const x of locales) {
      if (!x || ids.has(x.id) || x.deletedAt || !existe.has(x.petId)) continue;
      salida.push(x);
      destino.push(x);
    }
    return salida;
  };

  return {
    resultado: {
      pets,
      petWeights: unir(r.petWeights, l.petWeights, porSubir.petWeights),
      petVaccines: unir(r.petVaccines, l.petVaccines, porSubir.petVaccines),
      petHistory: unir(r.petHistory, l.petHistory, porSubir.petHistory),
    },
    porSubir,
  };
}
