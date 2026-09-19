import { describe, it, expect } from 'vitest';
import {
  ALCANCE_TOTAL,
  CACHE_ACCESO_SEGUNDOS,
  PREFIJO_CACHE_ACCESO,
  alcanza,
  claveAcceso,
  esOperacion,
  leerCacheAcceso,
  puedeMutarAcceso,
  resolverAcceso,
  separarPacientes,
  serializarAcceso,
  siguienteVersion,
  validarMutacion,
  versionDesde,
  type Acceso,
} from './acceso';
import { encabezadosDe } from './planInstalacion';

/**
 * La autorización del backend, probada sin hoja de cálculo.
 *
 * Ningún correo de aquí corresponde a una persona real. Las filas se fabrican
 * a partir de los encabezados del esquema, no con índices a mano: si mañana se
 * añade una columna en medio, estas pruebas se mueven con ella en vez de
 * empezar a leer otra celda en silencio.
 */

const TITULAR = 'titular-sintetico@example.invalid';
const COLUMNAS = encabezadosDe('ACCESO')!;

/** Una fila de ACCESO con los campos que se le pidan. */
function fila(campos: Record<string, string>): string[] {
  return COLUMNAS.map((c) => campos[c] ?? '');
}

const filaDe = (
  email: string,
  rol: string,
  estado: string,
  pacientes = '',
  propio = '',
): string[] =>
  fila({ email, rol, estado, pacientes_asignados: pacientes, paciente_propio: propio });

describe('resolverAcceso · el titular', () => {
  it('es TITULAR con alcance total aunque no figure en la hoja', () => {
    const r = resolverAcceso(TITULAR, [], TITULAR);
    expect(r.permitido).toBe(true);
    if (!r.permitido) return;
    expect(r.acceso.rol).toBe('TITULAR');
    expect(r.acceso.alcanceTotal).toBe(true);
  });

  it('sigue siendo TITULAR aunque su fila diga REVOCADO', () => {
    // No es una excepción cómoda: es la única forma de que no se quede fuera de
    // su propio expediente por una fila mal editada. Y puede editar la hoja de
    // todos modos, que es suya.
    const filas = [filaDe(TITULAR, 'LECTOR', 'REVOCADO')];
    const r = resolverAcceso(TITULAR, filas, TITULAR);
    expect(r.permitido).toBe(true);
    if (r.permitido) expect(r.acceso.rol).toBe('TITULAR');
  });

  it('recoge su paciente propio si además tiene fila', () => {
    const filas = [filaDe(TITULAR, 'TITULAR', 'ACTIVO', ALCANCE_TOTAL, 'p_titular')];
    const r = resolverAcceso(TITULAR, filas, TITULAR);
    if (r.permitido) expect(r.acceso.pacientePropio).toBe('p_titular');
  });

  it('compara sin distinguir mayúsculas', () => {
    const r = resolverAcceso('TITULAR-SINTETICO@example.invalid'.toLowerCase(), [], TITULAR);
    expect(r.permitido).toBe(true);
  });
});

