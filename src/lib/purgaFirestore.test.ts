import { describe, it, expect, beforeEach } from 'vitest';
import {
  BASES_CONOCIDAS,
  CLAVE_PURGA_PENDIENTE,
  ejecutarPurgaDiferidaSiProcede,
  esBaseDeFirebase,
  hayPurgaPendiente,
  purgarCacheFirestore,
  type AlmacenIndexado,
} from './purgaFirestore';

/**
 * A6-F2 · la caché que Firebase deja en el disco de quien ya usó la aplicación.
 *
 * Borrar el SDK no borra los datos: Firestore guardaba en IndexedDB una copia
 * de **todo documento leído**, o sea el expediente completo. Por eso este
 * módulo sobrevive a G4, y por eso se reescribió sobre IndexedDB directamente.
 *
 * Lo que más importa de todo esto es una sola cosa: **una purga a medias no se
 * puede reportar como éxito**. Si otra pestaña tiene la base abierta, el
 * borrado se queda bloqueado, y decirle a alguien que sus datos clínicos se
 * borraron cuando siguen ahí es la peor forma de fallar que tiene este módulo.
 */

function indexadoFalso(opciones: {
  bases?: string[];
  sinEnumerar?: boolean;
  bloqueadas?: string[];
  fallaEnumerar?: boolean;
} = {}) {
  const borradas: string[] = [];
  const bloqueadas = new Set(opciones.bloqueadas ?? []);

  const indexado: AlmacenIndexado = {
    databases: opciones.sinEnumerar
      ? undefined
      : async () => {
          if (opciones.fallaEnumerar) throw new Error('sin permiso');
          return (opciones.bases ?? []).map((name) => ({ name }));
        },
    deleteDatabase: (nombre: string) => {
      const peticion = {} as IDBOpenDBRequest & {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
      };

      queueMicrotask(() => {
        if (bloqueadas.has(nombre)) {
          peticion.onblocked?.(new Event('blocked') as never);
          return;
        }
        borradas.push(nombre);
        peticion.onsuccess?.(new Event('success') as never);
      });

      return peticion;
    },
  };

  return { indexado, borradas };
}

/**
 * Un `window` con `localStorage` de mentira.
 *
 * No hay navegador en las pruebas de unidad, y este módulo lee el marcador de
 * `localStorage` en cada llamada.
 */
