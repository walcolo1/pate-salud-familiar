/**
 * Importación manual de citas — Paté · Salud Familiar (Bloque B)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sustituye al escaneo automático de Gmail. La aplicación ya no lee el correo
 * de nadie: la persona pega el texto que recibió, o adjunta el documento, y
 * de ahí sale un BORRADOR que siempre pasa por revisión humana.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN
 * ──────────────────────────────
 *  1. Nunca se crea una cita automáticamente. Lo que sale de aquí es un
 *     candidato en estado PENDING_REVIEW; convertirlo en cita exige un acto
 *     explícito de una persona.
 *  2. Nada sale del dispositivo. El texto y los adjuntos se procesan en el
 *     navegador. No hay API externa ni modelo de lenguaje: es información
 *     clínica y no se envía a terceros.
 *  3. No se pide ningún ámbito OAuth. Esta ruta funciona sin haber autorizado
 *     nada, incluso sin sesión de Google.
 */

import type { FamilyMember, ImportedEmailAppointmentCandidate } from '../domain/models';
import { parseAppointmentEmail } from './analizadorCitaTexto';

// ─────────────────────────────────────────────────────────────────────────────
// Ámbitos OAuth · lista cerrada
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los únicos ámbitos que la aplicación puede pedir.
 *
 * `gmail.readonly` NO está y no debe volver: es un ámbito RESTRINGIDO, y
 * publicar con él obliga a una evaluación de seguridad CASA anual y de pago.
 * Hay una prueba que falla si alguien lo reintroduce.
 */
export const SCOPES_PERMITIDOS = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export const SCOPE_PROHIBIDO_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';

/** ¿Es este ámbito uno de los permitidos? */
export function scopePermitido(scope: string): boolean {
  return (SCOPES_PERMITIDOS as readonly string[]).includes(scope);
}