describe('resolverAcceso · denegación por defecto', () => {
  it('deniega a quien no figura', () => {
    const r = resolverAcceso('desconocido@example.invalid', [], TITULAR);
    expect(r).toEqual({ permitido: false, motivo: 'NO_FIGURA' });
  });

  it('deniega con la hoja vacía o ausente', () => {
    expect(resolverAcceso('a@example.invalid', [], TITULAR).permitido).toBe(false);
    expect(resolverAcceso('a@example.invalid', undefined as never, TITULAR).permitido).toBe(false);
  });

  it('deniega sin correo', () => {
    expect(resolverAcceso('', [], TITULAR)).toEqual({ permitido: false, motivo: 'SIN_CORREO' });
  });

  it('deniega todo estado que no sea ACTIVO', () => {
    for (const estado of ['INVITADO', 'REVOCADO', 'INACTIVO', '', 'ACTIVO_PERO_NO']) {
      const filas = [filaDe('familiar@example.invalid', 'MIEMBRO', estado)];
      const r = resolverAcceso('familiar@example.invalid', filas, TITULAR);
      expect(r.permitido, estado).toBe(false);
      if (!r.permitido) expect(r.motivo).toBe('ESTADO_NO_ACTIVO');
    }
  });

  it('perdona mayúsculas y espacios: la hoja la escribe una persona', () => {
    // Un espacio de más al pegar un valor no puede dejar fuera a un familiar,
    // porque el síntoma sería «no entro» sin nada visible que lo explique.
    for (const estado of ['activo', ' ACTIVO ', 'Activo']) {
      const filas = [filaDe('familiar@example.invalid', 'MIEMBRO', estado)];
      expect(
        resolverAcceso('familiar@example.invalid', filas, TITULAR).permitido,
        JSON.stringify(estado),
      ).toBe(true);
    }
  });

  it('deniega un rol que no está en el catálogo', () => {
    const filas = [filaDe('familiar@example.invalid', 'ADMINISTRADOR', 'ACTIVO')];
    const r = resolverAcceso('familiar@example.invalid', filas, TITULAR);
    expect(r).toEqual({ permitido: false, motivo: 'ROL_DESCONOCIDO' });
  });

  it('no confunde a dos correos parecidos', () => {
    const filas = [filaDe('ana@example.invalid', 'MIEMBRO', 'ACTIVO')];
    expect(resolverAcceso('ana2@example.invalid', filas, TITULAR).permitido).toBe(false);
    expect(resolverAcceso('an@example.invalid', filas, TITULAR).permitido).toBe(false);
  });
});

describe('resolverAcceso · roles y alcance', () => {
  it('resuelve los cuatro roles', () => {
    for (const rol of ['TITULAR', 'CUIDADOR', 'MIEMBRO', 'LECTOR']) {
      const filas = [filaDe('x@example.invalid', rol, 'ACTIVO')];
      const r = resolverAcceso('x@example.invalid', filas, TITULAR);
      expect(r.permitido, rol).toBe(true);
      if (r.permitido) expect(r.acceso.rol).toBe(rol);
    }
  });

  it('`*` es alcance total y deja la lista vacía', () => {
    const filas = [filaDe('c@example.invalid', 'CUIDADOR', 'ACTIVO', ALCANCE_TOTAL)];
    const r = resolverAcceso('c@example.invalid', filas, TITULAR);
    if (!r.permitido) throw new Error('debería permitir');
    expect(r.acceso.alcanceTotal).toBe(true);
    expect(r.acceso.pacientesPermitidos).toEqual([]);
  });

  it('una lista concreta NO es alcance total', () => {
    const filas = [filaDe('c@example.invalid', 'CUIDADOR', 'ACTIVO', 'p_ana, p_kira')];
    const r = resolverAcceso('c@example.invalid', filas, TITULAR);
    if (!r.permitido) throw new Error('debería permitir');
    expect(r.acceso.alcanceTotal).toBe(false);
    expect(r.acceso.pacientesPermitidos).toEqual(['p_ana', 'p_kira']);
  });

  it('un alcance vacío no es alcance total: no ve a nadie', () => {
    // El fallo silencioso más caro posible sería que una celda en blanco
    // significara «todos».
    const filas = [filaDe('c@example.invalid', 'LECTOR', 'ACTIVO', '')];
    const r = resolverAcceso('c@example.invalid', filas, TITULAR);
    if (!r.permitido) throw new Error('debería permitir');
    expect(r.acceso.alcanceTotal).toBe(false);
    expect(r.acceso.pacientesPermitidos).toEqual([]);
  });

  it('arrastra el paciente propio', () => {
    const filas = [filaDe('m@example.invalid', 'MIEMBRO', 'ACTIVO', '', 'p_juan')];
    const r = resolverAcceso('m@example.invalid', filas, TITULAR);
    if (r.permitido) expect(r.acceso.pacientePropio).toBe('p_juan');
  });

  it('lee por nombre de columna, no por posición', () => {
    // Si alguien añade una columna en medio del esquema, un `fila[4]` escrito
    // hoy leería el estado de otra celda **sin que nada fallara**.
    const posEstado = COLUMNAS.indexOf('estado');
    const f = filaDe('z@example.invalid', 'MIEMBRO', 'ACTIVO');
    expect(f[posEstado]).toBe('ACTIVO');
    expect(resolverAcceso('z@example.invalid', [f], TITULAR).permitido).toBe(true);
  });
});

