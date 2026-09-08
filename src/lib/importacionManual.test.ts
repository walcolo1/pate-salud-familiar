import { describe, it, expect } from 'vitest';
import {
  SCOPES_PERMITIDOS,
  SCOPE_PROHIBIDO_GMAIL,
  scopePermitido,
  scopesPermitidos,
  clientIdConfigurado,
  MENSAJE_SIN_CLIENT_ID,
  TIPOS_ADJUNTO_ACEPTADOS,
  TAMANO_MAXIMO_ADJUNTO,
  validarAdjunto,
  mensajeRechazoAdjunto,
  crearBorradorDesdeTexto,
  esOrigenManual,
  puedeConfirmarse,
  camposFaltantes,
} from './importacionManual';
import type { FamilyMember } from '../domain/models';

/**
 * Pruebas de la importación manual de citas (Bloque B).
 *
 * Todo el texto de prueba es sintético. No procede de ningún correo real ni
 * contiene datos de ninguna persona.
 */

const MIEMBROS = [
  { id: 'm1', fullName: 'Paciente Sintetico Uno', status: 'ACTIVE' },
  { id: 'm2', fullName: 'Paciente Sintetico Dos', status: 'ACTIVE' },
] as unknown as FamilyMember[];

/** Correo sintético con la forma de los que envía una EPS. */
const CORREO_EPS = [
  'Estimado usuario,',
  'Le confirmamos la cita de Paciente Sintetico Uno',
  'para el 15/07/2026 a las 10:30 am',
  'con la Dra. Sintetica Prueba',
  'Especialidad: odontología',
  'IPS Clinica Sintetica, consultorio 104',
].join('\n');

const AHORA = 1_757_000_000_000;
const OPC = { ahora: AHORA, sufijo: 'abcde' };

// ─────────────────────────────────────────────────────────────────────────────

describe('ámbitos OAuth · lista cerrada', () => {
  it('gmail.readonly NO está entre los permitidos', () => {
    expect(SCOPES_PERMITIDOS).not.toContain(SCOPE_PROHIBIDO_GMAIL);
    expect(scopePermitido(SCOPE_PROHIBIDO_GMAIL)).toBe(false);
  });

  it('ningún ámbito permitido menciona Gmail', () => {
    for (const s of SCOPES_PERMITIDOS) expect(s).not.toContain('gmail');
  });

  it('la lista es exactamente la esperada, ni uno más', () => {
    // Si alguien añade un ámbito, esta prueba obliga a justificarlo aquí.
    expect([...SCOPES_PERMITIDOS]).toEqual([
      'profile',
      'email',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar.events',
    ]);
  });

  it('valida cadenas de ámbitos como las que recibe GIS', () => {
    expect(scopesPermitidos('profile email')).toBe(true);
    expect(scopesPermitidos(`profile ${SCOPE_PROHIBIDO_GMAIL}`)).toBe(false);
  });

  it('una cadena vacía no se considera válida', () => {
    expect(scopesPermitidos('')).toBe(false);
    expect(scopesPermitidos('   ')).toBe(false);
  });
});

