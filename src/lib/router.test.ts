import { describe, it, expect, vi } from 'vitest';
import {
  ACCIONES,
  exigeAcceso,
  exigeToken,
  CLAVE_REVISION,
  TABLAS_PROHIBIDAS,
  VERBO_POR_TABLA,
  codigoDeExcepcion,
  despacharPeticion,
  esAccion,
  leerSolicitud,
  revisionDesde,
  siguienteRevision,
  trazaDeLote,
  validarLote,
  verboDeTabla,
  type Dependencias,
  type Mutacion,
} from './router';
import { VERBOS, puede } from './permisos';
import type { Acceso } from './acceso';
import { NOMBRES_PESTANAS } from './esquemaHoja';

/**
 * La cadena de seguridad entera, probada con dobles.
 *
 * `despacharPeticion` recibe sus dependencias, así que aquí se puede provocar
 * lo que dentro de Apps Script no se puede: un token rechazado, un acceso
 * revocado, un cerrojo ocupado. Son los caminos que más importan y los que
 * nadie ejercita a mano.
 *
 * Ningún correo ni token de aquí corresponde a nada real.
 */

const ACCESO_TITULAR: Acceso = {
  email: 'titular-sintetico@example.invalid',
  rol: 'TITULAR',
  estado: 'ACTIVO',
  alcanceTotal: true,
  pacientesPermitidos: [],
  pacientePropio: null,
  version: 1,
};

const ACCESO_LECTOR: Acceso = {
  ...ACCESO_TITULAR,
  email: 'lector-sintetico@example.invalid',
  rol: 'LECTOR',
  alcanceTotal: false,
  pacientesPermitidos: ['p_ana'],
};

/** Dependencias que dicen que sí a todo, para partir de ahí. */
function deps(over: Partial<Dependencias> = {}): Dependencias {
  return {
    verificarIdentidad: () => ({ email: ACCESO_TITULAR.email, sub: '1' }),
    resolverAcceso: () => ACCESO_TITULAR,
    puede: () => true,
    manejadores: {
      ping: () => ({ vivo: true }),
      obtenerRevision: () => ({ revision: 3 }),
      listarPacientes: () => [],
      verCatalogos: () => [],
      consultar: () => ({ filas: [] }),
      aplicar: () => ({ aplicadas: 1, revision: 4 }),
      invitar: () => ({ creada: true }),
      cambiarRol: () => ({ cambiada: true }),
      revocar: () => ({ revocada: true }),
      aceptarInvitacion: () => ({ aceptada: true }),
      verAuditoria: () => [],
      exportar: () => ({}),
    },
    ...over,
  };
}

const peticion = (accion: string, payload: unknown = {}) => ({
  idToken: 'token.sintetico.firma',
  accion,
  payload,
});

describe('el cuerpo de la petición', () => {
  it('lee un JSON bien formado', () => {
    expect(leerSolicitud('{"accion":"ping"}')).toEqual({ accion: 'ping' });
  });

  it('devuelve null ante cualquier cosa que no sea un objeto JSON', () => {
    for (const basura of ['', 'no-es-json', '[1,2]', '"cadena"', 'null', null, 42, undefined]) {
      expect(leerSolicitud(basura as never), String(basura)).toBeNull();
    }
  });

  it('una solicitud que no es objeto da ERROR_PAYLOAD', () => {
    expect(despacharPeticion(null as never, deps())).toEqual({
      ok: false,
      error: 'ERROR_PAYLOAD',
    });
  });

  it('un payload que no es objeto no rompe: se trata como vacío', () => {
    // Un array o una cadena en `payload` es una llamada mal hecha, no un
    // motivo para devolver una traza.
    for (const raro of ['cadena', 42, [1, 2], null]) {
      const r = despacharPeticion({ ...peticion('ping'), payload: raro }, deps());
      expect(r.ok, String(raro)).toBe(true);
    }
  });
});

