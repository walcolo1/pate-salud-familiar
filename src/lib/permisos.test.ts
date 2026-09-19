import { describe, it, expect } from 'vitest';
import {
  MATRIZ_PERMISOS,
  VERBOS,
  VERBOS_SOLO_TITULAR,
  esVerbo,
  exigePaciente,
  puede,
  verbosDe,
  type Verbo,
} from './permisos';
import { ROLES, type Acceso, type Rol } from './acceso';

/**
 * La matriz de permisos, probada sin hoja ni red.
 *
 * `puede()` es pura: recibe el acceso ya resuelto por E4 y decide. Estas
 * pruebas son lo único que impide que un verbo nuevo se cuele en la fila
 * equivocada, porque nada más lo comprobaría hasta que alguien viera lo que no
 * debía.
 */

/** Un acceso sintético con el rol y el alcance que se le pidan. */
function acceso(rol: Rol, over: Partial<Acceso> = {}): Acceso {
  return {
    email: 'persona-sintetica@example.invalid',
    rol,
    estado: 'ACTIVO',
    alcanceTotal: rol === 'TITULAR',
    pacientesPermitidos: rol === 'TITULAR' ? [] : ['p_ana'],
    pacientePropio: null,
    version: 1,
    ...over,
  };
}

const TODOS_LOS_VERBOS = Object.keys(VERBOS) as Verbo[];
const VERBOS_FAMILIA = TODOS_LOS_VERBOS.filter((v) => VERBOS[v].ambito === 'FAMILIA');
const VERBOS_PACIENTE = TODOS_LOS_VERBOS.filter((v) => VERBOS[v].ambito === 'PACIENTE');
const VERBOS_NEUTROS = VERBOS_PACIENTE.filter((v) => VERBOS[v].especie === 'CUALQUIERA');

describe('el catálogo de verbos', () => {
  it('cada verbo declara ámbito, especie y para qué sirve', () => {
    for (const v of TODOS_LOS_VERBOS) {
      expect(['FAMILIA', 'PACIENTE'], v).toContain(VERBOS[v].ambito);
      expect(['HUMANO', 'MASCOTA', 'CUALQUIERA'], v).toContain(VERBOS[v].especie);
      // Un verbo sin motivo escrito es uno que nadie se atreve a quitar dentro
      // de un año.
      expect(VERBOS[v].descripcion.length, v).toBeGreaterThan(20);
    }
  });

  it('los verbos de familia no distinguen especie', () => {
    for (const v of VERBOS_FAMILIA) {
      expect(VERBOS[v].especie, v).toBe('CUALQUIERA');
    }
  });

  it('`esVerbo` solo reconoce los del catálogo', () => {
    expect(esVerbo('LEER_HISTORIA')).toBe(true);
    for (const falso of ['BORRAR_TODO', 'leer_historia', '', null, 42, 'toString']) {
      expect(esVerbo(falso), String(falso)).toBe(false);
    }
  });

  it('`exigePaciente` distingue los dos ámbitos', () => {
    expect(exigePaciente('LEER_HISTORIA')).toBe(true);
    expect(exigePaciente('VER_CATALOGOS')).toBe(false);
    expect(exigePaciente('INVENTADO')).toBe(false);
  });
});

describe('denegación estricta', () => {
  it('un verbo desconocido se deniega para TODOS, incluido el titular', () => {
    // Es lo que hace que una acción nueva nazca cerrada.
    for (const rol of ROLES) {
      expect(puede(acceso(rol), 'BORRAR_EXPEDIENTE', 'p_ana'), rol).toBe(false);
      expect(puede(acceso(rol), '', 'p_ana'), rol).toBe(false);
      expect(puede(acceso(rol), null, 'p_ana'), rol).toBe(false);
    }
  });

  it('un rol desconocido no puede nada', () => {
    const intruso = acceso('ADMINISTRADOR' as Rol);
    for (const v of TODOS_LOS_VERBOS) {
      expect(puede(intruso, v, 'p_ana'), v).toBe(false);
    }
  });

  it('sin acceso no hay permiso', () => {
    expect(puede(null, 'LEER_HISTORIA', 'p_ana')).toBe(false);
    expect(puede(undefined, 'LEER_HISTORIA', 'p_ana')).toBe(false);
  });

  it('un acceso que no está ACTIVO no puede nada', () => {
    // `resolverAcceso` no devuelve otra cosa, pero esto no depende de que
    // quien llame se acuerde.
    const revocado = acceso('TITULAR', { estado: 'REVOCADO' });
    for (const v of TODOS_LOS_VERBOS) {
      expect(puede(revocado, v, 'p_ana'), v).toBe(false);
    }
  });

  it('no se cuela nada por el prototipo de Object', () => {
    // `VERBOS` es un objeto: sin `hasOwnProperty`, `constructor` o `toString`
    // pasarían por verbos existentes.
    for (const heredado of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(puede(acceso('TITULAR'), heredado, 'p_ana'), heredado).toBe(false);
    }
  });
});

