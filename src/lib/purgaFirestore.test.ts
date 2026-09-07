import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pruebas de `purgaFirestore` con DOBLES (stubs).
 *
 * HONESTIDAD SOBRE EL ALCANCE
 * ═══════════════════════════
 * Esto NO prueba la limpieza real de la caché de Firestore. `terminate()` y
 * `clearIndexedDbPersistence()` están sustituidos por dobles. Lo que se prueba
 * es la LÓGICA DE DECISIÓN que los rodea: cuándo se escribe el marcador, cuándo
 * se conserva, cuándo se borra, y que un fallo jamás se reporte como éxito.
 *
 * `failed-precondition` —el caso de "hay otra pestaña abierta"— no se puede
 * provocar de forma determinista en un navegador real, y por eso se cubre aquí.
 * La limpieza efectiva de IndexedDB queda pendiente de validación manual (M11
 * y M12).
 */

const dobles = vi.hoisted(() => ({
  esFirebase: true,
  terminate: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
}));

vi.mock('./dataBackend', () => ({
  get isFirebaseBackend() {
    return dobles.esFirebase;
  },
}));
vi.mock('./firebase', () => ({ db: { __doble: true } }));
vi.mock('firebase/firestore', () => ({
  terminate: (...a: unknown[]) => dobles.terminate(...(a as [])),
  clearIndexedDbPersistence: (...a: unknown[]) => dobles.clear(...(a as [])),
}));

const CLAVE = 'pate:purga_firestore_pendiente';