describe('el catálogo de acciones', () => {
  it('una acción desconocida se rechaza', () => {
    for (const mala of ['borrarTodo', '', null, 42, 'PING', 'toString', 'constructor']) {
      const r = despacharPeticion({ ...peticion('ping'), accion: mala }, deps());
      expect(r, String(mala)).toEqual({ ok: false, error: 'ACCION_DESCONOCIDA' });
    }
  });

  it('`esAccion` no se deja engañar por el prototipo', () => {
    expect(esAccion('ping')).toBe(true);
    expect(esAccion('hasOwnProperty')).toBe(false);
    expect(esAccion('__proto__')).toBe(false);
  });

  it('una acción sin manejador se rechaza en vez de romper', () => {
    const r = despacharPeticion(peticion('exportar'), deps({ manejadores: {} }));
    expect(r).toEqual({ ok: false, error: 'ACCION_DESCONOCIDA' });
  });

  it('toda acción declara verbo, salvo las que no tienen acceso contra el que comprobarlo', () => {
    for (const nombre of Object.keys(ACCIONES)) {
      const d = ACCIONES[nombre];
      if (!exigeAcceso(d)) expect(d.verbo, nombre).toBeNull();
      else expect(d.verbo, nombre).toBeTruthy();
    }
  });
});

describe('la cadena de seguridad, eslabón por eslabón', () => {
  it('un token rechazado corta en el segundo paso', () => {
    const resolver = vi.fn();
    const r = despacharPeticion(
      peticion('consultar', { pacienteId: 'p_ana' }),
      deps({
        verificarIdentidad: () => {
          throw new Error('TOKEN_INVALIDO');
        },
        resolverAcceso: resolver,
      }),
    );
    expect(r).toEqual({ ok: false, error: 'TOKEN_INVALIDO' });
    // Y no se llega a mirar el acceso: sin identidad no hay rol que resolver.
    expect(resolver).not.toHaveBeenCalled();
  });

  it('un acceso denegado corta en el tercero', () => {
    const permitir = vi.fn();
    const r = despacharPeticion(
      peticion('consultar', { pacienteId: 'p_ana' }),
      deps({
        resolverAcceso: () => {
          throw new Error('ACCESO_DENEGADO');
        },
        puede: permitir,
      }),
    );
    expect(r).toEqual({ ok: false, error: 'ACCESO_DENEGADO' });
    expect(permitir).not.toHaveBeenCalled();
  });

  it('un permiso insuficiente corta en el cuarto', () => {
    const manejador = vi.fn();
    const r = despacharPeticion(
      peticion('consultar', { pacienteId: 'p_ana' }),
      deps({ puede: () => false, manejadores: { consultar: manejador } }),
    );
    expect(r).toEqual({ ok: false, error: 'PERMISO_INSUFICIENTE' });
    // Lo importante: el manejador NO llegó a ejecutarse.
    expect(manejador).not.toHaveBeenCalled();
  });

  it('el orden es token → acceso → permiso, y no otro', () => {
    const orden: string[] = [];
    despacharPeticion(
      peticion('consultar', { pacienteId: 'p_ana' }),
      deps({
        verificarIdentidad: () => {
          orden.push('token');
          return { email: ACCESO_TITULAR.email, sub: '1' };
        },
        resolverAcceso: () => {
          orden.push('acceso');
          return ACCESO_TITULAR;
        },
        puede: () => {
          orden.push('permiso');
          return true;
        },
        manejadores: {
          consultar: () => {
            orden.push('manejador');
            return {};
          },
        },
      }),
    );
    expect(orden).toEqual(['token', 'acceso', 'permiso', 'manejador']);
  });

  it('el paciente del permiso sale del payload, no de ningún otro sitio', () => {
    const espia = vi.fn().mockReturnValue(true);
    despacharPeticion(
      peticion('consultar', { pacienteId: 'p_kira', especie: 'MASCOTA' }),
      deps({ puede: espia }),
    );
    expect(espia).toHaveBeenCalledWith(ACCESO_TITULAR, 'LEER_HISTORIA', 'p_kira', 'MASCOTA');
  });

  it('una petición correcta devuelve los datos del manejador', () => {
    const r = despacharPeticion(peticion('obtenerRevision'), deps());
    expect(r).toEqual({ ok: true, data: { revision: 3 } });
  });
});

describe('`ping` es la única acción anónima, y no cuenta nada', () => {
  it('responde sin token', () => {
    const verificar = vi.fn();
    const r = despacharPeticion({ accion: 'ping' }, deps({ verificarIdentidad: verificar }));
    expect(r.ok).toBe(true);
    expect(verificar).not.toHaveBeenCalled();
  });

  it('es la ÚNICA sin token del catálogo', () => {
    const sinToken = Object.keys(ACCIONES).filter((a) => !exigeToken(ACCIONES[a]));
    expect(sinToken).toEqual(['ping']);
  });

  it('ninguna otra acción pasa sin token', () => {
    // Si una acción con verbo pudiera saltarse la identidad, el muro entero
    // sería decorativo.
    for (const nombre of Object.keys(ACCIONES)) {
      if (!exigeToken(ACCIONES[nombre])) continue;
      const r = despacharPeticion(
        { accion: nombre },
        deps({
          verificarIdentidad: () => {
            throw new Error('TOKEN_INVALIDO');
          },
        }),
      );
      expect(r, nombre).toEqual({ ok: false, error: 'TOKEN_INVALIDO' });
    }
  });
});