describe('los verbos por paciente exigen paciente', () => {
  it('sin paciente se deniega, incluso al titular', () => {
    for (const v of VERBOS_PACIENTE) {
      expect(puede(acceso('TITULAR'), v), v).toBe(false);
      expect(puede(acceso('TITULAR'), v, ''), v).toBe(false);
      expect(puede(acceso('TITULAR'), v, '   '), v).toBe(false);
      expect(puede(acceso('TITULAR'), v, null), v).toBe(false);
    }
  });

  it('los verbos de familia NO necesitan paciente', () => {
    expect(puede(acceso('TITULAR'), 'VER_AUDITORIA')).toBe(true);
    expect(puede(acceso('LECTOR'), 'VER_CATALOGOS')).toBe(true);
  });

  it('un paciente de más no estorba a un verbo de familia', () => {
    expect(puede(acceso('LECTOR'), 'VER_CATALOGOS', 'p_ana')).toBe(true);
  });
});

describe('el cruce de verbo y alcance', () => {
  it('tener el verbo no basta si el paciente está fuera del alcance', () => {
    // Es la regla que sostiene todo el reparto: un CUIDADOR de `p_ana` no toca
    // el expediente de `p_juan` por muchos verbos que tenga.
    const cuidador = acceso('CUIDADOR', { pacientesPermitidos: ['p_ana'] });
    expect(puede(cuidador, 'ESCRIBIR_CITA', 'p_ana')).toBe(true);
    expect(puede(cuidador, 'ESCRIBIR_CITA', 'p_juan')).toBe(false);
  });

  it('estar en el alcance no basta si falta el verbo', () => {
    const lector = acceso('LECTOR', { pacientesPermitidos: ['p_ana'] });
    expect(puede(lector, 'LEER_HISTORIA', 'p_ana')).toBe(true);
    expect(puede(lector, 'ESCRIBIR_CITA', 'p_ana')).toBe(false);
  });

  it('el alcance total llega a cualquier paciente', () => {
    const cuidador = acceso('CUIDADOR', { alcanceTotal: true, pacientesPermitidos: [] });
    expect(puede(cuidador, 'ESCRIBIR_CITA', 'p_cualquiera')).toBe(true);
  });

  it('el expediente propio se alcanza aunque no esté en la lista', () => {
    const miembro = acceso('MIEMBRO', {
      pacientesPermitidos: [],
      pacientePropio: 'p_juan',
    });
    expect(puede(miembro, 'LEER_HISTORIA', 'p_juan')).toBe(true);
    expect(puede(miembro, 'LEER_HISTORIA', 'p_otro')).toBe(false);
  });

  it('un alcance vacío no alcanza a nadie', () => {
    const miembro = acceso('MIEMBRO', { pacientesPermitidos: [], pacientePropio: null });
    for (const v of VERBOS_NEUTROS) {
      expect(puede(miembro, v, 'p_ana'), v).toBe(false);
    }
  });
});

describe('el aislamiento por especie', () => {
  const titular = () => acceso('TITULAR');

  it('un verbo de mascota exige que el paciente sea una mascota', () => {
    expect(puede(titular(), 'ESCRIBIR_HISTORIAL_VET', 'p_kira', 'MASCOTA')).toBe(true);
    expect(puede(titular(), 'ESCRIBIR_HISTORIAL_VET', 'p_juan', 'HUMANO')).toBe(false);
  });

  it('un verbo humano exige que el paciente sea humano', () => {
    // Una autorización de EPS sobre un perro no significa nada.
    expect(puede(titular(), 'ESCRIBIR_ORDEN', 'p_juan', 'HUMANO')).toBe(true);
    expect(puede(titular(), 'ESCRIBIR_ORDEN', 'p_kira', 'MASCOTA')).toBe(false);
  });

  it('no saber la especie NO es permiso', () => {
    // Un historial veterinario sobre alguien de quien no se sabe si es un
    // animal se queda sin escribir. Denegación estricta también aquí.
    expect(puede(titular(), 'ESCRIBIR_HISTORIAL_VET', 'p_kira')).toBe(false);
    expect(puede(titular(), 'ESCRIBIR_ORDEN', 'p_juan', undefined)).toBe(false);
    expect(puede(titular(), 'ESCRIBIR_ORDEN', 'p_juan', 'CUALQUIERA')).toBe(false);
  });

  it('los verbos neutros no piden especie: una cita es una cita', () => {
    for (const v of VERBOS_NEUTROS) {
      expect(puede(titular(), v, 'p_ana'), v).toBe(true);
    }
  });

  it('tener alcance sobre una mascota NO da permisos sobre un humano', () => {
    // La regla se cumple por el alcance, antes incluso de mirar la especie: el
    // identificador del humano no está en su lista.
    const cuidadorDeMascota = acceso('CUIDADOR', { pacientesPermitidos: ['p_kira'] });
    expect(puede(cuidadorDeMascota, 'LEER_HISTORIA', 'p_kira')).toBe(true);
    expect(puede(cuidadorDeMascota, 'LEER_HISTORIA', 'p_juan')).toBe(false);
    expect(puede(cuidadorDeMascota, 'ESCRIBIR_ORDEN', 'p_juan', 'HUMANO')).toBe(false);
  });
});

