import { describe, it, expect, vi } from 'vitest';
import {
  CLAVE_PREFERENCIAS,
  CLAVE_MIGRACION,
  PREFERENCIAS_POR_DEFECTO,
  CAMPOS_PREFERENCIAS,
  sanearPreferencias,
  leerPreferencias,
  guardarPreferencias,
  migrarPreferenciasDesdeEstado,
  type AlmacenLike,
} from './preferencias';

/** Doble de localStorage en memoria: permite probar sin jsdom. */
function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map<string, string>(Object.entries(inicial));
  const store: AlmacenLike = {
    get length() {
      return datos.size;
    },
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => {
      datos.set(k, v);
    },
    removeItem: (k: string) => {
      datos.delete(k);
    },
  };
  return { store, datos };
}

const CLAVE_DEMO_HEREDADA = 'pate_salud_familiar_app_state_demo';

describe('sanearPreferencias', () => {
  it('devuelve los valores por defecto ante entradas no válidas', () => {
    for (const entrada of [null, undefined, 42, 'texto', [], true]) {
      expect(sanearPreferencias(entrada)).toEqual(PREFERENCIAS_POR_DEFECTO);
    }
  });

  it('descarta cualquier campo fuera de la lista blanca', () => {
    const r = sanearPreferencias({
      autoLockMinutes: 30,
      // Campos que jamás deben persistir en esta clave:
      email: 'alguien@example.invalid',
      uid: 'abc123',
      familyId: 'fam_1',
      memberId: 'm_1',
      databaseSpreadsheetId: '1AbC',
      members: [{ fullName: 'X' }],
    });
    expect(r.autoLockMinutes).toBe(30);
    expect(Object.keys(r).sort()).toEqual([...CAMPOS_PREFERENCIAS].sort());
  });

  it('rechaza horas mal formadas y conserva el valor por defecto', () => {
    const r = sanearPreferencias({ nightLockStart: '25:00', gmailScanTime: 'abc', nightLockEnd: '07:30' });
    expect(r.nightLockStart).toBe(PREFERENCIAS_POR_DEFECTO.nightLockStart);
    expect(r.gmailScanTime).toBe(PREFERENCIAS_POR_DEFECTO.gmailScanTime);
    expect(r.nightLockEnd).toBe('07:30');
  });

  it('acota los numéricos fuera de rango y trunca decimales', () => {
    expect(sanearPreferencias({ autoLockMinutes: 0 }).autoLockMinutes).toBe(15);
    expect(sanearPreferencias({ autoLockMinutes: 9999 }).autoLockMinutes).toBe(15);
    expect(sanearPreferencias({ autoLockMinutes: 20.7 }).autoLockMinutes).toBe(20);
    expect(sanearPreferencias({ gmailScanRangeDays: 400 }).gmailScanRangeDays).toBe(90);
    expect(sanearPreferencias({ gmailScanRangeDays: 30 }).gmailScanRangeDays).toBe(30);
  });

  it('ignora booleanos enviados como cadena', () => {
    expect(sanearPreferencias({ autoLockEnabled: 'true' }).autoLockEnabled).toBe(false);
  });
});