function prepararEntorno(conIndexedDb = true) {
  const datos = new Map<string, string>();
  const localStorage = {
    get length() { return datos.size; },
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear(),
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
  (globalThis as Record<string, unknown>).indexedDB = conIndexedDb ? {} : undefined;
  return datos;
}

async function cargarModulo() {
  vi.resetModules();
  return import('./purgaFirestore');
}

describe('purgaCacheFirestore · marcador y resultados', () => {
  beforeEach(() => {
    dobles.esFirebase = true;
    dobles.terminate.mockReset().mockResolvedValue(undefined);
    dobles.clear.mockReset().mockResolvedValue(undefined);
  });

  it('escribe el marcador ANTES de llamar a terminate', async () => {
    const datos = prepararEntorno();
    const orden: string[] = [];
    dobles.terminate.mockImplementation(async () => {
      orden.push('terminate:marcador=' + datos.get(CLAVE));
    });
    const { purgarCacheFirestore } = await cargarModulo();
    await purgarCacheFirestore();
    expect(orden[0]).toBe('terminate:marcador=1');
  });

  it('con limpieza exitosa devuelve ok y BORRA el marcador', async () => {
    const datos = prepararEntorno();
    const { purgarCacheFirestore } = await cargarModulo();
    expect(await purgarCacheFirestore()).toBe('ok');
    expect(datos.has(CLAVE)).toBe(false);
    expect(dobles.terminate).toHaveBeenCalledTimes(1);
    expect(dobles.clear).toHaveBeenCalledTimes(1);
  });

  it('con failed-precondition devuelve diferida y CONSERVA el marcador', async () => {
    const datos = prepararEntorno();
    dobles.clear.mockRejectedValue(Object.assign(new Error('otra pestaña'), { code: 'failed-precondition' }));
    const { purgarCacheFirestore } = await cargarModulo();
    const r = await purgarCacheFirestore();
    expect(r).toBe('diferida');
    expect(r).not.toBe('ok');           // jamás un éxito falso
    expect(datos.get(CLAVE)).toBe('1'); // se reintentará en el próximo arranque
  });

  it('ante un error desconocido tampoco afirma éxito', async () => {
    const datos = prepararEntorno();
    dobles.clear.mockRejectedValue(new Error('vaya'));
    const { purgarCacheFirestore } = await cargarModulo();
    expect(await purgarCacheFirestore()).toBe('diferida');
    expect(datos.get(CLAVE)).toBe('1');
  });

  it('si terminate rechaza (instancia ya terminada) continúa y limpia igual', async () => {
    const datos = prepararEntorno();
    dobles.terminate.mockRejectedValue(new Error('ya terminada'));
    const { purgarCacheFirestore } = await cargarModulo();
    expect(await purgarCacheFirestore()).toBe('ok');
    expect(datos.has(CLAVE)).toBe(false);
  });

  it('con persistencia no soportada devuelve no_aplica y borra el marcador', async () => {
    const datos = prepararEntorno();
    dobles.clear.mockRejectedValue(Object.assign(new Error('no'), { code: 'unimplemented' }));
    const { purgarCacheFirestore } = await cargarModulo();
    expect(await purgarCacheFirestore()).toBe('no_aplica');
    expect(datos.has(CLAVE)).toBe(false);
  });

  it('sin backend Firebase no toca nada', async () => {
    const datos = prepararEntorno();
    dobles.esFirebase = false;
    const { purgarCacheFirestore } = await cargarModulo();
    expect(await purgarCacheFirestore()).toBe('no_aplica');
    expect(datos.has(CLAVE)).toBe(false);
    expect(dobles.terminate).not.toHaveBeenCalled();
  });

  it('sin IndexedDB (modo privado) no bloquea la salida', async () => {
    const datos = prepararEntorno(false);
    const { purgarCacheFirestore } = await cargarModulo();
    expect(await purgarCacheFirestore()).toBe('no_aplica');
    expect(datos.has(CLAVE)).toBe(false);
    expect(dobles.terminate).not.toHaveBeenCalled();
  });
});

describe('ejecutarPurgaDiferidaSiProcede · arranque', () => {
  beforeEach(() => {
    dobles.esFirebase = true;
    dobles.terminate.mockReset().mockResolvedValue(undefined);
    dobles.clear.mockReset().mockResolvedValue(undefined);
  });

  it('sin marcador no hace nada', async () => {
    prepararEntorno();
    const { ejecutarPurgaDiferidaSiProcede } = await cargarModulo();
    expect(await ejecutarPurgaDiferidaSiProcede()).toBe('no_aplica');
    expect(dobles.terminate).not.toHaveBeenCalled();
  });

  it('con marcador y limpieza exitosa borra el marcador y devuelve ok', async () => {
    const datos = prepararEntorno();
    datos.set(CLAVE, '1');
    const { ejecutarPurgaDiferidaSiProcede, hayPurgaPendiente } = await cargarModulo();
    expect(hayPurgaPendiente()).toBe(true);
    expect(await ejecutarPurgaDiferidaSiProcede()).toBe('ok');
    expect(datos.has(CLAVE)).toBe(false);
  });

  it('con marcador y otra pestaña abierta lo conserva para el siguiente arranque', async () => {
    const datos = prepararEntorno();
    datos.set(CLAVE, '1');
    dobles.clear.mockRejectedValue(Object.assign(new Error('x'), { code: 'failed-precondition' }));
    const { ejecutarPurgaDiferidaSiProcede } = await cargarModulo();
    expect(await ejecutarPurgaDiferidaSiProcede()).toBe('diferida');
    expect(datos.get(CLAVE)).toBe('1');
  });

  it('un marcador huérfano de otro backend se limpia en lugar de quedarse', async () => {
    const datos = prepararEntorno();
    datos.set(CLAVE, '1');
    dobles.esFirebase = false;
    const { ejecutarPurgaDiferidaSiProcede } = await cargarModulo();
    expect(await ejecutarPurgaDiferidaSiProcede()).toBe('no_aplica');
    expect(datos.has(CLAVE)).toBe(false);
  });

  it('dos llamadas simultáneas producen UNA sola purga (React monta dos veces)', async () => {
    const datos = prepararEntorno();
    datos.set(CLAVE, '1');
    // Promesa diferida: `clear` no resuelve hasta que la prueba lo decida.
    let liberar!: () => void;
    const espera = new Promise<void>((res) => { liberar = res; });
    dobles.clear.mockImplementation(() => espera);
    const { ejecutarPurgaDiferidaSiProcede } = await cargarModulo();

    const a = ejecutarPurgaDiferidaSiProcede();
    const b = ejecutarPurgaDiferidaSiProcede();
    liberar();
    await Promise.all([a, b]);

    expect(dobles.terminate).toHaveBeenCalledTimes(1);
    expect(dobles.clear).toHaveBeenCalledTimes(1);
  });
});