describe('el titular', () => {
  it('puede con todos los verbos del catálogo', () => {
    for (const v of TODOS_LOS_VERBOS) {
      const especie = VERBOS[v].especie === 'CUALQUIERA' ? undefined : VERBOS[v].especie;
      const paciente = VERBOS[v].ambito === 'PACIENTE' ? 'p_ana' : undefined;
      expect(puede(acceso('TITULAR'), v, paciente, especie), v).toBe(true);
    }
  });

  it('no tiene fila en la matriz, a propósito', () => {
    // Mantener su lista al día sería una forma de olvidarse de actualizarla.
    expect(Object.keys(MATRIZ_PERMISOS)).not.toContain('TITULAR');
  });
});

describe('los roles que no son titular', () => {
  it('ninguno tiene un verbo administrativo', () => {
    for (const rol of ['CUIDADOR', 'MIEMBRO', 'LECTOR'] as const) {
      for (const v of VERBOS_SOLO_TITULAR) {
        expect(MATRIZ_PERMISOS[rol], `${rol}/${v}`).not.toContain(v);
        expect(puede(acceso(rol, { alcanceTotal: true }), v, 'p_ana'), `${rol}/${v}`).toBe(false);
      }
    }
  });

  it('LECTOR no escribe nada, ni siquiera sobre su propio expediente', () => {
    const lector = acceso('LECTOR', { pacientePropio: 'p_yo', pacientesPermitidos: ['p_yo'] });
    const escrituras = VERBOS_PACIENTE.filter((v) => v.indexOf('LEER') === -1);
    for (const v of escrituras) {
      expect(puede(lector, v, 'p_yo', 'HUMANO'), v).toBe(false);
      expect(puede(lector, v, 'p_yo', 'MASCOTA'), v).toBe(false);
    }
  });

  it('LECTOR sí lee lo que tiene asignado', () => {
    const lector = acceso('LECTOR', { pacientesPermitidos: ['p_ana'] });
    expect(puede(lector, 'LEER_HISTORIA', 'p_ana')).toBe(true);
    expect(puede(lector, 'LEER_DOCUMENTO', 'p_ana')).toBe(true);
  });

  it('MIEMBRO no receta: esa decisión pasa por quien cuida', () => {
    const miembro = acceso('MIEMBRO', { pacientesPermitidos: ['p_ana'] });
    expect(puede(miembro, 'ESCRIBIR_MEDICACION', 'p_ana')).toBe(false);
    expect(puede(miembro, 'MARCAR_DOSIS', 'p_ana')).toBe(true);
  });

  it('CUIDADOR hace lo clínico pero no reparte accesos', () => {
    const cuidador = acceso('CUIDADOR', { pacientesPermitidos: ['p_ana'] });
    expect(puede(cuidador, 'ESCRIBIR_MEDICACION', 'p_ana')).toBe(true);
    expect(puede(cuidador, 'ADMINISTRAR_ACCESOS')).toBe(false);
  });

  it('el alcance de cada rol solo crece hacia arriba', () => {
    // No hay herencia en el código —la matriz se escribe entera— pero el
    // reparto sí tiene que tener sentido: un LECTOR no puede hacer nada que un
    // CUIDADOR no pueda.
    for (const v of MATRIZ_PERMISOS.LECTOR) {
      expect(MATRIZ_PERMISOS.CUIDADOR, v).toContain(v);
    }
    for (const v of MATRIZ_PERMISOS.MIEMBRO) {
      expect(MATRIZ_PERMISOS.CUIDADOR, v).toContain(v);
    }
  });

  it('todos los verbos de la matriz existen en el catálogo', () => {
    // Una errata en un nombre dejaría un permiso que no concede nada y nadie
    // se enteraría hasta que alguien no pudiera hacer su trabajo.
    for (const rol of Object.keys(MATRIZ_PERMISOS) as Array<keyof typeof MATRIZ_PERMISOS>) {
      for (const v of MATRIZ_PERMISOS[rol]) {
        expect(esVerbo(v), `${rol}/${v}`).toBe(true);
      }
    }
  });
});

describe('verbosDe', () => {
  it('el titular los tiene todos', () => {
    expect(verbosDe('TITULAR').sort()).toEqual([...TODOS_LOS_VERBOS].sort());
  });

  it('los demás, los suyos', () => {
    expect(verbosDe('LECTOR').sort()).toEqual([...MATRIZ_PERMISOS.LECTOR].sort());
  });

  it('un rol desconocido no tiene ninguno', () => {
    expect(verbosDe('JEFE')).toEqual([]);
    expect(verbosDe(null)).toEqual([]);
  });
});