describe('los fallos del manejador salen traducidos', () => {
  it('un cerrojo ocupado da ERROR_CERROJO', () => {
    const r = despacharPeticion(
      peticion('aplicar'),
      deps({
        manejadores: {
          aplicar: () => {
            throw new Error('OCUPADO');
          },
        },
      }),
    );
    expect(r).toEqual({ ok: false, error: 'ERROR_CERROJO' });
  });

  it('un fallo cualquiera da ERROR_DESPACHO, nunca la traza', () => {
    const r = despacharPeticion(
      peticion('aplicar'),
      deps({
        manejadores: {
          aplicar: () => {
            throw new Error('TypeError: no se puede leer la fila 7 de la hoja 1AbC');
          },
        },
      }),
    );
    expect(r).toEqual({ ok: false, error: 'ERROR_DESPACHO' });
    expect(JSON.stringify(r)).not.toContain('1AbC');
  });

  it('traduce los códigos conocidos', () => {
    expect(codigoDeExcepcion(new Error('OCUPADO'))).toBe('ERROR_CERROJO');
    expect(codigoDeExcepcion(new Error('ACCESO_DENEGADO'))).toBe('ACCESO_DENEGADO');
    expect(codigoDeExcepcion(new Error('TOKEN_INVALIDO'))).toBe('TOKEN_INVALIDO');
    expect(codigoDeExcepcion(new Error('nada reconocible'))).toBe('ERROR_DESPACHO');
    expect(codigoDeExcepcion(null)).toBe('ERROR_DESPACHO');
  });

  it('despacharPeticion NUNCA lanza', () => {
    // Una excepción que se escapara dejaría que Apps Script respondiera con su
    // propia página de error, que enseña la traza y no sirve al cliente.
    expect(() =>
      despacharPeticion(
        peticion('aplicar'),
        deps({
          manejadores: {
            aplicar: () => {
              throw new Error('lo que sea');
            },
          },
          registrar: () => {
            throw new Error('hasta el registro falla');
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe('validarLote · todo o nada', () => {
  const mut = (tabla: string, pacienteId = 'p_ana', especie?: string): Mutacion => ({
    tabla,
    pacienteId,
    especie,
    fila: {},
  });

  it('un lote entero válido pasa', () => {
    const r = validarLote(ACCESO_TITULAR, [mut('CITAS'), mut('VACUNAS')], puede);
    expect(r.ok).toBe(true);
  });

  it('un lote vacío es una llamada mal hecha', () => {
    expect(validarLote(ACCESO_TITULAR, [], puede).error).toBe('ERROR_PAYLOAD');
  });

  it('se valida ANTES de escribir, y se señala cuál falló', () => {
    // Escribir tres mutaciones y descubrir en la cuarta que falta permiso deja
    // el expediente a medias, y nadie sabría qué entró y qué no.
    const lote = [mut('CITAS'), mut('CITAS'), mut('ORDENES', 'p_juan', 'HUMANO')];
    const r = validarLote(ACCESO_LECTOR, lote, puede);
    expect(r.ok).toBe(false);
    expect(r.indice).toBe(0);
    expect(r.error).toBe('PERMISO_INSUFICIENTE');
  });

  it('una tabla desconocida se rechaza', () => {
    const r = validarLote(ACCESO_TITULAR, [mut('TABLA_INVENTADA')], puede);
    expect(r).toEqual({ ok: false, indice: 0, error: 'ERROR_PAYLOAD' });
  });

  it('ACCESO, AUDITORIA y CONFIG no se tocan por `aplicar`', () => {
    // ACCESO se muta solo por `mutarAcceso`, que lleva cerrojo y sube la
    // versión. Dejar que el cliente escribiera ahí sería regalar la llave.
    for (const tabla of TABLAS_PROHIBIDAS) {
      expect(verboDeTabla(tabla), tabla).toBeNull();
      const r = validarLote(ACCESO_TITULAR, [mut(tabla)], puede);
      expect(r.error, tabla).toBe('ERROR_PAYLOAD');
    }
  });

  it('cada tabla escribible del esquema tiene su verbo', () => {
    // Una pestaña sin verbo es una pestaña que nadie puede escribir, y el
    // síntoma sería «no me deja guardar» sin más explicación.
    const sinVerbo = NOMBRES_PESTANAS.filter(
      (t) =>
        TABLAS_PROHIBIDAS.indexOf(t) === -1 &&
        ['CATALOGO_VACUNAS', 'DOMINIOS_AUTORIZADOS', 'SEGUIMIENTOS'].indexOf(t) === -1 &&
        !Object.prototype.hasOwnProperty.call(VERBO_POR_TABLA, t),
    );
    expect(sinVerbo, sinVerbo.join(', ')).toEqual([]);
  });

  it('el verbo de cada tabla existe en el catálogo de E5', () => {
    // La especie se toma de lo que cada verbo declara: `ORDENES` exige HUMANO
    // y `HISTORIAL` exige MASCOTA, así que pasarles la misma a todos sería
    // probar otra cosa.
    for (const tabla of Object.keys(VERBO_POR_TABLA)) {
      const verbo = VERBO_POR_TABLA[tabla];
      const especie = VERBOS[verbo].especie === 'CUALQUIERA' ? undefined : VERBOS[verbo].especie;
      expect(puede(ACCESO_TITULAR, verbo, 'p_ana', especie), tabla).toBe(true);
    }
  });

  it('el alcance se respeta dentro del lote', () => {
    const lote = [mut('CITAS', 'p_ana'), mut('CITAS', 'p_juan')];
    const cuidador: Acceso = { ...ACCESO_LECTOR, rol: 'CUIDADOR' };
    const r = validarLote(cuidador, lote, puede);
    expect(r.ok).toBe(false);
    expect(r.indice).toBe(1);
  });
});

describe('la revisión del documento', () => {
  it('ausente o ilegible vale 0', () => {
    for (const v of [null, undefined, '', 'hola', -5, NaN]) {
      expect(revisionDesde(v), String(v)).toBe(0);
    }
    expect(revisionDesde('12')).toBe(12);
  });

  it('sube de uno en uno', () => {
    expect(siguienteRevision(0)).toBe(1);
    expect(siguienteRevision('41')).toBe(42);
    expect(siguienteRevision(null)).toBe(1);
  });

  it('la clave es la que el router espera', () => {
    expect(CLAVE_REVISION).toBe('REVISION_DOCUMENTO');
  });
});

describe('la traza de auditoría', () => {
  it('cuenta por tabla, en orden estable', () => {
    const traza = trazaDeLote([
      { tabla: 'CITAS' },
      { tabla: 'VACUNAS' },
      { tabla: 'CITAS' },
    ]);
    expect(traza).toBe('CITAS:2 VACUNAS:1');
  });

  it('NO lleva el contenido de las filas', () => {
    // Una auditoría que copia los datos que audita duplica el problema que
    // intenta vigilar.
    const traza = trazaDeLote([
      { tabla: 'CITAS', pacienteId: 'p_ana', fila: { diagnostico: 'SECRETO-CLINICO' } },
    ]);
    expect(traza).not.toContain('SECRETO-CLINICO');
    expect(traza).not.toContain('p_ana');
    expect(traza).toBe('CITAS:1');
  });

  it('con un lote vacío no se rompe', () => {
    expect(trazaDeLote([])).toBe('');
    expect(trazaDeLote(undefined as never)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E7 · la segunda excepción a la cadena
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `aceptarInvitacion` es el único sitio donde alguien con identidad verificada
 * y **sin acceso** llega a un manejador. Es un agujero nuevo en el muro que E6
 * validó, así que se cierra por los cuatro lados.
 */
describe('E7 · aceptarInvitacion: identidad sí, acceso no', () => {
  it('llega al manejador aunque resolverAcceso deniegue', () => {
    const resolver = vi.fn(() => {
      throw new Error('ACCESO_DENEGADO');
    });
    const r = despacharPeticion(peticion('aceptarInvitacion', { t: 'x' }), deps({ resolverAcceso: resolver }));
    expect(r).toEqual({ ok: true, data: { aceptada: true } });
    expect(resolver, 'ni siquiera se pregunta por el acceso').not.toHaveBeenCalled();
  });

  it('pero SIGUE exigiendo token', () => {
    // Lo que se salta es el acceso, no la identidad. Sin `id_token` no hay
    // correo verificado contra el que comparar la invitación, y sin eso el
    // reenvío funcionaría.
    const r = despacharPeticion(
      { accion: 'aceptarInvitacion', payload: {} },
      deps({
        verificarIdentidad: () => {
          throw new Error('TOKEN_INVALIDO');
        },
      }),
    );
    expect(r).toEqual({ ok: false, error: 'TOKEN_INVALIDO' });
  });

  it('el manejador recibe la identidad, porque no tiene acceso del que sacarla', () => {
    let visto: unknown = 'no llamado';
    despacharPeticion(
      peticion('aceptarInvitacion'),
      deps({
        verificarIdentidad: () => ({ email: 'invitada@example.invalid', sub: '9' }),
        manejadores: {
          aceptarInvitacion: (_p, _a, identidad) => {
            visto = identidad;
            return {};
          },
        },
      }),
    );
    expect(visto).toEqual({ email: 'invitada@example.invalid', sub: '9' });
  });

  it('y recibe el acceso en null, no un objeto a medias', () => {
    let visto: unknown = 'no llamado';
    despacharPeticion(
      peticion('aceptarInvitacion'),
      deps({
        resolverAcceso: () => {
          throw new Error('ACCESO_DENEGADO');
        },
        manejadores: {
          aceptarInvitacion: (_p, acceso) => {
            visto = acceso;
            return {};
          },
        },
      }),
    );
    expect(visto).toBeNull();
  });

  it('es la ÚNICA que se salta el acceso teniendo token', () => {
    const sinAcceso = Object.keys(ACCIONES).filter(
      (a) => exigeToken(ACCIONES[a]) && !exigeAcceso(ACCIONES[a]),
    );
    expect(sinAcceso).toEqual(['aceptarInvitacion']);
  });

  it('nadie puede saltarse el acceso y tener verbo a la vez', () => {
    // Un verbo se comprueba contra un rol, y el rol sale del acceso. Una acción
    // con las dos cosas pasaría `puede()` sobre un objeto que no existe.
    for (const nombre of Object.keys(ACCIONES)) {
      if (exigeAcceso(ACCIONES[nombre])) continue;
      expect(ACCIONES[nombre].verbo, nombre).toBeNull();
    }
  });

  it('nadie puede saltarse el token sin saltarse también el acceso', () => {
    for (const nombre of Object.keys(ACCIONES)) {
      if (exigeToken(ACCIONES[nombre])) continue;
      expect(exigeAcceso(ACCIONES[nombre]), nombre).toBe(false);
    }
  });

  it('todas las demás siguen pasando por resolverAcceso', () => {
    for (const nombre of Object.keys(ACCIONES)) {
      if (!exigeAcceso(ACCIONES[nombre])) continue;
      const r = despacharPeticion(
        peticion(nombre),
        deps({
          resolverAcceso: () => {
            throw new Error('ACCESO_DENEGADO');
          },
        }),
      );
      expect(r, nombre).toEqual({ ok: false, error: 'ACCESO_DENEGADO' });
    }
  });

  it('los códigos de invitación salen tal cual, sin confundirse con los otros', () => {
    // `INVITACION_DESTINATARIO_INVALIDO` lleva «INVALIDO» dentro y no puede
    // acabar traducido a TOKEN_INVALIDO por una comparación de subcadenas.
    for (const codigo of [
      'INVITACION_DESCONOCIDA',
      'INVITACION_EXPIRADA',
      'INVITACION_YA_USADA',
      'INVITACION_REVOCADA',
      'INVITACION_DESTINATARIO_INVALIDO',
    ]) {
      expect(codigoDeExcepcion(new Error(codigo)), codigo).toBe(codigo);
      const r = despacharPeticion(
        peticion('aceptarInvitacion'),
        deps({
          manejadores: {
            aceptarInvitacion: () => {
              throw new Error(codigo);
            },
          },
        }),
      );
      expect(r, codigo).toEqual({ ok: false, error: codigo });
    }
  });

  it('un fallo cualquiera del manejador sigue siendo ERROR_DESPACHO', () => {
    const r = despacharPeticion(
      peticion('aceptarInvitacion'),
      deps({
        manejadores: {
          aceptarInvitacion: () => {
            throw new Error('se cayó la hoja');
          },
        },
      }),
    );
    expect(r).toEqual({ ok: false, error: 'ERROR_DESPACHO' });
  });
});
