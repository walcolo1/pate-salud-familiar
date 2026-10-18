import { describe, it, expect } from 'vitest';
import { fusionarMascotas, hayAlgo } from './fusionMascotas';
import type { Pet, WeightEntry } from '@/domain/mascotas';

const M = { createdAt: 'x', updatedAt: 'x' };
const pet = (id: string, nombre = id): Pet =>
  ({ id, familyId: '', memberId: 'm1', nombre, especie: 'PERRO', sexo: 'HEMBRA', activo: true, ...M }) as Pet;
const peso = (id: string, petId: string): WeightEntry =>
  ({ id, petId, memberId: 'm1', fecha: '2026-10-01', pesoKg: 4, ...M }) as WeightEntry;

describe('fusionar mascotas de la hoja con las de este navegador', () => {
  it('la hoja manda sobre la misma mascota', () => {
    const f = fusionarMascotas({ pets: [pet('a', 'Hoja')] }, { pets: [pet('a', 'Local')] });
    expect(f.resultado.pets.map((p) => p.nombre)).toEqual(['Hoja']);
    expect(hayAlgo(f.porSubir)).toBe(false);
  });

  it('lo que solo estaba aquí se conserva y se sube', () => {
    const f = fusionarMascotas({ pets: [] }, { pets: [pet('kira')], petWeights: [peso('p1', 'kira')] });
    expect(f.resultado.pets.map((p) => p.id)).toEqual(['kira']);
    expect(f.porSubir.pets.map((p) => p.id)).toEqual(['kira']);
    expect(f.porSubir.petWeights.map((p) => p.id)).toEqual(['p1']);
  });

  it('un peso de una mascota que no existe en ningún lado no se sube', () => {
    const f = fusionarMascotas({}, { petWeights: [peso('p1', 'fantasma')] });
    expect(f.resultado.petWeights).toEqual([]);
    expect(hayAlgo(f.porSubir)).toBe(false);
  });

  it('un peso local de una mascota que ya está en la hoja también se sube', () => {
    const f = fusionarMascotas({ pets: [pet('kira')] }, { petWeights: [peso('p1', 'kira')] });
    expect(f.porSubir.petWeights.map((p) => p.id)).toEqual(['p1']);
    expect(f.porSubir.pets).toEqual([]);
  });

  it('sin nada local, es exactamente lo de la hoja', () => {
    const remoto = { pets: [pet('a')], petWeights: [peso('p', 'a')], petVaccines: [], petHistory: [] };
    expect(fusionarMascotas(remoto, null)).toEqual({ resultado: remoto, porSubir: { pets: [], petWeights: [], petVaccines: [], petHistory: [] } });
  });
});
