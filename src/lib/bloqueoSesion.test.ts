import { describe, it, expect } from 'vitest';
import {
  CLAVE_BLOQUEO,
  UMBRAL_BLOQUEO_MS,
  CLAVES_ESTADO_CLINICO,
  minutosDelDia,
  estaEnVentanaNocturna,
  superoUmbralBloqueo,
  validarMarcador,
  leerMarcadorBloqueo,
  escribirMarcadorBloqueo,
  borrarMarcadorBloqueo,
  decidirArranque,
  type AlmacenLike,
} from './bloqueoSesion';

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map<string, string>(Object.entries(inicial));
  const store: AlmacenLike = {
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => { datos.set(k, v); },
    removeItem: (k) => { datos.delete(k); },
  };
  return { store, datos };
}

const hm = (h: number, m = 0) => h * 60 + m;

describe('estaEnVentanaNocturna · ventana normal (no cruza medianoche)', () => {
  it('dentro del rango 13:00–15:00', () => {
    expect(estaEnVentanaNocturna(hm(14), '13:00', '15:00')).toBe(true);
  });
  it('fuera del rango, antes y después', () => {
    expect(estaEnVentanaNocturna(hm(12, 59), '13:00', '15:00')).toBe(false);
    expect(estaEnVentanaNocturna(hm(15, 1), '13:00', '15:00')).toBe(false);
  });
  it('el minuto de inicio está DENTRO y el de fin FUERA', () => {
    expect(estaEnVentanaNocturna(hm(13, 0), '13:00', '15:00')).toBe(true);
    expect(estaEnVentanaNocturna(hm(15, 0), '13:00', '15:00')).toBe(false);
  });
});

describe('estaEnVentanaNocturna · ventana que CRUZA MEDIANOCHE', () => {
  // 22:00–06:00 es la configuración por defecto de la app.
  it('antes de medianoche, ya dentro', () => {
    expect(estaEnVentanaNocturna(hm(23, 30), '22:00', '06:00')).toBe(true);
  });
  it('después de medianoche, todavía dentro', () => {
    expect(estaEnVentanaNocturna(hm(2, 15), '22:00', '06:00')).toBe(true);
  });
  it('a plena luz del día, fuera', () => {
    expect(estaEnVentanaNocturna(hm(12), '22:00', '06:00')).toBe(false);
    expect(estaEnVentanaNocturna(hm(21, 59), '22:00', '06:00')).toBe(false);
  });
  it('los bordes se comportan igual que en la ventana normal', () => {
    expect(estaEnVentanaNocturna(hm(22, 0), '22:00', '06:00')).toBe(true);
    expect(estaEnVentanaNocturna(hm(6, 0), '22:00', '06:00')).toBe(false);
    expect(estaEnVentanaNocturna(hm(5, 59), '22:00', '06:00')).toBe(true);
  });
});

describe('estaEnVentanaNocturna · entradas degeneradas', () => {
  it('inicio igual a fin es una ventana VACÍA, no el día entero', () => {
    expect(estaEnVentanaNocturna(hm(22), '22:00', '22:00')).toBe(false);
    expect(estaEnVentanaNocturna(hm(3), '22:00', '22:00')).toBe(false);
  });
  it('horas mal formadas no bloquean nunca', () => {
    for (const [i, f] of [['25:00', '06:00'], ['22:00', '99:99'], ['abc', '06:00'], ['', ''], ['2200', '0600']]) {
      expect(estaEnVentanaNocturna(hm(23), i, f)).toBe(false);
    }
  });
});

describe('minutosDelDia', () => {
  it('convierte una fecha a minutos desde medianoche', () => {
    expect(minutosDelDia(new Date(2026, 8, 7, 0, 0))).toBe(0);
    expect(minutosDelDia(new Date(2026, 8, 7, 23, 59))).toBe(1439);
  });
});