describe('Client ID de Google', () => {
  it('ausente, vacío o en blanco cuenta como NO configurado', () => {
    expect(clientIdConfigurado(undefined)).toBe(false);
    expect(clientIdConfigurado(null)).toBe(false);
    expect(clientIdConfigurado('')).toBe(false);
    expect(clientIdConfigurado('   ')).toBe(false);
  });

  it('un valor real cuenta como configurado', () => {
    expect(clientIdConfigurado('123-abc.apps.googleusercontent.com')).toBe(true);
  });

  it('el mensaje de error nombra la variable pero no revela ningún valor', () => {
    expect(MENSAJE_SIN_CLIENT_ID).toContain('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    expect(MENSAJE_SIN_CLIENT_ID).not.toContain('apps.googleusercontent.com');
  });
});

describe('adjuntos', () => {
  const archivo = (type: string, size = 1024, name = 'a') => ({ name, type, size });

  it('acepta PDF, imágenes y texto', () => {
    for (const t of TIPOS_ADJUNTO_ACEPTADOS) {
      expect(validarAdjunto(archivo(t)).ok, t).toBe(true);
    }
  });

  it('rechaza un tipo que no está en la lista', () => {
    const r = validarAdjunto(archivo('application/x-msdownload'));
    expect(r).toEqual({ ok: false, motivo: 'TIPO_NO_ACEPTADO' });
  });

  it('rechaza un archivo vacío', () => {
    expect(validarAdjunto(archivo('application/pdf', 0))).toEqual({
      ok: false,
      motivo: 'VACIO',
    });
  });

  it('rechaza por encima de 8 MB y acepta justo en el límite', () => {
    expect(validarAdjunto(archivo('application/pdf', TAMANO_MAXIMO_ADJUNTO + 1)).ok).toBe(false);
    expect(validarAdjunto(archivo('application/pdf', TAMANO_MAXIMO_ADJUNTO)).ok).toBe(true);
  });

  it('distingue de qué archivos puede leer el texto SIN biblioteca', () => {
    // El texto plano, aquí mismo. El PDF necesita pdf.js y sale por
    // `extraerTextoPdf`. La imagen necesitaría OCR y nadie la atiende.
    expect(validarAdjunto(archivo('text/plain'))).toEqual({ ok: true, extraible: true });
    expect(validarAdjunto(archivo('application/pdf'))).toEqual({ ok: true, extraible: false });
    expect(validarAdjunto(archivo('image/png'))).toEqual({ ok: true, extraible: false });
  });

  it('los mensajes de rechazo no filtran el contenido del archivo', () => {
    for (const m of ['VACIO', 'DEMASIADO_GRANDE', 'TIPO_NO_ACEPTADO'] as const) {
      const texto = mensajeRechazoAdjunto(m);
      expect(texto.length).toBeGreaterThan(0);
      expect(texto).not.toContain('Paciente');
    }
  });
});

describe('creación del borrador', () => {
  it('extrae los datos de un correo sintético de EPS', () => {
    const b = crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, OPC)!;
    expect(b.detectedPatientName).toBe('Paciente Sintetico Uno');
    expect(b.detectedDate).toBe('2026-07-15');
    expect(b.detectedTime).toBe('10:30');
    expect(b.detectedDoctor).toBe('Sintetica Prueba');
    expect(b.detectedSpecialty).toBe('Odontología');
    expect(b.confidence).toBe('HIGH');
  });

  it('SIEMPRE queda pendiente de revisión, aunque lo reconozca todo', () => {
    // Es la regla central del bloque: el análisis no crea citas.
    const b = crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, OPC)!;
    expect(b.status).toBe('PENDING_REVIEW');
    expect(b.createdAppointmentId).toBeUndefined();
  });

  it('un texto que no reconoce sigue dando un borrador editable, no un error', () => {
    const b = crearBorradorDesdeTexto('algo sin ninguna estructura', MIEMBROS, OPC)!;
    expect(b).not.toBeNull();
    expect(b.status).toBe('PENDING_REVIEW');
    expect(b.detectedDate).toBeNull();
    expect(b.confidence).toBe('LOW');
  });

  it('un texto vacío o en blanco no crea nada', () => {
    expect(crearBorradorDesdeTexto('', MIEMBROS, OPC)).toBeNull();
    expect(crearBorradorDesdeTexto('   \n  ', MIEMBROS, OPC)).toBeNull();
  });

  it('queda marcado como MANUAL, sin identificador de mensaje de Gmail', () => {
    const b = crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, OPC)!;
    expect(b.sourceEmail).toBe('MANUAL');
    expect(esOrigenManual(b)).toBe(true);
    expect(b.gmailMessageId).toBe(`manual-${AHORA}-abcde`);
    expect(b.gmailMessageId).not.toMatch(/^[0-9a-f]{16}$/); // no es un id de Gmail
  });

  it('el extracto guardado se recorta y no arrastra el correo entero', () => {
    const largo = 'x'.repeat(1000);
    const b = crearBorradorDesdeTexto(largo, MIEMBROS, OPC)!;
    expect(b.rawSnippet.length).toBe(240);
  });

  it('el nombre del adjunto se usa como asunto cuando lo hay', () => {
    const b = crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, {
      ...OPC,
      nombreAdjunto: 'cita-sintetica.pdf',
    })!;
    expect(b.subject).toBe('cita-sintetica.pdf');
  });

  it('sin adjunto, el asunto dice de dónde vino', () => {
    expect(crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, OPC)!.subject).toBe('Texto pegado');
  });

  it('no inventa un familiar que no existe', () => {
    const b = crearBorradorDesdeTexto('Cita para Persona Que No Existe el 15/07/2026 10:30', [], OPC)!;
    expect(b.detectedPatientName).toBeNull();
  });

  it('con reloj y sufijo inyectados, dos llamadas dan el mismo resultado', () => {
    const a = crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, OPC);
    const b = crearBorradorDesdeTexto(CORREO_EPS, MIEMBROS, OPC);
    expect(a).toEqual(b);
  });
});

describe('confirmación del borrador', () => {
  it('exige familiar, fecha y hora', () => {
    expect(puedeConfirmarse({ memberId: 'm1', detectedDate: '2026-07-15', detectedTime: '10:30' })).toBe(true);
  });

  it('sin familiar no se puede confirmar aunque el texto se reconociera entero', () => {
    // El analizador propone un nombre; asignar el familiar es de la persona.
    expect(puedeConfirmarse({ memberId: null, detectedDate: '2026-07-15', detectedTime: '10:30' })).toBe(false);
  });

  it('sin fecha o sin hora tampoco', () => {
    expect(puedeConfirmarse({ memberId: 'm1', detectedDate: null, detectedTime: '10:30' })).toBe(false);
    expect(puedeConfirmarse({ memberId: 'm1', detectedDate: '2026-07-15', detectedTime: null })).toBe(false);
  });

  it('dice exactamente qué falta', () => {
    expect(camposFaltantes({})).toEqual(['familiar', 'fecha', 'hora']);
    expect(camposFaltantes({ memberId: 'm1', detectedDate: '2026-07-15' })).toEqual(['hora']);
    expect(camposFaltantes({ memberId: 'm1', detectedDate: '2026-07-15', detectedTime: '10:30' })).toEqual([]);
  });
});
