/**
 * Los tipos del acceso familiar (Bloque G, G4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vivían en `firestoreService.ts`, entre 2 206 líneas de consultas a Firestore.
 * Al retirar Firebase había que decidir: arrastrarlos con él, o quedárselos.
 *
 * Se quedan, porque **describen el dominio y no la base de datos**: qué rol
 * tiene alguien, qué pacientes puede ver, si su invitación sigue en pie. Eso
 * sigue siendo verdad con la hoja de cálculo detrás.
 *
 * LO QUE TODAVÍA HUELE A FIRESTORE
 * ────────────────────────────────
 * Los nombres. `familyId` era el documento de Firestore y aquí la familia **es
 * la hoja**; `acceptedByUid` era el UID de Firebase Auth, que ya no existe.
 * Se conservan tal cual **a propósito**: renombrarlos ahora tocaría
 * `AppContext` entero en el mismo paso que retira Firebase, y entonces un
 * fallo no diría cuál de las dos cosas lo causó.
 *
 * Queda anotado como deuda, no como descuido.
 */

/** Roles del contrato de la PWA. El router los traduce a los suyos (G0). */
export type FamilyRole = 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER';

/** Qué puede ver y hacer alguien dentro de una familia. */
export interface FamilyAccess {
  familyId: string;
  role: FamilyRole;
  /** El paciente propio, para el rol de miembro. */
  memberId: string | null;
  /** Los pacientes asignados, para el rol de cuidador. */
  assignedMemberIds: string[];
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  createdAt: string;
  acceptedAt: string | null;
}

/**
 * Una invitación.
 *
 * `token` aquí es el identificador de la invitación, no el secreto del correo:
 * ese lo genera el backend en E7, viaja solo por el mensaje y **nunca vuelve**
 * en una respuesta.
 */
export interface FamilyInvitation {
  id: string;
  familyId: string;
  /** Normalizado a minúsculas. */
  invitedEmail: string;
  invitedMemberId: string;
  role: FamilyRole;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUid: string | null;
  createdBy: string;
}

/**
 * Los ajustes de la familia.
 *
 * Los seis campos de Gmail son de E11 y hoy se escriben inertes; el Bloque B
 * retiró el escaneo por completo. El único vivo es
 * `gmailOnlyFutureAppointments`, que usa la importación manual.
 */
export interface FamilySettings {
  gmailAutoScanEnabled: boolean;
  /** `HH:mm`. */
  gmailScanTime: string;
  gmailScanRangeDays: number;
  gmailOnlyFutureAppointments: boolean;
  lastGmailScanAt: string | null;
  nextGmailScanAt: string | null;
  driveSyncEnabled: boolean;
  calendarSyncEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}
