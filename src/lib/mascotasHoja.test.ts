/**
 * Mascotas en la hoja (esquema v6).
 *
 * Hasta v6 las mascotas, sus pesos, sus vacunas y su historial vivían solo en
 * el navegador. Estas pruebas fijan que ahora viajan a la hoja con su especie,
 * y que al leer no se confunden con las personas, que comparten pestañas.
 */
import { describe, it, expect, vi } from 'vitest';
import { RepositorioBackend, idsDeMascotas, type SesionBackend } from './repositorioBackend';
import type { RepositoryContext } from './dataRepository';
import { encabezadosDe } from './planInstalacion';
import type { MedicalHistoryEntry, Pet, VaccineEntry, WeightEntry } from '@/domain/mascotas';

const MARCAS = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
const URL_BUENA = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';
const CTX: RepositoryContext = { uid: 'u1', email: 'a@b.com', familyId: null };

function banco(respuestas: unknown[] = []) {
  const cola = [...respuestas];
  const espia = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => (cola.length > 0 ? cola.shift() : { ok: true, data: { aplicadas: 1, revision: 1 } }),
  })) as unknown as typeof globalThis.fetch;
  const sesion: SesionBackend = { url: () => URL_BUENA, idToken: async () => 'id.token.firma', fetch: espia };
  return { repo: new RepositorioBackend(sesion), espia: espia as unknown as ReturnType<typeof vi.fn> };
}

type Mut = { tabla: string; fila: Record<string, unknown>; pacienteId?: string; especie?: string };
function mutaciones(espia: ReturnType<typeof vi.fn>): Mut[] {
  const [, opciones] = espia.mock.calls[0] as [string, RequestInit];
  return (JSON.parse(String(opciones.body)).payload?.mutaciones ?? []) as Mut[];
}

const KIRA: Pet = {
  id: 'pet-kira',
  familyId: 'local',
  memberId: 'member-titular',
  nombre: 'Kira',
  especie: 'PERRO',
  raza: 'Pinscher miniatura',
  fechaNacimiento: '2019-04-02',
  sexo: 'HEMBRA',
  pesoActualKg: 4.2,
  pesoIdealKg: 4,
  activo: true,
  notas: 'Miedo a los truenos',
  ...MARCAS,
};

