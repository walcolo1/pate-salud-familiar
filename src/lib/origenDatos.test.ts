import { describe, it, expect } from 'vitest';
import {
  AVISO_DEMO,
  CLAVE_ESTADO_DEMO,
  origenDe,
  esDemo,
  origenDeEstado,
  nombreExportacion,
  sobreExportacion,
  validarImportacion,
  mensajeRechazo,
} from './origenDatos';

describe('origenDe · solo Google es REAL', () => {
  it('una sesión de Google es REAL', () => {
    expect(origenDe({ provider: 'google' })).toBe('REAL');
    expect(esDemo({ provider: 'google' })).toBe(false);
  });

  it('cualquier otra cosa es DEMO', () => {
    for (const u of [{ provider: 'mock' }, { provider: '' }, { provider: null }, {}, null, undefined]) {
      expect(origenDe(u)).toBe('DEMO');
      expect(esDemo(u)).toBe(true);
    }
  });
});

describe('origenDeEstado · compatibilidad con respaldos antiguos', () => {
  it('respeta el campo origen cuando existe', () => {
    expect(origenDeEstado({ origen: 'REAL' })).toBe('REAL');
    expect(origenDeEstado({ origen: 'DEMO' })).toBe('DEMO');
  });

  it('sin campo origen lo infiere de la CLAVE, nunca del contenido', () => {
    expect(origenDeEstado({ members: [] }, CLAVE_ESTADO_DEMO)).toBe('DEMO');
    expect(origenDeEstado({ members: [] }, 'pate-salud-state:alguien@example.invalid')).toBe('REAL');
  });

  it('sin campo y sin clave devuelve null en vez de adivinar', () => {
    expect(origenDeEstado({ members: [] })).toBeNull();
    expect(origenDeEstado({ members: [] }, 'otra-clave')).toBeNull();
    expect(origenDeEstado(null)).toBeNull();
  });

  it('un origen con valor desconocido no se acepta', () => {
    expect(origenDeEstado({ origen: 'OTRO' })).toBeNull();
    expect(origenDeEstado({ origen: 123 })).toBeNull();
  });
});

describe('nombreExportacion', () => {
  const fecha = new Date(Date.UTC(2026, 8, 7, 12, 0, 0));

  it('marca el archivo DEMO con prefijo', () => {
    expect(nombreExportacion('DEMO', fecha)).toBe('DEMO_pate_salud_expediente_familiar_2026-09-07.json');
  });

  it('el archivo real no lleva prefijo', () => {
    expect(nombreExportacion('REAL', fecha)).toBe('pate_salud_expediente_familiar_2026-09-07.json');
  });
});

describe('sobreExportacion', () => {
  it('el JSON de demostración lleva aviso y origen', () => {
    const r = sobreExportacion('DEMO', { members: [], schemaVersion: 1 });
    expect(r.origen).toBe('DEMO');
    expect(r._aviso).toBe(AVISO_DEMO);
    expect(JSON.stringify(r)).toContain('DEMOSTRACIÓN');
  });

  it('el JSON real lleva origen pero no aviso', () => {
    const r = sobreExportacion('REAL', { members: [], schemaVersion: 1 });
    expect(r.origen).toBe('REAL');
    expect(r._aviso).toBeUndefined();
  });

  it('no muta el objeto recibido', () => {
    const original = { members: [], schemaVersion: 1 };
    sobreExportacion('DEMO', original);
    expect(Object.keys(original).sort()).toEqual(['members', 'schemaVersion']);
  });
});

describe('validarImportacion · matriz cruzada', () => {
  it('REAL en REAL se importa', () => {
    expect(validarImportacion('REAL', 'REAL')).toEqual({ ok: true });
  });

  it('DEMO en DEMO se importa', () => {
    expect(validarImportacion('DEMO', 'DEMO')).toEqual({ ok: true });
  });

  it('un respaldo DEMO NO entra en una sesión REAL', () => {
    expect(validarImportacion('REAL', 'DEMO')).toEqual({ ok: false, codigo: 'DEMO_EN_REAL' });
  });

  it('un respaldo REAL NO entra en el modo DEMO', () => {
    expect(validarImportacion('DEMO', 'REAL')).toEqual({ ok: false, codigo: 'REAL_EN_DEMO' });
  });

  it('un respaldo sin origen exige confirmación, no se acepta en silencio', () => {
    expect(validarImportacion('REAL', null)).toEqual({ ok: false, codigo: 'SIN_ORIGEN' });
    expect(validarImportacion('DEMO', null)).toEqual({ ok: false, codigo: 'SIN_ORIGEN' });
  });
});

describe('mensajeRechazo · no expone contenido del respaldo', () => {
  it('cada código tiene título y descripción propios', () => {
    for (const c of ['DEMO_EN_REAL', 'REAL_EN_DEMO', 'SIN_ORIGEN'] as const) {
      const m = mensajeRechazo(c);
      expect(m.titulo.length).toBeGreaterThan(10);
      expect(m.descripcion.length).toBeGreaterThan(20);
    }
  });

  it('los textos no incluyen marcadores de sustitución ni datos', () => {
    for (const c of ['DEMO_EN_REAL', 'REAL_EN_DEMO', 'SIN_ORIGEN'] as const) {
      const m = mensajeRechazo(c);
      expect(`${m.titulo} ${m.descripcion}`).not.toMatch(/\$\{|\{\{|@|\d{5,}/);
    }
  });
});