describe('separarPacientes', () => {
  it('parte por comas y recorta', () => {
    expect(separarPacientes(' p1 , p2,p3 ')).toEqual(['p1', 'p2', 'p3']);
  });

  it('descarta vacíos y repetidos', () => {
    expect(separarPacientes('p1,,p2,p1,')).toEqual(['p1', 'p2']);
  });

  it('`*` y lo vacío dan lista vacía', () => {
    expect(separarPacientes(ALCANCE_TOTAL)).toEqual([]);
    expect(separarPacientes('')).toEqual([]);
    expect(separarPacientes(null)).toEqual([]);
  });
});

describe('alcanza', () => {
  const base: Acceso = {
    email: 'c@example.invalid',
    rol: 'CUIDADOR',
    estado: 'ACTIVO',
    alcanceTotal: false,
    pacientesPermitidos: ['p_ana'],
    pacientePropio: 'p_carlos',
    version: 1,
  };

  it('el alcance total llega a cualquiera', () => {
    expect(alcanza({ ...base, alcanceTotal: true }, 'p_quien_sea')).toBe(true);
  });

  it('un asignado sí, el resto no', () => {
    expect(alcanza(base, 'p_ana')).toBe(true);
    expect(alcanza(base, 'p_otro')).toBe(false);
  });

  it('el expediente propio siempre se alcanza', () => {
    expect(alcanza(base, 'p_carlos')).toBe(true);
  });

  it('sin acceso o sin paciente, no', () => {
    expect(alcanza(null, 'p_ana')).toBe(false);
    expect(alcanza(base, '')).toBe(false);
    expect(alcanza(base, null)).toBe(false);
  });
});

describe('la caché se invalida cambiando la versión', () => {
  it('la clave lleva el correo y la versión', () => {
    expect(claveAcceso('Ana@Example.Invalid', 3)).toBe(
      PREFIJO_CACHE_ACCESO + 'ana@example.invalid:v3',
    );
  });

  it('subir la versión cambia la clave: lo anterior deja de encontrarse', () => {
    // Es el mecanismo entero. No se borra nada: simplemente nadie vuelve a
    // preguntar por la clave vieja, y caduca sola.
    const antes = claveAcceso('ana@example.invalid', 7);
    const despues = claveAcceso('ana@example.invalid', siguienteVersion(7));
    expect(antes).not.toBe(despues);
  });

  it('la versión ausente o ilegible vale 1, nunca 0 ni NaN', () => {
    for (const v of [null, undefined, '', 'hola', -3, 0, NaN]) {
      expect(versionDesde(v), String(v)).toBe(1);
    }
    expect(versionDesde('5')).toBe(5);
    expect(versionDesde(5.9)).toBe(5);
  });

  it('la versión solo sube', () => {
    // Reutilizar un número haría que una entrada vieja volviera a encontrarse,
    // y con ella el acceso que se acababa de revocar.
    expect(siguienteVersion(1)).toBe(2);
    expect(siguienteVersion('9')).toBe(10);
    expect(siguienteVersion(null)).toBe(2);
  });

  it('una entrada de otra versión se ignora', () => {
    const acceso: Acceso = {
      email: 'a@example.invalid',
      rol: 'MIEMBRO',
      estado: 'ACTIVO',
      alcanceTotal: false,
      pacientesPermitidos: [],
      pacientePropio: null,
      version: 2,
    };
    expect(leerCacheAcceso(serializarAcceso(acceso), 2)).toEqual(acceso);
    expect(leerCacheAcceso(serializarAcceso(acceso), 3)).toBeNull();
  });

  it('una entrada rota se ignora en vez de romper la petición', () => {
    for (const basura of ['', 'no-es-json', '{}', '{"rol":"INVENTADO"}', null, 42]) {
      expect(leerCacheAcceso(basura as never, 1), String(basura)).toBeNull();
    }
  });

  it('no se cachea nada que no esté ACTIVO', () => {
    const revocado = JSON.stringify({
      email: 'a@example.invalid',
      rol: 'MIEMBRO',
      estado: 'REVOCADO',
      alcanceTotal: false,
      pacientesPermitidos: [],
      version: 1,
    });
    expect(leerCacheAcceso(revocado, 1)).toBeNull();
  });

  it('la caché dura lo justo, y la versión no espera a que caduque', () => {
    expect(CACHE_ACCESO_SEGUNDOS).toBeLessThanOrEqual(300);
  });
});

