import { describe, it, expect } from 'vitest';
import {
  CAMPOS_RETIRADOS,
  CLAVE_CUARENTENA,
  MENSAJE_ILEGIBLE,
  leerExpediente,
  type AlmacenLike,
} from './lecturaExpediente';

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

const CLAVE = 'pate-salud-state:prueba@example.invalid';

/** Expediente mínimo válido. Ningún dato corresponde a una persona real. */
const EXPEDIENTE = JSON.stringify({
  schemaVersion: 1,
  origen: 'DEMO',
  user: null,
  members: [{ id: 'm1', fullName: 'SINTETICO' }],
  appointments: [],
});

describe('leerExpediente · distinguir vacío de ilegible', () => {
  it('sin nada guardado devuelve VACIO, que es un expediente nuevo', () => {
    const { store } = almacenFalso();
    expect(leerExpediente(CLAVE, store)).toEqual({ estado: 'VACIO' });
  });

  it('con una cadena vacía también es VACIO, no un fallo', () => {
    const { store } = almacenFalso({ [CLAVE]: '' });
    expect(leerExpediente(CLAVE, store).estado).toBe('VACIO');
  });

  it('con un expediente válido devuelve OK y sus datos', () => {
    const { store } = almacenFalso({ [CLAVE]: EXPEDIENTE });
    const r = leerExpediente(CLAVE, store);
    expect(r.estado).toBe('OK');
    if (r.estado !== 'OK') throw new Error('debía ser OK');
    expect(r.datos.members).toHaveLength(1);
  });

  it('con JSON roto NO dice que está vacío: dice que es ilegible', () => {
    const { store } = almacenFalso({ [CLAVE]: '{"members": [' });
    const r = leerExpediente(CLAVE, store);
    expect(r.estado).toBe('ILEGIBLE');
    if (r.estado !== 'ILEGIBLE') throw new Error('debía ser ILEGIBLE');
    expect(r.motivo).toBe('JSON_INVALIDO');
  });

  it('con un JSON que no es un objeto lo marca ilegible', () => {
    const { store } = almacenFalso({ [CLAVE]: '"soy una cadena"' });
    const r = leerExpediente(CLAVE, store);
    expect(r.estado).toBe('ILEGIBLE');
    if (r.estado !== 'ILEGIBLE') throw new Error('debía ser ILEGIBLE');
    expect(r.motivo).toBe('NO_ES_OBJETO');
  });

  it('con las estructuras clínicas mínimas ausentes lo marca ilegible', () => {
    const { store } = almacenFalso({ [CLAVE]: '{"schemaVersion":1}' });
    const r = leerExpediente(CLAVE, store);
    expect(r.estado).toBe('ILEGIBLE');
    if (r.estado !== 'ILEGIBLE') throw new Error('debía ser ILEGIBLE');
    expect(r.motivo).toBe('FALTAN_CAMPOS');
  });

  it('si el almacén lanza al leer, es ilegible y no vacío', () => {
    const { store } = almacenFalso();
    const roto: AlmacenLike = {
      ...store,
      getItem: () => {
        throw new Error('almacenamiento bloqueado');
      },
    };
    const r = leerExpediente(CLAVE, roto);
    expect(r.estado).toBe('ILEGIBLE');
    if (r.estado !== 'ILEGIBLE') throw new Error('debía ser ILEGIBLE');
    expect(r.motivo).toBe('LECTURA_FALLIDA');
  });

  it('sin almacén disponible es ilegible: no se puede afirmar que no haya nada', () => {
    expect(leerExpediente(CLAVE, null).estado).toBe('ILEGIBLE');
  });
});

describe('leerExpediente · el expediente ilegible NO se borra', () => {
  it('conserva intacto el original tras un fallo de lectura', () => {
    const roto = '{"members": [';
    const { store, datos } = almacenFalso({ [CLAVE]: roto });

    leerExpediente(CLAVE, store);

    expect(
      datos.get(CLAVE),
      'un expediente clínico ilegible no puede desaparecer: puede ser recuperable',
    ).toBe(roto);
  });

  it('guarda una copia en cuarentena para poder rescatarla', () => {
    const roto = '{"members": [';
    const { store, datos } = almacenFalso({ [CLAVE]: roto });

    leerExpediente(CLAVE, store);

    expect(datos.get(`${CLAVE_CUARENTENA}${CLAVE}`)).toBe(roto);
  });

  it('no pisa una cuarentena anterior con un segundo intento', () => {
    const primero = '{"members": [';
    const { store, datos } = almacenFalso({ [CLAVE]: primero });
    leerExpediente(CLAVE, store);

    datos.set(CLAVE, '{"otra cosa rota"');
    leerExpediente(CLAVE, store);

    expect(
      datos.get(`${CLAVE_CUARENTENA}${CLAVE}`),
      'la primera copia es la que conserva el estado más antiguo',
    ).toBe(primero);
  });

  it('si la cuarentena falla, la lectura sigue informando del problema', () => {
    const { store } = almacenFalso({ [CLAVE]: '{"members": [' });
    const sinEscritura: AlmacenLike = {
      ...store,
      setItem: () => {
        throw new Error('cuota superada');
      },
    };
    expect(leerExpediente(CLAVE, sinEscritura).estado).toBe('ILEGIBLE');
  });

  it('un expediente válido no deja nada en cuarentena', () => {
    const { store, datos } = almacenFalso({ [CLAVE]: EXPEDIENTE });
    leerExpediente(CLAVE, store);
    expect(datos.has(`${CLAVE_CUARENTENA}${CLAVE}`)).toBe(false);
  });
});

