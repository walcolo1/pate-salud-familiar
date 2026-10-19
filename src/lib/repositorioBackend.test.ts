import { describe, it, expect, vi } from 'vitest';
import {
  estadoDeVacuna,
  invitacionesDesdeAccesos,
  fechaLocalHoy,
  NO_HAY_DONDE,
  RepositorioBackend,
  SIN_BACKEND,
  SIN_IDENTIDAD,
  SIN_PACIENTE,
  rolDeContrato,
  type SesionBackend,
} from './repositorioBackend';
import { METODOS_ESCRITURA } from './contratoRepositorio';
import type { RepositoryContext } from './dataRepository';
import { encabezadosDe } from './planInstalacion';

/**
 * G0 · el repositorio de verdad, probado sin red y sin despliegue.
 *
 * Lo que se comprueba aquí es lo que G1 no puede ver. G1 mira el **código** y
 * dice si un método podría no hacer nada; esto mira el **comportamiento** y
 * dice si de verdad sale una mutación, con qué tabla, con qué paciente y con
 * qué fila.
 *
 * Un método puede llamar a algo y aun así perder el dato —mandar la fila a la
 * pestaña equivocada, olvidarse del paciente, colar un lote vacío— y ninguna de
 * esas tres cosas las atrapa una comprobación estructural.
 */

const URL_BUENA = 'https://script.google.com/macros/s/AKfycbFALSO0123456789abcdefgh/exec';

const CTX: RepositoryContext = { uid: 'u1', email: 'a@b.com', familyId: null };

function banco(respuestas: unknown[] = []) {
  const cola = [...respuestas];
  const espia = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => (cola.length > 0 ? cola.shift() : { ok: true, data: { aplicadas: 1, revision: 1 } }),
  })) as unknown as typeof globalThis.fetch;

  const sesion: SesionBackend = {
    url: () => URL_BUENA,
    idToken: async () => 'id.token.firma',
    fetch: espia,
  };

  return { repo: new RepositorioBackend(sesion), espia: espia as unknown as ReturnType<typeof vi.fn> };
}

