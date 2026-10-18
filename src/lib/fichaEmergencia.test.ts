import { describe, expect, it } from 'vitest';
import { construirFichaEmergencia, prescripcionActiva } from './fichaEmergencia';

const familiar = { id: 'm1', fullName: 'Ana Pérez', birthDate: '1980-05-01', bloodType: 'O_NEGATIVE' as const };
const perfil = {
  allergies: ['Penicilina', ' penicilina ', ''],
  chronicConditions: ['Hipotiroidismo'],
  currentMedications: ['Levotiroxina', 'Losartán'],
  emergencyContact: 'Juan · 300 000 0000',
  primaryDoctor: 'Dra. Ruiz',
  insuranceInfo: null,
};
const rx = (name: string, status: 'ACTIVE' | 'COMPLETED', endDate: string, memberId = 'm1') =>
  ({ memberId, name, dose: '50 mcg', status, endDate, instructions: null });

describe('ficha de emergencia', () => {
  it('reúne RH, alergias, condiciones, medicamentos activos y contacto', () => {
    const f = construirFichaEmergencia(familiar, perfil, [
      rx('Levotiroxina', 'ACTIVE', '2027-01-01'),
      rx('Amoxicilina', 'COMPLETED', '2026-01-10'),
      rx('Ibuprofeno', 'ACTIVE', '2026-01-10'),
      rx('Ajeno', 'ACTIVE', '2027-01-01', 'otro'),
    ], '2026-10-18');
    expect(f.grupoSanguineo).toBe('O−');
    expect(f.alergias).toEqual(['Penicilina']);
    expect(f.medicamentos).toEqual([
      { nombre: 'Levotiroxina', detalle: '50 mcg' },
      { nombre: 'Losartán', detalle: null },
    ]);
    expect(f.contactoEmergencia).toBe('Juan · 300 000 0000');
    expect(f.faltantes).toEqual([]);
  });

  it('dice lo que falta en vez de inventarlo', () => {
    const f = construirFichaEmergencia({ ...familiar, bloodType: 'UNKNOWN' }, null, [], '2026-10-18');
    expect(f.grupoSanguineo).toBeNull();
    expect(f.faltantes).toEqual(['Grupo sanguíneo y RH', 'Contacto de emergencia', 'Ficha médica (alergias y condiciones)']);
  });

  it('activa = ACTIVE sin fin vencido', () => {
    expect(prescripcionActiva({ status: 'ACTIVE', endDate: '2026-10-18' }, '2026-10-18')).toBe(true);
    expect(prescripcionActiva({ status: 'ACTIVE', endDate: '2026-10-17' }, '2026-10-18')).toBe(false);
    expect(prescripcionActiva({ status: 'SUSPENDED', endDate: '' }, '2026-10-18')).toBe(false);
  });
});