describe('CLAVES_ESTADO_CLINICO', () => {
  it('contiene exactamente las 16 estructuras clínicas acordadas', () => {
    expect(CLAVES_ESTADO_CLINICO).toHaveLength(16);
    expect([...CLAVES_ESTADO_CLINICO].sort()).toEqual(
      [
        'appointmentCandidates', 'appointments', 'checkups', 'documents', 'examResults',
        'exams', 'healthProfiles', 'history', 'medicalOrders', 'medicationDoseReminders',
        'medicationPrescriptions', 'members', 'reminders', 'sharedReports', 'tasks', 'vaccines',
      ].sort(),
    );
  });

  it('NO contiene identificadores, preferencias ni el contador de pendientes', () => {
    const prohibidas = [
      'user', 'familyId', 'memberId', 'deviceId', 'pendingSyncCount',
      'driveAccessToken', 'calendarAccessToken', 'sheetsAccessToken', 'gmailAccessToken',
      'databaseSpreadsheetId', 'databaseSpreadsheetUrl', 'appDataFileId',
      'currentUserFamilyAccess', 'simulatedRole', 'simulatedEmail',
      'driveSyncEnabled', 'calendarSyncEnabled', 'gmailAutoScanEnabled', 'gmailScanTime',
      'gmailScanRangeDays', 'gmailOnlyFutureAppointments', 'autoLockEnabled',
      'autoLockMinutes', 'nightLockEnabled', 'nightLockStart', 'nightLockEnd',
    ];
    for (const p of prohibidas) {
      expect(CLAVES_ESTADO_CLINICO as readonly string[]).not.toContain(p);
    }
  });

  it('no tiene duplicados', () => {
    expect(new Set(CLAVES_ESTADO_CLINICO).size).toBe(CLAVES_ESTADO_CLINICO.length);
  });
});

describe('superoUmbralBloqueo · 8 horas', () => {
  const t0 = 1_757_000_000_000;
  it('sin marca de inicio no cierra', () => {
    expect(superoUmbralBloqueo(null, t0)).toBe(false);
    expect(superoUmbralBloqueo(undefined, t0)).toBe(false);
  });
  it('7 h 59 min NO cierra', () => {
    expect(superoUmbralBloqueo(t0, t0 + UMBRAL_BLOQUEO_MS - 60_000)).toBe(false);
  });
  it('EXACTAMENTE 8 h cierra', () => {
    expect(superoUmbralBloqueo(t0, t0 + UMBRAL_BLOQUEO_MS)).toBe(true);
  });
  it('12 h cierra', () => {
    expect(superoUmbralBloqueo(t0, t0 + 12 * 3600_000)).toBe(true);
  });
  it('una marca no finita no cierra', () => {
    expect(superoUmbralBloqueo(Number.NaN, t0)).toBe(false);
  });
});

describe('validarMarcador · forma exacta', () => {
  const valido = { bloqueado: true, bloqueadoDesde: 1_757_000_000_000, origen: 'REAL' };

  it('acepta el marcador bien formado', () => {
    expect(validarMarcador(valido)).toEqual(valido);
    expect(validarMarcador({ ...valido, origen: 'DEMO' })?.origen).toBe('DEMO');
  });

  it('rechaza campos DE MÁS: el marcador solo admite tres', () => {
    expect(validarMarcador({ ...valido, email: 'x@example.invalid' })).toBeNull();
    expect(validarMarcador({ ...valido, familyId: 'fam_1' })).toBeNull();
  });

  it('rechaza la falta de bloqueadoDesde', () => {
    expect(validarMarcador({ bloqueado: true, origen: 'REAL' })).toBeNull();
  });

  it('rechaza tipos erróneos y valores imposibles', () => {
    expect(validarMarcador({ ...valido, bloqueadoDesde: '1757' })).toBeNull();
    expect(validarMarcador({ ...valido, bloqueadoDesde: 0 })).toBeNull();
    expect(validarMarcador({ ...valido, bloqueadoDesde: -5 })).toBeNull();
    expect(validarMarcador({ ...valido, bloqueado: false })).toBeNull();
    expect(validarMarcador({ ...valido, origen: 'OTRO' })).toBeNull();
  });

  it('rechaza valores que no son objeto', () => {
    for (const v of [null, undefined, 42, 'texto', [], true]) {
      expect(validarMarcador(v)).toBeNull();
    }
  });
});