/** Valida una cadena de ámbitos separados por espacios (la forma de GIS). */
export function scopesPermitidos(cadena: string): boolean {
  const partes = cadena.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return false;
  return partes.every(scopePermitido);
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuración: Client ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Antes había un Client ID incrustado como valor por defecto. Eso ataba el
 * binario a un proyecto de GCP concreto y, peor, convertía una configuración
 * ausente en un fallo silencioso: la aplicación intentaba autenticar contra un
 * proyecto ajeno en vez de decir que le falta configuración.
 */
export function clientIdConfigurado(valor: string | undefined | null): boolean {
  return typeof valor === 'string' && valor.trim().length > 0;
}

export const MENSAJE_SIN_CLIENT_ID =
  'Falta configurar el identificador de cliente de Google. La aplicación no ' +
  'puede iniciar sesión hasta que se defina NEXT_PUBLIC_GOOGLE_CLIENT_ID.';

// ─────────────────────────────────────────────────────────────────────────────
// Adjuntos
// ─────────────────────────────────────────────────────────────────────────────

/** 8 MB: un PDF de EPS o una captura de pantalla caben de sobra. */
export const TAMANO_MAXIMO_ADJUNTO = 8 * 1024 * 1024;

/** Tipos que se aceptan como adjunto de un borrador. */
export const TIPOS_ADJUNTO_ACEPTADOS = [
  'text/plain',
  'message/rfc822',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/**
 * De estos se saca el texto aquí mismo, sin ninguna biblioteca.
 *
 * Los PDF NO están en la lista porque los atiende `extraerTextoPdf`, que sí
 * necesita pdf.js. Las imágenes tampoco, y esas no las atiende nadie: haría
 * falta OCR.
 */
export const TIPOS_CON_TEXTO_LEGIBLE = ['text/plain', 'message/rfc822'] as const;

export type MotivoRechazoAdjunto = 'TIPO_NO_ACEPTADO' | 'DEMASIADO_GRANDE' | 'VACIO';

export type ResultadoAdjunto =
  | { ok: true; extraible: boolean }
  | { ok: false; motivo: MotivoRechazoAdjunto };

export interface AdjuntoLike {
  name: string;
  type: string;
  size: number;
}

/**
 * Decide si un archivo se admite y si su texto puede leerse aquí.
 *
 * `extraible: false` NO es un rechazo ni significa que no se pueda leer: un
 * PDF sale por la ruta de `extraerTextoPdf`. Solo las imágenes se quedan sin
 * lectura automática, porque haría falta OCR.
 */
export function validarAdjunto(archivo: AdjuntoLike): ResultadoAdjunto {
  if (!archivo.size) return { ok: false, motivo: 'VACIO' };
  if (archivo.size > TAMANO_MAXIMO_ADJUNTO) return { ok: false, motivo: 'DEMASIADO_GRANDE' };
  if (!(TIPOS_ADJUNTO_ACEPTADOS as readonly string[]).includes(archivo.type)) {
    return { ok: false, motivo: 'TIPO_NO_ACEPTADO' };
  }
  return {
    ok: true,
    extraible: (TIPOS_CON_TEXTO_LEGIBLE as readonly string[]).includes(archivo.type),
  };
}

/** Mensajes de rechazo. Nunca incluyen el contenido del archivo. */
export function mensajeRechazoAdjunto(motivo: MotivoRechazoAdjunto): string {
  switch (motivo) {
    case 'VACIO':
      return 'El archivo está vacío.';
    case 'DEMASIADO_GRANDE':
      return 'El archivo supera los 8 MB.';
    case 'TIPO_NO_ACEPTADO':
      return 'Solo se aceptan PDF, imágenes (PNG, JPG, WebP) o texto.';
  }
}

/** Aviso honesto cuando el archivo se adjunta pero su texto no puede leerse. */
export const AVISO_ADJUNTO_NO_EXTRAIBLE =
  'Este archivo se adjuntó, pero su texto no puede leerse automáticamente. ' +
  'Completa los datos de la cita a mano.';

// ─────────────────────────────────────────────────────────────────────────────
// Creación del borrador
// ─────────────────────────────────────────────────────────────────────────────

/** Longitud del extracto que se guarda para que la persona reconozca el origen. */
const LARGO_EXTRACTO = 240;

export interface OpcionesBorrador {
  /** Marca de tiempo, inyectable para poder probar sin reloj real. */
  ahora?: number;
  /** Sufijo del identificador, inyectable por la misma razón. */
  sufijo?: string;
  /** Nombre del archivo adjunto, si lo hubo. */
  nombreAdjunto?: string | null;
}

/**
 * Convierte texto pegado en un candidato PENDIENTE DE REVISIÓN.
 *
 * El estado es SIEMPRE `PENDING_REVIEW`, pase lo que pase con el análisis.
 * Ni siquiera un texto perfectamente reconocido crea una cita: esa decisión
 * es de la persona, no del analizador.
 */
export function crearBorradorDesdeTexto(
  texto: string,
  miembros: FamilyMember[],
  opciones: OpcionesBorrador = {},
): ImportedEmailAppointmentCandidate | null {
  const limpio = (texto ?? '').trim();
  if (!limpio) return null;

  const ahora = opciones.ahora ?? Date.now();
  const sufijo = opciones.sufijo ?? Math.random().toString(36).substring(2, 7);
  const iso = new Date(ahora).toISOString();

  const analisis = parseAppointmentEmail('', limpio, miembros);

  return {
    id: `cand-manual-${ahora}-${sufijo}`,
    // Origen del texto. `MANUAL` marca que nadie leyó ningún buzón.
    sourceEmail: 'MANUAL',
    // El nombre del campo se conserva para no migrar los candidatos ya
    // guardados. Con origen manual lleva un identificador sintético, nunca
    // un identificador de mensaje de Gmail.
    gmailMessageId: `manual-${ahora}-${sufijo}`,
    subject: opciones.nombreAdjunto || 'Texto pegado',
    receivedAt: iso,
    rawSnippet: limpio.slice(0, LARGO_EXTRACTO),
    detectedPatientName: analisis.detectedPatientName,
    detectedDate: analisis.detectedDate,
    detectedTime: analisis.detectedTime,
    detectedDoctor: analisis.detectedDoctor,
    detectedSpecialty: analisis.detectedSpecialty,
    detectedLocation: analisis.detectedLocation,
    confidence: analisis.confidence,
    status: 'PENDING_REVIEW',
    createdAt: iso,
    updatedAt: iso,
  };
}

/** ¿Este candidato nació de una importación manual? */
export function esOrigenManual(c: { sourceEmail?: string | null }): boolean {
  return c.sourceEmail === 'MANUAL';
}

/**
 * ¿Puede este borrador convertirse en cita?
 *
 * Exige familiar, fecha y hora. Sin eso la cita quedaría a medias, y es
 * preferible que la persona complete el borrador a crear un registro clínico
 * incompleto.
 */
export function puedeConfirmarse(borrador: {
  memberId?: string | null;
  detectedDate?: string | null;
  detectedTime?: string | null;
}): boolean {
  return Boolean(borrador.memberId && borrador.detectedDate && borrador.detectedTime);
}

/** Faltantes concretos, para decirle a la persona qué le falta. */
export function camposFaltantes(borrador: {
  memberId?: string | null;
  detectedDate?: string | null;
  detectedTime?: string | null;
}): string[] {
  const faltan: string[] = [];
  if (!borrador.memberId) faltan.push('familiar');
  if (!borrador.detectedDate) faltan.push('fecha');
  if (!borrador.detectedTime) faltan.push('hora');
  return faltan;
}