function prepararVentana() {
  const datos = new Map<string, string>();
  const localStorage = {
    get length() {
      return datos.size;
    },
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
  return datos;
}

let marcadores: Map<string, string>;
beforeEach(() => {
  marcadores = prepararVentana();
});

describe('qué se considera una base de Firebase', () => {
  it('las de Firestore y las del SDK, sí', () => {
    expect(esBaseDeFirebase('firestore/[DEFAULT]/pate-abc123/main')).toBe(true);
    expect(esBaseDeFirebase('firebaseLocalStorageDb')).toBe(true);
    expect(esBaseDeFirebase('firebase-heartbeat-database')).toBe(true);
  });

  it('las de la propia aplicación, NO', () => {
    // Borrar de más aquí significaría borrar datos de alguien. El filtro es
    // por nombre y tiene que ser estrecho.
    expect(esBaseDeFirebase('pate-local')).toBe(false);
    expect(esBaseDeFirebase('keyval-store')).toBe(false);
    expect(esBaseDeFirebase('')).toBe(false);
    expect(esBaseDeFirebase(null)).toBe(false);
  });
});

describe('purgarCacheFirestore', () => {
  it('escribe el marcador ANTES de borrar nada', async () => {
    // Si el navegador se cierra a mitad, la purga tiene que seguir pendiente.
    let visto = false;
    const { indexado } = indexadoFalso({ bases: ['firestore/[DEFAULT]/x/main'] });
    const original = indexado.deleteDatabase;
    indexado.deleteDatabase = (n) => {
      visto = hayPurgaPendiente();
      return original(n);
    };

    await purgarCacheFirestore(indexado);
    expect(visto).toBe(true);
  });

  it('borra las de Firebase y deja en paz las demás', async () => {
    const { indexado, borradas } = indexadoFalso({
      bases: ['firestore/[DEFAULT]/x/main', 'firebaseLocalStorageDb', 'pate-local'],
    });

    await expect(purgarCacheFirestore(indexado)).resolves.toBe('ok');
    expect(borradas.sort()).toEqual(['firebaseLocalStorageDb', 'firestore/[DEFAULT]/x/main']);
    expect(hayPurgaPendiente()).toBe(false);
  });

  it('sin nada que borrar, no hay purga pendiente que arrastrar', async () => {
    const { indexado } = indexadoFalso({ bases: ['pate-local'] });
    await expect(purgarCacheFirestore(indexado)).resolves.toBe('no_aplica');
    expect(hayPurgaPendiente()).toBe(false);
  });

  it('una base bloqueada por otra pestaña deja la purga DIFERIDA', async () => {
    // Es el caso realista, no el raro. `deleteDatabase` no falla: se queda
    // esperando a que la otra pestaña cierre.
    const { indexado } = indexadoFalso({
      bases: ['firestore/[DEFAULT]/x/main'],
      bloqueadas: ['firestore/[DEFAULT]/x/main'],
    });

    await expect(purgarCacheFirestore(indexado)).resolves.toBe('diferida');
    expect(hayPurgaPendiente(), 'el marcador tiene que sobrevivir').toBe(true);
  });

  it('si UNA de varias se bloquea, tampoco se canta victoria', async () => {
    // Media caché borrada sigue siendo la otra media en el disco.
    const { indexado } = indexadoFalso({
      bases: ['firestore/[DEFAULT]/x/main', 'firebaseLocalStorageDb'],
      bloqueadas: ['firebaseLocalStorageDb'],
    });

    await expect(purgarCacheFirestore(indexado)).resolves.toBe('diferida');
    expect(hayPurgaPendiente()).toBe(true);
  });

  it('si no se puede ni enumerar, se conserva el marcador', async () => {
    const { indexado } = indexadoFalso({ fallaEnumerar: true });
    await expect(purgarCacheFirestore(indexado)).resolves.toBe('diferida');
    expect(hayPurgaPendiente()).toBe(true);
  });

  it('sin IndexedDB no se bloquea la salida', async () => {
    await expect(purgarCacheFirestore(null)).resolves.toBe('no_aplica');
  });
});

describe('cuando el navegador no sabe enumerar bases', () => {
  it('se borra lo que tiene nombre fijo y se deja de reintentar', async () => {
    // Sin `databases()` no hay forma de dar con la de Firestore: su nombre
    // lleva dentro el identificador del proyecto, que se fue con la
    // configuración. Volver cada arranque a no encontrar nada no limpia nada y
    // sí gasta el arranque de todos.
    const { indexado, borradas } = indexadoFalso({ sinEnumerar: true });

    await expect(purgarCacheFirestore(indexado)).resolves.toBe('no_aplica');
    expect(borradas.sort()).toEqual([...BASES_CONOCIDAS].sort());
    expect(hayPurgaPendiente()).toBe(false);
  });
});

describe('ejecutarPurgaDiferidaSiProcede · el arranque', () => {
  it('sin marcador no hace nada', async () => {
    await expect(ejecutarPurgaDiferidaSiProcede()).resolves.toBe('no_aplica');
  });

  it('dos llamadas simultáneas son UNA purga', async () => {
    // React monta dos veces en modo estricto, y dos purgas a la vez se
    // bloquearían entre ellas.
    marcadores.set(CLAVE_PURGA_PENDIENTE, '1');

    const a = ejecutarPurgaDiferidaSiProcede();
    const b = ejecutarPurgaDiferidaSiProcede();
    expect(a).toBe(b);
    await Promise.all([a, b]);
  });

  it('un marcador huérfano se limpia en vez de quedarse', async () => {
    marcadores.set(CLAVE_PURGA_PENDIENTE, '1');
    await ejecutarPurgaDiferidaSiProcede();
    expect(hayPurgaPendiente()).toBe(false);
  });
});