describe('marcador · lectura, escritura y borrado', () => {
  it('ida y vuelta', () => {
    const { store, datos } = almacenFalso();
    expect(escribirMarcadorBloqueo(1_757_000_000_000, 'DEMO', store)).toBe(true);
    const l = leerMarcadorBloqueo(store);
    expect(l.estado).toBe('valido');
    if (l.estado === 'valido') {
      expect(l.marcador.origen).toBe('DEMO');
      expect(l.marcador.bloqueadoDesde).toBe(1_757_000_000_000);
    }
    // Solo los tres campos permitidos llegan al disco.
    expect(Object.keys(JSON.parse(datos.get(CLAVE_BLOQUEO)!)).sort())
      .toEqual(['bloqueadoDesde', 'bloqueado', 'origen'].sort());
  });

  it('sin marcador lo dice, no inventa', () => {
    expect(leerMarcadorBloqueo(almacenFalso().store).estado).toBe('sin_marcador');
  });

  it('un JSON ilegible se reporta como corrupto', () => {
    const { store } = almacenFalso({ [CLAVE_BLOQUEO]: '{roto' });
    expect(leerMarcadorBloqueo(store).estado).toBe('corrupto');
  });

  it('un marcador con campos de más se reporta como corrupto', () => {
    const { store } = almacenFalso({
      [CLAVE_BLOQUEO]: JSON.stringify({ bloqueado: true, bloqueadoDesde: 1, origen: 'REAL', uid: 'abc' }),
    });
    expect(leerMarcadorBloqueo(store).estado).toBe('corrupto');
  });

  it('borrar lo elimina', () => {
    const { store, datos } = almacenFalso();
    escribirMarcadorBloqueo(1_757_000_000_000, 'REAL', store);
    borrarMarcadorBloqueo(store);
    expect(datos.has(CLAVE_BLOQUEO)).toBe(false);
  });

  it('sin almacenamiento no lanza', () => {
    expect(leerMarcadorBloqueo(null).estado).toBe('sin_marcador');
    expect(escribirMarcadorBloqueo(1, 'REAL', null)).toBe(false);
    expect(() => borrarMarcadorBloqueo(null)).not.toThrow();
  });
});

describe('decidirArranque · los cuatro caminos', () => {
  const t0 = 1_757_000_000_000;

  it('sin marcador arranca normal', () => {
    expect(decidirArranque({ estado: 'sin_marcador' }, t0)).toEqual({ accion: 'arrancar_normal' });
  });

  it('marcador corrupto NO desbloquea: envía a login', () => {
    expect(decidirArranque({ estado: 'corrupto' }, t0)).toEqual({ accion: 'ir_a_login' });
  });

  it('bloqueo reciente sigue bloqueado y conserva el origen', () => {
    const l = { estado: 'valido' as const, marcador: { bloqueado: true as const, bloqueadoDesde: t0, origen: 'DEMO' as const } };
    expect(decidirArranque(l, t0 + 60_000)).toEqual({ accion: 'seguir_bloqueado', origen: 'DEMO' });
  });

  it('a las 8 horas EXACTAS cierra la sesión', () => {
    const l = { estado: 'valido' as const, marcador: { bloqueado: true as const, bloqueadoDesde: t0, origen: 'REAL' as const } };
    expect(decidirArranque(l, t0 + UMBRAL_BLOQUEO_MS)).toEqual({ accion: 'cerrar_sesion' });
  });
});