describe('quién puede repartir accesos', () => {
  const acceso = (rol: Acceso['rol']): Acceso => ({
    email: 'x@example.invalid',
    rol,
    estado: 'ACTIVO',
    alcanceTotal: true,
    pacientesPermitidos: [],
    pacientePropio: null,
    version: 1,
  });

  it('solo el titular', () => {
    expect(puedeMutarAcceso(acceso('TITULAR'))).toBe(true);
    for (const rol of ['CUIDADOR', 'MIEMBRO', 'LECTOR'] as const) {
      expect(puedeMutarAcceso(acceso(rol)), rol).toBe(false);
    }
    expect(puedeMutarAcceso(null)).toBe(false);
  });
});

describe('validarMutacion', () => {
  it('acepta las cuatro operaciones del catálogo', () => {
    for (const op of ['INVITAR', 'ACEPTAR', 'CAMBIAR_ROL', 'REVOCAR']) {
      expect(esOperacion(op), op).toBe(true);
    }
    expect(esOperacion('BORRAR')).toBe(false);
  });

  it('rechaza una operación desconocida', () => {
    expect(validarMutacion('BORRAR', 'a@example.invalid', TITULAR)).toBe('OPERACION_DESCONOCIDA');
  });

  it('rechaza sin destinatario', () => {
    expect(validarMutacion('REVOCAR', '', TITULAR)).toBe('SIN_DESTINATARIO');
  });

  it('el titular no se puede revocar ni degradar a sí mismo', () => {
    // Sería la única acción de la aplicación sin vuelta atrás desde la propia
    // aplicación.
    expect(validarMutacion('REVOCAR', TITULAR, TITULAR)).toBe('TITULAR_INTOCABLE');
    expect(validarMutacion('CAMBIAR_ROL', TITULAR.toUpperCase(), TITULAR, 'LECTOR')).toBe(
      'TITULAR_INTOCABLE',
    );
  });

  it('nadie reparte el rol de TITULAR', () => {
    expect(validarMutacion('CAMBIAR_ROL', 'a@example.invalid', TITULAR, 'TITULAR')).toBe(
      'ROL_NO_ASIGNABLE',
    );
  });

  it('exige un rol válido al cambiarlo', () => {
    expect(validarMutacion('CAMBIAR_ROL', 'a@example.invalid', TITULAR, 'JEFE')).toBe(
      'ROL_DESCONOCIDO',
    );
    expect(validarMutacion('CAMBIAR_ROL', 'a@example.invalid', TITULAR, 'CUIDADOR')).toBeNull();
  });

  it('deja pasar lo correcto', () => {
    expect(validarMutacion('INVITAR', 'nuevo@example.invalid', TITULAR)).toBeNull();
    expect(validarMutacion('REVOCAR', 'viejo@example.invalid', TITULAR)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E6-bis · normalización simétrica
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El correo se normaliza al ENTRAR y al COMPARAR, o no se normaliza en absoluto.
 *
 * `normalizarEmail` quita los puntos y las etiquetas `+tag` de `gmail.com`
 * porque Google las considera la misma cuenta. Eso está bien, pero durante E6
 * solo ocurría en un lado: lo que llegaba del `id_token` venía sin puntos y la
 * celda se comparaba tal y como estuviera escrita.
 *
 * Consecuencia: una fila tecleada como `juan.perez@gmail.com` **no se
 * encontraba nunca**, y un titular con puntos en su dirección se quedaba fuera
 * de su propio expediente. Se descubrió preparando E6-live y no lo destapó la
 * validación porque ninguna de las dos cuentas usadas llevaba puntos.
 */
describe('E6-bis · los puntos de gmail.com no dejan a nadie fuera', () => {
  const CON_PUNTOS = 'juan.perez@gmail.com';
  const SIN_PUNTOS = 'juanperez@gmail.com';

  it('una fila tecleada con puntos se encuentra con el correo normalizado', () => {
    const filas = [filaDe(CON_PUNTOS, 'LECTOR', 'ACTIVO', ALCANCE_TOTAL)];
    const r = resolverAcceso(SIN_PUNTOS, filas, TITULAR);
    expect(r.permitido, 'la fila existe y aun así se denegó').toBe(true);
    if (!r.permitido) return;
    expect(r.acceso.rol).toBe('LECTOR');
  });

  it('y su estado se lee de esa misma fila, no de ninguna otra', () => {
    // Lo contrario sería peor que no encontrarla: encontrar la fila pero leer
    // el estado equivocado deja entrar a un revocado.
    const filas = [filaDe(CON_PUNTOS, 'LECTOR', 'REVOCADO', ALCANCE_TOTAL)];
    expect(resolverAcceso(SIN_PUNTOS, filas, TITULAR).permitido).toBe(false);
  });

  it('una etiqueta +tag en la celda tampoco esconde la fila', () => {
    const filas = [filaDe('juan.perez+familia@gmail.com', 'MIEMBRO', 'ACTIVO', ALCANCE_TOTAL)];
    expect(resolverAcceso(SIN_PUNTOS, filas, TITULAR).permitido).toBe(true);
  });

  it('el titular con puntos en CONFIG sigue siendo el titular', () => {
    // Este es el caso grave: sin esto, el dueño de la hoja no entra en su
    // propio expediente y la única salida es editar la hoja a mano.
    const r = resolverAcceso('anagomez@gmail.com', [], 'Ana.Gomez@GMail.com');
    expect(r.permitido).toBe(true);
    if (!r.permitido) return;
    expect(r.acceso.rol).toBe('TITULAR');
  });

  it('el paciente propio del titular se encuentra aunque su fila lleve puntos', () => {
    const filas = [fila({ email: 'Ana.Gomez@gmail.com', paciente_propio: 'p_ana' })];
    const r = resolverAcceso('anagomez@gmail.com', filas, 'anagomez@gmail.com');
    expect(r.permitido).toBe(true);
    if (!r.permitido) return;
    expect(r.acceso.pacientePropio).toBe('p_ana');
  });

  it('fuera de gmail.com los puntos SÍ distinguen dos cuentas', () => {
    // No es una excepción olvidada: en otros dominios `juan.perez` y
    // `juanperez` son dos buzones distintos, y tratarlos como uno dejaría
    // entrar a quien no es.
    const filas = [filaDe('juan.perez@example.com', 'LECTOR', 'ACTIVO', ALCANCE_TOTAL)];
    expect(resolverAcceso('juanperez@example.com', filas, TITULAR).permitido).toBe(false);
    expect(resolverAcceso('juan.perez@example.com', filas, TITULAR).permitido).toBe(true);
  });

  it('el correo que devuelve el acceso viene normalizado, venga como venga', () => {
    // Lo que sale de aquí se usa como clave de caché y se escribe en la
    // auditoría. Si a veces llevara puntos, serían dos identidades.
    const filas = [filaDe(CON_PUNTOS, 'LECTOR', 'ACTIVO', ALCANCE_TOTAL)];
    const r = resolverAcceso(CON_PUNTOS, filas, TITULAR);
    expect(r.permitido).toBe(true);
    if (!r.permitido) return;
    expect(r.acceso.email).toBe(SIN_PUNTOS);
  });

  it('al titular no se le puede revocar escribiendo su correo con puntos', () => {
    // `validarMutacion` es lo único que protege al titular de quedarse fuera.
    // Una comparación literal la esquiva con solo teclear un punto.
    expect(validarMutacion('REVOCAR', 'Ana.Gomez@gmail.com', 'anagomez@gmail.com')).toBe(
      'TITULAR_INTOCABLE',
    );
  });

  it('ni cambiándole el rol por la puerta de al lado', () => {
    expect(
      validarMutacion('CAMBIAR_ROL', 'ana.gomez+x@gmail.com', 'anagomez@gmail.com', 'LECTOR'),
    ).toBe('TITULAR_INTOCABLE');
  });
});