describe('MENSAJE_ILEGIBLE', () => {
  it('cubre todos los motivos y ninguno culpa a quien lo lee', () => {
    for (const motivo of ['JSON_INVALIDO', 'NO_ES_OBJETO', 'FALTAN_CAMPOS', 'LECTURA_FALLIDA'] as const) {
      const m = MENSAJE_ILEGIBLE[motivo];
      expect(m, `falta mensaje para ${motivo}`).toBeTruthy();
      expect(m.length).toBeGreaterThan(20);
    }
  });

  it('ningún mensaje sugiere que el expediente esté vacío', () => {
    for (const m of Object.values(MENSAJE_ILEGIBLE)) {
      expect(m.toLowerCase()).not.toContain('no hay datos');
      expect(m.toLowerCase()).not.toContain('sin registros');
    }
  });
});

describe('Bloque I · la migración retira los campos que ya no existen', () => {
  const CON_RESIDUOS = JSON.stringify({
    schemaVersion: 1,
    origen: 'REAL',
    user: null,
    members: [{ id: 'm1', fullName: 'SINTETICO' }],
    appointments: [{ id: 'a1' }],
    sharedReports: [{ id: 'rep-1', spreadsheetId: 'ID-SINTETICO' }],
    lastExportMetadata: { spreadsheetId: 'ID-SINTETICO' },
    // Los de G4, por si un estado muy antiguo los conserva todavía.
    databaseSpreadsheetId: 'ID-SINTETICO',
    databaseSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/ID-SINTETICO',
    appDataFileId: 'ID-SINTETICO',
  });

  it('el expediente que devuelve ya no los lleva', () => {
    const { store } = almacenFalso({ [CLAVE]: CON_RESIDUOS });
    const r = leerExpediente(CLAVE, store);
    expect(r.estado).toBe('OK');
    const datos = (r as { datos: Record<string, unknown> }).datos;
    for (const campo of CAMPOS_RETIRADOS) expect(datos, campo).not.toHaveProperty(campo);
  });

  it('y el disco tampoco: se reescribe en el acto, sin esperar al próximo guardado', () => {
    const { store, datos } = almacenFalso({ [CLAVE]: CON_RESIDUOS });
    leerExpediente(CLAVE, store);
    const guardado = datos.get(CLAVE)!;
    expect(guardado).not.toContain('ID-SINTETICO');
  });

  it('no toca nada más: el expediente sigue entero', () => {
    const { store, datos } = almacenFalso({ [CLAVE]: CON_RESIDUOS });
    leerExpediente(CLAVE, store);
    const guardado = JSON.parse(datos.get(CLAVE)!);
    expect(guardado).toEqual({
      schemaVersion: 1,
      origen: 'REAL',
      user: null,
      members: [{ id: 'm1', fullName: 'SINTETICO' }],
      appointments: [{ id: 'a1' }],
    });
  });

  it('un expediente ya limpio no se reescribe', () => {
    const { store, datos } = almacenFalso({ [CLAVE]: EXPEDIENTE });
    let escrituras = 0;
    const espia = { ...store, setItem: (k: string, v: string) => { escrituras++; datos.set(k, v); } };
    leerExpediente(CLAVE, espia);
    expect(escrituras).toBe(0);
  });

  it('si no se puede reescribir, se devuelve limpio igual: la lectura no falla por eso', () => {
    const { store } = almacenFalso({ [CLAVE]: CON_RESIDUOS });
    const sinEscritura = { ...store, setItem: () => { throw new Error('QuotaExceededError'); } };
    const r = leerExpediente(CLAVE, sinEscritura);
    expect(r.estado).toBe('OK');
    expect((r as { datos: Record<string, unknown> }).datos).not.toHaveProperty('sharedReports');
  });
});
