import { describe, it, expect, vi } from 'vitest';
import {
  purgarPersistenciaLocal,
  debeEliminarse,
  CLAVES_PRESERVADAS,
} from './purgaLocal';
import {
  CLAVE_PREFERENCIAS,
  CLAVE_DEVICE_ID,
  CLAVE_MIGRACION,
  type AlmacenLike,
} from './preferencias';

const CLAVE_DEMO_HEREDADA = 'pate_salud_familiar_app_state_demo';

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

/** Escenario realista: expediente real, demo, heredada, sesión y preferencias. */
function escenarioCompleto() {
  return almacenFalso({
    'pate-salud-state:walter@gmail.com': '{"members":[{"documentNumber":"10203040"}]}',
    'pate-salud-state:demo': '{"members":[]}',
    [CLAVE_DEMO_HEREDADA]: '{"members":[]}',
    'pate_salud_active_user': '{"email":"walter@gmail.com"}',
    'pate_salud_appdata_boundary': 'algo',
    'pate:purga_firestore_pendiente': '1',
    // Preservadas
    [CLAVE_PREFERENCIAS]: '{"autoLockMinutes":15}',
    [CLAVE_DEVICE_ID]: 'dev-123',
    [CLAVE_MIGRACION]: '1',
    // Ajenas a Paté
    'otra-app:sesion': 'no tocar',
    'theme': 'dark',
    'PATE_MAYUSCULAS': 'no empieza por "pate" en minúsculas',
  });
}

describe('debeEliminarse', () => {
  it('preserva exactamente las tres claves permitidas', () => {
    expect(debeEliminarse(CLAVE_PREFERENCIAS)).toBe(false);
    expect(debeEliminarse(CLAVE_DEVICE_ID)).toBe(false);
    expect(debeEliminarse(CLAVE_MIGRACION)).toBe(false);
    expect(CLAVES_PRESERVADAS.size).toBe(3);
  });

  it('elimina cualquier clave de la app no preservada', () => {
    expect(debeEliminarse('pate-salud-state:alguien@gmail.com')).toBe(true);
    expect(debeEliminarse(CLAVE_DEMO_HEREDADA)).toBe(true);
    expect(debeEliminarse('pate_salud_active_user')).toBe(true);
  });

  it('elimina claves FUTURAS desconocidas que empiecen por pate', () => {
    expect(debeEliminarse('pate:algo-que-aun-no-existe')).toBe(true);
    expect(debeEliminarse('pate_v9_cache')).toBe(true);
    expect(debeEliminarse('pateXYZ')).toBe(true);
  });

  it('no toca claves ajenas a la aplicación', () => {
    expect(debeEliminarse('otra-app:sesion')).toBe(false);
    expect(debeEliminarse('theme')).toBe(false);
    expect(debeEliminarse('PATE_MAYUSCULAS')).toBe(false);
  });
});

describe('purgarPersistenciaLocal', () => {
  it('elimina el expediente real, el demo, la heredada y la sesión', () => {
    const { store, datos } = escenarioCompleto();
    const r = purgarPersistenciaLocal(store);

    expect(datos.has('pate-salud-state:walter@gmail.com')).toBe(false);
    expect(datos.has('pate-salud-state:demo')).toBe(false);
    expect(datos.has(CLAVE_DEMO_HEREDADA)).toBe(false);
    expect(datos.has('pate_salud_active_user')).toBe(false);
    expect(datos.has('pate_salud_appdata_boundary')).toBe(false);
    expect(r.errores).toEqual([]);
    expect(r.sinAlmacenamiento).toBe(false);
  });

  it('preserva EXACTAMENTE las tres claves permitidas, con su valor intacto', () => {
    const { store, datos } = escenarioCompleto();
    purgarPersistenciaLocal(store);

    expect(datos.get(CLAVE_PREFERENCIAS)).toBe('{"autoLockMinutes":15}');
    expect(datos.get(CLAVE_DEVICE_ID)).toBe('dev-123');
    expect(datos.get(CLAVE_MIGRACION)).toBe('1');
  });

  it('no elimina ni modifica claves de terceros', () => {
    const { store, datos } = escenarioCompleto();
    purgarPersistenciaLocal(store);

    expect(datos.get('otra-app:sesion')).toBe('no tocar');
    expect(datos.get('theme')).toBe('dark');
    expect(datos.get('PATE_MAYUSCULAS')).toBe('no empieza por "pate" en minúsculas');
  });

  it('elimina la clave DEMO heredada SIN llamar a getItem sobre ella', () => {
    const { store } = escenarioCompleto();
    const espia = vi.spyOn(store, 'getItem');
    purgarPersistenciaLocal(store);

    const leidas = espia.mock.calls.map((c) => c[0]);
    expect(leidas).not.toContain(CLAVE_DEMO_HEREDADA);
    espia.mockRestore();
  });

  it('no llama a getItem sobre NINGUNA de las claves eliminadas', () => {
    const { store } = escenarioCompleto();
    const espia = vi.spyOn(store, 'getItem');
    const r = purgarPersistenciaLocal(store);

    const leidas = new Set(espia.mock.calls.map((c) => c[0]));
    for (const eliminada of r.clavesEliminadas) {
      expect(leidas.has(eliminada)).toBe(false);
    }
    espia.mockRestore();
  });

  it('elimina claves desconocidas sembradas por una versión futura', () => {
    const { store, datos } = almacenFalso({
      'pate:formato-2027': 'x',
      'pate_nuevo_cache': 'y',
      [CLAVE_DEVICE_ID]: 'dev-1',
    });
    purgarPersistenciaLocal(store);

    expect(datos.has('pate:formato-2027')).toBe(false);
    expect(datos.has('pate_nuevo_cache')).toBe(false);
    expect(datos.has(CLAVE_DEVICE_ID)).toBe(true);
  });

  it('recorre todas las claves aunque se eliminen mientras se itera', () => {
    const { store, datos } = almacenFalso({
      'pate-a': '1', 'pate-b': '2', 'pate-c': '3', 'pate-d': '4', 'pate-e': '5',
    });
    const r = purgarPersistenciaLocal(store);

    expect(r.clavesEliminadas).toHaveLength(5);
    expect(datos.size).toBe(0);
  });

  it('sin almacenamiento devuelve sinAlmacenamiento y no lanza', () => {
    const r = purgarPersistenciaLocal(null);
    expect(r.sinAlmacenamiento).toBe(true);
    expect(r.clavesEliminadas).toEqual([]);
  });

  it('un removeItem que lanza acumula el error sin abortar el resto', () => {
    const { store, datos } = almacenFalso({ 'pate-a': '1', 'pate-b': '2' });
    const roto: AlmacenLike = {
      ...store,
      get length() { return store.length; },
      removeItem: (k: string) => {
        if (k === 'pate-a') throw new Error('bloqueado');
        store.removeItem(k);
      },
    };
    const r = purgarPersistenciaLocal(roto);

    expect(r.errores).toEqual(['no_eliminada:pate-a']);
    expect(r.clavesEliminadas).toEqual(['pate-b']);
    expect(datos.has('pate-b')).toBe(false);
  });

  it('no deja ningún rastro del número de documento sembrado', () => {
    const { store, datos } = escenarioCompleto();
    purgarPersistenciaLocal(store);
    const restante = JSON.stringify(Array.from(datos.entries()));
    expect(restante).not.toContain('10203040');
    expect(restante).not.toContain('walter@gmail.com');
  });
});
