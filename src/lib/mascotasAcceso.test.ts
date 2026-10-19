import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ampliarConMascotasACargo, mascotasACargoDesdeFilas, type Acceso } from './acceso';
import { puede } from './permisos';
import { fijarEspecies, validarLote } from './router';
import { encabezadosDe } from './planInstalacion';

/**
 * Bloque O · Una mascota la administra cualquier familiar autorizado, no solo
 * el titular: quien tenga alcance `*`, la propia mascota asignada o —nuevo— a
 * su responsable dentro de su alcance.
 */

const acceso = (o: Partial<Acceso>): Acceso => ({
  email: 'x@correo.com', rol: 'MIEMBRO', estado: 'ACTIVO', alcanceTotal: false,
  pacientesPermitidos: [], pacientePropio: null, version: 1, ...o,
});

const MASCOTAS = [
  { id: 'pet-nube', responsableId: 'p-ana' },
  { id: 'pet-toby', responsableId: 'p-juan' },
];

describe('alcance: mascotas a cargo', () => {
  it('el miembro responsable alcanza a su mascota, y solo a la suya', () => {
    const ana = ampliarConMascotasACargo(acceso({ pacientePropio: 'p-ana' }), MASCOTAS);
    expect(ana.pacientesPermitidos).toEqual(['pet-nube']);
  });

  it('un cuidador asignado a la responsable también la alcanza', () => {
    const c = ampliarConMascotasACargo(acceso({ rol: 'CUIDADOR', pacientesPermitidos: ['p-juan'] }), MASCOTAS);
    expect(c.pacientesPermitidos).toEqual(['p-juan', 'pet-toby']);
  });

  it('alcance total queda igual; nada nuevo, mismo objeto', () => {
    const total = acceso({ alcanceTotal: true });
    expect(ampliarConMascotasACargo(total, MASCOTAS)).toBe(total);
    const nadie = acceso({ pacientePropio: 'p-otro' });
    expect(ampliarConMascotasACargo(nadie, MASCOTAS)).toBe(nadie);
  });

  it('lee el responsable vigente de PERFIL_MASCOTA (la última fila manda; la baja quita)', () => {
    const enc = encabezadosDe('PERFIL_MASCOTA')!;
    const fila = (o: Record<string, string>) => enc.map((c) => o[c] ?? '');
    const filas = [
      fila({ paciente_id: 'pet-nube', responsable_id: 'p-juan' }),
      fila({ paciente_id: 'pet-nube', responsable_id: 'p-ana' }),
      fila({ paciente_id: 'pet-toby', responsable_id: 'p-juan' }),
      fila({ paciente_id: 'pet-toby', borrado_en: '2026-10-01T00:00:00Z' }),
    ];
    expect(mascotasACargoDesdeFilas(filas, enc)).toEqual([{ id: 'pet-nube', responsableId: 'p-ana' }]);
  });
});

describe('permisos sobre una mascota', () => {
  const ana = ampliarConMascotasACargo(acceso({ pacientePropio: 'p-ana' }), MASCOTAS);

  it('un MIEMBRO administra su mascota: perfil, peso, vacunas, medicación, tomas, historial y recordatorios', () => {
    for (const verbo of ['LEER_HISTORIA', 'EDITAR_PACIENTE', 'ESCRIBIR_CONTROL', 'ESCRIBIR_VACUNA', 'ESCRIBIR_MEDICACION', 'MARCAR_DOSIS', 'ESCRIBIR_HISTORIAL', 'ESCRIBIR_CITA', 'SUBIR_DOCUMENTO']) {
      expect(puede(ana, verbo, 'pet-nube', 'MASCOTA'), verbo).toBe(true);
    }
  });

  it('pero no la da de baja ni de alta, ni toca la mascota de otro', () => {
    expect(puede(ana, 'DAR_DE_BAJA_PACIENTE', 'pet-nube', 'MASCOTA')).toBe(false);
    expect(puede(ana, 'CREAR_PACIENTE')).toBe(false);
    expect(puede(ana, 'EDITAR_PACIENTE', 'pet-toby', 'MASCOTA')).toBe(false);
  });

  it('el permiso extra es solo para mascotas: sobre sí misma no edita identidad ni receta', () => {
    expect(puede(ana, 'EDITAR_PACIENTE', 'p-ana', 'HUMANO')).toBe(false);
    expect(puede(ana, 'ESCRIBIR_MEDICACION', 'p-ana', 'HUMANO')).toBe(false);
  });

  it('un LECTOR la ve y no la cambia', () => {
    const lector = ampliarConMascotasACargo(acceso({ rol: 'LECTOR', pacientePropio: 'p-ana' }), MASCOTAS);
    expect(puede(lector, 'LEER_HISTORIA', 'pet-nube', 'MASCOTA')).toBe(true);
    expect(puede(lector, 'EDITAR_PACIENTE', 'pet-nube', 'MASCOTA')).toBe(false);
  });
});

describe('la especie la fija la hoja, no el cliente', () => {
  const especieDe = (id: string) => ({ 'p-ana': 'HUMANO', 'pet-nube': 'MASCOTA' } as Record<string, string>)[id] ?? null;
  const ana = acceso({ pacientePropio: 'p-ana', alcanceTotal: false });

  it('decir «MASCOTA» sobre una persona no da permisos de mascota', () => {
    const lote = [{ tabla: 'PACIENTES', pacienteId: 'p-ana', especie: 'MASCOTA', fila: { id: 'p-ana', nombre: 'Otra' } }];
    expect(validarLote(ana, lote, puede).ok).toBe(true); // sin fijar: el agujero
    expect(validarLote(ana, fijarEspecies(lote, especieDe), puede)).toMatchObject({ ok: false, error: 'PERMISO_INSUFICIENTE' });
  });

  it('decir «HUMANO» sobre una mascota tampoco se la quita', () => {
    const conMascota = ampliarConMascotasACargo(ana, [{ id: 'pet-nube', responsableId: 'p-ana' }]);
    const lote = [{ tabla: 'MEDICAMENTOS', pacienteId: 'pet-nube', especie: 'HUMANO', fila: { id: 'm1' } }];
    expect(validarLote(conMascota, fijarEspecies(lote, especieDe), puede).ok).toBe(true);
  });

  it('un paciente aún inexistente conserva la especie que trae', () => {
    expect(fijarEspecies([{ tabla: 'PACIENTES', pacienteId: 'nuevo', especie: 'MASCOTA' }], especieDe)[0].especie).toBe('MASCOTA');
  });
});

describe('Router.gs lo usa de verdad', () => {
  const gs = readFileSync(join(process.cwd(), 'apps-script', 'plantilla', 'Router.gs'), 'utf8');
  it('amplía el alcance al resolver y fija especies antes de validar el lote', () => {
    expect(gs).toMatch(/ampliarConMascotasACargo\(resolverAccesoLocal\(email\), mascotasACargo_\(\)\)/);
    const aplicar = gs.slice(gs.indexOf('function aplicar('));
    expect(aplicar.indexOf('fijarEspecies(')).toBeGreaterThan(-1);
    expect(aplicar.indexOf('fijarEspecies(')).toBeLessThan(aplicar.indexOf('validarLote('));
  });
});