describe('leerPreferencias y guardarPreferencias', () => {
  it('sin almacenamiento devuelve los valores por defecto y no lanza', () => {
    expect(leerPreferencias(null)).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(guardarPreferencias({ autoLockMinutes: 5 }, null)).toBeNull();
  });

  it('ida y vuelta: lo guardado se recupera igual', () => {
    const { store } = almacenFalso();
    guardarPreferencias({ autoLockEnabled: true, autoLockMinutes: 5, nightLockStart: '23:15' }, store);
    const leidas = leerPreferencias(store);
    expect(leidas.autoLockEnabled).toBe(true);
    expect(leidas.autoLockMinutes).toBe(5);
    expect(leidas.nightLockStart).toBe('23:15');
    expect(leidas.driveSyncEnabled).toBe(PREFERENCIAS_POR_DEFECTO.driveSyncEnabled);
  });

  it('guarda de forma incremental sin perder lo anterior', () => {
    const { store } = almacenFalso();
    guardarPreferencias({ autoLockMinutes: 7 }, store);
    guardarPreferencias({ nightLockEnabled: true }, store);
    const r = leerPreferencias(store);
    expect(r.autoLockMinutes).toBe(7);
    expect(r.nightLockEnabled).toBe(true);
  });

  it('un JSON corrupto no rompe la lectura', () => {
    const { store } = almacenFalso({ [CLAVE_PREFERENCIAS]: '{esto no es json' });
    expect(leerPreferencias(store)).toEqual(PREFERENCIAS_POR_DEFECTO);
  });

  it('nunca escribe claves ajenas a la lista blanca', () => {
    const { store, datos } = almacenFalso();
    guardarPreferencias({ autoLockMinutes: 9, email: 'x@example.invalid' } as never, store);
    const guardado = JSON.parse(datos.get(CLAVE_PREFERENCIAS)!);
    expect(Object.keys(guardado).sort()).toEqual([...CAMPOS_PREFERENCIAS].sort());
    expect(JSON.stringify(guardado)).not.toContain('x@example.invalid');
  });

  it('un almacenamiento que lanza al escribir devuelve null en vez de propagar', () => {
    const { store } = almacenFalso();
    const roto: AlmacenLike = {
      ...store,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(guardarPreferencias({ autoLockMinutes: 5 }, roto)).toBeNull();
  });
});

describe('migrarPreferenciasDesdeEstado', () => {
  const estadoReal = JSON.stringify({
    schemaVersion: 1,
    // Preferencias que sí deben rescatarse:
    driveSyncEnabled: false,
    gmailScanRangeDays: 45,
    gmailScanTime: '08:30',
    // PHI e identificadores que NO deben viajar:
    user: { email: 'real@example.invalid', googleId: '1234567890' },
    members: [{ fullName: 'Persona Real', documentNumber: '10203040' }],
    databaseSpreadsheetId: '1AbCdEfGhIjK',
  });

  it('rescata solo los campos de la lista blanca', () => {
    const { store, datos } = almacenFalso({ 'pate-salud-state:usuario@example.invalid': estadoReal });
    const r = migrarPreferenciasDesdeEstado(store);

    expect(r.migrado).toBe(true);
    expect(r.camposRescatados).toBe(3);

    const prefs = leerPreferencias(store);
    expect(prefs.driveSyncEnabled).toBe(false);
    expect(prefs.gmailScanRangeDays).toBe(45);
    expect(prefs.gmailScanTime).toBe('08:30');

    const serializado = datos.get(CLAVE_PREFERENCIAS)!;
    expect(serializado).not.toContain('real@example.invalid');
    expect(serializado).not.toContain('Persona Real');
    expect(serializado).not.toContain('10203040');
    expect(serializado).not.toContain('1AbCdEfGhIjK');
  });

  it('no borra el estado original: purgar es tarea de A6-F2', () => {
    const { store, datos } = almacenFalso({ 'pate-salud-state:usuario@example.invalid': estadoReal });
    migrarPreferenciasDesdeEstado(store);
    expect(datos.get('pate-salud-state:usuario@example.invalid')).toBe(estadoReal);
  });

  it('es idempotente: la segunda llamada no hace trabajo', () => {
    const { store } = almacenFalso({ 'pate-salud-state:usuario@example.invalid': estadoReal });
    expect(migrarPreferenciasDesdeEstado(store).migrado).toBe(true);
    expect(migrarPreferenciasDesdeEstado(store).migrado).toBe(false);
  });

  it('no modifica preferencias ya guardadas al repetirse', () => {
    const { store } = almacenFalso({ 'pate-salud-state:usuario@example.invalid': estadoReal });
    migrarPreferenciasDesdeEstado(store);
    guardarPreferencias({ autoLockMinutes: 3 }, store);
    migrarPreferenciasDesdeEstado(store);
    expect(leerPreferencias(store).autoLockMinutes).toBe(3);
  });

  it('NUNCA lee la clave demo heredada', () => {
    const { store } = almacenFalso({
      [CLAVE_DEMO_HEREDADA]: JSON.stringify({ driveSyncEnabled: false, members: [{ fullName: 'Ficticio' }] }),
    });
    const espia = vi.spyOn(store, 'getItem');
    migrarPreferenciasDesdeEstado(store);
    const leidas = espia.mock.calls.map((c) => c[0]);
    expect(leidas).not.toContain(CLAVE_DEMO_HEREDADA);
    espia.mockRestore();
  });

  it('tampoco lee el estado de la sesión demo', () => {
    const { store } = almacenFalso({
      'pate-salud-state:demo': JSON.stringify({ driveSyncEnabled: false }),
    });
    const espia = vi.spyOn(store, 'getItem');
    migrarPreferenciasDesdeEstado(store);
    expect(espia.mock.calls.map((c) => c[0])).not.toContain('pate-salud-state:demo');
    espia.mockRestore();
  });

  it('sin estado previo deja los valores por defecto y marca la migración', () => {
    const { store } = almacenFalso();
    const r = migrarPreferenciasDesdeEstado(store);
    expect(r.migrado).toBe(true);
    expect(r.camposRescatados).toBe(0);
    expect(leerPreferencias(store)).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(store.getItem(CLAVE_MIGRACION)).toBe('1');
  });

  it('un estado corrupto no impide migrar ni lanza', () => {
    const { store } = almacenFalso({ 'pate-salud-state:x@example.invalid': '{roto' });
    const r = migrarPreferenciasDesdeEstado(store);
    expect(r.migrado).toBe(true);
    expect(r.camposRescatados).toBe(0);
    expect(leerPreferencias(store)).toEqual(PREFERENCIAS_POR_DEFECTO);
  });

  it('sin almacenamiento no hace nada y no lanza', () => {
    expect(migrarPreferenciasDesdeEstado(null)).toEqual({ migrado: false, camposRescatados: 0 });
  });
});