/** Lo que se mandó en la llamada número `n`. */
function envio(espia: ReturnType<typeof vi.fn>, n = 0) {
  const [, opciones] = espia.mock.calls[n] as [string, RequestInit];
  return JSON.parse(String(opciones.body)) as {
    accion: string;
    payload?: { mutaciones?: { tabla: string; fila: Record<string, unknown>; pacienteId?: string }[] };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escribir
// ─────────────────────────────────────────────────────────────────────────────

describe('guardar un paciente', () => {
  it('manda las dos mitades de la fila en un solo lote', async () => {
    // `PACIENTES` y `PERFIL_HUMANO` son dos pestañas y un solo paciente. En
    // dos peticiones, la segunda podría fallar y dejar media alta escrita.
    const { repo, espia } = banco();
    await repo.saveMember(CTX, {
      id: 'p1',
      familyGroupId: 'f',
      fullName: 'Ana',
      birthDate: '1990-01-01',
      relationship: 'PARENT',
    } as Parameters<RepositorioBackend['saveMember']>[1]);

    expect(espia).toHaveBeenCalledTimes(1);
    const { accion, payload } = envio(espia);
    expect(accion).toBe('aplicar');
    expect(payload?.mutaciones?.map((m) => m.tabla)).toEqual(['PACIENTES', 'PERFIL_HUMANO']);
  });

  it('la fila lleva la especie, que no es un campo del modelo', async () => {
    const { repo, espia } = banco();
    await repo.saveMember(CTX, { id: 'p1', fullName: 'Ana' } as Parameters<
      RepositorioBackend['saveMember']
    >[1]);
    expect(envio(espia).payload?.mutaciones?.[0].fila.tipo).toBe('HUMANO');
  });

  it('cada mutación dice de quién es, o el router la rechaza entera', async () => {
    // `puede()` deniega una mutación sin paciente **incluso al titular**, y lo
    // hace antes de mirar el rol. Olvidarlo aquí tumbaría el lote completo.
    const { repo, espia } = banco();
    await repo.saveVaccine(CTX, { id: 'v1', memberId: 'p9', vaccineName: 'Tétanos' } as Parameters<
      RepositorioBackend['saveVaccine']
    >[1]);

    const m = envio(espia).payload?.mutaciones?.[0];
    expect(m?.tabla).toBe('VACUNAS');
    expect(m?.pacienteId).toBe('p9');
  });

  it('una mitad sin nada que decir no gasta una fila', async () => {
    // Un familiar sin fecha de nacimiento ni documento no necesita una fila en
    // `PERFIL_HUMANO`: la hoja solo anexa, y una fila vacía por guardado es
    // una pestaña que crece sin contener nada.
    const { repo, espia } = banco();
    await repo.saveMember(CTX, { id: 'p1', fullName: 'Ana' } as Parameters<
      RepositorioBackend['saveMember']
    >[1]);
    expect(envio(espia).payload?.mutaciones?.map((m) => m.tabla)).toEqual(['PACIENTES']);
  });

  it('un guardado sin absolutamente nada falla en voz alta', async () => {
    // Es el fallo que este bloque entero viene a hacer imposible: un lote
    // vacío no sale a la red y la promesa se resolvería como si hubiera ido
    // bien.
    const { repo, espia } = banco();
    await expect(repo.saveVaccine(CTX, {} as Parameters<RepositorioBackend['saveVaccine']>[1]))
      .rejects.toThrow();
    expect(espia).not.toHaveBeenCalled();
  });
});

describe('borrar es dar de baja', () => {
  it('escribe la fecha y no borra nada', async () => {
    const { repo, espia } = banco();
    await repo.darDeBajaMember(CTX, 'p1');

    const m = envio(espia).payload?.mutaciones?.[0];
    expect(m?.tabla).toBe('PACIENTES');
    expect(m?.fila.id).toBe('p1');
    expect(String(m?.fila.borrado_en)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m?.pacienteId).toBe('p1');
  });

  it('la baja de algo que cuelga de un paciente también dice de quién es', async () => {
    // Sin paciente el router la rechaza; y como `deleteX` solo recibe un
    // identificador, el paciente tiene que salir de él.
    const { repo, espia } = banco();
    await repo.darDeBajaAppointment(CTX, 'c1');
    const m = envio(espia).payload?.mutaciones?.[0];
    expect(m?.tabla).toBe('CITAS');
    expect(m?.fila.id).toBe('c1');
  });
});

describe('lo que no tiene dónde escribirse, lo dice', () => {
  it('las tres colecciones sin pestaña lanzan, y no gastan una petición', async () => {
    // Eran cuatro: las tareas tienen pestaña desde el esquema v5 (Bloque J).
    const { repo, espia } = banco();

    await expect(
      repo.saveGmailSource(CTX, { id: 'g1' } as Parameters<RepositorioBackend['saveGmailSource']>[1]),
    ).rejects.toMatchObject({ codigo: NO_HAY_DONDE });
    await expect(repo.darDeBajaGmailSource(CTX, 'g1')).rejects.toMatchObject({ codigo: NO_HAY_DONDE });
    await expect(
      repo.saveAppointmentCandidate(CTX, { id: 'c1' } as Parameters<
        RepositorioBackend['saveAppointmentCandidate']
      >[1]),
    ).rejects.toMatchObject({ codigo: NO_HAY_DONDE });
    await expect(repo.saveSettings(CTX, { gmailScanRangeDays: 30 })).rejects.toMatchObject({
      codigo: NO_HAY_DONDE,
    });

    expect(espia).not.toHaveBeenCalled();
  });

  it('el motivo va en el mensaje, no solo el código', async () => {
    // Quien se encuentre esto dentro de un año tiene que saber por qué sin
    // abrir `descriptores.ts`.
    const { repo } = banco();
    await expect(
      repo.saveGmailSource(CTX, { id: 'g1' } as Parameters<RepositorioBackend['saveGmailSource']>[1]),
    ).rejects.toThrow(/Gmail/);
  });

  it('crear una familia no existe: la familia es la hoja', async () => {
    const { repo, espia } = banco();
    await expect(repo.createFamily(CTX, 'Los Colorado')).rejects.toThrow();
    expect(espia).not.toHaveBeenCalled();
  });

  it('los resultados de examen no se pueden escribir sin saber de quién son', async () => {
    // `puede()` deniega toda mutación sin paciente, también al titular. Se
    // dice, no se calla.
    const { repo } = banco();
    await expect(
      repo.saveExamResults(CTX, 'e1', [
        { id: 'r1', examId: 'e1', parameterName: 'Hb', value: '13', isAbnormal: false, recordedAt: '' },
      ]),
    ).rejects.toMatchObject({ codigo: SIN_PACIENTE });
  });

  it('y con el paciente delante, sí', async () => {
    const { repo, espia } = banco();
    await repo.saveExamResults(
      CTX,
      'e1',
      [{ id: 'r1', examId: 'e1', parameterName: 'Hb', value: '13', isAbnormal: false, recordedAt: '' }],
      'p1',
    );
    const m = envio(espia).payload?.mutaciones?.[0];
    expect(m?.tabla).toBe('EXAMENES_RESULTADOS');
    expect(m?.pacienteId).toBe('p1');
    expect(m?.fila.examen_id).toBe('e1');
    // v4 · Y va también EN la fila: es lo que permite volver a encontrarla.
    expect(m?.fila.paciente_id).toBe('p1');
  });

  it('Bloque N · la bandeja escribe su confianza y su verificación, y vuelven al leer', async () => {
    const resultado = {
      id: 'r1', examId: 'e1', parameterName: 'HDL COLESTEROL', value: '48', unit: 'mg/dL',
      referenceRange: '55 - 85', isAbnormal: true, recordedAt: '',
      extractionConfidence: 'ALTA', verifiedBy: 'REVISION_HUMANA:2026-10-18',
    };
    const { repo, espia } = banco();
    await repo.saveExamResults(CTX, 'e1', [resultado], 'p1');
    const fila = envio(espia).payload!.mutaciones![0].fila;
    expect(fila).toMatchObject({
      parametro: 'HDL COLESTEROL', valor: '48', unidad: 'mg/dL', rango_referencia: '55 - 85',
      fuera_de_rango: 'SI', confianza_extraccion: 'ALTA', verificado_por: 'REVISION_HUMANA:2026-10-18',
    });

    // Ida y vuelta: la misma fila, releída de la hoja, da el mismo resultado.
    const enc = encabezadosDe('EXAMENES_RESULTADOS') ?? [];
    const { repo: lector } = banco([
      { ok: true, data: { esquema: 6, revision: 1, tablas: {
        PACIENTES: [['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', '']],
        EXAMENES_RESULTADOS: [enc.map((c) => String(fila[c] ?? ''))],
      } } },
    ]);
    const [leido] = (await lector.loadAll(CTX)).examResults.e1;
    expect(leido).toMatchObject({
      parameterName: 'HDL COLESTEROL', value: '48', unit: 'mg/dL', referenceRange: '55 - 85',
      isAbnormal: true, extractionConfidence: 'ALTA', verifiedBy: 'REVISION_HUMANA:2026-10-18',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accesos
// ─────────────────────────────────────────────────────────────────────────────

describe('invitar y revocar pasan por el router, no por la hoja', () => {
  it('invitar traduce el rol del contrato al del router', async () => {
    const { repo, espia } = banco([{ ok: true, data: { invitada: true, expiraEn: 7 } }]);
    const id = await repo.createInvitation(CTX, 'Tia@Example.com ', 'p1', 'CAREGIVER');

    const { accion, payload } = envio(espia) as unknown as {
      accion: string;
      payload: Record<string, unknown>;
    };
    expect(accion).toBe('invitar');
    expect(payload.rol).toBe('CUIDADOR');
    expect(payload.email).toBe('tia@example.com');
    // Un cuidador ve a toda la familia, como promete la etiqueta del
    // formulario (Bloque L); solo un miembro queda limitado a su ficha.
    expect(payload.pacientes).toBe('*');
    // No hay identificador de invitación: `ACCESO` se lleva por correo.
    expect(id).toBe('tia@example.com');
  });

  it('un miembro queda limitado a su ficha', async () => {
    const { repo, espia } = banco([{ ok: true, data: { invitada: true, expiraEn: 7 } }]);
    await repo.createInvitation(CTX, 'ana@example.com', 'p1', 'MEMBER');
    const { payload } = envio(espia) as unknown as { payload: Record<string, unknown> };
    expect(payload.rol).toBe('MIEMBRO');
    expect(payload.pacientes).toBe('p1');
  });

  it('el rol de titular no se reparte', async () => {
    const { repo, espia } = banco();
    await expect(repo.createInvitation(CTX, 'x@y.com', 'p1', 'OWNER')).rejects.toThrow();
    expect(espia).not.toHaveBeenCalled();
  });

  it('la traducción de roles está completa', () => {
    expect(rolDeContrato('MEMBER')).toBe('MIEMBRO');
    expect(rolDeContrato('CAREGIVER')).toBe('CUIDADOR');
    expect(rolDeContrato('VIEWER')).toBe('LECTOR');
    expect(rolDeContrato('OWNER')).toBe(null);
  });

  it('revocar va por correo, y un identificador que no lo es se rechaza', async () => {
    const { repo, espia } = banco([{ ok: true, data: { revocada: true } }]);
    await repo.revokeInvitation(CTX, 'tia@example.com');
    expect(envio(espia).accion).toBe('revocar');

    await expect(repo.revokeInvitation(CTX, 'abc123')).rejects.toThrow();
  });

  it('aceptar una invitación no pasa por aquí, y se explica', async () => {
    // El canje necesita el token del correo, que esta ruta no tiene. Va por
    // `/invitacion`, y devolver un `void` silencioso aquí haría creer que
    // alguien entró.
    const { repo, espia } = banco();
    await expect(repo.acceptInvitation(CTX, 'f1', 'i1')).rejects.toThrow(/invitacion/i);
    expect(espia).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Leer
// ─────────────────────────────────────────────────────────────────────────────

describe('loadAll', () => {
  const exportar = (tablas: Record<string, unknown[][]>) => ({
    ok: true,
    data: { esquema: 3, revision: 4, tablas },
  });

  it('con una sola petición cuando el rol lo permite', async () => {
    // `exportar` trae el expediente entero. La alternativa —`consultar` por
    // paciente y por pestaña— son once peticiones por persona.
    const { repo, espia } = banco([
      exportar({ PACIENTES: [['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', '']] }),
    ]);

    const datos = await repo.loadAll(CTX);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(envio(espia).accion).toBe('exportar');
    expect(datos.members.map((m) => m.fullName)).toEqual(['Ana']);
  });

  it('colapsa las filas repetidas: la última manda', async () => {
    const { repo } = banco([
      exportar({
        PACIENTES: [
          ['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', ''],
          ['p1', 'HUMANO', 'Ana María', '', 'ACTIVE', '', '', '', ''],
        ],
      }),
    ]);
    const datos = await repo.loadAll(CTX);
    expect(datos.members).toHaveLength(1);
    expect(datos.members[0].fullName).toBe('Ana María');
  });

  it('lo dado de baja no vuelve', async () => {
    const { repo } = banco([
      exportar({
        PACIENTES: [
          ['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', ''],
          ['p1', '', '', '', '', '', '', '', '2026-09-21T10:00:00.000Z'],
        ],
      }),
    ]);
    expect((await repo.loadAll(CTX)).members).toEqual([]);
  });

  it('una vacuna releída de la hoja sale aplicada si su fecha ya pasó, y programada si es futura', async () => {
    // `VACUNAS` no guarda el estado: se calcula. Antes se leía `undefined` y
    // la cartilla pintaba «Pendiente» en una dosis puesta hace meses.
    const enc = encabezadosDe('VACUNAS') ?? [];
    const fila = (id: string, fecha: string) =>
      enc.map((c) => ({ id, paciente_id: 'p1', vacuna: 'Influenza', fecha } as Record<string, string>)[c] ?? '');
    const { repo } = banco([
      exportar({
        PACIENTES: [['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', '']],
        VACUNAS: [fila('v1', '2020-05-29'), fila('v2', '2999-01-01'), fila('v3', '')],
      }),
    ]);
    const datos = await repo.loadAll(CTX);
    const estados = Object.fromEntries(datos.vaccines.map((v) => [v.id, v.status]));
    expect(estados).toEqual({ v1: 'COMPLETED', v2: 'SCHEDULED', v3: 'SCHEDULED' });
  });

  it('si el rol no llega a exportar, se pregunta paciente a paciente', async () => {
    const { repo, espia } = banco([
      { ok: false, error: 'PERMISO_INSUFICIENTE' },
      { ok: true, data: { filas: [['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', '']], revision: 4 } },
    ]);

    const datos = await repo.loadAll(CTX);
    expect(envio(espia, 0).accion).toBe('exportar');
    expect(envio(espia, 1).accion).toBe('listarPacientes');
    expect(datos.members.map((m) => m.id)).toEqual(['p1']);
    // Y a partir de ahí, una consulta por pestaña y paciente.
    expect(envio(espia, 2).accion).toBe('consultar');
  });

  it('los valores de examen vuelven agrupados por examen', async () => {
    // Antes de la columna `paciente_id` del esquema v4 esto era imposible:
    // `consultar` filtra por ahí, y sin ella los valores se escribían y no
    // había forma de volver a leerlos.
    const encabezados = encabezadosDe('EXAMENES_RESULTADOS') ?? [];
    const fila = (id: string, examen: string, parametro: string) =>
      encabezados.map((columna) => {
        if (columna === 'id') return id;
        if (columna === 'examen_id') return examen;
        if (columna === 'parametro') return parametro;
        if (columna === 'paciente_id') return 'p1';
        return '';
      });

    const { repo } = banco([
      exportar({
        EXAMENES_RESULTADOS: [
          fila('r1', 'e1', 'Hb'),
          fila('r2', 'e1', 'Hto'),
          fila('r3', 'e2', 'Glu'),
        ],
      }),
    ]);

    const datos = await repo.loadAll(CTX);
    expect(Object.keys(datos.examResults).sort()).toEqual(['e1', 'e2']);
    expect(datos.examResults.e1.map((r) => r.parameterName)).toEqual(['Hb', 'Hto']);
  });

  it('un fallo que no es de permiso NO se disfraza de expediente vacío', async () => {
    // Devolver `EMPTY_FAMILY_DATA` cuando la red falla es enseñarle a alguien
    // un expediente en blanco y dejar que saque conclusiones.
    const { repo } = banco([{ ok: false, error: 'ERROR_INTERNO' }]);
    await expect(repo.loadAll(CTX)).rejects.toThrow();
  });
});

describe('lo que solo observa puede no observar nada', () => {
  it('watchAll devuelve un desuscriptor y no llama a nadie', async () => {
    const { repo, espia } = banco();
    const parar = repo.watchAll(CTX, () => {});
    expect(typeof parar).toBe('function');
    parar();
    expect(espia).not.toHaveBeenCalled();
  });

  it('initFamily no inventa una familia: la familia es la hoja', async () => {
    const { repo } = banco();
    await expect(repo.initFamily({ uid: 'u1', email: 'a@b.com' })).resolves.toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sin sesión
// ─────────────────────────────────────────────────────────────────────────────

describe('sin backend o sin identidad, se corta antes de la red', () => {
  it('sin URL de familia', async () => {
    const espia = vi.fn();
    const repo = new RepositorioBackend({
      url: () => null,
      idToken: async () => 'x',
      fetch: espia as unknown as typeof globalThis.fetch,
    });
    await expect(repo.darDeBajaMember(CTX, 'p1')).rejects.toMatchObject({ codigo: SIN_BACKEND });
    expect(espia).not.toHaveBeenCalled();
  });

  it('sin id_token', async () => {
    const espia = vi.fn();
    const repo = new RepositorioBackend({
      url: () => URL_BUENA,
      idToken: async () => null,
      fetch: espia as unknown as typeof globalThis.fetch,
    });
    await expect(repo.darDeBajaMember(CTX, 'p1')).rejects.toMatchObject({ codigo: SIN_IDENTIDAD });
    expect(espia).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G3 · la identidad que caduca
// ─────────────────────────────────────────────────────────────────────────────

describe('cuando el router dice que el token ya no vale', () => {
  /** Un banco con renovación, para el reintento de G3. */
  function bancoConRenovacion(respuestas: unknown[], renovaciones: (string | null)[]) {
    const cola = [...respuestas];
    const espia = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => (cola.length > 0 ? cola.shift() : { ok: true, data: {} }),
    })) as unknown as typeof globalThis.fetch;

    const pendientes = [...renovaciones];
    const renovar = vi.fn(async () => (pendientes.length > 0 ? pendientes.shift()! : null));

    const repo = new RepositorioBackend({
      url: () => URL_BUENA,
      idToken: async () => 'viejo.id.token',
      renovar,
      fetch: espia,
    });

    return { repo, renovar, espia: espia as unknown as ReturnType<typeof vi.fn> };
  }

  const RECHAZO = { ok: false, error: 'TOKEN_INVALIDO' };
  const BIEN = { ok: true, data: { aplicadas: 1, revision: 2 } };

  it('renueva y reintenta una vez, con el token nuevo', async () => {
    // Un token puede dejar de valer ANTES de su `exp` —acceso revocado, reloj
    // del dispositivo adelantado— y el `exp` no se entera. Sin este reintento,
    // el usuario vería un error en mitad de un guardado que sí podía hacerse.
    const { repo, renovar, espia } = bancoConRenovacion([RECHAZO, BIEN], ['nuevo.id.token']);
    await repo.darDeBajaMember(CTX, 'p1');

    expect(renovar).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledTimes(2);

    const primera = JSON.parse(String((espia.mock.calls[0] as [string, RequestInit])[1].body));
    const segunda = JSON.parse(String((espia.mock.calls[1] as [string, RequestInit])[1].body));
    expect(primera.idToken).toBe('viejo.id.token');
    expect(segunda.idToken).toBe('nuevo.id.token');
    // Y el reintento manda lo mismo: no se pierde la mutación por el camino.
    expect(segunda.payload).toEqual(primera.payload);
  });

  it('el 401 no existe: lo que llega es un 200 con el fallo dentro', async () => {
    // El router contesta siempre HTTP 200. Un reintento que esperase un código
    // de estado no se dispararía nunca, y esta prueba es lo que lo fija.
    const { repo, renovar } = bancoConRenovacion([RECHAZO, BIEN], ['nuevo.id.token']);
    await repo.darDeBajaMember(CTX, 'p1');
    expect(renovar).toHaveBeenCalled();
  });

  it('si no se pudo renovar, sube el error ORIGINAL', async () => {
    // Decir «falló la renovación» taparía lo que de verdad contestó el router.
    const { repo, espia } = bancoConRenovacion([RECHAZO], [null]);
    await expect(repo.darDeBajaMember(CTX, 'p1')).rejects.toMatchObject({
      codigo: 'TOKEN_INVALIDO',
    });
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('un reintento y no más', async () => {
    // Si la credencial recién renovada tampoco vale, el problema no es la
    // caducidad y repetir solo gasta cuota.
    const { repo, espia } = bancoConRenovacion([RECHAZO, RECHAZO], ['a', 'b']);
    await expect(repo.darDeBajaMember(CTX, 'p1')).rejects.toThrow();
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it('un error que no es de identidad no se reintenta', async () => {
    const { repo, renovar, espia } = bancoConRenovacion(
      [{ ok: false, error: 'PERMISO_INSUFICIENTE' }],
      ['nuevo'],
    );
    await expect(repo.darDeBajaMember(CTX, 'p1')).rejects.toMatchObject({
      codigo: 'PERMISO_INSUFICIENTE',
    });
    expect(renovar).not.toHaveBeenCalled();
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('sin renovación disponible, se comporta como antes', async () => {
    const { repo } = banco([{ ok: false, error: 'TOKEN_INVALIDO' }]);
    await expect(repo.darDeBajaMember(CTX, 'p1')).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('también protege la lectura', async () => {
    const { repo, espia } = bancoConRenovacion(
      [RECHAZO, { ok: true, data: { esquema: 4, revision: 1, tablas: {} } }],
      ['nuevo.id.token'],
    );
    await expect(repo.loadAll(CTX)).resolves.toBeTruthy();
    expect(espia).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Una acción del usuario, un lote
// ─────────────────────────────────────────────────────────────────────────────

describe('una acción del usuario es UN lote, o nada', () => {
  /**
   * Lo que encontró la validación en vivo de G4b.
   *
   * Dar de alta un familiar son tres escrituras: el paciente, su perfil y la
   * entrada en su historial. Iban en **tres lotes**, y cuando el tercero se
   * rechazó, los dos primeros ya estaban en la hoja. La pantalla dijo «se
   * deshizo para no dejarlo a medias» con el expediente, justamente, a
   * medias.
   *
   * El router ya sabía hacerlo bien: valida el lote entero antes de escribir
   * nada. Lo único que había que hacer era mandarle uno.
   */

  const miembro = { id: 'p1', fullName: 'Ana', birthDate: '1990-01-01' } as Parameters<
    RepositorioBackend['saveMember']
  >[1];
  const evento = {
    id: 'h1',
    memberId: 'p1',
    eventType: 'OTHER',
    title: 'Alta',
    eventDate: '2026-09-22',
  } as Parameters<RepositorioBackend['saveHistoryEvent']>[1];

  it('tres escrituras dentro de una transacción salen en UNA petición', async () => {
    const { repo, espia } = banco();
    const tx = repo.transaccion();

    await tx.saveMember(CTX, miembro);
    await tx.saveHistoryEvent(CTX, evento);
    expect(espia, 'no sale nada hasta confirmar').not.toHaveBeenCalled();

    await tx.confirmar();
    expect(espia).toHaveBeenCalledTimes(1);
    expect(envio(espia).payload?.mutaciones?.map((m) => m.tabla)).toEqual([
      'PACIENTES',
      'PERFIL_HUMANO',
      'HISTORIAL',
    ]);
  });

  it('si algo falla ANTES de confirmar, no sale nada', async () => {
    // Una escritura que no tiene dónde ir —o un modelo sin paciente— lanza
    // dentro de la transacción. Lo que ya se había acumulado no puede salir
    // solo: sería la mitad de la acción.
    const { repo, espia } = banco();
    const tx = repo.transaccion();

    await tx.saveMember(CTX, miembro);
    await expect(
      tx.saveTask(CTX, { id: 't1' } as Parameters<RepositorioBackend['saveTask']>[1]),
    ).rejects.toThrow();

    expect(espia).not.toHaveBeenCalled();
  });

  it('una transacción sin nada que escribir no sale a la red ni falla', async () => {
    // Pasa de verdad: hay acciones que solo escriben si se cumple algo.
    const { repo, espia } = banco();
    await expect(repo.transaccion().confirmar()).resolves.toBeUndefined();
    expect(espia).not.toHaveBeenCalled();
  });

  it('confirmar dos veces no manda dos veces', async () => {
    const { repo, espia } = banco();
    const tx = repo.transaccion();
    await tx.saveMember(CTX, miembro);
    await tx.confirmar();
    await tx.confirmar();
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('dos transacciones a la vez no se mezclan', async () => {
    // El repositorio es único en la aplicación. Si la transacción viviera en
    // él y no en su propio objeto, dos guardados simultáneos acabarían en el
    // mismo lote.
    const { repo, espia } = banco();
    const a = repo.transaccion();
    const b = repo.transaccion();

    await a.saveMember(CTX, miembro);
    await b.saveHistoryEvent(CTX, evento);
    await a.confirmar();
    await b.confirmar();

    expect(espia).toHaveBeenCalledTimes(2);
    expect(envio(espia, 0).payload?.mutaciones?.map((m) => m.tabla)).toEqual([
      'PACIENTES',
      'PERFIL_HUMANO',
    ]);
    expect(envio(espia, 1).payload?.mutaciones?.map((m) => m.tabla)).toEqual(['HISTORIAL']);
  });

  it('fuera de una transacción, cada escritura sigue saliendo sola', async () => {
    const { repo, espia } = banco();
    await repo.saveHistoryEvent(CTX, evento);
    expect(espia).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El barrido
// ─────────────────────────────────────────────────────────────────────────────

/**
 * G1 mira el código y dice si un método **podría** no hacer nada. Esto lo
 * ejecuta y exige que haga una de las dos únicas cosas honestas: mandar algo,
 * o negarse en voz alta.
 *
 * Es la prueba que hace que el contador llegue a cero de verdad y no por
 * haberle puesto a cada cuerpo una línea que lo despiste.
 */
describe('ninguna escritura se queda callada', () => {
  const argumentos: Record<string, unknown[]> = {
    saveHealthProfile: ['p1', { id: 'h1', memberId: 'p1', allergies: ['polen'] }],
    saveExamResults: ['e1', [{ id: 'r1', examId: 'e1', parameterName: 'Hb', value: '1' }], 'p1'],
    createFamily: ['Familia'],
    createInvitation: ['x@y.com', 'p1', 'VIEWER'],
    acceptInvitation: ['f1', 'i1'],
    revokeInvitation: ['x@y.com'],
  };

  const modelo = { id: 'x1', memberId: 'p1', fullName: 'Ana', name: 'Algo', title: 'Algo' };

  for (const metodo of METODOS_ESCRITURA) {
    it(`${metodo} · o manda una mutación, o se niega`, async () => {
      const { repo, espia } = banco();
      const fn = (repo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[metodo];
      expect(typeof fn, `${metodo} no existe`).toBe('function');

      const args = argumentos[metodo] ?? [metodo.startsWith('delete') ? 'x1' : modelo];

      let lanzo = false;
      try {
        await fn.call(repo, CTX, ...args);
      } catch {
        lanzo = true;
      }

      expect(
        lanzo || espia.mock.calls.length > 0,
        `${metodo} resolvió sin mandar nada: el dato se pierde en silencio`,
      ).toBe(true);
    });
  }
});

describe('la dirección de la hoja (cierre de G4)', () => {
  it('la pide al despliegue registrado, con la sesión de siempre', async () => {
    const HOJA = 'https://docs.google.com/spreadsheets/d/1HojaSintetica0123456789/edit';
    const { repo, espia } = banco([{ ok: true, data: { url: HOJA } }]);
    expect(await repo.urlDeLaHoja()).toBe(HOJA);
    expect(envio(espia).accion).toBe('verHoja');
  });

  it('sin despliegue registrado no inventa una', async () => {
    const repo = new RepositorioBackend({ url: () => null, idToken: async () => 't', fetch: vi.fn() as never });
    await expect(repo.urlDeLaHoja()).rejects.toMatchObject({ codigo: SIN_BACKEND });
  });
});

describe('Bloque J · las tareas de seguimiento tienen pestaña', () => {
  const TAREA = {
    id: 't1',
    memberId: 'p1',
    title: 'Pedir cita de control',
    description: 'Con los resultados del laboratorio',
    createdAt: '2026-10-12T10:00:00.000Z',
    dueDate: '2026-10-20',
    status: 'PENDING',
    priority: 'HIGH',
  } as Parameters<RepositorioBackend['saveTask']>[1];

  it('guardar una tarea escribe una fila en TAREAS, con su paciente', async () => {
    const { repo, espia } = banco();
    await repo.saveTask(CTX, TAREA);
    const { accion, payload } = envio(espia);
    expect(accion).toBe('aplicar');
    const [m] = payload!.mutaciones!;
    expect(m.tabla).toBe('TAREAS');
    expect(m.pacienteId).toBe('p1');
    expect(m.fila).toMatchObject({
      id: 't1',
      paciente_id: 'p1',
      titulo: 'Pedir cita de control',
      descripcion: 'Con los resultados del laboratorio',
      fecha_limite: '2026-10-20',
      estado: 'PENDING',
      prioridad: 'HIGH',
    });
    // `creado_en` lo sella el router, no el reloj del cliente.
    expect(m.fila).not.toHaveProperty('creado_en');
  });

  it('al leer la hoja, las tareas vuelven', async () => {
    const enc = encabezadosDe('TAREAS')!;
    const fila = enc.map((c) =>
      ({ id: 't1', paciente_id: 'p1', titulo: 'Pedir cita', estado: 'DONE', prioridad: 'LOW', fecha_limite: '2026-10-20' } as Record<string, string>)[c] ?? '',
    );
    const { repo } = banco([{ ok: true, data: { esquema: 5, revision: 1, tablas: { TAREAS: [enc, fila] } } }]);
    const datos = await repo.loadAll(CTX);
    expect(datos.tasks).toHaveLength(1);
    expect(datos.tasks[0]).toMatchObject({ id: 't1', memberId: 'p1', title: 'Pedir cita', status: 'DONE', priority: 'LOW', dueDate: '2026-10-20' });
  });
});

describe('estadoDeVacuna', () => {
  it('compara solo el día, en la hora del dispositivo', () => {
    expect(estadoDeVacuna('2026-10-18', '2026-10-18')).toBe('COMPLETED');
    expect(estadoDeVacuna('2026-10-18T23:00:00Z', '2026-10-18')).toBe('COMPLETED');
    expect(estadoDeVacuna('2026-10-19', '2026-10-18')).toBe('SCHEDULED');
    expect(estadoDeVacuna('', '2026-10-18')).toBe('SCHEDULED');
    expect(estadoDeVacuna('no es fecha', '2026-10-18')).toBe('SCHEDULED');
  });

  it('hoy es la fecha local, no la UTC', () => {
    expect(fechaLocalHoy(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-18');
  });
});

describe('invitacionesDesdeAccesos (Bloque L)', () => {
  it('pasa ACCESO al modelo de Ajustes; el id es el correo, que es lo que revocar necesita', () => {
    const lista = invitacionesDesdeAccesos([
      { email: 'ana@x.com', rol: 'MIEMBRO', pacientes: 'm1', estado: 'PENDIENTE', expira: '2026-10-25' },
      { email: 'eva@x.com', rol: 'CUIDADOR', pacientes: '*', estado: 'ACEPTADA' },
      { email: '', rol: 'LECTOR', estado: 'PENDIENTE' },
      { email: 'raro@x.com', rol: 'TITULAR', estado: 'ACEPTADA' },
    ]);
    expect(lista.map((i) => [i.id, i.role, i.status, i.invitedMemberId])).toEqual([
      ['ana@x.com', 'MEMBER', 'PENDING', 'm1'],
      ['eva@x.com', 'CAREGIVER', 'ACCEPTED', '*'],
    ]);
    expect(invitacionesDesdeAccesos(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloque O · Mascotas: ficha ampliada y módulos, ida y vuelta por la hoja
// ─────────────────────────────────────────────────────────────────────────────

describe('Bloque O · mascota de punta a punta en las pestañas existentes', () => {
  /** Convierte la fila enviada en celdas de su pestaña, como las devolvería `exportar`. */
  const celdas = (tabla: string, fila: Record<string, unknown>) => (encabezadosDe(tabla) ?? []).map((c) => (fila[c] ?? '') as unknown);

  it('lo que se escribe se relee igual: ficha, vacuna, preventivo, tratamiento, toma, recordatorio, examen y documento', async () => {
    const { repo, espia } = banco(Array.from({ length: 12 }, () => ({ ok: true, data: { aplicadas: 1, revision: 1 } })));
    const pet = {
      id: 'pet-1', familyId: '', memberId: 'p1', nombre: 'Nube', especie: 'PERRO', sexo: 'HEMBRA', activo: true,
      notas: 'Le teme a la pólvora', fotoUrl: 'data:image/jpeg;base64,AAAA',
      ficha: { estado: 'EN_TRATAMIENTO', esterilizado: true, microchip: '985112003456789', veterinario: { nombre: 'Dra. Ruiz' }, alimentacion: { presentacion: 'SECO', vecesAlDia: 2 } },
      createdAt: '', updatedAt: '',
    };
    await repo.savePet(CTX, pet as never);
    await repo.savePetVaccine(CTX, { id: 'v1', petId: 'pet-1', memberId: 'p1', vacuna: 'Rabia', fecha: '2026-01-10', proximaDosis: '2027-01-10', tipo: 'CORE', costo: 60000, clinica: 'Huellitas', createdAt: '', updatedAt: '' } as never);
    await repo.savePetRecord(CTX, 'cuidados', { id: 'c1', petId: 'pet-1', memberId: 'p1', categoria: 'ANTIPULGAS', fecha: '2026-10-01', proxima: '2026-11-01', periodicidadMeses: 1, producto: 'Bravecto', via: 'ORAL', costo: 120000 });
    await repo.savePetRecord(CTX, 'tratamientos', { id: 't1', petId: 'pet-1', memberId: 'p1', nombre: 'Amoxicilina', tipo: 'ANTIBIOTICO', dosisValor: 250, dosisUnidad: 'mg', frecuencia: 'CADA_12H', via: 'ORAL', fechaInicio: '2026-10-15', horaInicio: '08:00', fechaFin: '2026-10-19', estado: 'ACTIVO', efectosSecundarios: 'Vómito' });
    await repo.savePetRecord(CTX, 'tomas', { id: 't1@2026-10-15T08:00', tratamientoId: 't1', petId: 'pet-1', memberId: 'p1', programadaEn: '2026-10-15T08:00', estado: 'APLICADA', aplicadaEn: '2026-10-15T13:05:00Z' });
    await repo.savePetRecord(CTX, 'recordatorios', { id: 'recpet:pet-1:PESO:2026-11-01', petId: 'pet-1', memberId: 'p1', clave: 'PESO:2026-11-01', tipo: 'PESO', titulo: 'Control de peso mensual', estado: 'POSPUESTO', fecha: '2026-11-08' });

    // Todas las mutaciones viajan como MASCOTA y con el paciente = la mascota.
    const enviadas = espia.mock.calls.map((_c, i) => envio(espia, i).payload!.mutaciones!).flat();
    for (const m of enviadas) {
      expect(m.pacienteId).toBe('pet-1');
      expect((m as { especie?: string }).especie).toBe('MASCOTA');
    }
    const tablas: Record<string, unknown[][]> = { PACIENTES: [['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', '']] };
    for (const m of enviadas) (tablas[m.tabla] ??= []).push(celdas(m.tabla, m.fila));
    // El control veterinario se distingue de uno humano por su prefijo.
    expect(enviadas.find((m) => m.tabla === 'CONTROLES')!.fila.tipo).toBe('VET_ANTIPULGAS');
    // Exámenes y documentos de la mascota van en sus pestañas de siempre.
    tablas.EXAMENES = [celdas('EXAMENES', { id: 'e1', paciente_id: 'pet-1', nombre: 'Química', fecha: '2026-10-01' })];
    tablas.DOCUMENTOS = [celdas('DOCUMENTOS', { id: 'd1', paciente_id: 'pet-1', titulo: 'carnet.pdf' })];

    const { repo: lector } = banco([{ ok: true, data: { esquema: 6, revision: 9, tablas } }]);
    const d = await lector.loadAll(CTX);

    expect(d.pets).toHaveLength(1);
    expect(d.pets[0]).toMatchObject({ nombre: 'Nube', notas: 'Le teme a la pólvora', fotoUrl: 'data:image/jpeg;base64,AAAA', ficha: pet.ficha });
    expect(d.petVaccines[0]).toMatchObject({ vacuna: 'Rabia', tipo: 'CORE', costo: 60000, clinica: 'Huellitas', memberId: 'p1' });
    expect(d.petModules.cuidados[0]).toMatchObject({ categoria: 'ANTIPULGAS', producto: 'Bravecto', via: 'ORAL', costo: 120000, proxima: '2026-11-01', periodicidadMeses: 1, memberId: 'p1' });
    expect(d.petModules.tratamientos[0]).toMatchObject({ nombre: 'Amoxicilina', tipo: 'ANTIBIOTICO', dosisValor: 250, frecuencia: 'CADA_12H', horaInicio: '08:00', efectosSecundarios: 'Vómito' });
    expect(d.petModules.tomas[0]).toMatchObject({ tratamientoId: 't1', programadaEn: '2026-10-15T08:00', estado: 'APLICADA' });
    expect(d.petModules.recordatorios[0]).toMatchObject({ clave: 'PESO:2026-11-01', estado: 'POSPUESTO', fecha: '2026-11-08' });
    expect(d.exams.map((e) => e.memberId)).toEqual(['pet-1']);
    expect(d.documents.map((x) => x.memberId)).toEqual(['pet-1']);
    // Y nada de la mascota se cuela en las colecciones humanas.
    expect(d.members.map((m) => m.id)).toEqual(['p1']);
    expect(d.medications).toEqual([]);
    expect(d.checkups).toEqual([]);
  });

  it('una mascota con notas antiguas en texto plano se lee igual que siempre', async () => {
    const { repo } = banco([{ ok: true, data: { esquema: 6, revision: 1, tablas: {
      PACIENTES: [['p1', 'HUMANO', 'Ana', '', 'ACTIVE', '', '', '', ''], celdas('PACIENTES', { id: 'pet-2', tipo: 'MASCOTA', nombre: 'Toby', activo: 'SI', notas: 'Come dos veces' })],
      PERFIL_MASCOTA: [celdas('PERFIL_MASCOTA', { paciente_id: 'pet-2', especie: 'GATO', responsable_id: 'p1' })],
    } } }]);
    const d = await repo.loadAll(CTX);
    expect(d.pets[0]).toMatchObject({ nombre: 'Toby', notas: 'Come dos veces', ficha: {} });
  });
});