describe('escribir mascotas', () => {
  it('una mascota es PACIENTES (tipo MASCOTA) + PERFIL_MASCOTA, en un lote y como MASCOTA', async () => {
    const { repo, espia } = banco();
    await repo.savePet(CTX, KIRA);
    const lote = mutaciones(espia);

    expect(lote.map((m) => m.tabla)).toEqual(['PACIENTES', 'PERFIL_MASCOTA']);
    for (const m of lote) {
      expect(m.especie).toBe('MASCOTA');
      expect(m.pacienteId).toBe('pet-kira');
    }
    expect(lote[0].fila).toMatchObject({ id: 'pet-kira', tipo: 'MASCOTA', nombre: 'Kira', activo: 'SI' });
    expect(lote[1].fila).toMatchObject({
      paciente_id: 'pet-kira',
      especie: 'PERRO',
      raza: 'Pinscher miniatura',
      sexo: 'HEMBRA',
      peso_actual_kg: 4.2,
      responsable_id: 'member-titular',
    });
  });

  it('la baja lógica es activo = NO, no un borrado', async () => {
    const { repo, espia } = banco();
    await repo.savePet(CTX, { ...KIRA, activo: false });
    const [pacientes] = mutaciones(espia);
    expect(pacientes.fila.activo).toBe('NO');
    expect(pacientes.fila.borrado_en).toBeUndefined();
  });

  it('pesos, vacunas e historial van a sus pestañas con el paciente de la mascota', async () => {
    const peso: WeightEntry = { id: 'peso-1', petId: 'pet-kira', memberId: 'member-titular', fecha: '2026-10-01', pesoKg: 4.3, ...MARCAS };
    const vacuna: VaccineEntry = {
      id: 'vac-1', petId: 'pet-kira', memberId: 'member-titular', vacuna: 'Rabia', fecha: '2026-09-01',
      proximaDosis: '2027-09-01', laboratorio: 'Lab', lote: 'L1', veterinario: 'Dra. Ruiz', ...MARCAS,
    };
    const historia: MedicalHistoryEntry = {
      id: 'h-1', petId: 'pet-kira', memberId: 'member-titular', fecha: '2026-08-15', tipo: 'CONSULTA',
      diagnostico: 'Otitis', tratamiento: 'Gotas', veterinario: 'Dr. Paz', ...MARCAS,
    };

    const a = banco();
    await a.repo.savePetWeight(CTX, peso);
    expect(mutaciones(a.espia)).toEqual([
      expect.objectContaining({ tabla: 'PESOS', especie: 'MASCOTA', pacienteId: 'pet-kira', fila: expect.objectContaining({ paciente_id: 'pet-kira', peso_kg: 4.3 }) }),
    ]);

    const b = banco();
    await b.repo.savePetVaccine(CTX, vacuna);
    expect(mutaciones(b.espia)[0]).toMatchObject({
      tabla: 'VACUNAS', especie: 'MASCOTA',
      fila: { paciente_id: 'pet-kira', vacuna: 'Rabia', proxima_dosis: '2027-09-01', profesional: 'Dra. Ruiz' },
    });

    const c = banco();
    await c.repo.savePetHistory(CTX, historia);
    expect(mutaciones(c.espia)[0]).toMatchObject({
      tabla: 'HISTORIAL', especie: 'MASCOTA',
      fila: { paciente_id: 'pet-kira', tipo_evento: 'CONSULTA', titulo: 'Otitis', descripcion: 'Gotas', profesional: 'Dr. Paz' },
    });
  });

  it('el responsable no se escribe en pesos, vacunas ni historial: se deriva al leer', async () => {
    const { repo, espia } = banco();
    await repo.savePetWeight(CTX, { id: 'p', petId: 'pet-kira', memberId: 'member-titular', fecha: '2026-10-01', pesoKg: 4, ...MARCAS });
    expect(JSON.stringify(mutaciones(espia))).not.toContain('member-titular');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Leer
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila con los encabezados reales de la pestaña. */
function fila(pestana: string, valores: Record<string, unknown>): unknown[] {
  return (encabezadosDe(pestana) ?? []).map((c) => valores[c] ?? '');
}

const TABLAS = {
  PACIENTES: [
    fila('PACIENTES', { id: 'member-titular', tipo: 'HUMANO', nombre: 'Walter', relacion: 'SELF', activo: 'ACTIVE' }),
    fila('PACIENTES', { id: 'pet-kira', tipo: 'MASCOTA', nombre: 'Kira', activo: 'SI', notas: 'Miedo a los truenos' }),
    fila('PACIENTES', { id: 'pet-nube', tipo: 'MASCOTA', nombre: 'Nube', activo: 'SI' }),
    // Nube cambia de nombre y luego se da de baja lógica.
    fila('PACIENTES', { id: 'pet-nube', tipo: 'MASCOTA', nombre: 'Nubecita', activo: 'NO' }),
  ],
  PERFIL_HUMANO: [fila('PERFIL_HUMANO', { paciente_id: 'member-titular', fecha_nacimiento: '1984-12-01' })],
  PERFIL_MASCOTA: [
    fila('PERFIL_MASCOTA', { paciente_id: 'pet-kira', especie: 'PERRO', sexo: 'HEMBRA', peso_actual_kg: 4.2, responsable_id: 'member-titular' }),
    fila('PERFIL_MASCOTA', { paciente_id: 'pet-nube', especie: 'GATO', sexo: 'MACHO', responsable_id: 'member-titular' }),
  ],
  VACUNAS: [
    fila('VACUNAS', { id: 'vac-humana', paciente_id: 'member-titular', vacuna: 'Tétanos', fecha: '2026-01-01' }),
    fila('VACUNAS', { id: 'vac-kira', paciente_id: 'pet-kira', vacuna: 'Rabia', fecha: '2026-09-01', profesional: 'Dra. Ruiz' }),
  ],
  HISTORIAL: [
    fila('HISTORIAL', { id: 'h-humano', paciente_id: 'member-titular', tipo_evento: 'NOTE', titulo: 'Alta', fecha_evento: '2026-01-01' }),
    fila('HISTORIAL', { id: 'h-kira', paciente_id: 'pet-kira', tipo_evento: 'CONSULTA', titulo: 'Otitis', fecha_evento: '2026-08-15', profesional: 'Dr. Paz' }),
  ],
  PESOS: [
    fila('PESOS', { id: 'peso-1', paciente_id: 'pet-kira', fecha: '2026-10-01', peso_kg: 4.3 }),
    fila('PESOS', { id: 'peso-huerfano', paciente_id: 'pet-que-no-existe', fecha: '2026-10-01', peso_kg: 9 }),
  ],
};

async function leer() {
  const { repo } = banco([{ ok: true, data: { esquema: 6, revision: 1, tablas: TABLAS } }]);
  return repo.loadAll(CTX);
}

describe('leer mascotas', () => {
  it('reconoce las mascotas por el tipo de PACIENTES', () => {
    const encabezados = encabezadosDe('PACIENTES') ?? [];
    const filas = TABLAS.PACIENTES.map((c) => Object.fromEntries(encabezados.map((h, i) => [h, (c as unknown[])[i]])));
    expect([...idsDeMascotas(filas)].sort()).toEqual(['pet-kira', 'pet-nube']);
  });

  it('una mascota no aparece como familiar', async () => {
    const datos = await leer();
    expect(datos.members.map((m) => m.id)).toEqual(['member-titular']);
  });

  it('las mascotas llegan con su perfil, su responsable y su estado', async () => {
    const datos = await leer();
    const kira = datos.pets.find((p) => p.id === 'pet-kira');
    const nube = datos.pets.find((p) => p.id === 'pet-nube');
    expect(kira).toMatchObject({ nombre: 'Kira', especie: 'PERRO', sexo: 'HEMBRA', pesoActualKg: 4.2, memberId: 'member-titular', activo: true, notas: 'Miedo a los truenos' });
    // La última fila manda: nombre nuevo e inactiva.
    expect(nube).toMatchObject({ nombre: 'Nubecita', activo: false, especie: 'GATO' });
  });

  it('las vacunas y el historial de una mascota no se mezclan con los de las personas', async () => {
    const datos = await leer();
    expect(datos.vaccines.map((v) => v.id)).toEqual(['vac-humana']);
    expect(datos.history.map((h) => h.id)).toEqual(['h-humano']);
    expect(datos.petVaccines).toEqual([expect.objectContaining({ id: 'vac-kira', petId: 'pet-kira', memberId: 'member-titular', veterinario: 'Dra. Ruiz' })]);
    expect(datos.petHistory).toEqual([expect.objectContaining({ id: 'h-kira', diagnostico: 'Otitis', veterinario: 'Dr. Paz', memberId: 'member-titular' })]);
  });

  it('los pesos llevan el responsable de su mascota, y los huérfanos se quedan fuera', async () => {
    const datos = await leer();
    expect(datos.petWeights).toEqual([expect.objectContaining({ id: 'peso-1', pesoKg: 4.3, memberId: 'member-titular' })]);
  });
});
