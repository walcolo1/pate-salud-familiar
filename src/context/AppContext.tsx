'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
// ── DataRepository abstraction (Phase 8) ─────────────────────────────────────
import { arrancarIdentidad } from '../lib/identidadGis';
import { conectarSondeo, ventanaDelNavegador } from '../lib/sondeoRevision';
import { comprobarYRegistrar, type ResultadoRegistro } from '../lib/registroBackend';
import { sesionBackend } from '../lib/identidad';
import { decodeGoogleToken } from '../lib/googleAuth';
import { clientIdConfigurado } from '../lib/importacionManual';
import { getDataRepository, resetDataRepository } from '../lib/dataRepository';
import type { DataUpdate, RepositoryContext } from '../lib/dataRepository';
import type { FamilyInvitation, FamilyAccess } from '../lib/tiposAcceso';

import { 
  UserAccount, 
  FamilyGroup, 
  FamilyMember, 
  HealthProfile, 
  MedicalAppointment, 
  PeriodicCheckup, 
  VaccineRecord, 
  MedicalExam, 
  ExamResult, 
  ClinicalDocument, 
  MedicalHistoryEvent, 
  Reminder, 
  FollowUpTask,
  ReminderStatus,
  TaskStatus,
  HealthEventStatus,
  LastExportMetadata,
  MemberPermissions,
  SharedMemberReport,
  AppointmentEmailSource,
  ImportedEmailAppointmentCandidate,
  MedicalOrder,
  MedicationPrescription,
  MedicationDoseReminder,
  DoseReminderStatus,
  DataIntegrityReport
} from '../domain/models';
import { 
  mockUser, 
  mockFamilyGroup, 
  mockMembers, 
  mockHealthProfiles, 
  mockAppointments, 
  mockCheckups, 
  mockVaccines, 
  mockExams, 
  mockExamResults, 
  mockDocuments, 
  mockHistory, 
  mockReminders, 
  mockTasks 
} from '../data/mockData';
import { MENSAJE_ILEGIBLE } from '../lib/lecturaExpediente';
import {
  validarHistorialVet,
  validarMascota,
  validarPeso,
  validarVacunaMascota,
  type TipoHistorialVet,
  type BorradorMascota,
  type MedicalHistoryEntry as EntradaHistorialVet,
  type Pet,
  type VaccineEntry as VacunaMascota,
  type Validacion,
  type WeightEntry as PesoMascota,
} from '../domain/mascotas';
import {
  generarDosis,
  reprogramarDosis,
  type ContextoDosis,
  type Pauta,
  type ResultadoReprogramacion,
} from '../lib/pautaMedicacion';
import { loadAppStateDetallado } from '../data/persistence';
import { loadAppState, saveAppState, clearAppState, exportDataAsJSON, getActiveUser, setActiveUser, SavedAppState } from '../data/persistence';
import {
  leerPreferencias,
  guardarPreferencias,
  migrarPreferenciasDesdeEstado,
} from '../lib/preferencias';
import { purgarPersistenciaLocal } from '../lib/purgaLocal';
import {
  purgarCacheFirestore,
  ejecutarPurgaDiferidaSiProcede,
  hayPurgaPendiente,
} from '../lib/purgaFirestore';
import {
  reducirCierre,
  ESTADO_CIERRE_INICIAL,
  type EstadoCierre,
  type AccionCierre,
} from '../lib/cierreSesion';
import {
  CLAVES_ESTADO_CLINICO,
  decidirArranque,
  estaEnVentanaNocturna,
  minutosDelDia,
  leerMarcadorBloqueo,
  escribirMarcadorBloqueo,
  borrarMarcadorBloqueo,
  superoUmbralBloqueo,
} from '../lib/bloqueoSesion';
import {
  type OrigenDatos,
  origenDe,
  origenDeEstado,
  validarImportacion,
  type ResultadoImportacion,
} from '../lib/origenDatos';
import { requestDrivePermission, resolveDrivePath, uploadFile, shareFileWithUser, revokeFileShare } from '../lib/googleDrive';
import { requestCalendarPermission, createCalendarEvent, createMedicationDoseCalendarEvent } from '../lib/googleCalendar';
import { requestSheetsPermission, exportFamilyHealthWorkbook } from '../lib/googleSheets';
import { 
  findConfigInAppData, 
  readConfigFromAppData, 
  writeConfigToAppData 
} from '../lib/googleAppData';
import { 
  createOperationalSpreadsheet, 
  readAllOperationalTables, 
  writeAllOperationalTables,
  createIndividualMemberReport,
  migrateOperationalSheetHeaders
} from '../lib/googleSheetsOperational';
import {
  ensureOperationalToken,
  ensureDriveToken,
  ensureCalendarToken,
  invalidateAllTokens,
  getOperationalTokenIfValid,
  isOperationalTokenValid,
  hasAnyValidToken,
  getTokenRemainingMinutes,
  ensureAllRequiredTokens,
} from '../lib/googleTokenManager';
import {
  crearBorradorDesdeTexto,
} from '../lib/importacionManual';
import {
  parseAppointmentEmail,
} from '../lib/analizadorCitaTexto';
import { useConfirmacion } from './Confirmacion';
import { useAviso } from './Avisos';

/**
 * Bloque B · Sin valor por defecto incrustado.
 *
 * Un Client ID de reserva hacía que una configuración ausente pareciera
 * funcionar, autenticando contra un proyecto de Google Cloud ajeno. Ahora
 * queda vacío y cada llamante debe comprobarlo antes de pedir nada.
 */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const sanitizeRemoteAppointment = (appt: any): MedicalAppointment => {
  const doctorName = appt.doctorName || appt.doctor || 'Médico';
  const doctor = appt.doctor || doctorName;
  
  // Reconstruct scheduledAt if missing but date & time exist
  let scheduledAt = appt.scheduledAt;
  if (!scheduledAt && appt.date && appt.time) {
    scheduledAt = `${appt.date}T${appt.time}`;
  }
  
  return {
    ...appt,
    doctorName,
    doctor,
    scheduledAt,
    documentIds: appt.documentIds || [],
    syncStatus: appt.syncStatus || 'SYNCED',
    calendarSyncStatus: appt.calendarSyncStatus || 'LOCAL_ONLY',
    retentionStatus: appt.retentionStatus || 'ACTIVE',
    deletedAt: appt.deletedAt || null
  };
};

export const MUST_PULL_BEFORE_PUSH_MS = 5 * 60 * 1000;

export const mergeMemberSafely = (localMember: FamilyMember, remoteMember: FamilyMember): FamilyMember => {
  const localUpdate = localMember.updatedAt ? new Date(localMember.updatedAt).getTime() : 0;
  const remoteUpdate = remoteMember.updatedAt ? new Date(remoteMember.updatedAt).getTime() : 0;

  // Determinar cuál es el base (última escritura gana)
  const baseMember = remoteUpdate > localUpdate ? { ...remoteMember } : { ...localMember };

  // Manejar eliminación lógica de forma explícita
  const localDeleted = !!localMember.deletedAt || localMember.status === 'DELETED';
  const remoteDeleted = !!remoteMember.deletedAt || remoteMember.status === 'DELETED';

  if (localDeleted || remoteDeleted) {
    const localDelTime = localMember.deletedAt ? new Date(localMember.deletedAt).getTime() : (localMember.status === 'DELETED' ? localUpdate : 0);
    const remoteDelTime = remoteMember.deletedAt ? new Date(remoteMember.deletedAt).getTime() : (remoteMember.status === 'DELETED' ? remoteUpdate : 0);
    
    const maxDelTime = Math.max(localDelTime, remoteDelTime);
    const maxUpdateTime = Math.max(localUpdate, remoteUpdate);
    
    if (maxDelTime >= maxUpdateTime || (localDeleted && !remoteDeleted && localUpdate >= remoteUpdate) || (remoteDeleted && !localDeleted && remoteUpdate >= localUpdate)) {
      baseMember.status = 'DELETED';
      baseMember.deletedAt = localDelTime > remoteDelTime ? (localMember.deletedAt || localMember.updatedAt) : (remoteMember.deletedAt || remoteMember.updatedAt);
    }
  }

  // Proteger documentType y documentNumber:
  const localDocNum = localMember.documentNumber?.trim();
  const localDocType = localMember.documentType?.trim();
  const remoteDocNum = remoteMember.documentNumber?.trim();
  const remoteDocType = remoteMember.documentType?.trim();

  const hasLocalDoc = !!(localDocNum && localDocNum !== '');
  const hasRemoteDoc = !!(remoteDocNum && remoteDocNum !== '');

  let finalDocNumber = baseMember.documentNumber;
  let finalDocType = baseMember.documentType;

  if (hasLocalDoc && !hasRemoteDoc) {
    // Si local tiene documento y remoto viene vacío, conservar local.
    finalDocNumber = localMember.documentNumber;
    finalDocType = localMember.documentType;
  } else if (hasRemoteDoc && !hasLocalDoc) {
    // Si remoto tiene documento y local viene vacío, conservar remoto.
    finalDocNumber = remoteMember.documentNumber;
    finalDocType = remoteMember.documentType;
  } else if (hasLocalDoc && hasRemoteDoc) {
    if (localDocNum !== remoteDocNum) {
      // Si ambos tienen documento diferente, gana el de updatedAt más reciente.
      if (remoteUpdate > localUpdate) {
        finalDocNumber = remoteMember.documentNumber;
        finalDocType = remoteMember.documentType;
      } else {
        finalDocNumber = localMember.documentNumber;
        finalDocType = localMember.documentType;
      }
    }
  }

  // Nunca sobrescribir documentType o documentNumber con null, undefined o ""
  if (!finalDocNumber || finalDocNumber.trim() === '') {
    if (hasLocalDoc) {
      finalDocNumber = localMember.documentNumber;
      finalDocType = localMember.documentType;
    } else if (hasRemoteDoc) {
      finalDocNumber = remoteMember.documentNumber;
      finalDocType = remoteMember.documentType;
    }
  }

  if (finalDocNumber && (!finalDocType || finalDocType.trim() === '')) {
    if (localDocNum === finalDocNumber && localDocType) {
      finalDocType = localMember.documentType;
    } else if (remoteDocNum === finalDocNumber && remoteDocType) {
      finalDocType = remoteMember.documentType;
    }
  }

  baseMember.documentNumber = finalDocNumber;
  baseMember.documentType = finalDocType;

  return baseMember;
};

interface AppContextProps {
  user: UserAccount | null;
  familyGroup: FamilyGroup | null;
  members: FamilyMember[];
  healthProfiles: Record<string, HealthProfile>;
  appointments: MedicalAppointment[];
  checkups: PeriodicCheckup[];
  vaccines: VaccineRecord[];
  exams: MedicalExam[];
  examResults: Record<string, ExamResult[]>;
  documents: ClinicalDocument[];
  history: MedicalHistoryEvent[];
  reminders: Reminder[];
  tasks: FollowUpTask[];
  driveSyncEnabled: boolean;
  calendarSyncEnabled: boolean;
  isLoading: boolean;
  /**
   * C2 · Por qué NO se pudo abrir el expediente guardado, si es que pasó.
   *
   * `null` significa que la carga fue bien, no que no haya datos: un
   * expediente vacío es un caso normal y se distingue por `members.length`.
   */
  errorCarga: string | null;
  /** Vuelve a intentar la carga inicial que falló. */
  reintentarCarga: () => void;
  
  // Google Drive specific states
  driveAccessToken: string | null;
  driveStatus: 'disconnected' | 'connected' | 'connecting' | 'authorizing' | 'subiendo' | 'subido' | 'error';
  driveError: string | null;
  lastDriveAuthTime: string | null;

  // Google Calendar specific states
  calendarAccessToken: string | null;
  calendarStatus: 'disconnected' | 'connected' | 'connecting' | 'authorizing' | 'sincronizando' | 'sincronizado' | 'error';
  calendarError: string | null;
  lastCalendarAuthTime: string | null;

  // Google Sheets specific states
  sheetsAccessToken: string | null;
  sheetsStatus: 'disconnected' | 'connected' | 'connecting' | 'authorizing' | 'exportando' | 'exportado' | 'error';
  sheetsError: string | null;
  lastSheetsAuthTime: string | null;
  lastExportMetadata: LastExportMetadata | null;
  
  signIn: (googleUser?: Omit<UserAccount, 'id' | 'createdAt'>, idToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  addMember: (member: Omit<FamilyMember, 'id' | 'familyGroupId'>, customId?: string) => void;
  updateMember: (id: string, member: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => boolean;
  uploadMemberAvatar: (memberId: string, file: File, oldAvatarPath?: string | null) => Promise<{ url: string; path: string }>;
  deleteMemberAvatar: (avatarPath: string) => Promise<void>;
  saveHealthProfile: (memberId: string, profile: Partial<HealthProfile>) => void;
  addAppointment: (appt: Omit<MedicalAppointment, 'id' | 'documentIds'>) => void;
  updateAppointmentStatus: (id: string, status: HealthEventStatus) => void;
  addCheckup: (chk: Omit<PeriodicCheckup, 'id'>) => void;
  addVaccine: (vac: Omit<VaccineRecord, 'id'>) => void;
  addExam: (exam: Omit<MedicalExam, 'id' | 'documentIds'>, results: Omit<ExamResult, 'id' | 'examId' | 'recordedAt'>[]) => void;
  uploadDocument: (memberId: string, doc: { fileName: string; fileType: string; description?: string }, file?: File) => Promise<string>;
  deleteDocument: (id: string) => void;
  completeTask: (id: string) => void;
  toggleReminder: (id: string) => void;
  setDriveSync: (enabled: boolean) => void;
  setCalendarSync: (enabled: boolean) => void;
  exportToSheets: (memberId: string) => Promise<string>;
  
  // Google Drive Actions
  connectDrive: () => Promise<string | null>;

  // Google Calendar Actions
  connectCalendar: () => Promise<string | null>;
  syncAppointmentToCalendar: (apptId: string, customAppt?: MedicalAppointment, forcePopup?: boolean) => Promise<void>;

  // Google Sheets Actions
  connectSheets: () => Promise<string | null>;

  // Role Simulation and Inactivity/Retention Actions
  currentUserRole: 'FAMILY_ADMIN' | 'MEMBER_SELF' | 'VIEWER';
  currentMemberSelfId: string | null;
  simulatedRole: 'FAMILY_ADMIN' | 'MEMBER_SELF' | 'VIEWER' | null;
  simulatedEmail: string | null;
  setSimulatedRole: (role: 'FAMILY_ADMIN' | 'MEMBER_SELF' | 'VIEWER' | null) => void;
  setSimulatedEmail: (email: string | null) => void;
  inactivateMember: (id: string) => void;
  reactivateMember: (id: string) => void;
  runAppointmentRetentionCleanup: () => void;
  
  // Métodos de administración local y persistencia
  clearAllData: () => void;
  restoreDemoData: () => void;
  clearDemoData: () => void;
  exportState: () => void;

  // Capa Operacional Google-Native Foundation
  databaseSpreadsheetId: string | null;
  databaseSpreadsheetUrl: string | null;
  lastSyncAt: string | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
  deviceId: string | null;
  opSyncStatus: 'disconnected' | 'connected' | 'syncing' | 'synced' | 'error';
  opSyncError: string | null;
  createGoogleNativeDatabase: () => Promise<void>;
  pullFromGoogle: () => Promise<void>;
  pushToGoogle: () => Promise<void>;
  syncNow: () => Promise<void>;
  updateDeviceFromGoogle: () => Promise<void>;
  repairGoogleNativeDatabase: () => Promise<void>;
  exportBackupJSON: () => void;
  postLoginGoogleSetup: () => Promise<void>;
  requestInitialGooglePermissions: () => Promise<string | null>;
  ensureGoogleNativeReady: (silent?: boolean) => Promise<string>;
  autoCreateOrLoadGoogleNativeBase: (token: string) => Promise<{ exists: boolean }>;

  // Estado de inicialización automática Google-native
  syncInitStatus: 'idle' | 'checking' | 'loaded_from_google' | 'no_remote_data' | 'local_only' | 'error' | 'needs_auth' | 'pending_sync';
  syncInitMessage: string | null;

  // Auto-sync
  pendingSyncCount: number;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (v: boolean) => void;
  needsGoogleAuth: boolean;
  reconnectGoogle: () => Promise<void>;
  flushPendingSync: () => Promise<void>;
  checkForExistingDatabase: (explicitToken?: string, silent?: boolean) => Promise<boolean>;

  // Secure Google-Native Sharing Phase 3B
  sharedReports: SharedMemberReport[];
  shareDocumentWithMember: (documentId: string, email: string) => Promise<void>;
  revokeDocumentShare: (documentId: string) => Promise<void>;
  generateAndShareMemberReport: (memberId: string, email: string) => Promise<void>;
  revokeMemberReportShare: (reportId: string) => Promise<void>;

  // Importación de citas (Bloque B: manual, sin Gmail)
  emailSources: AppointmentEmailSource[];
  appointmentCandidates: ImportedEmailAppointmentCandidate[];
  addAppointmentCandidate: (candidate: ImportedEmailAppointmentCandidate) => void;
  updateAppointmentCandidate: (id: string, fields: Partial<ImportedEmailAppointmentCandidate>) => void;
  importAppointmentFromCandidate: (candidateId: string, memberId: string, customDetails: Partial<MedicalAppointment>) => Promise<void>;
  /**
   * Bloque B · Crea un borrador de cita a partir de texto pegado o adjunto.
   * No pide ningún ámbito OAuth, no toca la red y nunca crea la cita: el
   * candidato nace en PENDING_REVIEW y una persona debe confirmarlo.
   */
  crearCandidatoManual: (texto: string, nombreAdjunto?: string | null) => ImportedEmailAppointmentCandidate | null;
  /** Descartar citas ya pasadas al importar. Aplica a la importación manual. */
  gmailOnlyFutureAppointments: boolean;
  setGmailOnlyFutureAppointments: (v: boolean) => void;

  // Medical Orders & Prescription Medications
  medicalOrders: MedicalOrder[];
  medicationPrescriptions: MedicationPrescription[];
  medicationDoseReminders: MedicationDoseReminder[];

  // ── Bloque D · Mascotas ──────────────────────────────────────────────────
  pets: Pet[];
  petWeights: PesoMascota[];
  petVaccines: VacunaMascota[];
  petHistory: EntradaHistorialVet[];
  /** Crea una mascota. Devuelve la validación: si no es válida, no crea nada. */
  addPet: (borrador: BorradorMascota) => Validacion;
  /** Edita los datos básicos. No toca pesos, vacunas ni historial. */
  updatePet: (id: string, cambios: BorradorMascota) => Validacion;
  /** Marca activa o inactiva. NUNCA borra: el historial se conserva. */
  setPetActiva: (id: string, activa: boolean) => void;
  /**
   * D2 · Registra un pesaje. Devuelve la validación: si no es válida, no se
   * guarda nada.
   */
  addPetWeight: (entrada: { petId: string; fecha: string; pesoKg: number; nota?: string | null }) => Validacion;
  /** D3 · Registra una vacuna aplicada, con su refuerzo opcional. */
  addPetVaccine: (entrada: {
    petId: string;
    vacuna: string;
    fecha: string;
    proximaDosis?: string | null;
    laboratorio?: string | null;
    lote?: string | null;
    veterinario?: string | null;
  }) => Validacion;
  /** D4 · Registra una atención veterinaria ya ocurrida. */
  addPetHistory: (entrada: {
    petId: string;
    fecha: string;
    tipo: TipoHistorialVet;
    diagnostico: string;
    tratamiento?: string | null;
    veterinario?: string | null;
  }) => Validacion;
  addMedicalOrder: (order: Omit<MedicalOrder, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void;
  updateMedicalOrder: (id: string, fields: Partial<MedicalOrder>) => void;
  deleteMedicalOrder: (id: string) => void;
  createAppointmentFromOrder: (orderId: string, apptData: Omit<MedicalAppointment, 'id' | 'documentIds' | 'medicalOrderId'>) => void;
  addMedicationPrescription: (prescription: Omit<MedicationPrescription, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void;
  updateMedicationPrescription: (id: string, fields: Partial<MedicationPrescription>) => void;
  deleteMedicationPrescription: (id: string) => void;
  markDoseReminder: (reminderId: string, status: DoseReminderStatus, takenAt?: string | null) => void;
  generateDoseReminders: (prescription: MedicationPrescription) => MedicationDoseReminder[];
  /** C3.4 · Cambia la pauta conservando el historial de tomas. */
  editarPautaMedicacion: (id: string, pauta: Pauta) => ResultadoReprogramacion | null;

  // Member document repair
  repairMemberDocuments: () => Promise<void>;

  // Session lock / inactivity
  sessionLocked: boolean;
  sessionLockedAt: string | null;
  autoLockEnabled: boolean;
  autoLockMinutes: number;
  nightLockEnabled: boolean;
  nightLockStart: string;
  nightLockEnd: string;
  /** A6-F3 · Restaura en sitio; es asincrona porque la restauracion lo es. */
  unlockSession: () => Promise<void>;
  /** A6-F3 · Fase del bloqueo, para que la interfaz diga la verdad. */
  estadoBloqueo: 'abierto' | 'bloqueado' | 'restaurando' | 'error_restauracion';
  errorRestauracion: string | null;
  /** A6-F3 · REAL o DEMO. Gobierna las guardas de sincronizacion. */
  origenDatos: OrigenDatos;
  setAutoLockEnabled: (v: boolean) => void;
  setAutoLockMinutes: (m: number) => void;
  setNightLockEnabled: (v: boolean) => void;
  setNightLockStart: (t: string) => void;
  setNightLockEnd: (t: string) => void;
  validateDataIntegrity: () => DataIntegrityReport;
  importBackupJSON: (data: SavedAppState) => ResultadoImportacion;
  /**
   * Si esta aplicación guarda **cuando el usuario lo pide** y no a cada cambio.
   *
   * Era `isFirebaseBackend`, y la pregunta que de verdad hacían las pantallas
   * no era «¿qué base de datos hay detrás?» sino «¿tengo que enseñar el botón
   * de sincronizar y el contador de pendientes?». Con Firebase retirado, ese es
   * el único concepto que quedaba vivo, así que se llama por su nombre.
   *
   * Hoy **sí**: el camino de la hoja sigue empujando por lotes. Pasa a `false`
   * cuando el repositorio escriba por mutación, y entonces esta interfaz
   * sobrará entera.
   */
  sincronizacionManual: boolean;
  /**
   * La hoja cambió desde que se cargó esta copia (G2).
   *
   * No se recarga solo: recargar tira lo que el usuario estuviera escribiendo,
   * y en un expediente clínico eso es peor que enseñar un dato de hace un
   * minuto. Se avisa y decide quien está delante.
   */
  hayCambiosRemotos: boolean;
  /** Trae lo nuevo y baja el aviso. */
  recargarExpediente: () => Promise<void>;
  /**
   * Si este navegador sabe dónde está la hoja de la familia.
   *
   * Sin ella, ningún cambio llega a ninguna parte: se guarda para reenviarlo,
   * pero no hay adónde. Es lo que dejó vacía la hoja en la validación en vivo
   * de G4b, y por eso se enseña en voz alta y no se deduce de un contador.
   */
  hojaRegistrada: boolean;
  /** Comprueba la URL del `/exec` con `ping` y, si cuadra, la guarda. */
  registrarHojaFamiliar: (url: string) => Promise<ResultadoRegistro>;
  familyId: string | null;
  pendingInvitations: FamilyInvitation[];
  invitations: FamilyInvitation[];
  createInvitation: (email: string, memberId: string, role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER') => Promise<string>;
  acceptInvitation: (targetFamilyId: string, invitationId: string) => Promise<void>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  createNewFamily: (name: string) => Promise<void>;
  checkPendingInvitations: () => Promise<FamilyInvitation[]>;

  // ── A6-F2 · Cierre de sesion seguro y purga local ────────────────────────
  /** Fase actual del flujo de cierre; gobierna el ConfirmDialog. */
  estadoCierre: EstadoCierre;
  /** Punto de entrada desde la interfaz. Decide si hace falta dialogo. */
  solicitarCierreDeSesion: () => void;
  /** Transiciones disparadas por los botones del dialogo. */
  despacharCierre: (accion: AccionCierre) => void;
  /** Reintenta enviar los cambios pendientes antes de cerrar. */
  reintentarSincronizacion: () => Promise<void>;
  /** Ejecuta la secuencia completa de limpieza. Usado tambien desde Ajustes. */
  cerrarSesionYPurgar: () => Promise<void>;
  /** La limpieza de la cache de Firestore quedo pendiente (otra pestana). */
  avisoPurgaDiferida: boolean;
  descartarAvisoPurgaDiferida: () => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

/**
 * G4b · la hoja ya no se empuja por lotes.
 *
 * Cada cambio sale solo, como una mutación contra el router, en el momento en
 * que ocurre. Las pantallas lo leen para dejar de ofrecer el botón de
 * «sincronizar todo», que ya no significa nada: no hay un expediente local
 * esperando a subirse.
 *
 * **Lo que sí sigue existiendo es un pendiente**, y es otra cosa: una escritura
 * concreta que no salió porque no había red. Esa se reenvía sola y la cuenta
 * `pendingSyncCount`.
 *
 * Queda como constante —y no borrada— mientras esas cuarenta condiciones sigan
 * en la interfaz: quitarlas es una limpieza de pantallas, no de backend, y
 * mezclarla aquí escondería este cambio dentro de un diff de JSX.
 */
const SINCRONIZACION_MANUAL = false;

export function AppProvider({ children }: { children: React.ReactNode }) {
  // C1.3b · Ambos proveedores envuelven a este en el layout, de modo que el
  // contexto puede preguntar y avisar sin recurrir a los cuadros del navegador.
  const confirmar = useConfirmacion();
  const avisar = useAviso();
  const [hayCambiosRemotos, setHayCambiosRemotos] = useState<boolean>(false);
  // Se lee al montar, no al renderizar: `localStorage` no existe en el
  // servidor y leerlo durante el render descuadraría la hidratación.
  const [hojaRegistrada, setHojaRegistrada] = useState<boolean>(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se sincroniza con un almacén externo al montar
    setHojaRegistrada(sesionBackend().url() !== null);
  }, []);

  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Cambiar este número vuelve a disparar el efecto de carga inicial.
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [healthProfiles, setHealthProfiles] = useState<Record<string, HealthProfile>>({});
  const [appointments, setAppointments] = useState<MedicalAppointment[]>([]);
  const [checkups, setCheckups] = useState<PeriodicCheckup[]>([]);
  const [vaccines, setVaccines] = useState<VaccineRecord[]>([]);
  const [exams, setExams] = useState<MedicalExam[]>([]);
  const [examResults, setExamResults] = useState<Record<string, ExamResult[]>>({});
  const [documents, setDocuments] = useState<ClinicalDocument[]>([]);
  const [history, setHistory] = useState<MedicalHistoryEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [medicalOrders, setMedicalOrders] = useState<MedicalOrder[]>([]);
  const [medicationPrescriptions, setMedicationPrescriptions] = useState<MedicationPrescription[]>([]);
  const [medicationDoseReminders, setMedicationDoseReminders] = useState<MedicationDoseReminder[]>([]);
  // Bloque D · Mascotas.
  const [pets, setPets] = useState<Pet[]>([]);
  const [petWeights, setPetWeights] = useState<PesoMascota[]>([]);
  const [petVaccines, setPetVaccines] = useState<VacunaMascota[]>([]);
  const [petHistory, setPetHistory] = useState<EntradaHistorialVet[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<FamilyInvitation[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);

  // Refs to prevent React state stale closures during async sync/pull operations
  /**
   * El usuario de la sesión, para leerlo desde un efecto sin depender de él.
   *
   * G3b lo necesita: la renovación entrega una credencial cada hora y hay que
   * poder distinguirla de un inicio de sesión sin que el efecto se vuelva a
   * montar con cada cambio de usuario.
   */
  const usuarioActivoRef = useRef<UserAccount | null>(null);
  useEffect(() => {
    usuarioActivoRef.current = user;
  }, [user]);

  const membersRef = useRef<FamilyMember[]>(members);
  const healthProfilesRef = useRef<Record<string, HealthProfile>>(healthProfiles);
  const appointmentsRef = useRef<MedicalAppointment[]>(appointments);
  const checkupsRef = useRef<PeriodicCheckup[]>(checkups);
  const vaccinesRef = useRef<VaccineRecord[]>(vaccines);
  const examsRef = useRef<MedicalExam[]>(exams);
  const examResultsRef = useRef<Record<string, ExamResult[]>>(examResults);
  const documentsRef = useRef<ClinicalDocument[]>(documents);
  const historyRef = useRef<MedicalHistoryEvent[]>(history);
  const remindersRef = useRef<Reminder[]>(reminders);
  const tasksRef = useRef<FollowUpTask[]>(tasks);
  const medicalOrdersRef = useRef<MedicalOrder[]>(medicalOrders);
  const medicationPrescriptionsRef = useRef<MedicationPrescription[]>(medicationPrescriptions);
  const medicationDoseRemindersRef = useRef<MedicationDoseReminder[]>(medicationDoseReminders);

  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { healthProfilesRef.current = healthProfiles; }, [healthProfiles]);
  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);
  useEffect(() => { checkupsRef.current = checkups; }, [checkups]);
  useEffect(() => { vaccinesRef.current = vaccines; }, [vaccines]);
  useEffect(() => { examsRef.current = exams; }, [exams]);
  useEffect(() => { examResultsRef.current = examResults; }, [examResults]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { remindersRef.current = reminders; }, [reminders]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { medicalOrdersRef.current = medicalOrders; }, [medicalOrders]);
  useEffect(() => { medicationPrescriptionsRef.current = medicationPrescriptions; }, [medicationPrescriptions]);
  useEffect(() => { medicationDoseRemindersRef.current = medicationDoseReminders; }, [medicationDoseReminders]);

  // ── Importación de citas (Bloque B) ───────────────────────────────────────
  // Ya no hay token, ni estado de conexión, ni planificador: la aplicación no
  // lee ningún buzón. Solo quedan los candidatos y la preferencia de citas
  // futuras, que ahora aplica a la importación manual.
  const [emailSources, setEmailSources] = useState<AppointmentEmailSource[]>([]);
  const [appointmentCandidates, setAppointmentCandidates] = useState<ImportedEmailAppointmentCandidate[]>([]);
  const [gmailOnlyFutureAppointments, setGmailOnlyFutureAppointments] = useState<boolean>(true);

  const emailSourcesRef = useRef<AppointmentEmailSource[]>(emailSources);
  const appointmentCandidatesRef = useRef<ImportedEmailAppointmentCandidate[]>(appointmentCandidates);
  const gmailOnlyFutureRef = useRef<boolean>(gmailOnlyFutureAppointments);

  useEffect(() => { emailSourcesRef.current = emailSources; }, [emailSources]);
  useEffect(() => { appointmentCandidatesRef.current = appointmentCandidates; }, [appointmentCandidates]);
  useEffect(() => { gmailOnlyFutureRef.current = gmailOnlyFutureAppointments; }, [gmailOnlyFutureAppointments]);

  const [driveSyncEnabled, setDriveSyncEnabled] = useState<boolean>(true);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'authorizing' | 'subiendo' | 'subido' | 'error'>('disconnected');
  const [driveError, setDriveError] = useState<string | null>(null);
  const [lastDriveAuthTime, setLastDriveAuthTime] = useState<string | null>(null);

  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState<boolean>(true);
  const [calendarAccessToken, setCalendarAccessToken] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'authorizing' | 'sincronizando' | 'sincronizado' | 'error'>('disconnected');
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [lastCalendarAuthTime, setLastCalendarAuthTime] = useState<string | null>(null);

  const [sheetsAccessToken, setSheetsAccessToken] = useState<string | null>(null);
  const [sheetsStatus, setSheetsStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'authorizing' | 'exportando' | 'exportado' | 'error'>('disconnected');
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [lastSheetsAuthTime, setLastSheetsAuthTime] = useState<string | null>(null);
  const [lastExportMetadata, setLastExportMetadata] = useState<LastExportMetadata | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<'FAMILY_ADMIN' | 'MEMBER_SELF' | 'VIEWER' | null>(null);
  const [simulatedEmail, setSimulatedEmail] = useState<string | null>(null);

  // Capa Operacional Google-Native Foundation States
  const [databaseSpreadsheetId, setDatabaseSpreadsheetId] = useState<string | null>(null);
  const [databaseSpreadsheetUrl, setDatabaseSpreadsheetUrl] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [lastPushAt, setLastPushAt] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [opSyncStatus, setOpSyncStatus] = useState<'disconnected' | 'connected' | 'syncing' | 'synced' | 'error'>('disconnected');
  const [opSyncError, setOpSyncError] = useState<string | null>(null);
  const [syncStrategy, setSyncStrategy] = useState<string>('LAST_WRITE_WINS');
  const [lastKnownRevision, setLastKnownRevision] = useState<number>(0);
  const [appDataFileId, setAppDataFileId] = useState<string | null>(null);
  const [sharedReports, setSharedReports] = useState<SharedMemberReport[]>([]);

  // Estado de inicialización automática desde Google al hacer login
  const [syncInitStatus, setSyncInitStatus] = useState<'idle' | 'checking' | 'loaded_from_google' | 'no_remote_data' | 'local_only' | 'error' | 'needs_auth' | 'pending_sync'>('idle');
  const [syncInitMessage, setSyncInitMessage] = useState<string | null>(null);

  // Auto-sync
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  /**
   * Las escrituras que no salieron por un fallo pasajero.
   *
   * Son las mismas mutaciones, guardadas para reenviarlas tal cual. No hay
   * fusión ni resolución de conflictos: la hoja solo anexa, la última fila
   * manda, y una repetida dice lo mismo.
   */
  const escriturasPendientesRef = useRef<((repo: Awaited<ReturnType<typeof getDataRepository>>, ctx: RepositoryContext) => Promise<void>)[]>([]);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState<boolean>(false);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncInProgress = useRef<boolean>(false);

  // Session lock / inactivity states
  const [sessionLocked, setSessionLocked] = useState<boolean>(false);
  const [sessionLockedAt, setSessionLockedAt] = useState<string | null>(null);
  const [autoLockEnabled, setAutoLockEnabled] = useState<boolean>(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(15);
  const [nightLockEnabled, setNightLockEnabled] = useState<boolean>(false);
  const [nightLockStart, setNightLockStart] = useState<string>('22:00');
  const [nightLockEnd, setNightLockEnd] = useState<string>('06:00');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nightLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── A6 · Compuerta de escritura ──────────────────────────────────────────
  // El efecto de autoguardado se dispara ante CUALQUIER cambio de estado. Al
  // vaciar la memoria clínica —durante una purga (A6-F2) o un bloqueo de
  // sesión (A6-F3)— ese efecto escribiría el estado vacío sobre
  // pate-salud-state:{uid} y destruiría los cambios aún no sincronizados.
  // Esta bandera lo suspende; debe activarse ANTES de tocar el estado.
  const escrituraSuspendidaRef = useRef<boolean>(false);

  // Evita que el efecto de preferencias escriba los valores por defecto antes
  // de que la migración y la carga inicial hayan terminado.
  const preferenciasListasRef = useRef<boolean>(false);

  // ── A6-F2 · Purga diferida de la caché de Firestore ──────────────────────
  // El inicializador perezoso se evalúa DURANTE EL PRIMER RENDER, antes que
  // cualquier efecto. Mientras valga true, el arranque, la autenticación y los
  // watchers de Firestore quedan detenidos: clearIndexedDbPersistence solo
  // puede tener éxito si no hay ninguna suscripción viva.
  const [purgaDiferidaPendiente, setPurgaDiferidaPendiente] = useState<boolean>(
    () => (typeof window === 'undefined' ? false : hayPurgaPendiente()),
  );
  // Se muestra cuando la limpieza no pudo completarse (otra pestaña abierta).
  const [avisoPurgaDiferida, setAvisoPurgaDiferida] = useState<boolean>(false);

  // ── A6-F2 · Cierre de sesión ─────────────────────────────────────────────
  const [estadoCierre, setEstadoCierre] = useState<EstadoCierre>(ESTADO_CIERRE_INICIAL);
  // Guarda reentrante. Es un ref y no un estado a propósito: dos clics dentro
  // del mismo ciclo de render verían el mismo valor de estado y ambos pasarían.
  const cierreEnCursoRef = useRef<boolean>(false);
  // Espejos para leer el estado real desde manejadores y temporizadores, sin
  // quedar atrapados en un cierre lexico obsoleto.
  const estadoCierreRef = useRef<EstadoCierre>(ESTADO_CIERRE_INICIAL);
  const pendingSyncCountRef = useRef<number>(0);

  // ── A6-F3 · Bloqueo de sesion veraz ──────────────────────────────────────
  // Marca de inicio del bloqueo. Vive en memoria Y en el marcador persistente,
  // que solo contiene { bloqueado, bloqueadoDesde, origen }: ni un dato mas.
  const bloqueadoDesdeRef = useRef<number | null>(null);
  // Origen de la sesion. La guarda de DEMO se apoya en esto, no en la ausencia
  // de token: aunque hubiera token valido, las rutas de sincronizacion salen.
  const origenDatosRef = useRef<OrigenDatos>('DEMO');
  const [origenDatos, setOrigenDatos] = useState<OrigenDatos>('DEMO');
  const [estadoBloqueo, setEstadoBloqueo] = useState<'abierto' | 'bloqueado' | 'restaurando' | 'error_restauracion'>('abierto');
  const [errorRestauracion, setErrorRestauracion] = useState<string | null>(null);
  // Hasta que no se resuelve el marcador de bloqueo no se carga nada clinico.
  const [bloqueoArranqueResuelto, setBloqueoArranqueResuelto] = useState<boolean>(false);
  const autoLockEnabledRef = useRef<boolean>(false);
  const autoLockMinutesRef = useRef<number>(15);
  const nightLockEnabledRef = useRef<boolean>(false);
  const nightLockStartRef = useRef<string>('22:00');
  const nightLockEndRef = useRef<string>('06:00');
  const sessionLockedRef = useRef<boolean>(false);

  // ── Firebase DataRepository state (Phase 8) ─────────────────────────────────
  // familyId is null for the Sheets backend and is set on sign-in for Firebase.
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [currentUserFamilyAccess, setCurrentUserFamilyAccess] = useState<FamilyAccess | null>(null);
  const familyIdRef = useRef<string | null>(null);
  useEffect(() => { familyIdRef.current = familyId; }, [familyId]);
  // Holds the single unsubscribe function returned by watchAllFamilyData.
  const firebaseUnsubRef = useRef<(() => void) | null>(null);
  const firebaseInvitationsUnsubRef = useRef<(() => void) | null>(null);


  useEffect(() => { autoLockEnabledRef.current = autoLockEnabled; }, [autoLockEnabled]);
  useEffect(() => { autoLockMinutesRef.current = autoLockMinutes; }, [autoLockMinutes]);
  useEffect(() => { nightLockEnabledRef.current = nightLockEnabled; }, [nightLockEnabled]);
  useEffect(() => { nightLockStartRef.current = nightLockStart; }, [nightLockStart]);
  useEffect(() => { nightLockEndRef.current = nightLockEnd; }, [nightLockEnd]);
  useEffect(() => { sessionLockedRef.current = sessionLocked; }, [sessionLocked]);


  // ── A6-F2 · Purga diferida · PRIMER EFECTO DEL PROVEEDOR ─────────────────
  // Se declara ANTES que ningún otro para que React lo ejecute primero, y los
  // efectos que tocan Firestore (autenticación, watchAll, watchUserFamilyAccess
  // y la carga inicial) están además detenidos por `purgaDiferidaPendiente`.
  //
  // Si la purga se completa, `terminate()` deja la instancia de Firestore
  // inutilizable, así que hay que recargar: el marcador ya se borró, de modo
  // que la recarga no puede entrar en bucle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!purgaDiferidaPendiente) return;

    let cancelado = false;
    ejecutarPurgaDiferidaSiProcede()
      .then((resultado) => {
        if (cancelado) return;
        if (resultado === 'ok') {
          window.location.reload();
          return;
        }
        if (resultado === 'diferida') {
          // No se afirma que los datos se borraron: se avisa y se continúa.
          setAvisoPurgaDiferida(true);
        }
        setPurgaDiferidaPendiente(false);
      })
      .catch(() => {
        if (cancelado) return;
        setAvisoPurgaDiferida(true);
        setPurgaDiferidaPendiente(false);
      });

    return () => { cancelado = true; };
  }, [purgaDiferidaPendiente]);

  // ── A6-F3 · Arranque con marcador de bloqueo ─────────────────────────────
  // El bloqueo sobrevive a una recarga. Antes de cargar nada clínico hay que
  // resolver qué dice el marcador persistente.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (bloqueoArranqueResuelto) return;

    const decision = decidirArranque(leerMarcadorBloqueo(), Date.now());

    if (decision.accion === 'cerrar_sesion') {
      // Ocho horas o más bloqueada: se cierra con purga.
      void cerrarSesionYPurgar();
      return;
    }

    if (decision.accion === 'ir_a_login') {
      // Marcador ilegible. No se desbloquea ni se adivina: a iniciar sesión.
      // El marcador corrupto SÍ se borra, porque conservarlo dejaría la app en
      // un bucle de redirecciones del que no se puede salir.
      borrarMarcadorBloqueo();
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
        return;
      }
      setBloqueoArranqueResuelto(true);
      return;
    }

    if (decision.accion === 'seguir_bloqueado') {
      const lectura = leerMarcadorBloqueo();
      escrituraSuspendidaRef.current = true;
      sessionLockedRef.current = true;
      bloqueadoDesdeRef.current =
        lectura.estado === 'valido' ? lectura.marcador.bloqueadoDesde : Date.now();
      setSessionLocked(true);
      setSessionLockedAt(new Date(bloqueadoDesdeRef.current).toISOString());
      setEstadoBloqueo('bloqueado');
    }

    setBloqueoArranqueResuelto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueoArranqueResuelto]);

  // ── A6-F3 · Vigilancia del umbral de 8 horas ─────────────────────────────
  // Sin un setTimeout largo, que no sobrevive a una pestaña suspendida: se
  // comparan marcas de tiempo en cuatro momentos distintos.
  useEffect(() => {
    if (!sessionLocked) return;

    const comprobar = () => {
      if (superoUmbralBloqueo(bloqueadoDesdeRef.current, Date.now())) {
        void cerrarSesionYPurgar();
      }
    };

    const alVolverAVerse = () => {
      if (document.visibilityState === 'visible') comprobar();
    };

    window.addEventListener('focus', comprobar);
    document.addEventListener('visibilitychange', alVolverAVerse);
    const id = setInterval(comprobar, 60_000);
    comprobar();

    return () => {
      window.removeEventListener('focus', comprobar);
      document.removeEventListener('visibilitychange', alVolverAVerse);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLocked]);

  // ── A6-F1 · Preferencias no clínicas ─────────────────────────────────────
  // Se ejecuta ANTES del efecto de carga inicial (React respeta el orden de
  // declaración), de modo que el estado guardado pueda sobrescribir después
  // sin conflicto: tras la migración ambos orígenes coinciden.
  //
  // Este efecto NO borra nada. La purga es responsabilidad de A6-F2.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      migrarPreferenciasDesdeEstado();
      const prefs = leerPreferencias();
      setDriveSyncEnabled(prefs.driveSyncEnabled);
      setCalendarSyncEnabled(prefs.calendarSyncEnabled);
      setGmailOnlyFutureAppointments(prefs.gmailOnlyFutureAppointments);
      setAutoLockEnabled(prefs.autoLockEnabled);
      setAutoLockMinutes(prefs.autoLockMinutes);
      setNightLockEnabled(prefs.nightLockEnabled);
      setNightLockStart(prefs.nightLockStart);
      setNightLockEnd(prefs.nightLockEnd);
    } catch (e) {
      console.error('[AppContext] No se pudieron cargar las preferencias locales:', e);
    } finally {
      preferenciasListasRef.current = true;
    }
  }, []);

  // 1. Carga inicial controlada del LocalStorage (únicamente del lado del cliente)
  useEffect(() => {
    if (purgaDiferidaPendiente) return; // A6-F2: no arrancar sobre una caché por limpiar
    if (!bloqueoArranqueResuelto) return; // A6-F3: no cargar nada clínico antes de resolver el bloqueo

    // A6-F3 · La sesión arrancó bloqueada: se restaura la IDENTIDAD para que la
    // interfaz pueda mostrar la superposición, pero NINGÚN dato clínico. Estos
    // llegarán al desbloquear, desde el backend si el origen es REAL.
    if (sessionLockedRef.current) {
      try {
        const activo = getActiveUser();
        if (activo && activo !== 'demo') {
          setUser(activo);
        } else if (activo === 'demo') {
          const guardado = loadAppState('demo');
          if (guardado?.user) setUser(guardado.user);
        }
      } catch (e) {
        console.error('[AppContext] No se pudo restaurar la identidad tras el bloqueo:', e);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const activeUser = getActiveUser();
      
      if (activeUser) {
        const userEmailOrId = activeUser === 'demo' ? 'demo' : (activeUser.googleId || activeUser.email);
        const lectura = loadAppStateDetallado(userEmailOrId);
        // C2 · Un expediente ilegible NO es un expediente vacío. Antes ambos
        // llegaban aquí como `null` y la pantalla decía «aún no tienes
        // miembros registrados» sobre un historial clínico intacto y sin abrir.
        if (lectura.estado === 'ILEGIBLE') {
          setErrorCarga(MENSAJE_ILEGIBLE[lectura.motivo]);
          setIsLoading(false);
          return;
        }
        const savedState = lectura.estado === 'OK' ? (lectura.datos as unknown as SavedAppState) : null;
        
        if (savedState) {
          if (activeUser === 'demo') {
            setUser({
              ...mockUser,
              provider: 'mock',
              loggedAt: new Date().toISOString()
            });
          } else {
            setUser(activeUser);
          }
          
          // Sanitización y carga de miembros
          const sanitizedMembers = (savedState.members || []).map(m => ({
            ...m,
            status: m.status || 'ACTIVE'
          }));
          setMembers(sanitizedMembers);
          setHealthProfiles(savedState.healthProfiles || {});
          
          const sanitizedAppointments = (savedState.appointments || []).map(a => ({
            ...a,
            retentionStatus: a.retentionStatus || 'ACTIVE',
            completedAt: a.status === 'COMPLETED' && !a.completedAt ? a.scheduledAt : a.completedAt
          }));
          setAppointments(sanitizedAppointments);
          
          setCheckups(savedState.checkups || []);
          setVaccines(savedState.vaccines || []);
          setExams(savedState.exams || []);
          setExamResults(savedState.examResults || {});
          setDocuments(savedState.documents || []);
          setHistory(savedState.history || []);
          setReminders(savedState.reminders || []);
          setTasks(savedState.tasks || []);
          setMedicalOrders(savedState.medicalOrders || []);
          setMedicationPrescriptions(savedState.medicationPrescriptions || []);
          setMedicationDoseReminders(savedState.medicationDoseReminders || []);
          // Bloque D · Mascotas.
          setPets(savedState.pets || []);
          setPetWeights(savedState.petWeights || []);
          setPetVaccines(savedState.petVaccines || []);
          setPetHistory(savedState.petHistory || []);
          setSharedReports(savedState.sharedReports || []);
          setDriveSyncEnabled(savedState.driveSyncEnabled !== undefined ? savedState.driveSyncEnabled : true);
          setCalendarSyncEnabled(savedState.calendarSyncEnabled !== undefined ? savedState.calendarSyncEnabled : true);
          setLastExportMetadata(savedState.lastExportMetadata !== undefined ? savedState.lastExportMetadata : null);
          setSimulatedRole(savedState.simulatedRole !== undefined ? savedState.simulatedRole : null);
          setSimulatedEmail(savedState.simulatedEmail !== undefined ? savedState.simulatedEmail : null);

          // Gmail Import Loading
          const defaultSources: AppointmentEmailSource[] = [
            {
              id: 'source-default',
              email: 'noreply@informacion.saludsis.mil.co',
              label: 'Salud SIS (Defecto)',
              enabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ];
          setEmailSources(savedState.emailSources && savedState.emailSources.length > 0 ? savedState.emailSources : defaultSources);
          setAppointmentCandidates(savedState.appointmentCandidates || []);
          setGmailOnlyFutureAppointments(savedState.gmailOnlyFutureAppointments ?? true);

          // Capa Operacional
          setDatabaseSpreadsheetId(savedState.databaseSpreadsheetId || null);
          setDatabaseSpreadsheetUrl(savedState.databaseSpreadsheetUrl || null);
          setLastSyncAt(savedState.lastSyncAt || null);
          setLastPullAt(savedState.lastPullAt || null);
          setLastPushAt(savedState.lastPushAt || null);
          setSyncStrategy(savedState.syncStrategy || 'LAST_WRITE_WINS');
          setLastKnownRevision(savedState.lastKnownRevision || 0);
          setAppDataFileId(savedState.appDataFileId || null);
          
          let devId = savedState.deviceId;
          if (!devId && typeof window !== 'undefined') {
            devId = window.localStorage.getItem('pate_salud_device_id');
          }
          if (!devId) {
            devId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('pate_salud_device_id', devId);
            }
          }
          setDeviceId(devId);
        } else {
          // Inicializar como vacío si el archivo no existe (o demo si es demo)
          if (activeUser === 'demo') {
            setUser({
              ...mockUser,
              provider: 'mock',
              loggedAt: new Date().toISOString()
            });
            const sanitizedMockMembers = mockMembers.map(m => ({ ...m, status: 'ACTIVE' as const }));
            const sanitizedMockAppointments = mockAppointments.map(a => ({ ...a, retentionStatus: 'ACTIVE' as const }));
            setMembers(sanitizedMockMembers);
            setHealthProfiles(mockHealthProfiles);
            setAppointments(sanitizedMockAppointments);
            setCheckups(mockCheckups);
            setVaccines(mockVaccines);
            setExams(mockExams);
            setExamResults(mockExamResults);
            setDocuments(mockDocuments);
            setHistory(mockHistory);
            setReminders(mockReminders);
            setTasks(mockTasks);
            setDriveSyncEnabled(true);
            setCalendarSyncEnabled(true);
            setLastExportMetadata(null);
            setSimulatedRole(null);
            setSimulatedEmail(null);
            setSharedReports([]);
            setDatabaseSpreadsheetId(null);
            setDatabaseSpreadsheetUrl(null);
            setLastSyncAt(null);
            setLastPullAt(null);
            setLastPushAt(null);
            setSyncStrategy('LAST_WRITE_WINS');
            setLastKnownRevision(0);
            setAppDataFileId(null);
            setEmailSources([
              {
                id: 'source-default',
                email: 'noreply@informacion.saludsis.mil.co',
                label: 'Salud SIS (Defecto)',
                enabled: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ]);
            setAppointmentCandidates([]);
          } else {
            setUser(activeUser);
            setMembers([]);
            setHealthProfiles({});
            setAppointments([]);
            setCheckups([]);
            setVaccines([]);
            setExams([]);
            setExamResults({});
            setDocuments([]);
            setHistory([]);
            setReminders([]);
            setTasks([]);
            setSharedReports([]);
            setDriveSyncEnabled(true);
            setCalendarSyncEnabled(true);
            setLastExportMetadata(null);
            setSimulatedRole(null);
            setSimulatedEmail(null);
            setDatabaseSpreadsheetId(null);
            setDatabaseSpreadsheetUrl(null);
            setLastSyncAt(null);
            setLastPullAt(null);
            setLastPushAt(null);
            setSyncStrategy('LAST_WRITE_WINS');
            setLastKnownRevision(0);
            setAppDataFileId(null);
            setEmailSources([
              {
                id: 'source-default',
                email: 'noreply@informacion.saludsis.mil.co',
                label: 'Salud SIS (Defecto)',
                enabled: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ]);
            setAppointmentCandidates([]);
          }
          
          let devId = typeof window !== 'undefined' ? window.localStorage.getItem('pate_salud_device_id') : null;
          if (!devId) {
            devId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('pate_salud_device_id', devId);
            }
          }
          setDeviceId(devId);

          if (activeUser !== 'demo' && activeUser.provider === 'google') {
            setTimeout(() => {
              autoSyncOnLogin(activeUser);
            }, 500);
          }
        }
      } else {
        // No hay usuario activo (primer ingreso absoluto)
        // Iniciar en limpio y deslogueado (sin cargar mockData!)
        setUser(null);
        setMembers([]);
        setHealthProfiles({});
        setAppointments([]);
        setCheckups([]);
        setVaccines([]);
        setExams([]);
        setExamResults({});
        setDocuments([]);
        setHistory([]);
        setReminders([]);
        setTasks([]);
        setSharedReports([]);
        setDriveSyncEnabled(true);
        setCalendarSyncEnabled(true);
        setLastExportMetadata(null);
        setSimulatedRole(null);
        setSimulatedEmail(null);
        
        setDatabaseSpreadsheetId(null);
        setDatabaseSpreadsheetUrl(null);
        setLastSyncAt(null);
        setLastPullAt(null);
        setLastPushAt(null);
        setSyncStrategy('LAST_WRITE_WINS');
        setLastKnownRevision(0);
        setAppDataFileId(null);
        setEmailSources([
          {
            id: 'source-default',
            email: 'noreply@informacion.saludsis.mil.co',
            label: 'Salud SIS (Defecto)',
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
        setAppointmentCandidates([]);
        
        let devId = typeof window !== 'undefined' ? window.localStorage.getItem('pate_salud_device_id') : null;
        if (!devId) {
          devId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('pate_salud_device_id', devId);
          }
        }
        setDeviceId(devId);

      }

      // Registro del Service Worker para soporte PWA y Offline.
      //
      // C3.2 · Esto estaba dentro de `addEventListener('load')` a secas, y ese
      // evento YA HA OCURRIDO cuando React monta y llega hasta aquí. El oyente
      // se colgaba de un evento que no iba a volver a dispararse, así que el
      // Service Worker no se registraba nunca: ni la caché de la PWA ni, ahora,
      // los avisos. Se comprobó en el arnés: cero registros. Si la carga ya
      // terminó se registra en el acto; si no, se espera al evento.
      if ('serviceWorker' in navigator) {
        const registrar = () => {
          navigator.serviceWorker
            .register('/sw.js')
            .catch((err) => console.error('Error al registrar el Service Worker:', err));
        };
        if (document.readyState === 'complete') registrar();
        else window.addEventListener('load', registrar, { once: true });
      }
    } catch (e) {
      // C2 · Antes esto terminaba aquí: el fallo iba a la consola y la
      // aplicación seguía como si el expediente estuviera vacío.
      console.error('Error al cargar la persistencia local:', e);
      setErrorCarga(
        'No se pudo abrir el expediente guardado en este dispositivo. No se ha borrado nada.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [purgaDiferidaPendiente, bloqueoArranqueResuelto, intentoCarga]);

  /** C2 · Reintenta la carga inicial desde cero. */
  const reintentarCarga = useCallback(() => {
    setErrorCarga(null);
    setIsLoading(true);
    setIntentoCarga((n) => n + 1);
  }, []);

  // ── A6-F1 · Persistencia de preferencias ─────────────────────────────────
  // Clave propia, por dispositivo. Es lo único —junto al deviceId— que
  // sobrevivirá a la purga de A6-F2. La lista blanca de lib/preferencias.ts
  // garantiza que aquí no pueda colarse PHI ni ningún identificador.
  useEffect(() => {
    if (!preferenciasListasRef.current) return;   // aún no se ha cargado
    if (escrituraSuspendidaRef.current) return;   // purga o bloqueo en curso
    guardarPreferencias({
      driveSyncEnabled,
      calendarSyncEnabled,
      gmailOnlyFutureAppointments,
      autoLockEnabled,
      autoLockMinutes,
      nightLockEnabled,
      nightLockStart,
      nightLockEnd,
    });
  }, [
    driveSyncEnabled,
    calendarSyncEnabled,
    gmailOnlyFutureAppointments,
    autoLockEnabled,
    autoLockMinutes,
    nightLockEnabled,
    nightLockStart,
    nightLockEnd,
  ]);

  // 2. Reactividad de Autoguardado: Sincroniza cualquier cambio en caliente al LocalStorage
  useEffect(() => {
    if (escrituraSuspendidaRef.current) return; // A6: purga o bloqueo en curso — no sobrescribir el snapshot
    if (isLoading) return; // Evita sobreescribir con estados vacíos durante la carga inicial
    if (!user) return; // Evita guardar estados vacíos cuando no hay sesión activa (evita borrar demo en logout)
    
    const userEmailOrId = user.provider === 'google' ? (user.googleId || user.email) : 'demo';
    
    saveAppState({
      user,
      members,
      healthProfiles,
      appointments,
      checkups,
      vaccines,
      exams,
      examResults,
      documents,
      history,
      reminders,
      tasks,
      driveSyncEnabled,
      calendarSyncEnabled,
      lastExportMetadata,
      simulatedRole,
      simulatedEmail,
      databaseSpreadsheetId,
      databaseSpreadsheetUrl,
      lastSyncAt,
      lastPullAt,
      lastPushAt,
      syncStatus: opSyncStatus,
      syncError: opSyncError,
      deviceId,
      syncStrategy,
      lastKnownRevision,
      appDataFileId,
      sharedReports,
      emailSources,
      appointmentCandidates,
        // Bloque B · El escaneo de Gmail ya no existe. Estos campos se escriben
        // con su valor inerte para no cambiar el esquema ni forzar una
        // migración de datos ya guardados. Solo la preferencia de citas
        // futuras sigue viva, y la usa la importación manual.
      gmailAutoScanEnabled: false,
      gmailScanTime: '00:00',
      lastGmailScanAt: null,
      nextGmailScanAt: null,
      gmailScanRangeDays: 90,
      gmailOnlyFutureAppointments,
      medicalOrders,
      medicationPrescriptions,
      medicationDoseReminders,
      pets,
      petWeights,
      petVaccines,
      petHistory
    }, userEmailOrId);
  }, [
    user,
    members,
    healthProfiles,
    appointments,
    checkups,
    vaccines,
    exams,
    examResults,
    documents,
    history,
    reminders,
    tasks,
    driveSyncEnabled,
    calendarSyncEnabled,
    lastExportMetadata,
    simulatedRole,
    simulatedEmail,
    databaseSpreadsheetId,
    databaseSpreadsheetUrl,
    lastSyncAt,
    lastPullAt,
    lastPushAt,
    opSyncStatus,
    opSyncError,
    deviceId,
    syncStrategy,
    lastKnownRevision,
    appDataFileId,
    sharedReports,
    emailSources,
    appointmentCandidates,
    gmailOnlyFutureAppointments,
    medicalOrders,
    medicationPrescriptions,
    medicationDoseReminders,
    pets,
    petWeights,
    petVaccines,
    petHistory,
    isLoading
  ]);

  // Persist settings to Firebase when they change
  useEffect(() => {
    // G4 · los ajustes se guardan con el resto del expediente, por lotes.
    if (isLoading || !user || !currentUserFamilyAccess) return;

    // Check if the user has permission to write family settings (OWNER or CAREGIVER)
    const role = currentUserFamilyAccess.role;
    if (role !== 'OWNER' && role !== 'CAREGIVER') {
      console.warn(`[AppContext] Skipping settings persist because user role ${role} is not OWNER or CAREGIVER`);
      return;
    }
    
    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveSettings(ctx, {
        // Bloque B · El escaneo de Gmail ya no existe. Estos campos se escriben
        // con su valor inerte para no cambiar el esquema ni forzar una
        // migración de datos ya guardados. Solo la preferencia de citas
        // futuras sigue viva, y la usa la importación manual.
        gmailAutoScanEnabled: false,
        gmailScanTime: '00:00',
        gmailScanRangeDays: 90,
        gmailOnlyFutureAppointments,
        lastGmailScanAt: null,
        nextGmailScanAt: null,
      });
    });
  }, [
    gmailOnlyFutureAppointments,
    isLoading,
    user,
    currentUserFamilyAccess,
  ]);

  // Ejecutar limpieza de retención de citas al iniciar la app
  useEffect(() => {
    if (!isLoading) {
      runAppointmentRetentionCleanup();
    }
  }, [isLoading]);

  /**
   * G2 · el sondeo híbrido de revisión, encendido.
   *
   * La hoja no avisa cuando cambia, así que se pregunta: al volver a la
   * pestaña y cada 120 s **solo con ella delante**. Se consulta
   * `obtenerRevision`, que es la única acción del router que no lee la hoja.
   *
   * Ocho horas con la pestaña abierta son 240 peticiones al día: el 1,2 % de
   * las 20.000 de una cuenta gratuita.
   */
  useEffect(() => {
    if (!user) return;
    if (origenDatosRef.current === 'DEMO') return;

    const ventana = ventanaDelNavegador();
    if (!ventana) return;

    const { desconectar } = conectarSondeo(ventana, {
      obtenerRevision: async () => {
        const repo = await getDataRepository();
        const revision = await ((repo as { revision?: () => Promise<number> }).revision?.() ?? 0);

        // Si el router acaba de contestar, hay camino: es el momento de
        // reenviar lo que esperaba. Sin esto, «se reenviarán solos» era una
        // promesa que nadie cumplía —solo el diálogo de cierre reintentaba—.
        if (escriturasPendientesRef.current.length > 0) void flushPendingSync();

        return revision;
      },
      programar: (fn, ms) => setTimeout(fn, ms),
      cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      alCambiar: () => setHayCambiosRemotos(true),
      registrarFallo: (error) => {
        // Un sondeo que falla no puede interrumpir a nadie: se reintenta solo,
        // y si de verdad no hay sesión ya lo dice el aviso de identidad.
        console.warn('[AppContext] el sondeo de revisión falló:', error);
      },
    });

    // Volver a tener red es la otra señal de que se puede reenviar.
    const alVolverLaRed = () => {
      if (escriturasPendientesRef.current.length > 0) void flushPendingSync();
    };
    window.addEventListener('online', alVolverLaRed);

    return () => {
      window.removeEventListener('online', alVolverLaRed);
      desconectar();
    };
    // `flushPendingSync` se recrea en cada render; entrar aquí reiniciaría el
    // sondeo constantemente. Lee la cola por referencia, así que no se queda
    // con una copia vieja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /**
   * G3b · la sesión sin Firebase Auth.
   *
   * Es el equivalente de `onAuthStateChanged` para el camino del titular: un
   * solo propietario de GIS que, con `auto_select`, devuelve la credencial al
   * cargar. Sin esto, **un F5 cerraría la sesión**, porque la decisión de G3b
   * fue no guardar el `id_token` en ningún almacén del navegador.
   *
   * NO SE ENCIENDE EN `/invitacion`, Y NO ES UN DETALLE
   * ───────────────────────────────────────────────────
   * Esa ruta pide GIS **sin** reentrada automática: la invitación es para una
   * cuenta concreta y entrar con la que hubiera abierta es el error más
   * probable de todo el flujo —está comprobado en vivo—. Como el propietario
   * se comparte y lo fija el primero que llega, arrancar aquí la reentrada
   * automática volvería a abrir justo ese agujero.
   */
  useEffect(() => {
    if (purgaDiferidaPendiente) return;
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/invitacion')) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientIdConfigurado(clientId)) return;

    const identidad = arrancarIdentidad({
      clientId: String(clientId).trim(),
      alRecibirCredencial: (credencial) => {
        const perfil = decodeGoogleToken(credencial);
        if (!perfil) return;

        // Si ya hay sesión abierta con este mismo correo, esto es una
        // renovación y no un inicio: repetir `signIn` recargaría el expediente
        // entero cada hora.
        if (usuarioActivoRef.current?.email === perfil.email) return;

        void signIn(
          {
            googleId: perfil.sub,
            displayName: perfil.name,
            email: perfil.email,
            photoUrl: perfil.picture || null,
          },
          credencial,
        );
      },
    });

    return () => identidad.soltar();
    // `signIn` se recrea en cada render y no puede entrar aquí: reinicializaría
    // la identidad constantemente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purgaDiferidaPendiente]);

  /*
   * G4 · aquí vivía `onAuthStateChanged`.
   *
   * Sincronizaba el usuario de Firebase Auth con el estado de React y, de paso,
   * era lo que hacía que la sesión sobreviviera a una recarga. Lo sustituye el
   * arranque de identidad de G3b, unos efectos más arriba: un solo propietario
   * de GIS con `auto_select` y el `id_token` en memoria.
   */

  const signIn = async (googleUser?: Omit<UserAccount, 'id' | 'createdAt'>, idToken?: string) => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (googleUser) {
      const realUser: UserAccount = {
        id: `user-${googleUser.googleId || Date.now()}`,
        googleId: googleUser.googleId || null,
        displayName: googleUser.displayName,
        email: googleUser.email,
        photoUrl: googleUser.photoUrl || null,
        createdAt: new Date().toISOString(),
        provider: 'google',
        loggedAt: new Date().toISOString()
      };

      /*
       * G4 · aquí se canjeaba el `id_token` por una sesión de Firebase Auth
       * con `signInWithCredential`, y a partir de ahí Firestore era el origen
       * de los datos. Ya no: el `id_token` va directo al router del titular,
       * que lo verifica en cada petición.
       */

      // Establecer usuario activo en LocalStorage (Sheets path)
      setActiveUser(realUser);
      
      const userKey = realUser.googleId || realUser.email;
      const savedState = loadAppState(userKey);
      
      if (savedState) {
        setUser(realUser);
        setMembers(savedState.members || []);
        setHealthProfiles(savedState.healthProfiles || {});
        setAppointments(savedState.appointments || []);
        setCheckups(savedState.checkups || []);
        setVaccines(savedState.vaccines || []);
        setExams(savedState.exams || []);
        setExamResults(savedState.examResults || {});
        setDocuments(savedState.documents || []);
        setHistory(savedState.history || []);
        setReminders(savedState.reminders || []);
        setTasks(savedState.tasks || []);
        setMedicalOrders(savedState.medicalOrders || []);
        setMedicationPrescriptions(savedState.medicationPrescriptions || []);
        setMedicationDoseReminders(savedState.medicationDoseReminders || []);
          // Bloque D · Mascotas.
          setPets(savedState.pets || []);
          setPetWeights(savedState.petWeights || []);
          setPetVaccines(savedState.petVaccines || []);
          setPetHistory(savedState.petHistory || []);
        setSharedReports(savedState.sharedReports || []);
        setDriveSyncEnabled(savedState.driveSyncEnabled !== undefined ? savedState.driveSyncEnabled : true);
        setCalendarSyncEnabled(savedState.calendarSyncEnabled !== undefined ? savedState.calendarSyncEnabled : true);
        setLastExportMetadata(savedState.lastExportMetadata || null);
        setSimulatedRole(savedState.simulatedRole || null);
        setSimulatedEmail(savedState.simulatedEmail || null);
        
        // Gmail Import Loading
        const defaultSources: AppointmentEmailSource[] = [
          {
            id: 'source-default',
            email: 'noreply@informacion.saludsis.mil.co',
            label: 'Salud SIS (Defecto)',
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
        setEmailSources(savedState.emailSources && savedState.emailSources.length > 0 ? savedState.emailSources : defaultSources);
        setAppointmentCandidates(savedState.appointmentCandidates || []);
        // Gmail auto-scan config
        setGmailOnlyFutureAppointments(savedState.gmailOnlyFutureAppointments ?? true);

        setDatabaseSpreadsheetId(savedState.databaseSpreadsheetId || null);
        setDatabaseSpreadsheetUrl(savedState.databaseSpreadsheetUrl || null);
        setLastSyncAt(savedState.lastSyncAt || null);
        setLastPullAt(savedState.lastPullAt || null);
        setLastPushAt(savedState.lastPushAt || null);
        setSyncStrategy(savedState.syncStrategy || 'LAST_WRITE_WINS');
        setLastKnownRevision(savedState.lastKnownRevision || 0);
        setAppDataFileId(savedState.appDataFileId || null);
        // Marcar como cargado desde caché local; el pull automático se lanza en background
        setSyncInitStatus('local_only');
        setSyncInitMessage('Datos cargados desde caché local. Puedes sincronizar desde Configuración.');
      } else {
        // Inicialización limpia por primera vez para usuario real nuevo
        setUser(realUser);
        setMembers([]);
        setHealthProfiles({});
        setAppointments([]);
        setCheckups([]);
        setVaccines([]);
        setExams([]);
        setExamResults({});
        setDocuments([]);
        setHistory([]);
        setReminders([]);
        setTasks([]);
        setMedicalOrders([]);
        setMedicationPrescriptions([]);
        setMedicationDoseReminders([]);
        setSharedReports([]);
        setDriveSyncEnabled(true);
        setCalendarSyncEnabled(true);
        setLastExportMetadata(null);
        setSimulatedRole(null);
        setSimulatedEmail(null);
        setDatabaseSpreadsheetId(null);
        setDatabaseSpreadsheetUrl(null);
        setLastSyncAt(null);
        setLastPullAt(null);
        setLastPushAt(null);
        setSyncStrategy('LAST_WRITE_WINS');
        setLastKnownRevision(0);
        setAppDataFileId(null);
        setEmailSources([
          {
            id: 'source-default',
            email: 'noreply@informacion.saludsis.mil.co',
            label: 'Salud SIS (Defecto)',
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
        setAppointmentCandidates([]);
        setSyncInitStatus('idle');
        setSyncInitMessage(null);
        
        // Registrar auditoría inicial
        const newEvent: MedicalHistoryEvent = {
          id: `hist-${Date.now()}`,
          memberId: 'admin',
          eventType: 'OTHER',
          title: 'Expediente clínico inicializado',
          description: `El usuario ${realUser.displayName} inició sesión e inicializó su expediente en limpio.`,
          eventDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString()
        };
        setHistory([newEvent]);
      }

      // Lanzar búsqueda automática en Google (no bloquea el login)
      // Intento silencioso primero — sin popup si ya concedió permisos
      setIsLoading(false);
      setTimeout(() => {
        autoSyncOnLogin(realUser);
      }, 500);
      return;
    } else {
      // Sesión Demo
      setActiveUser('demo');
      const savedState = loadAppState('demo');
      
      const fallbackUser: UserAccount = {
        ...mockUser,
        provider: 'mock',
        loggedAt: new Date().toISOString()
      };
      
      setUser(fallbackUser);
      
      if (savedState) {
        setMembers(savedState.members || []);
        setHealthProfiles(savedState.healthProfiles || {});
        setAppointments(savedState.appointments || []);
        setCheckups(savedState.checkups || []);
        setVaccines(savedState.vaccines || []);
        setExams(savedState.exams || []);
        setExamResults(savedState.examResults || {});
        setDocuments(savedState.documents || []);
        setHistory(savedState.history || []);
        setReminders(savedState.reminders || []);
        setTasks(savedState.tasks || []);
        setMedicalOrders(savedState.medicalOrders || []);
        setMedicationPrescriptions(savedState.medicationPrescriptions || []);
        setMedicationDoseReminders(savedState.medicationDoseReminders || []);
          // Bloque D · Mascotas.
          setPets(savedState.pets || []);
          setPetWeights(savedState.petWeights || []);
          setPetVaccines(savedState.petVaccines || []);
          setPetHistory(savedState.petHistory || []);
        setSharedReports(savedState.sharedReports || []);
        setDriveSyncEnabled(savedState.driveSyncEnabled !== undefined ? savedState.driveSyncEnabled : true);
        setCalendarSyncEnabled(savedState.calendarSyncEnabled !== undefined ? savedState.calendarSyncEnabled : true);
        setSimulatedRole(savedState.simulatedRole !== undefined ? savedState.simulatedRole : null);
        setSimulatedEmail(savedState.simulatedEmail !== undefined ? savedState.simulatedEmail : null);

        // Gmail Import Loading
        const defaultSources: AppointmentEmailSource[] = [
          {
            id: 'source-default',
            email: 'noreply@informacion.saludsis.mil.co',
            label: 'Salud SIS (Defecto)',
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
        setEmailSources(savedState.emailSources && savedState.emailSources.length > 0 ? savedState.emailSources : defaultSources);
        setAppointmentCandidates(savedState.appointmentCandidates || []);
        // Gmail auto-scan config — must be loaded here or defaults overwrite LocalStorage on autosave
        setGmailOnlyFutureAppointments(savedState.gmailOnlyFutureAppointments ?? true);

        setDatabaseSpreadsheetId(savedState.databaseSpreadsheetId || null);
        setDatabaseSpreadsheetUrl(savedState.databaseSpreadsheetUrl || null);
        setLastSyncAt(savedState.lastSyncAt || null);
        setAppDataFileId(savedState.appDataFileId || null);
      } else {
        const sanitizedMockMembers = mockMembers.map(m => ({ ...m, status: 'ACTIVE' as const }));
        const sanitizedMockAppointments = mockAppointments.map(a => ({ ...a, retentionStatus: 'ACTIVE' as const }));
        
        setMembers(sanitizedMockMembers);
        setHealthProfiles(mockHealthProfiles);
        setAppointments(sanitizedMockAppointments);
        setCheckups(mockCheckups);
        setVaccines(mockVaccines);
        setExams(mockExams);
        setExamResults(mockExamResults);
        setDocuments(mockDocuments);
        setHistory(mockHistory);
        setReminders(mockReminders);
        setTasks(mockTasks);
        setSharedReports([]);
        setDriveSyncEnabled(true);
        setCalendarSyncEnabled(true);
        setLastExportMetadata(null);
        setSimulatedRole(null);
        setSimulatedEmail(null);
        setDatabaseSpreadsheetId(null);
        setDatabaseSpreadsheetUrl(null);
        setLastSyncAt(null);
        setLastPullAt(null);
        setLastPushAt(null);
        setSyncStrategy('LAST_WRITE_WINS');
        setLastKnownRevision(0);
        setAppDataFileId(null);
        setEmailSources([
          {
            id: 'source-default',
            email: 'noreply@informacion.saludsis.mil.co',
            label: 'Salud SIS (Defecto)',
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
        setAppointmentCandidates([]);
      }
    }
    
    setIsLoading(false);
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      // G4 · ya no hay sesión de Firebase que cerrar. Lo que sí hay que hacer
      // es decirle a Google que no vuelva a entrar solo en la siguiente carga:
      // pelearse con quien se acaba de ir a propósito es peor que pedirle el
      // botón otra vez.
      const { sesionDeLaAplicacion } = await import('../lib/identidad');
      sesionDeLaAplicacion.olvidar();
    } catch (err) {
      console.error('[AppContext] Error al cerrar la sesión de Google:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Cancelar timer de auto-sync pendiente
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    // ── Firebase: teardown real-time watchers ─────────────────────────────────
    if (firebaseUnsubRef.current) {
      firebaseUnsubRef.current();
      firebaseUnsubRef.current = null;
    }
    if (firebaseInvitationsUnsubRef.current) {
      firebaseInvitationsUnsubRef.current();
      firebaseInvitationsUnsubRef.current = null;
    }
    resetDataRepository();
    setFamilyId(null);
    setCurrentUserFamilyAccess(null);
    // ─────────────────────────────────────────────────────────────────────────
    // Limpiar tokens en memoria (seguridad)
    invalidateAllTokens();

    setActiveUser(null);
    setUser(null);
    setMembers([]);
    setHealthProfiles({});
    setAppointments([]);
    setPendingInvitations([]);
    setInvitations([]);
    setCheckups([]);
    setVaccines([]);
    setExams([]);
    setExamResults({});
    setDocuments([]);
    setHistory([]);
    setReminders([]);
    setTasks([]);
    setSharedReports([]);
    setEmailSources([
      {
        id: 'source-default',
        email: 'noreply@informacion.saludsis.mil.co',
        label: 'Salud SIS (Defecto)',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    setAppointmentCandidates([]);
    setDriveSyncEnabled(true);
    setCalendarSyncEnabled(true);
    setLastExportMetadata(null);
    setSimulatedRole(null);
    setSimulatedEmail(null);
    setDatabaseSpreadsheetId(null);
    setDatabaseSpreadsheetUrl(null);
    setLastSyncAt(null);
    setLastPullAt(null);
    setLastPushAt(null);
    setAppDataFileId(null);
    setLastKnownRevision(0);
    setPendingSyncCount(0);
    setNeedsGoogleAuth(false);
    setSyncInitStatus('idle');
    setSyncInitMessage(null);
    setOpSyncStatus('disconnected');
    setOpSyncError(null);
    setDriveAccessToken(null);
    setCalendarAccessToken(null);
    setSheetsAccessToken(null);
    setIsLoading(false);
  };

  // ===========================================================================
  // A6-F2 . CIERRE DE SESION SEGURO
  // ===========================================================================

  useEffect(() => { estadoCierreRef.current = estadoCierre; }, [estadoCierre]);
  useEffect(() => {
    const o = origenDe(user);
    origenDatosRef.current = o;
    setOrigenDatos(o);
  }, [user]);
  useEffect(() => { pendingSyncCountRef.current = pendingSyncCount; }, [pendingSyncCount]);

  /**
   * Secuencia de limpieza. El orden es el acordado y no es negociable: cada
   * paso depende de que el anterior haya ocurrido.
   *
   * Ningun fallo aborta la secuencia. Un error al limpiar jamas debe dejar al
   * usuario dentro de una vista que muestra el expediente, asi que cada paso
   * va en su propio try/catch y siempre se llega a la recarga final.
   */
  const cerrarSesionYPurgar = async (): Promise<void> => {
    // (a) Guarda reentrante. Un segundo clic no arranca una segunda purga.
    if (cierreEnCursoRef.current) return;
    cierreEnCursoRef.current = true;

    // (b) Compuerta de escritura: impide que el vaciado del estado dispare el
    //     autoguardado y sobrescriba el snapshot con datos vacios.
    escrituraSuspendidaRef.current = true;

    const fallos: string[] = [];

    // (c) Temporizadores. Se cancelan aqui de forma explicita para garantizar
    //     el orden; signOut los vuelve a cancelar, lo cual es idempotente.
    try {
      if (autoSyncTimerRef.current) { clearTimeout(autoSyncTimerRef.current); autoSyncTimerRef.current = null; }
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      if (nightLockTimerRef.current) { clearTimeout(nightLockTimerRef.current); nightLockTimerRef.current = null; }
    } catch { fallos.push('temporizadores'); }

    // (d) Watchers de Firestore.
    try {
      if (firebaseUnsubRef.current) { firebaseUnsubRef.current(); firebaseUnsubRef.current = null; }
      if (firebaseInvitationsUnsubRef.current) { firebaseInvitationsUnsubRef.current(); firebaseInvitationsUnsubRef.current = null; }
    } catch { fallos.push('watchers'); }

    // (e) Preferencias no clinicas, ANTES de vaciar nada.
    try {
      guardarPreferencias({
        driveSyncEnabled,
        calendarSyncEnabled,
        gmailOnlyFutureAppointments,
        autoLockEnabled,
        autoLockMinutes,
        nightLockEnabled,
        nightLockStart,
        nightLockEnd,
      });
    } catch { fallos.push('preferencias'); }

    // (f)(g)(h)(k) signOut ya cierra Firebase Auth, invalida los tokens en
    //     memoria, reinicia el repositorio y vacia el estado de React.
    try {
      await signOut();
    } catch { fallos.push('signOut'); }

    // (i) localStorage.
    try {
      const r = purgarPersistenciaLocal();
      if (r.errores.length > 0) fallos.push('localStorage');
    } catch { fallos.push('localStorage'); }

    // (j) Cache IndexedDB de Firestore.
    let resultadoFirestore: 'ok' | 'diferida' | 'no_aplica' = 'no_aplica';
    try {
      resultadoFirestore = await purgarCacheFirestore();
    } catch { resultadoFirestore = 'diferida'; }
    if (resultadoFirestore === 'diferida') fallos.push('cacheFirestore');

    if (fallos.length > 0) {
      console.warn('[AppContext] Cierre de sesion con limpieza incompleta:', fallos.join(','));
    }

    // (l) Recarga controlada. `replace` y no `push`: el boton de retroceso no
    //     debe devolver a una vista que todavia tuviera datos montados.
    try {
      window.location.replace('/login');
    } catch {
      cierreEnCursoRef.current = false;
      escrituraSuspendidaRef.current = false;
    }
  };

  const descartarAvisoPurgaDiferida = () => setAvisoPurgaDiferida(false);

  /** Aplica una transicion y lanza la purga cuando la maquina llega a ella. */
  const aplicarEstadoCierre = (siguiente: EstadoCierre) => {
    const anterior = estadoCierreRef.current;
    estadoCierreRef.current = siguiente;
    setEstadoCierre(siguiente);
    if (siguiente.fase === 'purgando' && anterior.fase !== 'purgando') {
      void cerrarSesionYPurgar();
    }
  };

  const despacharCierre = (accion: AccionCierre) => {
    aplicarEstadoCierre(reducirCierre(estadoCierreRef.current, accion));
  };

  /**
   * Punto de entrada unico desde la interfaz. Lee el estado REAL -no una
   * copia- de la sincronizacion en curso y de los cambios pendientes.
   */
  const solicitarCierreDeSesion = () => {
    if (cierreEnCursoRef.current) return;
    despacharCierre({
      tipo: 'solicitar',
      sincronizando: isSyncInProgress.current,
      pendientes: pendingSyncCountRef.current,
    });
  };

  const ERROR_REINTENTO =
    'No se pudo sincronizar. Revisa tu conexion o vuelve a conectar tu cuenta de Google. Tus cambios siguen guardados en este dispositivo.';

  const reintentarSincronizacion = async (): Promise<void> => {
    try {
      await flushPendingSync();
      if (pendingSyncCountRef.current === 0) {
        despacharCierre({ tipo: 'reintento_ok' });
      } else {
        despacharCierre({ tipo: 'reintento_fallido', error: ERROR_REINTENTO });
      }
    } catch {
      despacharCierre({ tipo: 'reintento_fallido', error: ERROR_REINTENTO });
    }
  };

  /**
   * Mientras se espera a una sincronizacion en curso hay que vigilar
   * isSyncInProgress, que es un ref y no provoca re-render. Un sondeo corto es
   * la forma honesta de observarlo sin reescribir la capa de sincronizacion,
   * que es territorio del bloque H.
   */
  useEffect(() => {
    if (estadoCierre.fase !== 'sincronizando') return;
    const id = setInterval(() => {
      if (!isSyncInProgress.current) {
        despacharCierre({ tipo: 'sync_finalizada', pendientes: pendingSyncCountRef.current });
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoCierre.fase]);

  // ── G4 · aquí estaban los observadores en tiempo real de Firestore ─────────
  // When familyId becomes available (after firebase signIn) start listening to
  // all Firestore collections. Tears down automatically when familyId clears.
  useEffect(() => {
    // G4 · no hay observadores en tiempo real: la hoja no avisa. El sondeo de
    // revisión (G2) es lo que ocupa su sitio, y lo enciende G4b.
    return;
    if (!familyId) return;
    if (purgaDiferidaPendiente) return; // A6-F2: ningún watcher antes de limpiar
    if (sessionLocked) return; // A6-F3: sin watchers mientras la sesión está bloqueada

    let cancelled = false;
    getDataRepository().then((repo) => {
      if (cancelled) return;
      const unsub = repo.watchAll(
        {
          uid: user?.googleId ?? user?.id ?? '',
          email: user?.email ?? '',
          familyId,
        },
        (update: DataUpdate) => {
          if (cancelled) return;
          switch (update.type) {
            case 'members':               setMembers(update.data);                     break;
            case 'healthProfiles':        setHealthProfiles(update.data);              break;
            case 'appointments':          setAppointments(update.data);                break;
            case 'checkups':              setCheckups(update.data);                    break;
            case 'vaccines':              setVaccines(update.data);                    break;
            case 'exams':                 setExams(update.data);                       break;
            case 'documents':             setDocuments(update.data);                   break;
            case 'history':               setHistory(update.data);                     break;
            case 'reminders':             setReminders(update.data);                   break;
            case 'tasks':                 setTasks(update.data);                       break;
            case 'medicalOrders':         setMedicalOrders(update.data);               break;
            case 'medications':           setMedicationPrescriptions(update.data);     break;
            case 'doseReminders':         setMedicationDoseReminders(update.data);     break;
            case 'gmailSources':          setEmailSources(update.data);                break;
            case 'appointmentCandidates': setAppointmentCandidates(update.data);       break;
            case 'settings':
              if (update.data) {
                if (update.data.gmailOnlyFutureAppointments !== undefined) setGmailOnlyFutureAppointments(update.data.gmailOnlyFutureAppointments);
              }
              break;
          }
        },
      );
      firebaseUnsubRef.current = unsub;
    }).catch((err) => {
      console.error('[AppContext] Firebase watcher setup failed:', err);
    });

    getDataRepository().then((repo) => {
      if (cancelled) return;
      if (repo.watchInvitations && currentUserFamilyAccess?.role === 'OWNER') {
        const unsub = repo.watchInvitations(
          { uid: user?.googleId ?? user?.id ?? '', email: user?.email ?? '', familyId },
          (invs) => {
            if (cancelled) return;
            setInvitations(invs);
          }
        );
        firebaseInvitationsUnsubRef.current = unsub;
      } else {
        setInvitations([]);
      }
    }).catch((err) => {
      console.error('[AppContext] Firebase invitations watcher setup failed:', err);
    });

    return () => {
      cancelled = true;
      if (firebaseUnsubRef.current) {
        firebaseUnsubRef.current();
        firebaseUnsubRef.current = null;
      }
      if (firebaseInvitationsUnsubRef.current) {
        firebaseInvitationsUnsubRef.current();
        firebaseInvitationsUnsubRef.current = null;
      }
    };
  }, [familyId, user, currentUserFamilyAccess, purgaDiferidaPendiente, sessionLocked]);  

  // ── G4 · aquí se observaban los accesos del usuario en Firestore ───────────
  useEffect(() => {
    if (!user) {
      setCurrentUserFamilyAccess(null);
      return;
    }
    if (purgaDiferidaPendiente) return; // A6-F2: ningún watcher antes de limpiar
    if (sessionLocked) return; // A6-F3: sin watchers mientras la sesión está bloqueada

    const uid = user.googleId || user.id || '';
    let cancelled = false;
    let unsub: (() => void) | null = null;

    getDataRepository().then((repo) => {
      if (cancelled) return;
      unsub = repo.watchUserFamilyAccess(uid, (accessList) => {
        if (cancelled) return;
        const active = accessList.find(a => a.familyId === familyId && a.status === 'ACTIVE');
        setCurrentUserFamilyAccess(active || null);
        console.info('[AppContext] watchUserFamilyAccess updated active access:', active);
      });
    }).catch((err) => {
      console.error('[AppContext] Firebase watchUserFamilyAccess setup failed:', err);
    });

    return () => {
      cancelled = true;
      if (unsub) {
        unsub();
      }
    };
  }, [user, familyId, purgaDiferidaPendiente, sessionLocked]);

  // ── Instantánea del estado, para deshacer una escritura optimista ─────────
  const stateRef = useRef({
    members,
    healthProfiles,
    appointments,
    checkups,
    vaccines,
    exams,
    examResults,
    documents,
    history,
    reminders,
    tasks,
    medicalOrders,
    medicationPrescriptions,
    medicationDoseReminders,
  });

  stateRef.current = {
    members,
    healthProfiles,
    appointments,
    checkups,
    vaccines,
    exams,
    examResults,
    documents,
    history,
    reminders,
    tasks,
    medicalOrders,
    medicationPrescriptions,
    medicationDoseReminders,
  };

  /**
   * Guardar una entidad suelta, sin bloquear la interfaz.
   *
   * Es el embudo por el que pasarán **todas** las escrituras cuando el
   * repositorio escriba por mutación. Hoy no escribe: la persistencia sigue
   * siendo el empuje por lotes de `scheduleAutoSync`, y activar los dos a la
   * vez sería lo peor de ambos —el router anexa filas y el empuje reescribe
   * pestañas enteras—.
   *
   * ESTO NO ES UNA ESCRITURA MUDA, Y LA DIFERENCIA IMPORTA
   * ──────────────────────────────────────────────────────
   * Una escritura muda es la que **parece** guardar y no guarda. Aquí no lo
   * parece: la condición tiene nombre, está escrita arriba y se apaga en un
   * sitio. `SINCRONIZACION_MANUAL` pasa a `false` en G4b y esto empieza a
   * escribir de verdad; el empuje por lotes se va en el mismo paso.
   */
  const persistirPorMutacion = useCallback(
    (fn: (repo: Awaited<ReturnType<typeof getDataRepository>>, ctx: RepositoryContext) => Promise<void>) => {
      // A6-F3 · Guarda estructural del modo demostración.
      if (origenDatosRef.current === 'DEMO') return;

      // La instantánea se toma ANTES de salir a la red: es a lo que se vuelve
      // si el router rechaza la escritura.
      const snap = { ...stateRef.current };

      getDataRepository().then(async (repo) => {
        try {
          await fn(repo, {
            uid: user?.googleId ?? user?.id ?? '',
            email: user?.email ?? '',
            // La familia **es la hoja**: no hay documento que identificar. El
            // repositorio lo ignora, y queda aquí porque el contrato todavía
            // lo pide.
            familyId: null,
          });
        } catch (err: unknown) {
          const codigo = (err as { codigo?: string } | null)?.codigo ?? '';

          // Lo que no tiene dónde guardarse no es un fallo del guardado: es una
          // pérdida conocida y decidida (`SIN_PESTANA`, en descriptores.ts).
          // Deshacer la pantalla por eso rompería funciones que no tienen nada
          // que ver.
          if (codigo === 'NO_HAY_DONDE_ESCRIBIRLO') {
            console.warn('[AppContext] sin pestaña donde guardarlo:', (err as Error)?.message);
            return;
          }

          /*
           * UN FALLO PASAJERO NO PUEDE BORRAR LO QUE ALGUIEN ACABA DE ESCRIBIR
           * ──────────────────────────────────────────────────────────────────
           * Sin red, con el cerrojo ocupado, o en un navegador que todavía no
           * tiene registrada la hoja de la familia, deshacer el cambio
           * significa que quien estaba en el ascensor apuntando una vacuna ve
           * desaparecer lo que escribió.
           *
           * Así que se guarda la escritura y se reintenta. No es una cola de
           * sincronización con fusión —eso es lo que G4b vino a quitar—: son
           * las mismas mutaciones, que se reenvían tal cual. Reenviarlas es
           * inofensivo porque la hoja **solo anexa**: la última fila manda, y
           * una repetida dice exactamente lo mismo.
           *
           * Lo que SÍ se deshace es un rechazo que no va a cambiar
           * reintentando: un permiso denegado seguirá denegado, y dejar el dato
           * en pantalla sería prometer un guardado que no va a ocurrir.
           */
          const reintentable =
            (err as { reintentable?: boolean } | null)?.reintentable === true ||
            codigo === 'SIN_BACKEND' ||
            codigo === 'SIN_IDENTIDAD';

          if (reintentable) {
            escriturasPendientesRef.current.push(fn);
            setPendingSyncCount(escriturasPendientesRef.current.length);
            pendingSyncCountRef.current = escriturasPendientesRef.current.length;
            console.warn('[AppContext] guardado aplazado, se reintentará:', codigo || 'sin código');
            return;
          }

          console.error('[AppContext] persistirPorMutacion: error — se deshace el cambio:', err);

          // Rollback all states
          setMembers(snap.members);
          setHealthProfiles(snap.healthProfiles);
          setAppointments(snap.appointments);
          setCheckups(snap.checkups);
          setVaccines(snap.vaccines);
          setExams(snap.exams);
          setExamResults(snap.examResults);
          setDocuments(snap.documents);
          setHistory(snap.history);
          setReminders(snap.reminders);
          setTasks(snap.tasks);
          setMedicalOrders(snap.medicalOrders);
          setMedicationPrescriptions(snap.medicationPrescriptions);
          setMedicationDoseReminders(snap.medicationDoseReminders);

          avisar(
            codigo === 'SIN_BACKEND'
              ? 'Este navegador todavía no tiene registrada la hoja de la familia.'
              : codigo === 'SIN_IDENTIDAD'
                ? 'La sesión caducó. Vuelve a entrar para guardar el cambio.'
                : 'No se pudo guardar el cambio. Se deshizo para no dejarlo a medias.',
          );
        }
      }).catch((err) => {
        console.error('[AppContext] persistirPorMutacion: error de preparación:', err);
      });
    },
    [user, avisar],
  );

  // ── Invitaciones y accesos ────────────────────────────────────────────────
  const createInvitation = useCallback(async (
    email: string,
    memberId: string,
    role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER'
  ): Promise<string> => {
    const repo = await getDataRepository();
    const ctx = { uid: user?.googleId ?? user?.id ?? '', email: user?.email ?? '', familyId };
    return await repo.createInvitation(ctx, email, memberId, role);
  }, [user, familyId]);

  const acceptInvitation = useCallback(async (
    targetFamilyId: string,
    invitationId: string
  ): Promise<void> => {
    setIsLoading(true);
    try {
      const repo = await getDataRepository();
      const ctx = { uid: user?.googleId ?? user?.id ?? '', email: user?.email ?? '', familyId: null };
      await repo.acceptInvitation(ctx, targetFamilyId, invitationId);
      
      // Update context familyId to the new familyId!
      setFamilyId(targetFamilyId);
      
      // Reload everything
      const data = await repo.loadAll({
        uid: user?.googleId ?? user?.id ?? '',
        email: user?.email ?? '',
        familyId: targetFamilyId,
      });

      setMembers(data.members);
      setHealthProfiles(data.healthProfiles);
      setAppointments(data.appointments);
      setCheckups(data.checkups);
      setVaccines(data.vaccines);
      setExams(data.exams);
      setExamResults(data.examResults);
      setDocuments(data.documents);
      setHistory(data.history);
      setReminders(data.reminders);
      setTasks(data.tasks);
      setMedicalOrders(data.medicalOrders);
      setMedicationPrescriptions(data.medications);
      setMedicationDoseReminders(data.doseReminders);
      setEmailSources(data.gmailSources);
      setAppointmentCandidates(data.appointmentCandidates);
      
      // Clear pending invitations since we accepted one
      setPendingInvitations([]);
    } catch (err) {
      console.error('[AppContext] Failed to accept invitation:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const revokeInvitation = useCallback(async (
    invitationId: string
  ): Promise<void> => {
    const repo = await getDataRepository();
    const ctx = { uid: user?.googleId ?? user?.id ?? '', email: user?.email ?? '', familyId };
    await repo.revokeInvitation(ctx, invitationId);
  }, [user, familyId]);

  const createNewFamily = useCallback(async (name: string): Promise<void> => {
    setIsLoading(true);
    try {
      const repo = await getDataRepository();
      const ctx = { uid: user?.googleId ?? user?.id ?? '', email: user?.email ?? '', familyId: null };
      const newFid = await repo.createFamily(ctx, name);
      
      setFamilyId(newFid);
      
      // Clear state
      setMembers([]);
      setHealthProfiles({});
      setAppointments([]);
      setCheckups([]);
      setVaccines([]);
      setExams([]);
      setExamResults({});
      setDocuments([]);
      setHistory([]);
      setReminders([]);
      setTasks([]);
      setMedicalOrders([]);
      setMedicationPrescriptions([]);
      setMedicationDoseReminders([]);
      
      // Load all
      const data = await repo.loadAll({
        uid: user?.googleId ?? user?.id ?? '',
        email: user?.email ?? '',
        familyId: newFid,
      });
      setMembers(data.members);
    } catch (err) {
      console.error('[AppContext] Failed to create family:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const checkPendingInvitations = useCallback(async (): Promise<FamilyInvitation[]> => {
    if (!user?.email) return [];
    try {
      const repo = await getDataRepository();
      const invs = await repo.getInvitationsForEmail(user.email);
      setPendingInvitations(invs);
      return invs;
    } catch (err) {
      console.error('[AppContext] Failed to get pending invitations:', err);
      return [];
    }
  }, [user]);

  // ── FUNCIONES DE AUTO-SYNC ────────────────────────────────────────────────

  /*
   * G4b · aquí vivía `scheduleAutoSync`.
   *
   * Esperaba cuatro segundos y llamaba a `syncNow()`, que **reescribía las 20
   * pestañas operativas enteras** en cada guardado. Era el punto que el
   * antiguo Bloque H venía a eliminar, y es incompatible con lo que construyó
   * E6: `aplicar()` recibe un lote de mutaciones concretas, valida cada una
   * contra el rol de quien la pide y escribe solo esas filas.
   *
   * Reescribir el expediente entero cada cuatro segundos contra el router
   * habría sido lo peor de los dos mundos: más cuota, más riesgo y ninguna de
   * las garantías de E5.
   *
   * Lo sustituye `persistirPorMutacion`, que ahora sí escribe.
   */

  /**
   * flushPendingSync — Sincroniza inmediatamente si hay cambios pendientes y token válido.
   */
  /**
   * Reenvía las escrituras que quedaron pendientes.
   *
   * Antes esto pedía un token y empujaba el expediente entero. Ahora reenvía
   * **las mutaciones que fallaron**, una a una y en el orden en que
   * ocurrieron: el orden importa porque una cita puede depender de la orden
   * médica que la originó.
   *
   * Las que vuelvan a fallar se quedan en la cola. Nunca se descarta una
   * escritura por haberla intentado.
   */
  const flushPendingSync = async (): Promise<void> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    if (isSyncInProgress.current) return;
    if (escriturasPendientesRef.current.length === 0) return;

    isSyncInProgress.current = true;
    try {
      const repo = await getDataRepository();
      const ctx: RepositoryContext = {
        uid: user?.googleId ?? user?.id ?? '',
        email: user?.email ?? '',
        familyId: null,
      };

      const cola = [...escriturasPendientesRef.current];
      const fallidas: typeof cola = [];

      for (const escritura of cola) {
        try {
          await escritura(repo, ctx);
        } catch {
          fallidas.push(escritura);
        }
      }

      escriturasPendientesRef.current = fallidas;
      setPendingSyncCount(fallidas.length);
      pendingSyncCountRef.current = fallidas.length;
      if (fallidas.length === 0) setNeedsGoogleAuth(false);
    } finally {
      isSyncInProgress.current = false;
    }
  };

  /**
   * reconnectGoogle — Solicita token explícitamente con popup y luego flushea cambios pendientes.
   * Solo se llama cuando el usuario hace clic en "Conectar Google" o "Reconectar".
   */
  const reconnectGoogle = async (): Promise<void> => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    setSyncInitStatus('checking');
    setSyncInitMessage('Conectando con Google...');
    setOpSyncError(null);

    try {
      // forcePrompt=false usa el popup normal de GIS (select_account)
      const token = await ensureOperationalToken(clientId, false);
      setNeedsGoogleAuth(false);
      
      // Buscar base remota con el token recién otorgado
      const found = await checkForExistingDatabase(token, true);
      
      if (!found) {
        // Si no se encontró base remota, pero ya tiene token,
        // y tiene cambios locales pendientes, sincronizamos.
        if (pendingSyncCount > 0) {
          setSyncInitMessage('Sincronizando cambios locales...');
          await flushPendingSync();
        }
      }
    } catch (err: any) {
      const errMsg = err?.error || err?.message || 'Error desconocido';
      const cancelled = errMsg === 'access_denied' || errMsg === 'popup_closed_by_user';
      if (!cancelled) {
        setSyncInitStatus('error');
        setSyncInitMessage(`Error al conectar: ${errMsg}`);
        setNeedsGoogleAuth(true);
      } else {
        setSyncInitStatus('pending_sync');
        setSyncInitMessage('Autorización cancelada. Los cambios quedaron pendientes.');
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  const addMember = (member: Omit<FamilyMember, 'id' | 'familyGroupId'>, customId?: string) => {
    const newId = customId || `member-${Date.now()}`;
    const newMember: FamilyMember = {
      ...member,
      id: newId,
      familyGroupId: 'family-001',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'PENDING_SYNC'
    };
    setMembers((prev) => [...prev, newMember]);

    // Crear ficha médica en blanco por defecto
    const newProfile: HealthProfile = {
      id: `hp-${Date.now()}`,
      memberId: newId,
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
      lastUpdated: new Date().toISOString()
    };
    setHealthProfiles((prev) => ({ ...prev, [newId]: newProfile }));

    // Registrar hito en el historial clínico
    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: newId,
      eventType: 'OTHER',
      title: 'Miembro agregado',
      description: `${member.fullName} fue agregado/a al núcleo familiar.`,
      eventDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    setHistory((prev) => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveMember(ctx, newMember);
      await repo.saveHealthProfile(ctx, newId, newProfile);
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const updateMember = (id: string, updatedFields: Partial<FamilyMember>) => {
    let updatedMember: FamilyMember | null = null;
    let newEvent: MedicalHistoryEvent | null = null;
    setMembers((prev) => prev.map((m) => {
      if (m.id === id) {
        const permissionsChanged = JSON.stringify(m.permissions) !== JSON.stringify(updatedFields.permissions) || 
          m.email !== updatedFields.email || 
          m.canAccessPortal !== updatedFields.canAccessPortal || 
          m.permissionStatus !== updatedFields.permissionStatus;

        if (permissionsChanged) {
          newEvent = {
            id: `hist-${Date.now()}`,
            memberId: id,
            eventType: 'OTHER',
            title: 'Permisos actualizados',
            description: `Se actualizaron los permisos de acceso al portal y configuración de correo para ${m.fullName}.`,
            eventDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent!, ...h]), 50);
        } else {
          newEvent = {
            id: `hist-${Date.now()}`,
            memberId: id,
            eventType: 'OTHER',
            title: 'Perfil familiar editado',
            description: `Se editó y actualizó la información de perfil para ${m.fullName}.`,
            eventDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent!, ...h]), 50);
        }
        updatedMember = {
          ...m,
          ...updatedFields,
          updatedAt: new Date().toISOString(),
          syncStatus: 'PENDING_SYNC'
        };
        return updatedMember;
      }
      return m;
    }));

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedMember) {
        await repo.saveMember(ctx, updatedMember);
      }
      if (newEvent) {
        await repo.saveHistoryEvent(ctx, newEvent);
      }
    });
  };

  const uploadMemberAvatar = useCallback(
    async (
      memberId: string,
      file: File,
      oldAvatarPath?: string | null,
    ): Promise<{ url: string; path: string }> => {
      const repo = await getDataRepository();
      if (repo.uploadMemberAvatar) {
        return await repo.uploadMemberAvatar(
          {
            uid: user?.googleId ?? user?.id ?? '',
            email: user?.email ?? '',
            familyId,
          },
          memberId,
          file,
          oldAvatarPath,
        );
      }
      throw new Error('El backend actual no soporta subida de archivos');
    },
    [familyId, user],
  );

  const deleteMemberAvatar = useCallback(
    async (avatarPath: string): Promise<void> => {
      const repo = await getDataRepository();
      if (repo.deleteMemberAvatar) {
        await repo.deleteMemberAvatar(
          {
            uid: user?.googleId ?? user?.id ?? '',
            email: user?.email ?? '',
            familyId,
          },
          avatarPath,
        );
        return;
      }
      throw new Error('El backend actual no soporta borrado de archivos');
    },
    [familyId, user],
  );

  const deleteMember = (id: string): boolean => {
    const memberAppointments = appointments.filter(a => a.memberId === id && a.retentionStatus !== 'PURGED');
    const memberCheckups = checkups.filter(c => c.memberId === id);
    const memberVaccines = vaccines.filter(v => v.memberId === id);
    const memberExams = exams.filter(e => e.memberId === id);
    const memberDocuments = documents.filter(d => d.memberId === id);
    const memberHistory = history.filter(h => h.memberId === id && h.title !== 'Miembro agregado' && h.title !== 'Miembro inactivo' && h.title !== 'Miembro reactivado');
    const memberReminders = reminders.filter(r => r.memberId === id);
    const memberTasks = tasks.filter(t => t.memberId === id);

    const hasAnyHistory = 
      memberAppointments.length > 0 || 
      memberCheckups.length > 0 || 
      memberVaccines.length > 0 || 
      memberExams.length > 0 || 
      memberDocuments.length > 0 || 
      memberHistory.length > 0 || 
      memberReminders.length > 0 || 
      memberTasks.length > 0;

    const targetMember = members.find(m => m.id === id);
    const memberName = targetMember ? targetMember.fullName : 'Miembro';

    if (hasAnyHistory) {
      const newEvent: MedicalHistoryEvent = {
        id: `hist-${Date.now()}`,
        memberId: id,
        eventType: 'OTHER',
        title: 'Borrado bloqueado por historial',
        description: `Intento de eliminar a ${memberName} bloqueado porque posee registros clínicos activos.`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [newEvent, ...prev]);
      return false; 
    }

    setMembers((prev) => prev.map((m) => {
      if (m.id === id) {
        return {
          ...m,
          status: 'DELETED',
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'PENDING_SYNC'
        };
      }
      return m;
    }));
    
    const adminMember = members.find(m => m.relationship === 'SELF') || members[0];
    let newEvent: MedicalHistoryEvent | null = null;
    if (adminMember) {
      newEvent = {
        id: `hist-${Date.now()}`,
        memberId: adminMember.id,
        eventType: 'OTHER',
        title: 'Miembro familiar eliminado',
        description: `Se eliminó permanentemente a ${memberName} (sin historial clínico asociado).`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [newEvent!, ...prev]);
    }

    persistirPorMutacion(async (repo, ctx) => {
      await repo.darDeBajaMember(ctx, id);
      if (newEvent) {
        await repo.saveHistoryEvent(ctx, newEvent);
      }
    });
    return true; 
  };

  const inactivateMember = (memberId: string) => {
    let updatedMember: FamilyMember | null = null;
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        updatedMember = { 
          ...m, 
          status: 'INACTIVE',
          updatedAt: new Date().toISOString(),
          syncStatus: 'PENDING_SYNC'
        };
        return updatedMember;
      }
      return m;
    }));
    
    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: memberId,
      eventType: 'OTHER',
      title: 'Miembro inactivado',
      description: 'El miembro fue marcado como inactivo. Su historial clínico se conserva intacto.',
      eventDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    setHistory(prev => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedMember) {
        await repo.saveMember(ctx, updatedMember);
      }
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const reactivateMember = (memberId: string) => {
    let updatedMember: FamilyMember | null = null;
    setMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        updatedMember = { 
          ...m, 
          status: 'ACTIVE',
          updatedAt: new Date().toISOString(),
          syncStatus: 'PENDING_SYNC'
        };
        return updatedMember;
      }
      return m;
    }));
    
    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: memberId,
      eventType: 'OTHER',
      title: 'Miembro reactivado',
      description: 'El miembro fue reactivado con éxito y volverá a aparecer en todas las pantallas principales.',
      eventDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    setHistory(prev => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedMember) {
        await repo.saveMember(ctx, updatedMember);
      }
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const runAppointmentRetentionCleanup = () => {
    const now = new Date();
    let updatedCount = 0;
    
    setAppointments(prev => prev.map(appt => {
      if (appt.retentionStatus === 'PURGED') return appt;
      
      const scheduledDate = new Date(appt.scheduledAt);
      if (isNaN(scheduledDate.getTime())) return appt;
      
      // No depurar citas futuras
      if (scheduledDate.getTime() > now.getTime()) return appt;
      
      // No depurar citas creadas recientemente (menos de 30 días)
      const createdTime = appt.createdAt ? new Date(appt.createdAt).getTime() : 0;
      if (!isNaN(createdTime) && (now.getTime() - createdTime) < 30 * 24 * 60 * 60 * 1000) {
        return appt;
      }
      
      if (appt.status === 'COMPLETED') {
        const completedDate = appt.completedAt ? new Date(appt.completedAt) : scheduledDate;
        if (isNaN(completedDate.getTime())) return appt;
        const diffYears = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (diffYears >= 2) {
          updatedCount++;
          const newEvent: MedicalHistoryEvent = {
            id: `hist-${Date.now()}-${updatedCount}`,
            memberId: appt.memberId,
            eventType: 'OTHER',
            title: 'Cita médica depurada',
            description: `Cita con ${appt.doctorName} (${appt.specialty}) realizada ha sido depurada tras cumplir política de retención de 2 años.`,
            eventDate: now.toISOString().split('T')[0],
            createdAt: now.toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent, ...h]), 50 + updatedCount * 10);

          return {
            ...appt,
            retentionStatus: 'PURGED' as const,
            retentionReason: 'Cita completada hace más de 2 años',
            purgedAt: now.toISOString()
          };
        }
      } else if (appt.status !== 'CANCELLED') {
        const diffYears = (now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (diffYears >= 1) {
          updatedCount++;
          const newEvent: MedicalHistoryEvent = {
            id: `hist-${Date.now()}-${updatedCount}`,
            memberId: appt.memberId,
            eventType: 'OTHER',
            title: 'Cita médica depurada',
            description: `Cita con ${appt.doctorName} (${appt.specialty}) no completada ha sido depurada tras cumplir política de retención de 1 año.`,
            eventDate: now.toISOString().split('T')[0],
            createdAt: now.toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent, ...h]), 50 + updatedCount * 10);

          return {
            ...appt,
            retentionStatus: 'PURGED' as const,
            retentionReason: 'Cita no completada hace más de 1 año',
            purgedAt: now.toISOString()
          };
        }
      }
      return appt;
    }));
    if (updatedCount > 0) {
    }
  };

  const saveHealthProfile = (memberId: string, profileFields: Partial<HealthProfile>) => {
    let updatedProfile: HealthProfile | null = null;
    setHealthProfiles((prev) => {
      const current = prev[memberId] || {
        id: `hp-${Date.now()}`,
        memberId,
        allergies: [],
        chronicConditions: [],
        currentMedications: [],
        lastUpdated: ''
      };
      updatedProfile = {
        ...current,
        ...profileFields,
        lastUpdated: new Date().toISOString()
      };
      return {
        ...prev,
        [memberId]: updatedProfile
      };
    });

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedProfile) {
        await repo.saveHealthProfile(ctx, memberId, updatedProfile);
      }
    });
  };

  const addAppointment = (appt: Omit<MedicalAppointment, 'id' | 'documentIds'>) => {
    const newId = `appt-${Date.now()}`;
    const nowIso = new Date().toISOString();
    
    let date = '';
    let time = '';
    if (appt.scheduledAt && appt.scheduledAt.includes('T')) {
      [date, time] = appt.scheduledAt.split('T');
    } else if (appt.scheduledAt) {
      date = appt.scheduledAt;
    }

    const newAppt: MedicalAppointment = {
      ...appt,
      id: newId,
      doctor: appt.doctorName,
      date,
      time,
      documentIds: [],
      calendarSyncStatus: calendarSyncEnabled ? 'PENDING_CALENDAR_SYNC' : 'LOCAL_ONLY',
      syncStatus: 'PENDING_SYNC',
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      retentionStatus: 'ACTIVE'
    };
    setAppointments((prev) => [...prev, newAppt]);

    // Crear recordatorio automático de cita
    const newReminder: Reminder = {
      id: `rem-${Date.now()}`,
      memberId: appt.memberId,
      title: `Cita Médica: ${appt.doctorName} (${appt.specialty})`,
      description: `Asistir a ${appt.location || 'Consultorio'}. Motivo: ${appt.reason}`,
      dueDate: appt.scheduledAt,
      reminderType: 'APPOINTMENT',
      status: 'PENDING',
      relatedEventId: newId
    };
    setReminders((prev) => [...prev, newReminder]);

    // Registrar evento de historial
    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: appt.memberId,
      eventType: 'APPOINTMENT',
      title: `Cita de ${appt.specialty} programada`,
      description: `Con ${appt.doctorName} en ${appt.location || 'Consultorio'}.`,
      eventDate: appt.scheduledAt.split('T')[0],
      relatedEntityId: newId,
      createdAt: new Date().toISOString()
    };
    setHistory((prev) => [newEvent, ...prev]);

    // Sincronizar en segundo plano con Google Calendar si está habilitado
    if (calendarSyncEnabled) {
      setTimeout(() => {
        syncAppointmentToCalendar(newId, newAppt);
      }, 200);
    }

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveAppointment(ctx, newAppt);
      await repo.saveReminder(ctx, newReminder);
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const updateAppointmentStatus = (id: string, status: HealthEventStatus) => {
    let updatedAppt: MedicalAppointment | null = null;
    let newHistoryEvent: MedicalHistoryEvent | null = null;
    let updatedReminder: Reminder | null = null;

    setAppointments((prev) => prev.map((a) => {
      if (a.id === id) {
        const completedAt = status === 'COMPLETED' ? new Date().toISOString() : a.completedAt;
        
        if (status === 'COMPLETED' && a.status !== 'COMPLETED') {
          newHistoryEvent = {
            id: `hist-${Date.now()}`,
            memberId: a.memberId,
            eventType: 'APPOINTMENT',
            title: 'Cita médica realizada',
            description: `La cita con ${a.doctorName} (${a.specialty}) ha sido marcada como completada.`,
            eventDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setTimeout(() => setHistory(h => [newHistoryEvent!, ...h]), 50);
        }

        updatedAppt = { ...a, status, completedAt };
        return updatedAppt;
      }
      return a;
    }));
    
    if (status === 'COMPLETED') {
      setReminders((prev) => prev.map((r) => {
        if (r.relatedEventId === id) {
          updatedReminder = { ...r, status: 'DONE' };
          return updatedReminder;
        }
        return r;
      }));
    }

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedAppt) {
        await repo.saveAppointment(ctx, updatedAppt);
      }
      if (newHistoryEvent) {
        await repo.saveHistoryEvent(ctx, newHistoryEvent);
      }
      if (updatedReminder) {
        await repo.saveReminder(ctx, updatedReminder);
      }
    });
  };

  const addCheckup = (chk: Omit<PeriodicCheckup, 'id'>) => {
    const newId = `chk-${Date.now()}`;
    const newCheckup: PeriodicCheckup = {
      ...chk,
      id: newId
    };
    setCheckups((prev) => [...prev, newCheckup]);

    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: chk.memberId,
      eventType: 'CHECKUP',
      title: chk.checkupType,
      description: chk.results || 'Control programado.',
      eventDate: chk.scheduledDate,
      relatedEntityId: newId,
      createdAt: new Date().toISOString()
    };
    setHistory((prev) => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveCheckup(ctx, newCheckup);
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const addVaccine = (vac: Omit<VaccineRecord, 'id'>) => {
    const newId = `vac-${Date.now()}`;
    const newVac: VaccineRecord = {
      ...vac,
      id: newId
    };
    setVaccines((prev) => [...prev, newVac]);

    let newReminder: Reminder | null = null;
    if (vac.status === 'SCHEDULED') {
      newReminder = {
        id: `rem-${Date.now()}`,
        memberId: vac.memberId,
        title: `Vacuna: ${vac.vaccineName} (Dosis ${vac.doseNumber})`,
        description: `Aplicación en ${vac.institution || 'Centro de Salud'}`,
        dueDate: new Date(vac.dateApplied).toISOString(),
        reminderType: 'VACCINE',
        status: 'PENDING',
        relatedEventId: newId
      };
      setReminders((prev) => [...prev, newReminder!]);
    }

    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: vac.memberId,
      eventType: 'VACCINE',
      title: `Vacuna: ${vac.vaccineName}`,
      description: vac.status === 'COMPLETED' 
        ? `Dosis ${vac.doseNumber} aplicada en ${vac.institution || 'Centro de Salud'}.`
        : `Dosis ${vac.doseNumber} programada.`,
      eventDate: vac.dateApplied,
      relatedEntityId: newId,
      createdAt: new Date().toISOString()
    };
    setHistory((prev) => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveVaccine(ctx, newVac);
      if (newReminder) {
        await repo.saveReminder(ctx, newReminder);
      }
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const addExam = (
    exam: Omit<MedicalExam, 'id' | 'documentIds'>, 
    results: Omit<ExamResult, 'id' | 'examId' | 'recordedAt'>[]
  ) => {
    const examId = `exam-${Date.now()}`;
    const newExam: MedicalExam = {
      ...exam,
      id: examId,
      documentIds: []
    };
    setExams((prev) => [...prev, newExam]);

    const newResults: ExamResult[] = results.map((r, index) => ({
      ...r,
      id: `res-${Date.now()}-${index}`,
      examId,
      recordedAt: new Date().toISOString()
    }));
    setExamResults((prev) => ({ ...prev, [examId]: newResults }));

    const hasAbnormal = newResults.some((r) => r.isAbnormal);

    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: exam.memberId,
      eventType: 'EXAM',
      title: exam.examName,
      description: `Realizado en ${exam.laboratory || 'Laboratorio'}. ${hasAbnormal ? 'Presenta valores anormales de alerta.' : 'Valores estables.'}`,
      eventDate: exam.orderedDate,
      relatedEntityId: examId,
      createdAt: new Date().toISOString()
    };
    setHistory((prev) => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveExam(ctx, newExam);
      // El paciente hace falta: `EXAMENES_RESULTADOS` lo lleva en su columna
      // desde el esquema v4, y sin él el router deniega la mutación.
      await repo.saveExamResults(ctx, examId, newResults, exam.memberId);
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const connectDrive = async (): Promise<string | null> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return null;
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) {
      setDriveStatus('error');
      setDriveError('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
      return null;
    }

    setDriveStatus('authorizing');
    setDriveError(null);
    try {
      // Usar TokenManager: primero intenta caché en memoria, luego popup
      const token = await ensureDriveToken(clientId, false);
      setDriveAccessToken(token);
      setDriveStatus('connected');
      setLastDriveAuthTime(new Date().toISOString());
      return token;
    } catch (err: any) {
      const errCode = err?.error || err?.message || 'auth_error';
      setDriveStatus('error');
      setDriveError(errCode === 'access_denied' ? 'Acceso denegado. Verifica que tu correo esté autorizado como tester.' : (errCode || 'El usuario canceló o falló la autorización'));
      return null;
    }
  };

  const connectCalendar = async (): Promise<string | null> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return null;
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) {
      setCalendarStatus('error');
      setCalendarError('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
      return null;
    }

    setCalendarStatus('authorizing');
    setCalendarError(null);
    try {
      // Usar TokenManager: intenta caché en memoria primero, luego popup (silent = false)
      const token = await ensureCalendarToken(clientId, false);
      setCalendarAccessToken(token);
      setCalendarStatus('connected');
      setLastCalendarAuthTime(new Date().toISOString());
      return token;
    } catch (err: any) {
      const errCode = err?.error || err?.message || 'auth_error';
      setCalendarStatus('error');
      setCalendarError(errCode === 'access_denied' ? 'Acceso denegado. Verifica que tu correo esté autorizado como tester.' : (errCode || 'El usuario canceló o falló la autorización'));
      return null;
    }
  };

  const syncAppointmentToCalendar = async (apptId: string, customAppt?: MedicalAppointment, forcePopup = false) => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    const appt = customAppt || appointments.find((a) => a.id === apptId);
    if (!appt) return;

    const member = members.find((m) => m.id === appt.memberId);
    const memberName = member ? member.fullName : 'Familiar';

    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) {
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === apptId
            ? {
                ...a,
                calendarSyncStatus: 'SYNC_ERROR',
                calendarError: 'Google Client ID no configurado.'
              }
            : a
        )
      );
      return;
    }

    setCalendarStatus('connecting');
    setCalendarError(null);
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === apptId ? { ...a, calendarSyncStatus: 'PENDING_SYNC' } : a
      )
    );

    // Usar TokenManager: reusar token en memoria si está vigente
    // Intentar obtener el token de forma silenciosa primero si forcePopup es false
    let token = calendarAccessToken;
    if (!token) {
      try {
        token = await ensureCalendarToken(clientId, !forcePopup);
        setCalendarAccessToken(token);
        setLastCalendarAuthTime(new Date().toISOString());
      } catch (_) {
        token = null;
      }
    }

    if (token) {
      try {
        setCalendarStatus('sincronizando');
        const result = await createCalendarEvent(token, appt, memberName);

        setAppointments((prev) =>
          prev.map((a) =>
            a.id === apptId
              ? {
                  ...a,
                  googleCalendarEventId: result.eventId,
                  googleCalendarHtmlLink: result.htmlLink,
                  calendarSyncStatus: 'SYNCED',
                  calendarSyncedAt: new Date().toISOString(),
                  calendarError: null,
                  reminderPolicy: 'popup-1440,popup-180'
                }
              : a
          )
        );
        setCalendarStatus('sincronizado');
      } catch (err: any) {
        console.error('Error sincronizando cita con Google Calendar:', err.message || err);
        setCalendarStatus('error');
        setCalendarError(err.message || 'Error de sincronización');
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === apptId
              ? {
                  ...a,
                  calendarSyncStatus: 'SYNC_ERROR',
                  calendarError: err.message || 'Error al crear evento en Google Calendar.'
                }
              : a
          )
        );
      }
    } else {
      if (!forcePopup) {
        // En background no lanzamos popup molesto que bloquee el navegador,
        // simplemente dejamos en PENDING_CALENDAR_SYNC.
        setCalendarStatus('disconnected');
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === apptId
              ? {
                  ...a,
                  calendarSyncStatus: 'PENDING_CALENDAR_SYNC',
                  calendarError: 'Requiere autorización de Google Calendar. Haz clic en Reintentar.'
                }
              : a
          )
        );
      } else {
        setCalendarStatus('error');
        setCalendarError('Permiso de Google Calendar denegado.');
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === apptId
              ? {
                  ...a,
                  calendarSyncStatus: 'SYNC_ERROR',
                  calendarError: 'Permiso de Google Calendar denegado.'
                }
              : a
          )
        );
      }
    }
  };

  const uploadDocument = async (
    memberId: string, 
    doc: { fileName: string; fileType: string; description?: string },
    file?: File
  ) => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return '';
    const member = members.find((m) => m.id === memberId);
    const memberName = member ? member.fullName : 'Miembro';
    const categoryName = ({
      PRESCRIPTION: 'Fórmula Médica',
      LAB_RESULT: 'Resultado de Laboratorio',
      MEDICAL_ORDER: 'Orden de Examen',
      CERTIFICATE: 'Certificado Clínico',
      PDF: 'Archivo PDF General',
      IMAGE: 'Imagen Médica',
      OTHER: 'Otro'
    } as Record<string, string>)[doc.fileType] || 'Otro';
    const year = new Date().getFullYear().toString();

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (driveSyncEnabled && clientId && file) {
      setDriveStatus('connecting');
      setDriveError(null);
      // Usar TokenManager: reusar token en memoria si está vigente
      let token = driveAccessToken;
      if (!token) {
        try {
          token = await ensureDriveToken(clientId, false);
          setDriveAccessToken(token);
          setLastDriveAuthTime(new Date().toISOString());
          setDriveStatus('connected');
        } catch (_) {
          token = await connectDrive();
        }
      }

      if (token) {
        try {
          setDriveStatus('subiendo');
          const folderId = await resolveDrivePath(token, memberName, categoryName, year);
          const result = await uploadFile(token, file, folderId);
          
          const docId = `doc-${Date.now()}`;
          const newDoc: ClinicalDocument = {
            id: docId,
            memberId,
            documentType: doc.fileType as any || 'PDF',
            fileName: result.name || doc.fileName,
            driveFileId: result.fileId,
            driveUrl: result.webViewLink || 'https://drive.google.com/drive',
            uploadedAt: result.createdTime || new Date().toISOString(),
            syncStatus: 'SYNCED',
            description: doc.description || null,
            fileSize: result.size,
            mimeType: result.mimeType,
            clinicalCategory: categoryName
          };
          
          setDocuments((prev) => [...prev, newDoc]);
          setDriveStatus('subido');

          const newEvent: MedicalHistoryEvent = {
            id: `hist-${Date.now()}`,
            memberId,
            eventType: 'DOCUMENT',
            title: `Documento cargado: ${newDoc.fileName}`,
            description: doc.description || `Documento clínico cargado exitosamente a Drive en la carpeta ${categoryName}/${year}.`,
            eventDate: new Date().toISOString().split('T')[0],
            relatedEntityId: docId,
            createdAt: new Date().toISOString()
          };
          setHistory((prev) => [newEvent, ...prev]);

          persistirPorMutacion(async (repo, ctx) => {
            await repo.saveDocument(ctx, newDoc);
            await repo.saveHistoryEvent(ctx, newEvent);
          });

          return docId;
        } catch (uploadErr: any) {
          console.error('Error subiendo archivo a Google Drive:', uploadErr.message || uploadErr);
          setDriveStatus('error');
          setDriveError(uploadErr.message || 'Error de subida');
        }
      } else {
        setDriveStatus('error');
        setDriveError('Permiso de Google Drive denegado.');
      }
    }

    // Fallback Mock
    const docId = `doc-${Date.now()}`;
    const newDoc: ClinicalDocument = {
      id: docId,
      memberId,
      documentType: doc.fileType as any || 'PDF',
      fileName: file ? file.name : (doc.fileName.endsWith('.pdf') || doc.fileName.endsWith('.png') || doc.fileName.endsWith('.jpg') ? doc.fileName : `${doc.fileName}.pdf`),
      driveFileId: `mock-drive-${Date.now()}`,
      driveUrl: 'https://drive.google.com/drive',
      uploadedAt: new Date().toISOString(),
      syncStatus: driveSyncEnabled ? 'SYNC_ERROR' : 'LOCAL_ONLY',
      description: doc.description || null,
      fileSize: file ? file.size : 1024 * 500,
      mimeType: file ? file.type : 'application/pdf',
      clinicalCategory: categoryName
    };
    setDocuments((prev) => [...prev, newDoc]);

    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId,
      eventType: 'DOCUMENT',
      title: `Documento guardado: ${newDoc.fileName}`,
      description: doc.description || `Guardado localmente. Respaldo en Drive no disponible.`,
      eventDate: new Date().toISOString().split('T')[0],
      relatedEntityId: docId,
      createdAt: new Date().toISOString()
    };
    setHistory((prev) => [newEvent, ...prev]);

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveDocument(ctx, newDoc);
      await repo.saveHistoryEvent(ctx, newEvent);
    });

    return docId;
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));

    persistirPorMutacion(async (repo, ctx) => {
      await repo.darDeBajaDocument(ctx, id);
    });
  };

  const completeTask = (id: string) => {
    let updatedTask: FollowUpTask | null = null;
    setTasks((prev) => prev.map((t) => {
      if (t.id === id) {
        updatedTask = { ...t, status: 'DONE' };
        return updatedTask;
      }
      return t;
    }));

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedTask) {
        await repo.saveTask(ctx, updatedTask);
      }
    });
  };

  const toggleReminder = (id: string) => {
    let updatedReminder: Reminder | null = null;
    let updatedDose: MedicationDoseReminder | null = null;
    setReminders((prev) => {
      let isMedication = false;
      let newStatus: ReminderStatus = 'PENDING';
      
      const updated = prev.map((r) => {
        if (r.id === id) {
          isMedication = r.reminderType === 'MEDICATION';
          newStatus = r.status === 'DONE' ? 'PENDING' : 'DONE';
          updatedReminder = { ...r, status: newStatus };
          return updatedReminder;
        }
        return r;
      });

      if (isMedication) {
        const doseStatus: DoseReminderStatus = (newStatus as string) === 'DONE' ? 'TAKEN' : 'PENDING';
        setMedicationDoseReminders(doses => doses.map(d => {
          if (d.id === id) {
            updatedDose = {
              ...d,
              status: doseStatus,
              takenAt: doseStatus === 'TAKEN' ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString(),
              syncStatus: ('PENDING_SYNC') as any
            };
            return updatedDose;
          }
          return d;
        }));
      }

      return updated;
    });

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedReminder) {
        await repo.saveReminder(ctx, updatedReminder);
      }
      if (updatedDose) {
        await repo.saveDoseReminder(ctx, updatedDose);
      }
    });
  };

  /**
   * C3.4 · El cálculo vive en `lib/pautaMedicacion`, con pruebas.
   *
   * Aquí quedaba mezclado con la sesión y los metadatos de sincronización, sin
   * tope de tomas y con identificadores construidos con `Date.now()` más azar:
   * dentro de un mismo bucle `Date.now()` no cambia, así que 400 tomas chocaban
   * de identificador con una probabilidad altísima. Ahora son deterministas.
   */
  const generateDoseReminders = (prescription: MedicationPrescription): MedicationDoseReminder[] => {
    return generarDosis(prescription, contextoDeDosis(prescription)).dosis;
  };

  /** Datos que acompañan a cada toma y no dependen de la pauta. */
  const contextoDeDosis = (prescription: MedicationPrescription): ContextoDosis => ({
    prescriptionId: prescription.id,
    memberId: prescription.memberId,
    medicationName: prescription.name,
    dose: prescription.dose,
    creadoEn: new Date().toISOString(),
    syncStatus: 'PENDING_SYNC',
    ownerEmail: user?.email || null,
    ownerGoogleId: user?.googleId || user?.id || null,
    sourceDeviceId: deviceId || null,
  });

  /**
   * C3.4 · Cambia la pauta de un tratamiento SIN destruir lo ya ocurrido.
   *
   * Regenerar sin más borraba las tomas anteriores, incluidas las que ya
   * estaban tomadas o falladas: eso falsifica el historial clínico. Aquí solo
   * se sustituye lo que todavía no ha llegado.
   */
  const editarPautaMedicacion = (id: string, pauta: Pauta): ResultadoReprogramacion | null => {
    const prescripcion = medicationPrescriptions.find((m) => m.id === id);
    if (!prescripcion) return null;

    const actualizada: MedicationPrescription = { ...prescripcion, ...pauta };
    const resultado = reprogramarDosis(
      pauta,
      contextoDeDosis(actualizada),
      medicationDoseReminders,
      new Date(),
    );

    const nowIso = new Date().toISOString();
    setMedicationPrescriptions((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...actualizada, updatedAt: nowIso, syncStatus: 'PENDING_SYNC' }
          : m,
      ),
    );

    // Las de otros tratamientos se quedan como estaban; de este, solo lo que
    // ya forma parte del historial más lo que genera la pauta nueva.
    setMedicationDoseReminders((prev) => [
      ...prev.filter((d) => d.prescriptionId !== id),
      ...resultado.conservadas,
      ...resultado.dosis,
    ]);

    return resultado;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Bloque D · Mascotas
  //
  // La validación vive en `domain/mascotas` y se ejecuta AQUÍ, no en el
  // formulario: por esta puerta también entran los datos de un respaldo
  // restaurado y, en el Bloque G, los de Firestore.
  // ═══════════════════════════════════════════════════════════════════════

  /** Metadatos comunes a cualquier cosa que se cree en el expediente. */
  const marcasDeCreacion = () => {
    const nowIso = new Date().toISOString();
    return {
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      syncStatus: ('PENDING_SYNC') as Pet['syncStatus'],
      ownerEmail: user?.email || null,
      ownerGoogleId: user?.googleId || user?.id || null,
      sourceDeviceId: deviceId || null,
    };
  };

  const addPet = (borrador: BorradorMascota): Validacion => {
    const validacion = validarMascota(borrador);
    if (!validacion.valido) return validacion;

    const nueva: Pet = {
      id: `pet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      familyId: familyId || 'local',
      memberId: borrador.memberId as string,
      nombre: (borrador.nombre as string).trim(),
      especie: borrador.especie!,
      raza: borrador.raza?.trim() || null,
      fechaNacimiento: borrador.fechaNacimiento || null,
      sexo: borrador.sexo!,
      pesoActualKg: borrador.pesoActualKg ?? null,
      pesoIdealKg: borrador.pesoIdealKg ?? null,
      activo: true,
      notas: borrador.notas?.trim() || null,
      ...marcasDeCreacion(),
    };

    setPets((prev) => [...prev, nueva]);
    return { valido: true };
  };

  const updatePet = (id: string, cambios: BorradorMascota): Validacion => {
    const actual = pets.find((p) => p.id === id);
    if (!actual) {
      return { valido: false, problemas: [{ campo: 'id', mensaje: 'La mascota ya no existe.' }] };
    }

    // Se valida la mascota RESULTANTE, no solo los campos que llegan: un
    // cambio parcial puede dejar el conjunto en un estado imposible.
    const resultante: BorradorMascota = {
      nombre: cambios.nombre ?? actual.nombre,
      especie: cambios.especie ?? actual.especie,
      raza: cambios.raza ?? actual.raza,
      fechaNacimiento: cambios.fechaNacimiento ?? actual.fechaNacimiento,
      sexo: cambios.sexo ?? actual.sexo,
      pesoActualKg: cambios.pesoActualKg ?? actual.pesoActualKg,
      pesoIdealKg: cambios.pesoIdealKg ?? actual.pesoIdealKg,
      memberId: cambios.memberId ?? actual.memberId,
      notas: cambios.notas ?? actual.notas,
    };

    const validacion = validarMascota(resultante);
    if (!validacion.valido) return validacion;

    setPets((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              ...resultante,
              nombre: (resultante.nombre as string).trim(),
              raza: resultante.raza?.trim() || null,
              notas: resultante.notas?.trim() || null,
              updatedAt: new Date().toISOString(),
              syncStatus: 'PENDING_SYNC',
            }
          : p,
      ),
    );
    return { valido: true };
  };

  /**
   * Marca activa o inactiva.
   *
   * No hay borrado. Un animal que ya no está sigue teniendo un historial
   * clínico que puede hacer falta —para el veterinario del siguiente, o para
   * la propia familia— y borrarlo no devuelve nada a cambio.
   */
  const setPetActiva = (id: string, activa: boolean) => {
    setPets((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              activo: activa,
              updatedAt: new Date().toISOString(),
              syncStatus: 'PENDING_SYNC',
            }
          : p,
      ),
    );
  };

  /**
   * D2 · Registra un pesaje y refresca el peso actual de la mascota.
   *
   * `pesoActualKg` es un REFLEJO del pesaje más reciente, no una fuente
   * aparte. Se recalcula sobre la serie completa —no se asigna el peso que
   * acaba de entrar— porque nada impide registrar hoy un pesaje de la semana
   * pasada, y ese no es el peso actual de nadie.
   */
  const addPetWeight = (entrada: {
    petId: string;
    fecha: string;
    pesoKg: number;
    nota?: string | null;
  }): Validacion => {
    const validacion = validarPeso(entrada);
    if (!validacion.valido) return validacion;

    const mascota = pets.find((p) => p.id === entrada.petId);
    if (!mascota) {
      return { valido: false, problemas: [{ campo: 'petId', mensaje: 'La mascota ya no existe.' }] };
    }

    const nuevo: PesoMascota = {
      id: `peso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      petId: entrada.petId,
      // Denormalizado desde la mascota: es lo que usan las reglas de Firestore
      // para decidir quién puede leerlo, sin releer el documento padre.
      memberId: mascota.memberId,
      fecha: entrada.fecha,
      pesoKg: entrada.pesoKg,
      nota: entrada.nota?.trim() || null,
      ...marcasDeCreacion(),
    };

    const serie = [...petWeights.filter((p) => p.petId === entrada.petId && !p.deletedAt), nuevo].sort(
      (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0),
    );
    const masReciente = serie[serie.length - 1];

    setPetWeights((prev) => [...prev, nuevo]);
    setPets((prev) =>
      prev.map((p) =>
        p.id === entrada.petId
          ? {
              ...p,
              pesoActualKg: masReciente.pesoKg,
              updatedAt: new Date().toISOString(),
              syncStatus: 'PENDING_SYNC',
            }
          : p,
      ),
    );

    return { valido: true };
  };

  /**
   * D3 · Registra una vacuna aplicada.
   *
   * El estado —al día, próxima, vencida— NO se guarda: se calcula a partir de
   * las dos fechas en `lib/vacunasMascota`. Un estado guardado que nadie
   * refresca miente en cuanto pasa la medianoche.
   */
  const addPetVaccine = (entrada: {
    petId: string;
    vacuna: string;
    fecha: string;
    proximaDosis?: string | null;
    laboratorio?: string | null;
    lote?: string | null;
    veterinario?: string | null;
  }): Validacion => {
    const validacion = validarVacunaMascota(entrada);
    if (!validacion.valido) return validacion;

    const mascota = pets.find((p) => p.id === entrada.petId);
    if (!mascota) {
      return { valido: false, problemas: [{ campo: 'petId', mensaje: 'La mascota ya no existe.' }] };
    }

    const nueva: VacunaMascota = {
      id: `vacpet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      petId: entrada.petId,
      // Denormalizado: es lo que usan las reglas de Firestore sin releer el
      // documento padre.
      memberId: mascota.memberId,
      vacuna: entrada.vacuna.trim(),
      fecha: entrada.fecha,
      proximaDosis: entrada.proximaDosis || null,
      laboratorio: entrada.laboratorio?.trim() || null,
      lote: entrada.lote?.trim() || null,
      veterinario: entrada.veterinario?.trim() || null,
      ...marcasDeCreacion(),
    };

    setPetVaccines((prev) => [...prev, nueva]);
    return { valido: true };
  };

  /**
   * D4 · Registra una atención veterinaria.
   *
   * Es un registro de lo que YA pasó: no programa nada, no entra en la agenda
   * y no genera avisos. Por eso aquí no hay `scheduleAutoSync` de agenda ni
   * recordatorio que sembrar, y `TipoEvento` sigue teniendo cuatro valores.
   */
  const addPetHistory = (entrada: {
    petId: string;
    fecha: string;
    tipo: TipoHistorialVet;
    diagnostico: string;
    tratamiento?: string | null;
    veterinario?: string | null;
  }): Validacion => {
    const validacion = validarHistorialVet(entrada);
    if (!validacion.valido) return validacion;

    const mascota = pets.find((p) => p.id === entrada.petId);
    if (!mascota) {
      return { valido: false, problemas: [{ campo: 'petId', mensaje: 'La mascota ya no existe.' }] };
    }

    const nueva: EntradaHistorialVet = {
      id: `histvet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      petId: entrada.petId,
      // Denormalizado desde la mascota: es lo que usan las reglas de Firestore
      // para decidir quién puede leerlo, sin releer el documento padre.
      memberId: mascota.memberId,
      fecha: entrada.fecha,
      tipo: entrada.tipo,
      diagnostico: entrada.diagnostico.trim(),
      tratamiento: entrada.tratamiento?.trim() || null,
      veterinario: entrada.veterinario?.trim() || null,
      // Los adjuntos llegan con el módulo de documentos: aquí se guardaría la
      // referencia, nunca el archivo.
      documentoId: null,
      ...marcasDeCreacion(),
    };

    setPetHistory((prev) => [...prev, nueva]);
    return { valido: true };
  };

  const addMedicalOrder = (order: Omit<MedicalOrder, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => {
    const newId = `ord-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const email = user?.email || 'titular@correo.com';
    const uid = user?.googleId || user?.id || 'unknown';

    const newOrder: MedicalOrder = {
      ...order,
      id: newId,
      status: order.status || (order.requiresAuthorization ? 'PENDING_AUTHORIZATION' : 'AUTHORIZED'),
      createdAt: nowIso,
      updatedAt: nowIso,
      syncStatus: 'PENDING_SYNC',
      ownerEmail: email,
      ownerGoogleId: uid,
      sourceDeviceId: deviceId || null
    };

    setMedicalOrders(prev => [...prev, newOrder]);

    const newEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: order.memberId,
      eventType: 'MEDICAL_ORDER',
      title: `Orden médica registrada: ${order.title}`,
      description: `Orden del médico ${order.doctorName || 'No especificado'}. Especialidad: ${order.specialty || 'No especificado'}. Requiere autorización: ${order.requiresAuthorization ? 'Sí' : 'No'}.`,
      eventDate: order.issuedAt,
      relatedEntityId: newId,
      createdAt: nowIso
    };
    setHistory(prev => [newEvent, ...prev]);


    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveMedicalOrder(ctx, newOrder);
      await repo.saveHistoryEvent(ctx, newEvent);
    });
  };

  const updateMedicalOrder = (id: string, fields: Partial<MedicalOrder>) => {
    const nowIso = new Date().toISOString();
    let updatedOrder: MedicalOrder | null = null;
    let newEvent: MedicalHistoryEvent | null = null;
    setMedicalOrders(prev => prev.map(o => {
      if (o.id === id) {
        updatedOrder = {
          ...o,
          ...fields,
          updatedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any
        };
        
        if (fields.status && fields.status !== o.status) {
          newEvent = {
            id: `hist-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            memberId: o.memberId,
            eventType: 'MEDICAL_ORDER',
            title: `Orden médica actualizada`,
            description: `Orden "${o.title}" cambió su estado de ${o.status} a ${fields.status}.`,
            eventDate: new Date().toISOString().split('T')[0],
            relatedEntityId: id,
            createdAt: nowIso
          };
          setTimeout(() => setHistory(h => [newEvent!, ...h]), 50);
        }

        return updatedOrder;
      }
      return o;
    }));


    persistirPorMutacion(async (repo, ctx) => {
      if (updatedOrder) {
        await repo.saveMedicalOrder(ctx, updatedOrder);
      }
      if (newEvent) {
        await repo.saveHistoryEvent(ctx, newEvent);
      }
    });
  };

  const deleteMedicalOrder = (id: string) => {
    const nowIso = new Date().toISOString();
    let deletedOrder: MedicalOrder | null = null;
    setMedicalOrders(prev => prev.map(o => {
      if (o.id === id) {
        deletedOrder = {
          ...o,
          deletedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any,
          updatedAt: nowIso
        };
        return deletedOrder;
      }
      return o;
    }));

    persistirPorMutacion(async (repo, ctx) => {
      await repo.darDeBajaMedicalOrder(ctx, id);
    });
  };

  const createAppointmentFromOrder = (orderId: string, apptData: Omit<MedicalAppointment, 'id' | 'documentIds' | 'medicalOrderId'>) => {
    const newId = `appt-${Date.now()}`;
    const nowIso = new Date().toISOString();
    let date = '';
    let time = '';
    if (apptData.scheduledAt && apptData.scheduledAt.includes('T')) {
      [date, time] = apptData.scheduledAt.split('T');
    } else if (apptData.scheduledAt) {
      date = apptData.scheduledAt;
    }

    const email = user?.email || 'titular@correo.com';
    const uid = user?.googleId || user?.id || 'unknown';

    const newAppt: MedicalAppointment = {
      ...apptData,
      id: newId,
      medicalOrderId: orderId,
      doctor: apptData.doctorName,
      date,
      time,
      documentIds: [],
      calendarSyncStatus: calendarSyncEnabled ? 'PENDING_CALENDAR_SYNC' : 'LOCAL_ONLY',
      syncStatus: 'PENDING_SYNC',
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      retentionStatus: 'ACTIVE',
      ownerEmail: email,
      ownerGoogleId: uid,
      sourceDeviceId: deviceId || null
    };
    
    setAppointments(prev => [...prev, newAppt]);

    const newReminder: Reminder = {
      id: `rem-${Date.now()}`,
      memberId: apptData.memberId,
      title: `Cita Médica: ${apptData.doctorName} (${apptData.specialty})`,
      description: `Agendada desde orden médica. Ubicación: ${apptData.location || 'Consultorio'}.`,
      dueDate: apptData.scheduledAt,
      reminderType: 'APPOINTMENT',
      status: 'PENDING',
      relatedEventId: newId
    };
    setReminders(prev => [...prev, newReminder]);

    const newEventAppt: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: apptData.memberId,
      eventType: 'APPOINTMENT',
      title: `Cita de ${apptData.specialty} agendada`,
      description: `Agendada desde orden de autorización. Médico: ${apptData.doctorName}.`,
      eventDate: apptData.scheduledAt.split('T')[0],
      relatedEntityId: newId,
      createdAt: nowIso
    };
    setHistory(prev => [newEventAppt, ...prev]);

    let updatedOrder: MedicalOrder | null = null;
    setMedicalOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        updatedOrder = {
          ...o,
          status: 'APPOINTMENT_SCHEDULED' as const,
          relatedAppointmentId: newId,
          updatedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any
        };
        return updatedOrder;
      }
      return o;
    }));


    if (calendarSyncEnabled) {
      setTimeout(() => {
        syncAppointmentToCalendar(newId, newAppt);
      }, 200);
    }

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveAppointment(ctx, newAppt);
      await repo.saveReminder(ctx, newReminder);
      await repo.saveHistoryEvent(ctx, newEventAppt);
      if (updatedOrder) {
        await repo.saveMedicalOrder(ctx, updatedOrder);
      }
    });
  };

  const syncMedicationCalendarEvents = async (
    prescriptionId: string,
    doses: MedicationDoseReminder[],
    prescription: MedicationPrescription
  ) => {
    const activeDoses = doses.filter(d => !d.deletedAt && d.status === 'PENDING');
    if (activeDoses.length === 0) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const member = members.find(m => m.id === prescription.memberId);
    const memberName = member ? member.fullName : 'Familiar';

    let token = calendarAccessToken;
    if (!token) {
      try {
        token = await ensureCalendarToken(clientId, false);
        setCalendarAccessToken(token);
        setLastCalendarAuthTime(new Date().toISOString());
      } catch (_) {
        token = null;
      }
    }

    if (!token) return;

    try {
      setCalendarStatus('sincronizando');
      const updatedDoses = [...medicationDoseRemindersRef.current];
      let hasUpdates = false;

      for (const dose of activeDoses) {
        try {
          const result = await createMedicationDoseCalendarEvent(
            token,
            prescription.name,
            prescription.dose,
            dose.scheduledAt,
            memberName,
            prescription.instructions
          );

          const doseIdx = updatedDoses.findIndex(d => d.id === dose.id);
          if (doseIdx >= 0) {
            updatedDoses[doseIdx] = {
              ...updatedDoses[doseIdx],
              googleCalendarEventId: result.eventId,
              syncStatus: 'PENDING_SYNC'
            };
            hasUpdates = true;
          }
        } catch (err) {
          console.error(`Error syncing dose reminder ${dose.id} to calendar:`, err);
        }
      }

      if (hasUpdates) {
        setMedicationDoseReminders(updatedDoses);
      }
      setCalendarStatus('sincronizado');
    } catch (err) {
      console.error('Error in syncMedicationCalendarEvents:', err);
      setCalendarStatus('error');
    }
  };

  const addMedicationPrescription = (prescription: Omit<MedicationPrescription, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => {
    const newId = `med-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const email = user?.email || 'titular@correo.com';
    const uid = user?.googleId || user?.id || 'unknown';

    const newPrescription: MedicationPrescription = {
      ...prescription,
      id: newId,
      createdAt: nowIso,
      updatedAt: nowIso,
      syncStatus: 'PENDING_SYNC',
      ownerEmail: email,
      ownerGoogleId: uid,
      sourceDeviceId: deviceId || null
    };

    const generatedDoses = generateDoseReminders({ ...newPrescription });

    setMedicationPrescriptions(prev => [...prev, newPrescription]);
    setMedicationDoseReminders(prev => [...prev, ...generatedDoses]);

    const globalRemindersToAdd: Reminder[] = generatedDoses.map(dose => ({
      id: dose.id,
      memberId: prescription.memberId,
      title: `Tomar ${prescription.name} (${prescription.dose})`,
      description: prescription.instructions || 'Tomar según indicación médica.',
      dueDate: dose.scheduledAt,
      reminderType: 'MEDICATION',
      status: 'PENDING',
      relatedEventId: newId
    }));
    
    setReminders(prev => [...prev, ...globalRemindersToAdd]);

    const newHistoryEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId: prescription.memberId,
      eventType: 'MEDICATION',
      title: `Prescripción de medicamento registrada: ${prescription.name}`,
      description: `Dosis: ${prescription.dose}. Duración: ${prescription.durationDays} días. Frecuencia: ${prescription.frequencyType}.`,
      eventDate: prescription.startDate,
      relatedEntityId: newId,
      createdAt: nowIso
    };
    setHistory(prev => [newHistoryEvent, ...prev]);


    if (calendarSyncEnabled && generatedDoses.length > 0 && generatedDoses.length <= 20) {
      setTimeout(() => {
        syncMedicationCalendarEvents(newId, generatedDoses, newPrescription);
      }, 200);
    }

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveMedication(ctx, newPrescription);
      for (const dose of generatedDoses) {
        await repo.saveDoseReminder(ctx, dose);
      }
      for (const reminder of globalRemindersToAdd) {
        await repo.saveReminder(ctx, reminder);
      }
      await repo.saveHistoryEvent(ctx, newHistoryEvent);
    });
  };

  const updateMedicationPrescription = (id: string, fields: Partial<MedicationPrescription>) => {
    const nowIso = new Date().toISOString();
    let updatedPrescription: MedicationPrescription | null = null;
    let histEvent: MedicalHistoryEvent | null = null;
    const modifiedDoses: MedicationDoseReminder[] = [];
    const modifiedReminders: Reminder[] = [];

    setMedicationPrescriptions(prev => prev.map(m => {
      if (m.id === id) {
        updatedPrescription = {
          ...m,
          ...fields,
          updatedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any
        };

        if (fields.status && fields.status !== m.status) {
          const historyMsg = `Medicamento "${m.name}" fue marcado como ${fields.status}.`;
          histEvent = {
            id: `hist-${Date.now()}`,
            memberId: m.memberId,
            eventType: 'MEDICATION',
            title: `Medicamento ${fields.status.toLowerCase()}`,
            description: historyMsg,
            eventDate: new Date().toISOString().split('T')[0],
            relatedEntityId: id,
            createdAt: nowIso
          };
          setTimeout(() => setHistory(h => [histEvent!, ...h]), 50);

          if (fields.status === 'SUSPENDED' || fields.status === 'CANCELLED') {
            setMedicationDoseReminders(doses => doses.map(d => {
              if (d.prescriptionId === id && d.status === 'PENDING') {
                const skippedDose = { ...d, status: 'SKIPPED' as const, updatedAt: nowIso, syncStatus: ('PENDING_SYNC') as any };
                modifiedDoses.push(skippedDose);
                return skippedDose;
              }
              return d;
            }));
            setReminders(rems => rems.map(r => {
              if (r.relatedEventId === id && r.status === 'PENDING') {
                const doneReminder = { ...r, status: 'DONE' as const };
                modifiedReminders.push(doneReminder);
                return doneReminder;
              }
              return r;
            }));
          }
        }

        return updatedPrescription;
      }
      return m;
    }));

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedPrescription) {
        await repo.saveMedication(ctx, updatedPrescription);
      }
      if (histEvent) {
        await repo.saveHistoryEvent(ctx, histEvent);
      }
      for (const d of modifiedDoses) {
        await repo.saveDoseReminder(ctx, d);
      }
      for (const r of modifiedReminders) {
        await repo.saveReminder(ctx, r);
      }
    });
  };

  const deleteMedicationPrescription = (id: string) => {
    const nowIso = new Date().toISOString();
    let deletedPrescription: MedicationPrescription | null = null;
    const deletedDoses: MedicationDoseReminder[] = [];

    setMedicationPrescriptions(prev => prev.map(m => {
      if (m.id === id) {
        deletedPrescription = {
          ...m,
          deletedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any,
          updatedAt: nowIso
        };
        return deletedPrescription;
      }
      return m;
    }));

    setMedicationDoseReminders(prev => prev.map(d => {
      if (d.prescriptionId === id) {
        const delDose = {
          ...d,
          deletedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any,
          updatedAt: nowIso
        };
        deletedDoses.push(delDose);
        return delDose;
      }
      return d;
    }));

    setReminders(prev => prev.filter(r => r.relatedEventId !== id));

    persistirPorMutacion(async (repo, ctx) => {
      if (deletedPrescription) {
        await repo.darDeBajaMedication(ctx, id);
      }
      for (const d of deletedDoses) {
        await repo.darDeBajaDoseReminder(ctx, d.id);
      }
    });
  };

  const markDoseReminder = (reminderId: string, status: DoseReminderStatus, takenAt?: string | null) => {
    const nowIso = new Date().toISOString();
    let updatedDose: MedicationDoseReminder | null = null;
    let updatedReminder: Reminder | null = null;
    
    setMedicationDoseReminders(prev => prev.map(d => {
      if (d.id === reminderId) {
        updatedDose = {
          ...d,
          status,
          takenAt: status === 'TAKEN' ? (takenAt || nowIso) : null,
          updatedAt: nowIso,
          syncStatus: ('PENDING_SYNC') as any
        };
        return updatedDose;
      }
      return d;
    }));

    let globalStatus: ReminderStatus = 'PENDING';
    if (status === 'TAKEN') globalStatus = 'DONE';
    else if (status === 'MISSED') globalStatus = 'OVERDUE';
    else if (status === 'SKIPPED') globalStatus = 'DONE';

    setReminders(prev => prev.map(r => {
      if (r.id === reminderId) {
        updatedReminder = {
          ...r,
          status: globalStatus
        };
        return updatedReminder;
      }
      return r;
    }));


    persistirPorMutacion(async (repo, ctx) => {
      if (updatedDose) {
        await repo.saveDoseReminder(ctx, updatedDose);
      }
      if (updatedReminder) {
        await repo.saveReminder(ctx, updatedReminder);
      }
    });
  };

  const setDriveSync = (enabled: boolean) => {
    setDriveSyncEnabled(enabled);
    setDocuments((prev) => 
      prev.map((d) => ({
        ...d,
        syncStatus: enabled ? 'SYNCED' : 'LOCAL_ONLY'
      }))
    );
  };

  const setCalendarSync = (enabled: boolean) => {
    setCalendarSyncEnabled(enabled);
    setAppointments((prev) => 
      prev.map((a) => ({
        ...a,
        calendarSyncStatus: enabled ? (a.googleCalendarEventId ? 'SYNCED' : 'PENDING_SYNC') : 'LOCAL_ONLY'
      }))
    );
  };

  const connectSheets = async (): Promise<string | null> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return null;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setSheetsStatus('error');
      setSheetsError('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
      return null;
    }

    setSheetsStatus('authorizing');
    setSheetsError(null);
    try {
      // Usar TokenManager: reusar token operacional si está vigente
      const token = await ensureOperationalToken(clientId, false);
      setSheetsAccessToken(token);
      setSheetsStatus('connected');
      setLastSheetsAuthTime(new Date().toISOString());
      return token;
    } catch (err: any) {
      const errCode = err?.error || err?.message || 'auth_error';
      setSheetsStatus('error');
      setSheetsError(errCode === 'access_denied' ? 'Acceso denegado. Verifica que tu correo esté autorizado como tester.' : (errCode || 'El usuario canceló o falló la autorización'));
      return null;
    }
  };

  const exportToSheets = async (memberId: string): Promise<string> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return '';
    setSheetsStatus('connecting');
    setSheetsError(null);

    const clientId3 = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    // Intentar token desde caché del TokenManager primero
    let token = sheetsAccessToken;
    if (!token && clientId3) {
      try {
        token = await ensureOperationalToken(clientId3, false);
        setSheetsAccessToken(token);
        setLastSheetsAuthTime(new Date().toISOString());
        setSheetsStatus('connected');
      } catch (_) {
        token = await connectSheets();
      }
    } else if (!token) {
      token = await connectSheets();
    }

    if (!token) {
      setSheetsStatus('error');
      setSheetsError('Permiso de Google Sheets denegado.');
      const updatedMeta: LastExportMetadata = {
        spreadsheetId: null,
        spreadsheetUrl: null,
        exportedAt: new Date().toISOString(),
        exportedBy: user ? user.displayName : 'Usuario',
        sheetsSyncStatus: 'ERROR',
        sheetsError: 'Permiso de Google Sheets denegado.'
      };
      setLastExportMetadata(updatedMeta);
      throw new Error('Permiso de Google Sheets denegado.');
    }

    try {
      setSheetsStatus('exportando');
      
      const currentStateSnapshot = {
        members,
        healthProfiles,
        appointments,
        checkups,
        vaccines,
        exams,
        examResults,
        documents,
        history,
        reminders,
        tasks
      };

      const ownerName = user ? user.displayName : 'Titular';
      const ownerEmail = user ? user.email : 'titular@correo.com';

      const result = await exportFamilyHealthWorkbook(token, currentStateSnapshot, ownerName, ownerEmail);

      const updatedMeta: LastExportMetadata = {
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        exportedAt: new Date().toISOString(),
        exportedBy: user ? user.displayName : 'Usuario',
        sheetsSyncStatus: 'EXPORTED',
        sheetsError: null
      };

      setLastExportMetadata(updatedMeta);
      setSheetsStatus('exportado');
      return result.spreadsheetUrl;
    } catch (err: any) {
      console.error('Error exportando a Google Sheets:', err.message || err);
      setSheetsStatus('error');
      setSheetsError(err.message || 'Error durante la exportación');
      
      const updatedMeta: LastExportMetadata = {
        spreadsheetId: lastExportMetadata?.spreadsheetId || null,
        spreadsheetUrl: lastExportMetadata?.spreadsheetUrl || null,
        exportedAt: new Date().toISOString(),
        exportedBy: user ? user.displayName : 'Usuario',
        sheetsSyncStatus: 'ERROR',
        sheetsError: err.message || 'Error durante la exportación'
      };
      setLastExportMetadata(updatedMeta);
      throw err;
    }
  };

  // ── GMAIL IMPORT MODULE ACTIONS ───────────────────────────────────────────

  /**
   * isPastAppointment — Returns true if the detected date+time of a candidate
   * is strictly before the current moment. Candidates without a detectable date
   * are NOT considered past (we keep them for manual review).
   */
  const isPastAppointment = (detectedDate?: string | null, detectedTime?: string | null): boolean => {
    if (!detectedDate) return false; // no date → not considered past
    const timeStr = detectedTime || '00:00';
    const candidateDt = new Date(`${detectedDate}T${timeStr}`);
    if (isNaN(candidateDt.getTime())) return false;
    return candidateDt.getTime() < Date.now();
  };

  /**
   * Bloque B · Las acciones sobre remitentes de correo se retiraron.
   *
   * Existían para construir la consulta `from:` del escaneo de Gmail. Sin
   * escaneo no tienen a quién servir, y dejarlas sería código muerto que la
   * interfaz ya no puede alcanzar.
   *
   * La LISTA sí se conserva —`emailSources` sigue en el estado y en el
   * almacenamiento— para no dejar huérfanos los datos que alguien ya tuviera
   * guardados. Retirarla exige decidir qué hacer con esos registros, y esa
   * decisión no se toma en silencio.
   */

  const addAppointmentCandidate = (candidate: ImportedEmailAppointmentCandidate) => {
    let updatedCandidate: ImportedEmailAppointmentCandidate | null = null;
    setAppointmentCandidates(prev => {
      const idx = prev.findIndex(c => c.gmailMessageId === candidate.gmailMessageId);
      if (idx >= 0) {
        const updated = [...prev];
        updatedCandidate = { ...candidate, updatedAt: new Date().toISOString(), syncStatus: ('PENDING_SYNC') as any };
        updated[idx] = updatedCandidate;
        return updated;
      }
      updatedCandidate = { ...candidate, syncStatus: ('PENDING_SYNC') as any };
      return [...prev, updatedCandidate];
    });

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedCandidate) {
        await repo.saveAppointmentCandidate(ctx, updatedCandidate);
      }
    });
  };

  const updateAppointmentCandidate = (id: string, fields: Partial<ImportedEmailAppointmentCandidate>) => {
    let updatedCandidate: ImportedEmailAppointmentCandidate | null = null;
    setAppointmentCandidates(prev => prev.map(c => {
      if (c.id === id) {
        updatedCandidate = {
          ...c,
          ...fields,
          updatedAt: new Date().toISOString(),
          syncStatus: ('PENDING_SYNC') as any
        };
        return updatedCandidate;
      }
      return c;
    }));

    persistirPorMutacion(async (repo, ctx) => {
      if (updatedCandidate) {
        await repo.saveAppointmentCandidate(ctx, updatedCandidate);
      }
    });
  };

  const importAppointmentFromCandidate = async (
    candidateId: string,
    memberId: string,
    customDetails: Partial<MedicalAppointment>
  ) => {
    const candidate = appointmentCandidatesRef.current.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidato no encontrado.');

    // 1. Validaciones de Duplicados obligatorias
    const dupByMsgId = appointmentsRef.current.some(a => a.sourceMessageId === candidate.gmailMessageId && !a.deletedAt);
    if (dupByMsgId) {
      throw new Error('Esta cita ya ha sido importada (coincidencia de gmailMessageId).');
    }

    const targetDate = customDetails.date || candidate.detectedDate;
    const targetTime = customDetails.time || candidate.detectedTime;
    const targetDoctor = customDetails.doctorName || candidate.detectedDoctor || 'Médico';
    const targetSpecialty = customDetails.specialty || candidate.detectedSpecialty || 'Medicina General';
    const targetSubject = candidate.subject;
    const targetSender = candidate.sourceEmail;
    const targetReceivedAt = candidate.receivedAt;

    if (!targetDate || !targetTime) {
      throw new Error('La fecha y la hora son obligatorias para importar la cita.');
    }

    // Duplicado por miembro + fecha + hora + médico/especialidad
    const dupByDateTimeDoctor = appointmentsRef.current.some(a => 
      a.memberId === memberId &&
      a.scheduledAt === `${targetDate}T${targetTime}` &&
      (a.doctorName?.toLowerCase() === targetDoctor.toLowerCase() || a.specialty?.toLowerCase() === targetSpecialty.toLowerCase()) &&
      !a.deletedAt
    );
    if (dupByDateTimeDoctor) {
      throw new Error('Ya existe una cita para este familiar en la misma fecha y hora con este médico/especialidad.');
    }

    // Duplicado por asunto + remitente + fecha del correo
    const dupBySubjectSenderDate = appointmentsRef.current.some(a => 
      a.sourceSubject === targetSubject &&
      a.sourceEmail === targetSender &&
      a.createdAt?.split('T')[0] === targetReceivedAt?.split('T')[0] &&
      !a.deletedAt
    );
    if (dupBySubjectSenderDate) {
      throw new Error('Ya se importó una cita con el mismo asunto, remitente y fecha de correo.');
    }

    // 2. Crear Cita Médica Local inmediatamente
    const apptId = `appt-${Date.now()}`;
    const newAppointment: MedicalAppointment = {
      id: apptId,
      memberId,
      doctorName: targetDoctor,
      doctor: targetDoctor,
      specialty: targetSpecialty,
      scheduledAt: `${targetDate}T${targetTime}`,
      date: targetDate,
      time: targetTime,
      location: customDetails.location || candidate.detectedLocation || 'Consultorio',
      reason: customDetails.reason || `Importada desde correo: ${candidate.subject}`,
      notes: customDetails.notes || `Snippet: ${candidate.rawSnippet}`,
      status: 'SCHEDULED' as HealthEventStatus,
      documentIds: [],
      source: 'GMAIL_IMPORT' as const,
      sourceEmail: candidate.sourceEmail,
      sourceMessageId: candidate.gmailMessageId,
      sourceSubject: candidate.subject,
      syncStatus: ('PENDING_SYNC') as any,
      calendarSyncStatus: 'PENDING_CALENDAR_SYNC' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setAppointments(prev => [...prev, newAppointment]);
    
    // Marcar candidato como IMPORTADO
    let updatedCandidate: ImportedEmailAppointmentCandidate | null = null;
    setAppointmentCandidates(prev => prev.map(c => {
      if (c.id === candidateId) {
        updatedCandidate = {
          ...c,
          status: 'IMPORTED' as const,
          createdAppointmentId: apptId,
          updatedAt: new Date().toISOString(),
          syncStatus: ('PENDING_SYNC') as any
        };
        return updatedCandidate;
      }
      return c;
    }));

    // Registrar evento de historial
    const importHistoryEvent: MedicalHistoryEvent = {
      id: `hist-${Date.now()}`,
      memberId,
      eventType: 'APPOINTMENT',
      title: 'Cita importada desde un correo',
      description: `Se importó la cita con ${targetDoctor} (${targetSpecialty}) programada para el ${targetDate} a las ${targetTime}.`,
      eventDate: targetDate,
      createdAt: new Date().toISOString()
    };
    setHistory(prev => [importHistoryEvent, ...prev]);

    // 3. Sincronizar en segundo plano sin bloquear
    setTimeout(async () => {
      try {
        await syncAppointmentToCalendar(apptId, newAppointment);
      } catch (calErr) {
        console.error('Error sincronizando la cita importada a Google Calendar:', calErr);
      }
    }, 100);

    setTimeout(async () => {
      try {
        await flushPendingSync();
      } catch (sheetErr) {
        console.error('Error haciendo push de la cita importada a Google Sheets:', sheetErr);
      }
    }, 1500);

    persistirPorMutacion(async (repo, ctx) => {
      await repo.saveAppointment(ctx, newAppointment);
      await repo.saveHistoryEvent(ctx, importHistoryEvent);
      if (updatedCandidate) {
        await repo.saveAppointmentCandidate(ctx, updatedCandidate);
      }
    });
  };

  /**
   * Bloque B · Crea un borrador de cita a partir de texto.
   *
   * Sustituye a `scanGmailForAppointmentsAction`. La diferencia no es de
   * implementación sino de naturaleza: aquello leía el buzón del titular con
   * un ámbito OAuth restringido; esto recibe el texto que la persona ya tenía
   * delante. No hay token, ni red, ni ámbito, ni servicio externo.
   *
   * El candidato nace SIEMPRE en PENDING_REVIEW. Convertirlo en cita exige
   * `importAppointmentFromCandidate`, que es un acto explícito de la persona.
   */
  const crearCandidatoManual = (
    texto: string,
    nombreAdjunto?: string | null,
  ): ImportedEmailAppointmentCandidate | null => {
    const borrador = crearBorradorDesdeTexto(texto, membersRef.current, { nombreAdjunto });
    if (!borrador) return null;

    // La preferencia de «solo citas futuras» sigue viva y ahora aplica aquí.
    // No se descarta el borrador: se marca, para que la persona lo vea y
    // decida. Descartarlo en silencio ocultaría lo que acaba de pegar.
    const pasada =
      gmailOnlyFutureRef.current &&
      isPastAppointment(borrador.detectedDate, borrador.detectedTime);

    const candidato: ImportedEmailAppointmentCandidate = {
      ...borrador,
      status: pasada ? 'IGNORED' : 'PENDING_REVIEW',
      syncStatus: ('PENDING_SYNC') as any,
    };

    addAppointmentCandidate(candidato);
    return candidato;
  };

  // 3. Métodos para la administración y restauración local
  const clearAllData = () => {
    setIsLoading(true);
    const activeUser = getActiveUser();
    const userEmailOrId = activeUser && activeUser !== 'demo' ? (activeUser.googleId || activeUser.email) : 'demo';
    
    clearAppState(userEmailOrId);
    if (activeUser && activeUser !== 'demo') {
      setActiveUser(null);
      setUser(null);
    }
    
    setMembers([]);
    setHealthProfiles({});
    setAppointments([]);
    setCheckups([]);
    setVaccines([]);
    setExams([]);
    setExamResults({});
    setDocuments([]);
    setHistory([]);
    setReminders(prev => []);
    setTasks(prev => []);
    setMedicalOrders(prev => []);
    setMedicationPrescriptions(prev => []);
    setMedicationDoseReminders(prev => []);
    setEmailSources([
      {
        id: 'source-default',
        email: 'noreply@informacion.saludsis.mil.co',
        label: 'Salud SIS (Defecto)',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    setAppointmentCandidates([]);
    setDriveSyncEnabled(false);
    setCalendarSyncEnabled(false);
    setLastExportMetadata(null);
    setSimulatedRole(null);
    setSimulatedEmail(null);
    setSharedReports([]);
    
    // Reset base links
    setDatabaseSpreadsheetId(null);
    setDatabaseSpreadsheetUrl(null);
    setLastSyncAt(null);
    setLastPullAt(null);
    setLastPushAt(null);
    setAppDataFileId(null);
    setLastKnownRevision(0);
    
    setIsLoading(false);
  };

  const restoreDemoData = () => {
    setIsLoading(true);
    setActiveUser('demo');
    
    const fallbackUser: UserAccount = {
      ...mockUser,
      provider: 'mock',
      loggedAt: new Date().toISOString()
    };
    
    setUser(fallbackUser);
    const sanitizedMockMembers = mockMembers.map(m => ({ ...m, status: 'ACTIVE' as const }));
    const sanitizedMockAppointments = mockAppointments.map(a => ({ ...a, retentionStatus: 'ACTIVE' as const }));
    
    setMembers(sanitizedMockMembers);
    setHealthProfiles(mockHealthProfiles);
    setAppointments(sanitizedMockAppointments);
    setCheckups(mockCheckups);
    setVaccines(mockVaccines);
    setExams(mockExams);
    setExamResults(mockExamResults);
    setDocuments(mockDocuments);
    setHistory(mockHistory);
    setReminders(mockReminders);
    setTasks(mockTasks);
    setMedicalOrders([]);
    setMedicationPrescriptions([]);
    setMedicationDoseReminders([]);
    setDriveSyncEnabled(true);
    setCalendarSyncEnabled(true);
    setLastExportMetadata(null);
    setSimulatedRole(null);
    setSimulatedEmail(null);
    setSharedReports([]);
    
    saveAppState({
      user: fallbackUser,
      members: sanitizedMockMembers,
      healthProfiles: mockHealthProfiles,
      appointments: sanitizedMockAppointments,
      checkups: mockCheckups,
      vaccines: mockVaccines,
      exams: mockExams,
      examResults: mockExamResults,
      documents: mockDocuments,
      history: mockHistory,
      reminders: mockReminders,
      tasks: mockTasks,
      driveSyncEnabled: true,
      calendarSyncEnabled: true,
      lastExportMetadata: null,
      simulatedRole: null,
      simulatedEmail: null,
      sharedReports: [],
      databaseSpreadsheetId: null,
      databaseSpreadsheetUrl: null,
      lastSyncAt: null,
      lastPullAt: null,
      lastPushAt: null,
      syncStatus: 'disconnected',
      syncError: null,
      deviceId,
      syncStrategy: 'LAST_WRITE_WINS',
      lastKnownRevision: 0,
      appDataFileId: null,
      medicalOrders: [],
      medicationPrescriptions: [],
      medicationDoseReminders: []
    }, 'demo');
    
    setIsLoading(false);
  };

  const clearDemoData = () => {
    clearAppState('demo');
  };

  const exportState = () => {
    exportDataAsJSON({
      user,
      members,
      healthProfiles,
      appointments,
      checkups,
      vaccines,
      exams,
      examResults,
      documents,
      history,
      reminders,
      tasks,
      driveSyncEnabled,
      calendarSyncEnabled,
      lastExportMetadata,
      simulatedRole,
      simulatedEmail,
      sharedReports,
      medicalOrders,
      medicationPrescriptions,
      medicationDoseReminders,
      pets,
      petWeights,
      petVaccines,
      petHistory
    });
  };

  /**
   * A6-F3 · Un respaldo ficticio no entra en un expediente real, ni al reves.
   *
   * La validacion vive aqui y no en la pagina de Ajustes para que ninguna otra
   * ruta de importacion pueda saltarsela. El motivo del rechazo se devuelve
   * como codigo: la interfaz nunca muestra contenido del respaldo.
   */
  const importBackupJSON = (data: SavedAppState): ResultadoImportacion => {
    if (!data) return { ok: false, codigo: 'SIN_ORIGEN' };

    const veredicto = validarImportacion(origenDatosRef.current, origenDeEstado(data));
    if (!veredicto.ok) return veredicto;

    setIsLoading(true);
    try {
      if (Array.isArray(data.members)) setMembers(data.members);
      if (data.healthProfiles) setHealthProfiles(data.healthProfiles);
      if (Array.isArray(data.appointments)) setAppointments(data.appointments);
      if (Array.isArray(data.checkups)) setCheckups(data.checkups);
      if (Array.isArray(data.vaccines)) setVaccines(data.vaccines);
      if (Array.isArray(data.exams)) setExams(data.exams);
      if (data.examResults) setExamResults(data.examResults);
      if (Array.isArray(data.documents)) setDocuments(data.documents);
      if (Array.isArray(data.history)) setHistory(data.history);
      if (Array.isArray(data.reminders)) setReminders(data.reminders);
      if (Array.isArray(data.tasks)) setTasks(data.tasks);
      if (Array.isArray(data.medicalOrders)) setMedicalOrders(data.medicalOrders);
      if (Array.isArray(data.medicationPrescriptions)) setMedicationPrescriptions(data.medicationPrescriptions);
      if (Array.isArray(data.medicationDoseReminders)) setMedicationDoseReminders(data.medicationDoseReminders);
      // Bloque D · Un respaldo que no restaura las mascotas es una trampa:
      // se descubre cuando ya no están.
      if (Array.isArray(data.pets)) setPets(data.pets);
      if (Array.isArray(data.petWeights)) setPetWeights(data.petWeights);
      if (Array.isArray(data.petVaccines)) setPetVaccines(data.petVaccines);
      if (Array.isArray(data.petHistory)) setPetHistory(data.petHistory);
      if (Array.isArray(data.sharedReports)) setSharedReports(data.sharedReports);
      if (Array.isArray(data.emailSources)) setEmailSources(data.emailSources);
      if (Array.isArray(data.appointmentCandidates)) setAppointmentCandidates(data.appointmentCandidates);

      if (data.databaseSpreadsheetId) setDatabaseSpreadsheetId(data.databaseSpreadsheetId);
      if (data.databaseSpreadsheetUrl) setDatabaseSpreadsheetUrl(data.databaseSpreadsheetUrl);
      if (data.appDataFileId) setAppDataFileId(data.appDataFileId);

      const nowStr = new Date().toISOString();
      const markPendingSync = <T extends { syncStatus?: any; updatedAt?: string }>(arr: T[]): T[] => {
        return arr.map(item => ({
          ...item,
          syncStatus: ('PENDING_SYNC') as any,
          updatedAt: item.updatedAt || nowStr
        }));
      };

      if (user?.provider === 'google') {
        if (Array.isArray(data.members)) setMembers(markPendingSync(data.members));
        if (Array.isArray(data.appointments)) setAppointments(markPendingSync(data.appointments));
        if (Array.isArray(data.checkups)) setCheckups(markPendingSync(data.checkups));
        if (Array.isArray(data.vaccines)) setVaccines(markPendingSync(data.vaccines));
        if (Array.isArray(data.exams)) setExams(markPendingSync(data.exams));
        if (Array.isArray(data.documents)) setDocuments(markPendingSync(data.documents));
        if (Array.isArray(data.medicalOrders)) setMedicalOrders(markPendingSync(data.medicalOrders));
        if (Array.isArray(data.medicationPrescriptions)) setMedicationPrescriptions(markPendingSync(data.medicationPrescriptions));
        if (Array.isArray(data.medicationDoseReminders)) setMedicationDoseReminders(markPendingSync(data.medicationDoseReminders));
        
        setTimeout(async () => {
          try {
            await syncNow();
          } catch (syncErr) {
            console.error('Error auto-syncing imported backup:', syncErr);
          }
        }, 1000);
      }
    } catch (e) {
      console.error('Error importing backup JSON:', e);
      throw e;
    } finally {
      setIsLoading(false);
    }
    return { ok: true };
  };


  // ── AUTO-SYNC AL LOGIN (intento silencioso) ───────────────────────────────

  /**
   * autoSyncOnLogin — Busca automáticamente en Google appDataFolder si existe
   * una base operacional. Usa prompt:'' para intentar token SILENCIOSO sin popup.
   * Si Google requiere consentimiento, setea needs_auth y muestra banner.
   * NO bloquea el UX — el usuario puede usar la app mientras esto corre.
   */
  // ── BÚSQUEDA DE BASE EXISTENTE E INICIALIZACIÓN ──────────────────────────

  /**
   * checkForExistingDatabase — Busca en Google Drive si ya existe una base operacional
   * vinculada (pate-salud-config.json).
   * - Si silent=true, intenta obtener el token sin popup (prompt: '').
   * - Si silent=false, abre el popup de consentimiento si no hay token.
   * - Si encuentra la base, carga el historial remoto en el cliente.
   * - Retorna true si encontró base, false si no.
   */
  const checkForExistingDatabase = async (explicitToken?: string, silent = true): Promise<boolean> => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return false;

    setSyncInitStatus('checking');
    setSyncInitMessage('Buscando tu base de datos en Google...');

    try {
      let token = explicitToken || getOperationalTokenIfValid();
      if (!token) {
        token = await ensureOperationalToken(clientId, silent);
      }

      const configFileId = await findConfigInAppData(token);
      if (!configFileId) {
        setAppDataFileId(null);
        setSyncInitStatus('no_remote_data');
        setSyncInitMessage('No existe base Google-native para esta cuenta.');
        return false;
      }

      const remoteConfig = await readConfigFromAppData(token, configFileId);
      if (!remoteConfig || !remoteConfig.databaseSpreadsheetId) {
        setAppDataFileId(configFileId);
        setSyncInitStatus('no_remote_data');
        setSyncInitMessage('No existe base Google-native para esta cuenta.');
        return false;
      }

      const remoteSheetId = remoteConfig.databaseSpreadsheetId as string;
      const remoteSheetUrl = remoteConfig.databaseSpreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${remoteSheetId}`;

      setAppDataFileId(configFileId);
      setDatabaseSpreadsheetId(remoteSheetId);
      setDatabaseSpreadsheetUrl(remoteSheetUrl);

      if (remoteConfig.permissionRefs?.sharedReports) {
        setSharedReports(remoteConfig.permissionRefs.sharedReports);
      }

      // Preferencia de citas futuras desde remoto: gana el valor remoto si
      // viene explícito; si no, se conserva el local.
      if (remoteConfig.gmailOnlyFutureAppointments !== undefined && remoteConfig.gmailOnlyFutureAppointments !== null) {
        setGmailOnlyFutureAppointments(remoteConfig.gmailOnlyFutureAppointments);
      }

      setSyncInitMessage('Base encontrada. Cargando datos desde Google...');
      await pullFromGoogle();

      setSyncInitStatus('loaded_from_google');
      setSyncInitMessage(`✅ Datos cargados desde Google (${new Date().toLocaleTimeString('es-CO')})`);
      setNeedsGoogleAuth(false);
      setPendingSyncCount(0);
      return true;
    } catch (err: any) {
      const errCode = err?.error || err?.message || '';
      const errMessage = err?.message || '';
      const isNotFound = errMessage.includes('Not Found') || errMessage.includes('404') || errMessage.includes('403') || errMessage.includes('not found') || errMessage.includes('deleted');

      const needsInteraction =
        errCode === 'interaction_required' ||
        errCode === 'consent_required' ||
        errCode === 'login_required' ||
        errCode === 'access_denied' ||
        errCode === 'popup_closed_by_user' ||
        errCode === 'popup_failed_to_open';

      if (needsInteraction) {
        setSyncInitStatus('needs_auth');
        setSyncInitMessage('Conecta Google para buscar tu base existente.');
        setNeedsGoogleAuth(true);
      } else if (isNotFound) {
        setDatabaseSpreadsheetId(null);
        setDatabaseSpreadsheetUrl(null);
        setSyncInitStatus('no_remote_data');
        setSyncInitMessage('No existe base Google-native para esta cuenta.');
      } else {
        setSyncInitStatus('error');
        setSyncInitMessage(`Error al conectar: ${errCode || 'error desconocido'}.`);
      }
      return false;
    }
  };

  /**
   * autoSyncOnLogin — Intenta buscar silenciosamente al iniciar la app/sesión.
   */
  const autoSyncOnLogin = async (loggedUser: UserAccount): Promise<void> => {
    if (!loggedUser || loggedUser.provider !== 'google') return;
    await checkForExistingDatabase(undefined, true /* silent */);
  };

  // ── CAPA OPERACIONAL GOOGLE-NATIVE FOUNDATION ACTIONS ──────────────────────

  /**
   * requestGoogleNativeToken — Obtiene token operacional via TokenManager.
   * Intenta caché en memoria primero; si expiró, abre popup de GIS.
   * NUNCA guarda el token en localStorage ni sessionStorage.
   */
  const requestGoogleNativeToken = async (): Promise<string | null> => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setOpSyncStatus('error');
      setOpSyncError('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
      return null;
    }

    setOpSyncStatus('syncing');
    setOpSyncError(null);
    try {
      // Usar TokenManager: reusar token en memoria si es válido
      return await ensureOperationalToken(clientId, false);
    } catch (err: any) {
      const errCode = err?.error || err?.message || 'Error de autorización';
      setOpSyncStatus('error');
      setOpSyncError(errCode);
      return null;
    }
  };

  const createGoogleNativeDatabase = async () => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    const token = await requestGoogleNativeToken();
    if (!token) return;

    try {
      setOpSyncStatus('syncing');
      
      // 1. Verificar si ya existe pate-salud-config.json en appDataFolder
      const configId = await findConfigInAppData(token);
      let sheetId = databaseSpreadsheetId;
      let sheetUrl = databaseSpreadsheetUrl;
      let remoteConfig: any = null;

      if (configId) {
        // Si existe en appDataFolder, lo leemos
        remoteConfig = await readConfigFromAppData(token, configId);
        if (remoteConfig && remoteConfig.databaseSpreadsheetId) {
          const foundSheetId = remoteConfig.databaseSpreadsheetId as string;
          sheetId = foundSheetId;
          sheetUrl = remoteConfig.databaseSpreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sheetId}`;
          setAppDataFileId(configId);
          setDatabaseSpreadsheetId(sheetId);
          setDatabaseSpreadsheetUrl(sheetUrl);
          
          if (remoteConfig.permissionRefs && remoteConfig.permissionRefs.sharedReports) {
            setSharedReports(remoteConfig.permissionRefs.sharedReports);
          }
          
          avisar('Se encontró una base operacional en tu cuenta de Google. Se cargará tu historial.');
          // Proceder a jalar el historial
          await pullFromGoogle();
          return;
        }
      }

      // 2. Si no existe la hoja, la creamos en Drive
      if (!sheetId) {
        const result = await createOperationalSpreadsheet(token, user?.email || '');
        sheetId = result.spreadsheetId;
        sheetUrl = result.spreadsheetUrl;
        setDatabaseSpreadsheetId(sheetId);
        setDatabaseSpreadsheetUrl(sheetUrl);
      }

      // 3. Crear o actualizar configuración en appDataFolder
      const newConfig = {
        schemaVersion: 2,
        ownerEmail: user?.email || '',
        ownerGoogleId: user?.googleId || '',
        databaseSpreadsheetId: sheetId,
        databaseSpreadsheetUrl: sheetUrl,
        lastSyncAt: new Date().toISOString(),
        lastPullAt: new Date().toISOString(),
        lastPushAt: new Date().toISOString(),
        deviceId: deviceId || 'unknown',
        syncStrategy: 'LAST_WRITE_WINS',
        lastKnownRevision: 1,
        backupRefs: {},
        permissionRefs: {
          sharedReports: sharedReports
        },
        // Bloque B · Valores inertes: el escaneo ya no existe, pero el esquema
        // remoto no se altera para no forzar una migración.
        gmailAutoScanEnabled: false,
        gmailScanTime: '00:00',
        gmailScanRangeDays: 90,
        gmailOnlyFutureAppointments: gmailOnlyFutureRef.current
      };

      const newConfigId = await writeConfigToAppData(token, newConfig, configId);
      setAppDataFileId(newConfigId);

      
      setOpSyncStatus('synced');
      setLastSyncAt(new Date().toISOString());

      // Registrar auditoría
      const newAudit: MedicalHistoryEvent = {
        id: `hist-${Date.now()}`,
        memberId: members[0]?.id || 'family-owner',
        eventType: 'OTHER',
        title: 'Base operacional Google creada',
        description: `Base Google-native creada exitosamente con ID: ${sheetId}`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(h => [newAudit, ...h]);

    } catch (err: any) {
      console.error('Error creando base operacional Google:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al crear la base operacional.');
    }
  };

  /**
   * Relee el expediente entero desde el backend del titular (G4b).
   *
   * QUÉ SE FUE DE AQUÍ, Y POR QUÉ NO SE ECHA DE MENOS
   * ─────────────────────────────────────────────────
   * Esto eran 174 líneas de fusión «gana la última escritura»: la copia local
   * podía tener cambios sin enviar, y había que decidir cuál de las dos
   * versiones de cada fila sobrevivía —dejando rastro en el historial cuando
   * se pisaba algo—.
   *
   * Con la escritura por mutación **no hay cambios sin enviar**: cada uno sale
   * en el momento en que ocurre, y si el router lo rechaza la pantalla se
   * deshace. Así que la hoja es la verdad y se lee entera. La fusión no se ha
   * simplificado: ha dejado de tener sentido.
   *
   * Y había una razón más fuerte para no dejar la lectura donde estaba: leía
   * **otra hoja**. La que la PWA creó en el alta, por la API de Sheets. El
   * router escribe en la suya, la del despliegue. Con la escritura ya movida,
   * mantener esa lectura habría significado guardar en un sitio y mirar en
   * otro, y el síntoma habría sido «guardo y no aparece».
   */
  const pullFromGoogle = async () => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;

    setOpSyncStatus('syncing');
    try {
      const repo = await getDataRepository();
      const datos = await repo.loadAll({
        uid: user?.googleId ?? user?.id ?? '',
        email: user?.email ?? '',
        familyId: null,
      });

      aplicarDatosRemotos(datos);
      setLastPullAt(new Date().toISOString());
      setLastSyncAt(new Date().toISOString());
      setOpSyncStatus('synced');
    } catch (err: unknown) {
      const codigo = (err as { codigo?: string } | null)?.codigo ?? '';
      console.error('[AppContext] no se pudo releer el expediente:', err);
      setOpSyncStatus('error');
      setOpSyncError(
        codigo === 'SIN_BACKEND'
          ? 'Este navegador todavía no tiene registrada la hoja de la familia.'
          : codigo === 'SIN_IDENTIDAD'
            ? 'La sesión caducó. Vuelve a entrar.'
            : 'No se pudo descargar el expediente.',
      );
      throw err;
    }
  };

  /*
   * G4b · aquí vivía `pushToGoogleInternal`.
   *
   * Reescribía **las 20 pestañas operativas enteras** en cada sincronización,
   * con `writeAllOperationalTables`. Era el punto que el antiguo Bloque H venía
   * a eliminar, y era incompatible con lo que construyó E6: `aplicar()` recibe
   * mutaciones concretas, valida cada una contra el rol de quien la pide y
   * escribe **solo esas filas**.
   *
   * Lo sustituye `persistirPorMutacion`, que manda una mutación por cambio en
   * el momento en que ocurre.
   */

  /**
   * El titular registra su hoja (G4b).
   *
   * Si cuadra, además de guardarla se **reenvían en el acto** los cambios que
   * esperaban sin destino: esperar al siguiente guardado para descubrir que
   * había cosas atascadas sería dejar el problema a medio resolver.
   */
  const registrarHojaFamiliar = async (url: string): Promise<ResultadoRegistro> => {
    const resultado = await comprobarYRegistrar(url);
    if (resultado.ok) {
      setHojaRegistrada(true);
      await flushPendingSync();
    }
    return resultado;
  };

  /** Trae lo nuevo y baja el aviso de cambios remotos. */
  const recargarExpediente = async () => {
    await pullFromGoogle();
    setHayCambiosRemotos(false);
  };

  /**
   * Volver a mirar la hoja.
   *
   * Antes esto empujaba los cambios locales; ahora no hay cambios locales que
   * empujar, porque cada uno se escribe solo en el momento en que ocurre. Lo
   * único que tiene sentido pedir a mano es **releer**.
   */
  const syncNow = async () => {
    await pullFromGoogle();
  };

  const pushToGoogle = async () => {
    // Se conserva mientras la interfaz lo ofrezca en algún sitio. Releer es lo
    // más parecido a lo que hacía, y no miente sobre lo que ocurre.
    await pullFromGoogle();
  };


  const repairGoogleNativeDatabase = async () => {
    const token = await requestGoogleNativeToken();
    if (!token) return;

    try {
      setOpSyncStatus('syncing');
      setOpSyncError(null);

      const configId = await findConfigInAppData(token);
      let sheetId = databaseSpreadsheetId;
      let sheetUrl = databaseSpreadsheetUrl;

      // 1. Intentar validar si la hoja existe y es accesible
      let sheetExists = false;
      if (sheetId) {
        try {
          await readAllOperationalTables(token, sheetId);
          sheetExists = true;
        } catch (e) {
          console.warn('La hoja de cálculo no existe o no es accesible. Se creará una nueva.', e);
        }
      }

      // 2. Si no existe o no es accesible, crearla
      if (!sheetExists) {
        const result = await createOperationalSpreadsheet(token, user?.email || '');
        sheetId = result.spreadsheetId;
        sheetUrl = result.spreadsheetUrl;
        setDatabaseSpreadsheetId(sheetId);
        setDatabaseSpreadsheetUrl(sheetUrl);
      }

      if (!sheetId) {
        throw new Error('No se pudo encontrar ni crear una hoja de cálculo.');
      }

      // 3. Crear o actualizar configuración en appDataFolder
      const newConfig = {
        schemaVersion: 2,
        ownerEmail: user?.email || '',
        ownerGoogleId: user?.googleId || '',
        databaseSpreadsheetId: sheetId,
        databaseSpreadsheetUrl: sheetUrl,
        lastSyncAt: new Date().toISOString(),
        lastPullAt: new Date().toISOString(),
        lastPushAt: new Date().toISOString(),
        deviceId: deviceId || 'unknown',
        syncStrategy: 'LAST_WRITE_WINS',
        lastKnownRevision: 1,
        backupRefs: {},
        permissionRefs: {
          sharedReports: sharedReports
        },
        // Bloque B · Valores inertes: el escaneo ya no existe, pero el esquema
        // remoto no se altera para no forzar una migración.
        gmailAutoScanEnabled: false,
        gmailScanTime: '00:00',
        gmailScanRangeDays: 90,
        gmailOnlyFutureAppointments: gmailOnlyFutureRef.current
      };

      const newConfigId = await writeConfigToAppData(token, newConfig, configId || undefined);
      setAppDataFileId(newConfigId);

      // 4. Forzar la escritura del estado local para reparar cualquier dato
      
      setOpSyncStatus('synced');
      setLastSyncAt(new Date().toISOString());

      // Registrar auditoría
      const newAudit: MedicalHistoryEvent = {
        id: `hist-${Date.now()}`,
        memberId: members[0]?.id || 'family-owner',
        eventType: 'OTHER',
        title: 'Base Google reparada',
        description: `Base Google-native reparada y resincronizada con éxito. Sheets ID: ${sheetId}`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(h => [newAudit, ...h]);
      avisar('Base operacional reparada: se reconstruyó la estructura y se subieron los datos locales.');
    } catch (err: any) {
      console.error('Error al reparar base de datos:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al reparar la base.');
      alert(`Error al reparar la base Google-native: ${err.message}`);
    }
  };

  const exportBackupJSON = () => {
    exportState();
  };

  const requestInitialGooglePermissions = async (): Promise<string | null> => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
    }
    const token = await ensureAllRequiredTokens(clientId, false);
    // Rellenar las variables de estado locales para que los badges se actualicen de inmediato
    setDriveAccessToken(token);
    setSheetsAccessToken(token);
    setCalendarAccessToken(token);
    setLastDriveAuthTime(new Date().toISOString());
    setLastSheetsAuthTime(new Date().toISOString());
    setLastCalendarAuthTime(new Date().toISOString());
    setDriveStatus('connected');
    setSheetsStatus('connected');
    setCalendarStatus('connected');
    return token;
  };

  const ensureGoogleNativeReady = async (silent = true): Promise<string> => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
    }
    const token = await ensureAllRequiredTokens(clientId, silent);
    // Mantener sincronizados los tokens
    setDriveAccessToken(token);
    setSheetsAccessToken(token);
    setCalendarAccessToken(token);
    return token;
  };

  const autoCreateOrLoadGoogleNativeBase = async (token: string): Promise<{ exists: boolean }> => {
    setOpSyncStatus('syncing');
    setSyncInitStatus('checking');
    setSyncInitMessage('Conectando con tu cuenta Google...');
    try {
      const email = user?.email || 'titular@correo.com';
      const uid = user?.googleId || user?.id || 'unknown';

      // 1. Buscar pate-salud-config.json en appDataFolder
      const configFileId = await findConfigInAppData(token);
      if (configFileId) {
        const remoteConfig = await readConfigFromAppData(token, configFileId);
        if (remoteConfig && remoteConfig.databaseSpreadsheetId) {
          const remoteSheetId = remoteConfig.databaseSpreadsheetId;
          const remoteSheetUrl = remoteConfig.databaseSpreadsheetUrl || `https://docs.google.com/spreadsheets/d/${remoteSheetId}`;
          
          setAppDataFileId(configFileId);
          setDatabaseSpreadsheetId(remoteSheetId);
          setDatabaseSpreadsheetUrl(remoteSheetUrl);
          
          if (remoteConfig.permissionRefs?.sharedReports) {
            setSharedReports(remoteConfig.permissionRefs.sharedReports);
          }
          
          setSyncInitStatus('checking');
          setSyncInitMessage('Hemos encontrado tu base de datos de Paté Salud en Google Drive. Descargando...');
          
          // Pull de los datos remotos existentes
          await pullFromGoogle();
          
          setLastSyncAt(new Date().toISOString());
          setOpSyncStatus('synced');
          setSyncInitStatus('loaded_from_google');
          setSyncInitMessage(`✅ Datos sincronizados con Google (${new Date().toLocaleTimeString('es-CO')})`);
          return { exists: true };
        }
      }
      
      // 2. Si no existe la hoja en Drive, crear una nueva
      setSyncInitMessage('Creando tu base de datos segura y privada en Google Drive...');
      const result = await createOperationalSpreadsheet(token, email);
      const sheetId = result.spreadsheetId;
      const sheetUrl = result.spreadsheetUrl;
      
      setDatabaseSpreadsheetId(sheetId);
      setDatabaseSpreadsheetUrl(sheetUrl);
      
      // Crear estructura inicial de config en appDataFolder
      const newConfig = {
        schemaVersion: 2,
        ownerEmail: email,
        ownerGoogleId: uid,
        databaseSpreadsheetId: sheetId,
        databaseSpreadsheetUrl: sheetUrl,
        lastSyncAt: new Date().toISOString(),
        lastPullAt: new Date().toISOString(),
        lastPushAt: new Date().toISOString(),
        deviceId: deviceId || 'unknown',
        syncStrategy: 'LAST_WRITE_WINS',
        lastKnownRevision: 1,
        backupRefs: {},
        permissionRefs: {
          sharedReports: []
        },
        // Bloque B · Valores inertes: el escaneo ya no existe, pero el esquema
        // remoto no se altera para no forzar una migración.
        gmailAutoScanEnabled: false,
        gmailScanTime: '00:00',
        gmailScanRangeDays: 90,
        gmailOnlyFutureAppointments: gmailOnlyFutureRef.current
      };
      
      const newConfigId = await writeConfigToAppData(token, newConfig);
      setAppDataFileId(newConfigId);
      
      // Guardar el estado local (incluyendo el admin/titular) en Google Sheets
      
      setLastSyncAt(new Date().toISOString());
      setOpSyncStatus('synced');
      setSyncInitStatus('loaded_from_google');
      setSyncInitMessage(`✅ Base de datos configurada y sincronizada`);
      
      // Registrar hito
      const newAudit: MedicalHistoryEvent = {
        id: `hist-${Date.now()}`,
        memberId: 'admin',
        eventType: 'OTHER',
        title: 'Base operacional Google creada',
        description: `Base Google-native inicializada automáticamente en Drive. Sheets ID: ${sheetId}`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(h => [newAudit, ...h]);
      
      return { exists: false };
    } catch (err: any) {
      console.error('Error en autoCreateOrLoadGoogleNativeBase:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al configurar base Google-native.');
      setSyncInitStatus('error');
      setSyncInitMessage(`Fallo en configuración: ${err.message}`);
      throw err;
    }
  };

  const postLoginGoogleSetup = async () => {
    const token = await requestInitialGooglePermissions();
    if (!token) throw new Error('No se concedieron permisos de Google.');
    await autoCreateOrLoadGoogleNativeBase(token);
  };


  // ── ROLE SIMULATION & ACCESS CONTROL FILTERING ──────────────────────────────
  
  // Active email matching simulated or actual Google user
  const activeEmail = simulatedEmail || user?.email || null;

  // Determine role and matched member
  let currentUserRole: 'FAMILY_ADMIN' | 'MEMBER_SELF' | 'VIEWER' = 'FAMILY_ADMIN';
  let currentMemberSelfId: string | null = null;

  if (simulatedRole) {
    currentUserRole = simulatedRole;
    if (currentUserRole === 'MEMBER_SELF') {
      const matched = members.find(m => m.email && m.email.toLowerCase() === activeEmail?.toLowerCase() && m.canAccessPortal === true && m.permissionStatus === 'ACTIVE');
      currentMemberSelfId = matched ? matched.id : (members.find(m => m.relationship === 'SELF')?.id || null);
    }
  } else if (currentUserFamilyAccess) {
    // G4 · el rol ya no lo dice Firestore: lo dice la fila de `ACCESO` que
    // resuelve el router. El mapeo es el mismo.
    if (currentUserFamilyAccess.role === 'OWNER' || currentUserFamilyAccess.role === 'CAREGIVER') {
      currentUserRole = 'FAMILY_ADMIN';
    } else if (currentUserFamilyAccess.role === 'MEMBER') {
      currentUserRole = 'MEMBER_SELF';
      currentMemberSelfId = currentUserFamilyAccess.memberId;
    } else if (currentUserFamilyAccess.role === 'VIEWER') {
      currentUserRole = 'VIEWER';
    }
  } else if (activeEmail) {
    const matched = members.find(m => m.email && m.email.toLowerCase() === activeEmail.toLowerCase() && m.canAccessPortal === true && m.permissionStatus === 'ACTIVE');
    if (matched) {
      currentUserRole = 'MEMBER_SELF';
      currentMemberSelfId = matched.id;
    }
  }

  // Member permissions default configuration
  const matchedMember = currentMemberSelfId ? members.find(m => m.id === currentMemberSelfId) : null;
  const memberPerms: MemberPermissions = matchedMember?.permissions || {
    canManageOwnProfile: currentUserRole !== 'VIEWER',
    canManageOwnAppointments: currentUserRole !== 'VIEWER',
    canManageOwnDocuments: currentUserRole !== 'VIEWER',
    canViewOwnHistory: true,
    canUploadDocuments: currentUserRole !== 'VIEWER',
    canExportOwnData: false,
    canViewFamilyData: currentUserRole !== 'MEMBER_SELF',
    canManageFamilyData: currentUserRole === 'FAMILY_ADMIN'
  };

  // If role is MEMBER_SELF, override family data access if granular permissions don't allow it
  const canViewFamily = currentUserRole === 'FAMILY_ADMIN' || memberPerms.canViewFamilyData;

  const filterByRole = <T extends { memberId?: string; id?: string }>(array: T[], memberIdField: keyof T = 'memberId'): T[] => {
    if (currentUserRole === 'MEMBER_SELF' && !canViewFamily) {
      return array.filter(item => {
        const itemMemberId = memberIdField === 'id' ? item.id : item[memberIdField];
        return itemMemberId === currentMemberSelfId;
      });
    }
    return array;
  };

  // Exposed arrays to UI components
  const exposedMembers = members.map(m => ({
    ...m,
    status: m.status || 'ACTIVE'
  })).filter(m => {
    if (m.status === 'DELETED') return false;
    if (currentUserRole === 'MEMBER_SELF' && !canViewFamily) {
      return m.id === currentMemberSelfId;
    }
    return true;
  });

  // ── SECURE GOOGLE-NATIVE SHARING PHASE 3B METHODS ─────────────────────────────

  const shareDocumentWithMember = async (documentId: string, email: string): Promise<void> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    if (!email) throw new Error('El miembro familiar debe poseer un correo electrónico registrado.');

    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const doc = documents.find(d => d.id === documentId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!doc.driveFileId) throw new Error('El archivo no ha sido subido a Google Drive aún.');

    const aceptadoCompartir = await confirmar({
      titulo: 'Compartir documento',
      descripcion: `Se dará acceso al documento «${doc.fileName}» a ${email}. Podrá abrirlo desde su cuenta de Google mientras no revoques el acceso.`,
      etiquetaConfirmar: 'Compartir documento',
      tono: 'primario',
    });
    if (!aceptadoCompartir) return;

    try {
      setOpSyncStatus('syncing');
      setOpSyncError(null);

      // Llamar API de permisos de Drive
      const permissionId = await shareFileWithUser(token, doc.driveFileId, email);

      // Actualizar estado local del documento
      const updatedDoc: ClinicalDocument = {
        ...doc,
        sharedWithEmail: email,
        permissionId,
        sharedAt: new Date().toISOString(),
        revokedAt: null,
        shareStatus: 'SHARED',
        shareError: null,
        syncStatus: 'PENDING_SYNC',
        updatedAt: new Date().toISOString()
      };

      setDocuments(prev => prev.map(d => d.id === documentId ? updatedDoc : d));

      // Registrar evento en historial (Auditoría)
      const shareEvent: MedicalHistoryEvent = {
        id: `hist-share-${Date.now()}`,
        memberId: doc.memberId,
        eventType: 'DOCUMENT',
        title: 'Documento compartido',
        description: `Documento "${doc.fileName}" compartido con ${email} (lector). File ID: ${doc.driveFileId}, Permission ID: ${permissionId}.`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [shareEvent, ...prev]);

      // Sincronizar en lote a la base operacional Sheets en segundo plano

      avisar(`El documento «${doc.fileName}» se compartió correctamente.`);
    } catch (err: any) {
      console.error('Error al compartir documento:', err);
      setDocuments(prev => prev.map(d => d.id === documentId ? {
        ...d,
        shareStatus: 'ERROR',
        shareError: err.message || 'Error de API'
      } : d));

      // Auditoría de error
      const errEvent: MedicalHistoryEvent = {
        id: `hist-share-err-${Date.now()}`,
        memberId: doc.memberId,
        eventType: 'DOCUMENT',
        title: 'Error de compartición',
        description: `Fallo al compartir documento "${doc.fileName}" con ${email}. Error: ${err.message || 'API error'}`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [errEvent, ...prev]);
      throw err;
    }
  };

  const revokeDocumentShare = async (documentId: string): Promise<void> => {
    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const doc = documents.find(d => d.id === documentId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!doc.driveFileId) throw new Error('El archivo no tiene ID de Drive.');
    if (!doc.permissionId) throw new Error('El archivo no posee ID de permiso registrado.');

    const targetEmail = doc.sharedWithEmail || 'correo';

    const aceptadoRevocarDoc = await confirmar({
      titulo: 'Revocar acceso al documento',
      descripcion: `${targetEmail} dejará de poder abrir «${doc.fileName}».`,
      etiquetaConfirmar: 'Revocar acceso',
      tono: 'peligro',
    });
    if (!aceptadoRevocarDoc) return;

    try {
      setOpSyncStatus('syncing');
      setOpSyncError(null);

      // Llamar API para revocar
      await revokeFileShare(token, doc.driveFileId, doc.permissionId);

      // Actualizar estado local
      const updatedDoc: ClinicalDocument = {
        ...doc,
        revokedAt: new Date().toISOString(),
        shareStatus: 'REVOKED',
        syncStatus: 'PENDING_SYNC',
        updatedAt: new Date().toISOString(),
        permissionId: null,
        sharedWithEmail: null
      };

      setDocuments(prev => prev.map(d => d.id === documentId ? updatedDoc : d));

      // Auditoría
      const revokeEvent: MedicalHistoryEvent = {
        id: `hist-rev-${Date.now()}`,
        memberId: doc.memberId,
        eventType: 'DOCUMENT',
        title: 'Documento revocado',
        description: `Acceso al documento "${doc.fileName}" compartido previamente con ${targetEmail} revocado exitosamente.`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [revokeEvent, ...prev]);


      avisar(`Se revocó el acceso de ${targetEmail} al documento.`);
    } catch (err: any) {
      console.error('Error al revocar acceso al documento:', err);
      setDocuments(prev => prev.map(d => d.id === documentId ? {
        ...d,
        shareStatus: 'ERROR',
        shareError: `Error al revocar: ${err.message}`
      } : d));
      throw err;
    }
  };

  const generateAndShareMemberReport = async (memberId: string, email: string): Promise<void> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    if (!email) throw new Error('El miembro familiar debe poseer un correo electrónico registrado.');

    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember) throw new Error('Familiar no encontrado.');

    const aceptadoReporte = await confirmar({
      titulo: 'Crear y compartir reporte clínico',
      descripcion: `Se creará una hoja de cálculo con el historial de ${targetMember.fullName} y se compartirá con ${email}.`,
      etiquetaConfirmar: 'Crear y compartir',
      tono: 'primario',
    });
    if (!aceptadoReporte) return;

    try {
      setOpSyncStatus('syncing');
      setOpSyncError(null);

      // Filtrar datos clínico-operativos exclusivos para este familiar (no expone a otros)
      const filteredProfile = healthProfiles[memberId] || null;
      const filteredAppts = appointments.filter(a => a.memberId === memberId && (a.retentionStatus || 'ACTIVE') !== 'PURGED');
      const filteredCheckups = checkups.filter(c => c.memberId === memberId);
      const filteredVaccines = vaccines.filter(v => v.memberId === memberId);
      const filteredExams = exams.filter(e => e.memberId === memberId);
      const filteredDocs = documents.filter(d => d.memberId === memberId);
      const filteredHistory = history.filter(h => h.memberId === memberId);
      const filteredReminders = reminders.filter(r => r.memberId === memberId);

      const memberData = {
        member: targetMember,
        healthProfile: filteredProfile,
        appointments: filteredAppts,
        checkups: filteredCheckups,
        vaccines: filteredVaccines,
        exams: filteredExams,
        documents: filteredDocs,
        history: filteredHistory,
        reminders: filteredReminders
      };

      // Crear el libro individual en Sheets
      const result = await createIndividualMemberReport(token, targetMember.fullName, memberData);

      // Otorgar permisos de lectura (reader) en Drive al correo destino
      const permissionId = await shareFileWithUser(token, result.spreadsheetId, email);

      // Registrar el nuevo informe en la lista de reportes compartidos
      const newReport: SharedMemberReport = {
        id: `rep-${Date.now()}`,
        memberId,
        memberName: targetMember.fullName,
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        sharedWithEmail: email,
        sharedAt: new Date().toISOString(),
        permissionId,
        shareStatus: 'SHARED',
        shareError: null
      };

      // Actualizar estado local
      const updatedReports = [newReport, ...sharedReports];
      setSharedReports(updatedReports);

      // Actualizar el archivo de configuración en appDataFolder
      let configId = appDataFileId;
      if (!configId) {
        configId = await findConfigInAppData(token);
      }
      const existingConfig = {
        schemaVersion: 2,
        ownerEmail: user?.email || '',
        ownerGoogleId: user?.googleId || '',
        databaseSpreadsheetId: databaseSpreadsheetId || '',
        databaseSpreadsheetUrl: databaseSpreadsheetUrl || '',
        lastSyncAt: new Date().toISOString(),
        lastPullAt: lastPullAt || new Date().toISOString(),
        lastPushAt: new Date().toISOString(),
        deviceId: deviceId || 'unknown',
        syncStrategy: 'LAST_WRITE_WINS',
        lastKnownRevision: lastKnownRevision || 1,
        backupRefs: {},
        permissionRefs: {
          sharedReports: updatedReports
        }
      };

      const newConfigId = await writeConfigToAppData(token, existingConfig, configId || undefined);
      setAppDataFileId(newConfigId);

      // Trazabilidad de Auditoría
      const reportEvent: MedicalHistoryEvent = {
        id: `hist-rep-${Date.now()}`,
        memberId,
        eventType: 'OTHER',
        title: 'Reporte individual creado',
        description: `Reporte clínico individual creado y compartido con ${email}. Spreadsheet ID: ${result.spreadsheetId}, Permission ID: ${permissionId}.`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [reportEvent, ...prev]);

      setOpSyncStatus('synced');
      
      avisar(`Reporte clínico de ${targetMember.fullName} creado y compartido.`);
    } catch (err: any) {
      console.error('Error al generar o compartir reporte individual:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al crear reporte individual.');

      // Registrar error en auditoría
      const errEvent: MedicalHistoryEvent = {
        id: `hist-rep-err-${Date.now()}`,
        memberId,
        eventType: 'OTHER',
        title: 'Error de compartición',
        description: `Fallo al generar reporte clínico individual para ${targetMember.fullName || memberId}. Error: ${err.message}`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [errEvent, ...prev]);
      throw err;
    }
  };

  const revokeMemberReportShare = async (reportId: string): Promise<void> => {
    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const rep = sharedReports.find(r => r.id === reportId);
    if (!rep) throw new Error('Reporte compartido no encontrado.');

    const aceptadoRevocarRep = await confirmar({
      titulo: 'Revocar acceso al reporte clínico',
      descripcion: `${rep.sharedWithEmail} dejará de poder abrir el reporte clínico de ${rep.memberName}.`,
      etiquetaConfirmar: 'Revocar acceso',
      tono: 'peligro',
    });
    if (!aceptadoRevocarRep) return;

    try {
      setOpSyncStatus('syncing');
      setOpSyncError(null);

      // Revocar el permiso si existe el ID de permiso
      if (rep.permissionId) {
        await revokeFileShare(token, rep.spreadsheetId, rep.permissionId);
      }

      // Actualizar estado local
      const updatedReports = sharedReports.map(r => r.id === reportId ? {
        ...r,
        shareStatus: 'REVOKED' as const,
        revokedAt: new Date().toISOString()
      } : r);

      setSharedReports(updatedReports);

      // Actualizar configuración en appDataFolder
      let configId = appDataFileId;
      if (!configId) {
        configId = await findConfigInAppData(token);
      }
      const existingConfig = {
        schemaVersion: 2,
        ownerEmail: user?.email || '',
        ownerGoogleId: user?.googleId || '',
        databaseSpreadsheetId: databaseSpreadsheetId || '',
        databaseSpreadsheetUrl: databaseSpreadsheetUrl || '',
        lastSyncAt: new Date().toISOString(),
        lastPullAt: lastPullAt || new Date().toISOString(),
        lastPushAt: new Date().toISOString(),
        deviceId: deviceId || 'unknown',
        syncStrategy: 'LAST_WRITE_WINS',
        lastKnownRevision: lastKnownRevision || 1,
        backupRefs: {},
        permissionRefs: {
          sharedReports: updatedReports
        }
      };

      const newConfigId = await writeConfigToAppData(token, existingConfig, configId || undefined);
      setAppDataFileId(newConfigId);

      // Auditoría
      const revokeEvent: MedicalHistoryEvent = {
        id: `hist-rep-rev-${Date.now()}`,
        memberId: rep.memberId,
        eventType: 'OTHER',
        title: 'Reporte individual revocado',
        description: `Acceso al reporte clínico individual de ${rep.memberName} para ${rep.sharedWithEmail} revocado exitosamente.`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [revokeEvent, ...prev]);

      setOpSyncStatus('synced');
      avisar(`Se revocó el acceso de ${rep.sharedWithEmail} al reporte.`);
    } catch (err: any) {
      console.error('Error al revocar acceso al reporte individual:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al revocar reporte individual.');
      throw err;
    }
  };

  // ─── repairMemberDocuments ────────────────────────────────────────────────────
  const repairMemberDocuments = async (): Promise<void> => {
    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    let sheetId = databaseSpreadsheetId;
    if (!sheetId) {
      sheetId = await findConfigInAppData(token);
    }
    if (!sheetId) throw new Error('No hay base de datos operacional configurada.');

    setOpSyncStatus('syncing');
    setOpSyncError(null);

    try {
      // 1. Asegurar cabeceras
      await migrateOperationalSheetHeaders(token, sheetId);

      // 2. Leer miembros remotos
      const remoteState = await readAllOperationalTables(token, sheetId);
      const remoteMembers: FamilyMember[] = remoteState.Miembros || [];

      // 1. Leer miembros locales
      const currentMembers = [...membersRef.current];

      // 3. Fusionar con mergeMemberSafely
      // 4. Conservar documentos no vacíos
      // 5. Respetar deletedAt
      const repairedMembers = currentMembers.map(localMember => {
        const remoteMember = remoteMembers.find(r => r.id === localMember.id);
        if (remoteMember) {
          const merged = mergeMemberSafely(localMember, remoteMember);
          return {
            ...merged,
            syncStatus: ('PENDING_SYNC') as any,
            updatedAt: new Date().toISOString()
          };
        }
        return {
          ...localMember,
          syncStatus: ('PENDING_SYNC') as any,
          updatedAt: new Date().toISOString()
        };
      });

      // Asegurar que si hay remotos no presentes locales se integren (si no están borrados)
      remoteMembers.forEach(remoteMember => {
        const localExists = repairedMembers.some(m => m.id === remoteMember.id);
        const isDeleted = remoteMember.deletedAt || remoteMember.status === 'DELETED';
        if (!localExists && !isDeleted) {
          repairedMembers.push({
            ...remoteMember,
            syncStatus: ('PENDING_SYNC') as any,
            updatedAt: new Date().toISOString()
          });
        }
      });

      setMembers(repairedMembers);
      membersRef.current = repairedMembers;

      // 6. Subir estado consolidado
      await syncNow();

      // 7. Leer de vuelta desde Sheets
      const verifiedRemoteState = await readAllOperationalTables(token, sheetId);
      const verifiedRemoteMembers: FamilyMember[] = verifiedRemoteState.Miembros || [];

      // 8. Confirmar que documentType y documentNumber permanecen
      let verificationSuccess = true;
      repairedMembers.forEach(rep => {
        if (rep.status !== 'DELETED' && rep.documentNumber) {
          const remoteRep = verifiedRemoteMembers.find(r => r.id === rep.id);
          if (!remoteRep || remoteRep.documentNumber !== rep.documentNumber || remoteRep.documentType !== rep.documentType) {
            verificationSuccess = false;
            console.error(`Verification failed for member ${rep.fullName}: remote has ${remoteRep?.documentNumber} but expected ${rep.documentNumber}`);
          }
        }
      });

      if (verificationSuccess) {
        setOpSyncStatus('synced');
        avisar('Reparación completada: los documentos quedaron confirmados en Google Sheets.');
      } else {
        throw new Error('La verificación falló. Algunos documentos no se guardaron correctamente en Google Sheets.');
      }
    } catch (err: any) {
      console.error('repairMemberDocuments error:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error en reparación de documentos de miembros.');
      throw err;
    }
  };

  const updateDeviceFromGoogle = async (): Promise<void> => {
    // 1. Exportar backup local automático
    exportState();

    // 2. Hacer pull desde Google
    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const sheetId = databaseSpreadsheetId;
    if (!sheetId) throw new Error('No hay base de datos operacional configurada.');

    // 5. No hacer push inmediato si hay conflictos críticos (advertir primero)
    const remoteState = await readAllOperationalTables(token, sheetId);
    const remoteMembers: FamilyMember[] = remoteState.Miembros || [];
    const localMembers = membersRef.current;
    
    let criticalConflictFound = false;
    let conflictDetails = '';

    localMembers.forEach(localM => {
      const remoteM = remoteMembers.find(r => r.id === localM.id);
      if (remoteM) {
        const localDoc = localM.documentNumber?.trim();
        const remoteDoc = remoteM.documentNumber?.trim();
        if (localDoc && remoteDoc && localDoc !== remoteDoc) {
          criticalConflictFound = true;
          conflictDetails += `\n- ${localM.fullName}: Local "${localDoc}", Remoto "${remoteDoc}"`;
        }
      }
    });

    if (criticalConflictFound) {
      const proceed = await confirmar({
        titulo: 'Conflicto de números de documento',
        descripcion: (
          <>
            <p>
              El número de documento de uno o más familiares no coincide entre este dispositivo y
              Google.
            </p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-2 text-[11px] font-semibold text-slate-700">
              {conflictDetails.trim()}
            </pre>
            <p className="mt-2">
              Se aplicará la versión más reciente en este dispositivo, pero NO se subirá nada a
              Google, para no sobrescribir datos allí.
            </p>
          </>
        ),
        etiquetaConfirmar: 'Aplicar la versión más reciente',
        tono: 'peligro',
      });
      if (!proceed) return;
    }

    // 3. Fusionar con mergeMemberSafely
    // 4. El estado local se actualiza al releer el expediente.
    await pullFromGoogle();
  };

  // ─── Session lock / inactivity ────────────────────────────────────────────────

  /** Vacia las 16 estructuras clinicas. NO toca sesion, preferencias ni pendientes. */
  const vaciarEstadoClinico = () => {
    setMembers([]);
    setHealthProfiles({});
    setAppointments([]);
    setCheckups([]);
    setVaccines([]);
    setExams([]);
    setExamResults({});
    setDocuments([]);
    setHistory([]);
    setReminders([]);
    setTasks([]);
    setMedicalOrders([]);
    setMedicationPrescriptions([]);
    setMedicationDoseReminders([]);
    setAppointmentCandidates([]);
    setSharedReports([]);
    // Bloque D · Sin esto, los datos de las mascotas sobreviven al bloqueo de
    // sesión, que es exactamente lo que A6-F3 vino a impedir.
    setPets([]);
    setPetWeights([]);
    setPetVaccines([]);
    setPetHistory([]);
  };

  /**
   * Bloquea la sesion de verdad: ademas de la superposicion, vacia la memoria
   * clinica y desmonta los watchers.
   *
   * El orden no es negociable. La compuerta de escritura va PRIMERO: sin ella,
   * vaciar el estado dispara el autoguardado y este escribe el estado vacio
   * sobre pate-salud-state:{uid}, destruyendo los cambios sin sincronizar.
   *
   * sessionLockedRef se actualiza de forma SINCRONA antes que el estado, para
   * que no exista una ventana entre el vaciado y el re-render en la que un
   * onSnapshot en vuelo pueda rehidratar los datos.
   */
  const lockSession = () => {
    if (sessionLockedRef.current) return;

    escrituraSuspendidaRef.current = true;          // (1) antes de tocar nada

    const ahora = Date.now();
    bloqueadoDesdeRef.current = ahora;              // (2) solo en memoria...
    escribirMarcadorBloqueo(ahora, origenDatosRef.current);  // ...y en el marcador

    sessionLockedRef.current = true;                // (3) el ref, sincrono
    setSessionLocked(true);
    setSessionLockedAt(new Date(ahora).toISOString());
    setEstadoBloqueo('bloqueado');
    setErrorRestauracion(null);

    vaciarEstadoClinico();                          // (4) la memoria clinica
  };

  /**
   * Restaura el expediente EN SITIO, sin recargar la pagina.
   *
   * No se recarga a proposito: una recarga pondria pendingSyncCount a cero y
   * el usuario perderia la advertencia de cambios sin sincronizar al cerrar
   * sesion. Ese contador no se toca en ningun punto de esta funcion.
   *
   * REAL nunca se restaura desde localStorage: los datos clinicos vienen del
   * backend. DEMO si puede hacerlo, porque su contenido esta marcado como
   * sintetico de forma estructural y no hay PHI que proteger.
   */
  const unlockSession = async (): Promise<void> => {
    // (1) Umbral de 8 horas antes que nada.
    if (superoUmbralBloqueo(bloqueadoDesdeRef.current, Date.now())) {
      void cerrarSesionYPurgar();
      return;
    }

    setEstadoBloqueo('restaurando');
    setErrorRestauracion(null);

    const alLogin = () => {
      borrarMarcadorBloqueo();
      window.location.replace('/login');
    };

    // (2) La sesion debe seguir vigente.
    if (!user) { alLogin(); return; }
    const origen = origenDatosRef.current;

    // G4 · antes se comprobaba aquí `firebaseAuth.currentUser`. Ahora la sesión
    // es el `id_token` en memoria, y quien la vigila es `sesionDeLaAplicacion`.

    // (3) Restauracion segun el origen.
    try {
      if (origen === 'DEMO') {
        const guardado = loadAppState('demo');
        if (!guardado) throw new Error('sin_estado_demo');
        aplicarEstadoRestaurado(guardado);
      } else {
        /*
         * La fuente de verdad es la hoja, y tras un bloqueo se relee entera.
         *
         * PERO NO SE DEJA A NADIE FUERA POR UN FALLO DE RED
         * ─────────────────────────────────────────────────
         * Si el backend no responde, lo que hay en memoria **no es un
         * expediente a medias**: es exactamente el mismo que había antes de
         * bloquear, completo y coherente. Negar el desbloqueo por no poder
         * refrescarlo dejaría a alguien sin acceso a sus propios datos en un
         * ascensor.
         *
         * Se distingue: un fallo pasajero deja pasar con la copia que ya
         * estaba; un rechazo del router —acceso revocado— no, y ahí sí sigue
         * bloqueado.
         */
        try {
          await pullFromGoogle();
        } catch (err: unknown) {
          const reintentable =
            (err as { reintentable?: boolean } | null)?.reintentable === true ||
            (err as { codigo?: string } | null)?.codigo === 'SIN_BACKEND' ||
            (err as { codigo?: string } | null)?.codigo === 'SIN_IDENTIDAD';
          if (!reintentable) throw err;

          console.warn('[AppContext] se desbloquea con la copia local: no se pudo refrescar');
        }
      }
    } catch (err) {
      console.error('[AppContext] No se pudo restaurar la sesión tras el bloqueo:', err);
      setEstadoBloqueo('error_restauracion');
      setErrorRestauracion('No se pudo restaurar la sesión. Vuelve a iniciar sesión.');
      return;   // SIGUE BLOQUEADO: nunca se muestra un expediente a medias.
    }

    // (4) Solo ahora se libera la compuerta y se levanta el bloqueo.
    borrarMarcadorBloqueo();
    bloqueadoDesdeRef.current = null;
    sessionLockedRef.current = false;
    escrituraSuspendidaRef.current = false;
    setSessionLocked(false);
    setSessionLockedAt(null);
    setEstadoBloqueo('abierto');
    resetIdleTimer();
  };

  /** Repuebla el estado clinico desde una instantanea guardada (solo DEMO). */
  const aplicarEstadoRestaurado = (g: SavedAppState) => {
    setMembers(g.members || []);
    setHealthProfiles(g.healthProfiles || {});
    setAppointments(g.appointments || []);
    setCheckups(g.checkups || []);
    setVaccines(g.vaccines || []);
    setExams(g.exams || []);
    setExamResults(g.examResults || {});
    setDocuments(g.documents || []);
    setHistory(g.history || []);
    setReminders(g.reminders || []);
    setTasks(g.tasks || []);
    setMedicalOrders(g.medicalOrders || []);
    setMedicationPrescriptions(g.medicationPrescriptions || []);
    setMedicationDoseReminders(g.medicationDoseReminders || []);
    setAppointmentCandidates(g.appointmentCandidates || []);
    setSharedReports(g.sharedReports || []);
  };

  /** Repuebla el estado clinico desde el backend (REAL con Firebase). */
  const aplicarDatosRemotos = (d: Awaited<ReturnType<Awaited<ReturnType<typeof getDataRepository>>['loadAll']>>) => {
    setMembers(d.members);
    setHealthProfiles(d.healthProfiles);
    setAppointments(d.appointments);
    setCheckups(d.checkups);
    setVaccines(d.vaccines);
    setExams(d.exams);
    setExamResults(d.examResults);
    setDocuments(d.documents);
    setHistory(d.history);
    setReminders(d.reminders);
    setTasks(d.tasks);
    setMedicalOrders(d.medicalOrders);
    setMedicationPrescriptions(d.medications);
    setMedicationDoseReminders(d.doseReminders);
    setAppointmentCandidates(d.appointmentCandidates);
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!autoLockEnabledRef.current) return;
    const ms = autoLockMinutesRef.current * 60 * 1000;
    idleTimerRef.current = setTimeout(() => {
      lockSession();
    }, ms);
  };

  // Watcher de inactividad — reinicia el timer en cualquier interacción del usuario
  useEffect(() => {
    if (!autoLockEnabled) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handler = () => resetIdleTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [autoLockEnabled, autoLockMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cierre nocturno — comprueba cada minuto si estamos dentro de la ventana
  useEffect(() => {
    if (!nightLockEnabled) {
      if (nightLockTimerRef.current) clearInterval(nightLockTimerRef.current);
      return;
    }
    const checkNightLock = () => {
      if (!nightLockEnabledRef.current) return;
      // A6-F3: la logica vive en lib/bloqueoSesion, con pruebas propias que
      // cubren el cruce de medianoche y las horas mal formadas.
      const dentro = estaEnVentanaNocturna(
        minutosDelDia(new Date()),
        nightLockStartRef.current,
        nightLockEndRef.current,
      );
      if (dentro && !sessionLockedRef.current) {
        lockSession();
      }
    };
    checkNightLock();
    nightLockTimerRef.current = setInterval(checkNightLock, 60_000) as any;
    return () => {
      if (nightLockTimerRef.current) clearInterval(nightLockTimerRef.current);
    };
  }, [nightLockEnabled, nightLockStart, nightLockEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const validateDataIntegrity = (): DataIntegrityReport => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Miembros sin id
    const membersWithoutId = membersRef.current.filter(m => !m.id);
    if (membersWithoutId.length > 0) {
      errors.push(`Hay ${membersWithoutId.length} miembro(s) sin ID.`);
    }

    // 2. Miembros con documento duplicado
    const docMap = new Map<string, string[]>();
    membersRef.current.forEach(m => {
      if (m.documentNumber && m.status !== 'DELETED') {
        const key = `${m.documentType || 'OTHER'}:${m.documentNumber.trim()}`;
        const list = docMap.get(key) || [];
        list.push(m.fullName || m.id);
        docMap.set(key, list);
      }
    });
    for (const [key, names] of docMap.entries()) {
      if (names.length > 1) {
        errors.push(`Documento de identidad duplicado (${key}) en los miembros: ${names.join(', ')}.`);
      }
    }

    // 3. Miembros sin documento
    const membersWithoutDoc = membersRef.current.filter(m => m.status !== 'DELETED' && (!m.documentNumber || !m.documentType));
    if (membersWithoutDoc.length > 0) {
      warnings.push(`Hay ${membersWithoutDoc.length} miembro(s) activo(s) sin tipo o número de documento de identidad registrado: ${membersWithoutDoc.map(m => m.fullName).join(', ')}.`);
    }

    // 4. Citas sin memberId
    const apptsWithoutMember = appointmentsRef.current.filter(a => !a.memberId && a.retentionStatus !== 'PURGED');
    if (apptsWithoutMember.length > 0) {
      errors.push(`Hay ${apptsWithoutMember.length} cita(s) sin ID de miembro (memberId vacío).`);
    }

    // 5. Documentos sin memberId
    const docsWithoutMember = documentsRef.current.filter(d => !d.memberId);
    if (docsWithoutMember.length > 0) {
      errors.push(`Hay ${docsWithoutMember.length} documento(s) clínico(s) sin ID de miembro (memberId vacío).`);
    }

    // 6. Medicamentos sin memberId
    const medsWithoutMember = medicationPrescriptionsRef.current.filter(p => !p.memberId);
    if (medsWithoutMember.length > 0) {
      errors.push(`Hay ${medsWithoutMember.length} prescripción(es) de medicamento sin ID de miembro (memberId vacío).`);
    }

    // 7. Tomas sin prescriptionId
    const dosesWithoutPrescription = medicationDoseRemindersRef.current.filter(r => !r.prescriptionId);
    if (dosesWithoutPrescription.length > 0) {
      errors.push(`Hay ${dosesWithoutPrescription.length} toma(s) de medicamentos sin prescripción vinculada (prescriptionId vacío).`);
    }

    // 8. Órdenes sin memberId
    const ordersWithoutMember = medicalOrdersRef.current.filter(o => !o.memberId);
    if (ordersWithoutMember.length > 0) {
      errors.push(`Hay ${ordersWithoutMember.length} orden(es) médica(s) sin ID de miembro (memberId vacío).`);
    }

    // 9. Citas vinculadas a órdenes inexistentes
    const orderIds = new Set(medicalOrdersRef.current.map(o => o.id));
    const apptsWithInvalidOrder = appointmentsRef.current.filter(a => a.medicalOrderId && !orderIds.has(a.medicalOrderId));
    if (apptsWithInvalidOrder.length > 0) {
      warnings.push(`Hay ${apptsWithInvalidOrder.length} cita(s) vinculada(s) a ID de orden médica inexistente.`);
    }

    // 10. Citas importadas duplicadas desde Gmail
    const gmailMsgMap = new Map<string, string[]>();
    appointmentsRef.current.forEach(a => {
      if (a.source === 'GMAIL_IMPORT' && a.sourceMessageId && a.status !== 'CANCELLED') {
        const list = gmailMsgMap.get(a.sourceMessageId) || [];
        list.push(a.id);
        gmailMsgMap.set(a.sourceMessageId, list);
      }
    });
    let duplicateGmailAppts = 0;
    for (const [msgId, ids] of gmailMsgMap.entries()) {
      if (ids.length > 1) {
        duplicateGmailAppts += (ids.length - 1);
      }
    }
    if (duplicateGmailAppts > 0) {
      warnings.push(`Hay ${duplicateGmailAppts} cita(s) importada(s) desde Gmail que están duplicadas (comparten el mismo mensaje de origen).`);
    }

    // 11. Documentos clínicos huérfanos
    const memberIds = new Set(membersRef.current.map(m => m.id));
    const orphanedDocs = documentsRef.current.filter(d => d.memberId && !memberIds.has(d.memberId));
    if (orphanedDocs.length > 0) {
      warnings.push(`Hay ${orphanedDocs.length} documento(s) clínico(s) huérfano(s) (el ID de miembro no coincide con ningún familiar registrado).`);
    }

    const status = errors.length > 0 ? 'errors' : warnings.length > 0 ? 'warnings' : 'ok';
    return {
      status,
      errors,
      warnings,
      checkedAt: new Date().toISOString()
    };
  };

  const exposedAppointments = filterByRole(appointments);
  const exposedVaccines = filterByRole(vaccines);
  const exposedCheckups = filterByRole(checkups);
  const exposedExams = filterByRole(exams);
  const exposedDocuments = filterByRole(documents);
  const exposedHistory = filterByRole(history);
  const exposedReminders = filterByRole(reminders);
  const exposedTasks = filterByRole(tasks);
  const exposedMedicalOrders = filterByRole(medicalOrders);
  const exposedMedicationPrescriptions = filterByRole(medicationPrescriptions);
  const exposedMedicationDoseReminders = filterByRole(medicationDoseReminders);

  return (
    <AppContext.Provider value={{
      user,
      familyGroup: mockFamilyGroup,
      members: exposedMembers,
      healthProfiles,
      appointments: exposedAppointments,
      checkups: exposedCheckups,
      vaccines: exposedVaccines,
      exams: exposedExams,
      examResults,
      documents: exposedDocuments,
      history: exposedHistory,
      reminders: exposedReminders,
      tasks: exposedTasks,
      driveSyncEnabled,
      calendarSyncEnabled,
      isLoading,
      errorCarga,
      reintentarCarga,
      familyId,
      
      // Google Drive states
      driveAccessToken,
      driveStatus,
      driveError,
      lastDriveAuthTime,

      // Google Calendar states
      calendarAccessToken,
      calendarStatus,
      calendarError,
      lastCalendarAuthTime,

      // Google Sheets states
      sheetsAccessToken,
      sheetsStatus,
      sheetsError,
      lastSheetsAuthTime,
      lastExportMetadata,
      
      signIn,
      signOut,
      addMember,
      updateMember,
      deleteMember,
      uploadMemberAvatar,
      deleteMemberAvatar,
      saveHealthProfile,
      addAppointment,
      updateAppointmentStatus,
      addCheckup,
      addVaccine,
      addExam,
      uploadDocument,
      deleteDocument,
      completeTask,
      toggleReminder,
      setDriveSync,
      setCalendarSync,
      exportToSheets,
      
      // Google Drive Actions
      connectDrive,

      // Google Calendar Actions
      connectCalendar,
      syncAppointmentToCalendar,

      // Google Sheets Actions
      connectSheets,

      // Simulated credentials and lifecycle/retention helpers
      currentUserRole,
      currentMemberSelfId,
      simulatedRole,
      simulatedEmail,
      setSimulatedRole,
      setSimulatedEmail,
      inactivateMember,
      reactivateMember,
      runAppointmentRetentionCleanup,
      
      clearAllData,
      restoreDemoData,
      clearDemoData,
      exportState,

      // Medical Orders & Prescription Medications Bindings
      medicalOrders: exposedMedicalOrders,
      medicationPrescriptions: exposedMedicationPrescriptions,
      medicationDoseReminders: exposedMedicationDoseReminders,
      pets,
      petWeights,
      petVaccines,
      petHistory,
      addPet,
      updatePet,
      setPetActiva,
      addPetWeight,
      addPetVaccine,
      addPetHistory,
      addMedicalOrder,
      updateMedicalOrder,
      deleteMedicalOrder,
      createAppointmentFromOrder,
      addMedicationPrescription,
      updateMedicationPrescription,
      deleteMedicationPrescription,
      markDoseReminder,
      generateDoseReminders,
      editarPautaMedicacion,

      // Capa Operacional Google-Native Foundation Values Expose
      databaseSpreadsheetId,
      databaseSpreadsheetUrl,
      lastSyncAt,
      lastPullAt,
      lastPushAt,
      deviceId,
      opSyncStatus,
      opSyncError,
      createGoogleNativeDatabase,
      pullFromGoogle,
      pushToGoogle,
      syncNow,
      updateDeviceFromGoogle,
      repairGoogleNativeDatabase,
      exportBackupJSON,
      postLoginGoogleSetup,
      requestInitialGooglePermissions,
      ensureGoogleNativeReady,
      autoCreateOrLoadGoogleNativeBase,

      // Estado de inicialización automática desde Google
      syncInitStatus,
      syncInitMessage,

      // Auto-sync
      pendingSyncCount,
      autoSyncEnabled,
      setAutoSyncEnabled,
      needsGoogleAuth,
      reconnectGoogle,
      flushPendingSync,
      checkForExistingDatabase,

      // Secure Google-Native Sharing Phase 3B Bindings
      sharedReports,
      shareDocumentWithMember,
      revokeDocumentShare,
      generateAndShareMemberReport,
      revokeMemberReportShare,

      // Importación de citas (Bloque B: manual)
      emailSources,
      appointmentCandidates,
      addAppointmentCandidate,
      updateAppointmentCandidate,
      importAppointmentFromCandidate,
      crearCandidatoManual,
      gmailOnlyFutureAppointments,
      setGmailOnlyFutureAppointments,

      // Member document repair
      repairMemberDocuments,

      // Session lock / inactivity
      sessionLocked,
      sessionLockedAt,
      autoLockEnabled,
      autoLockMinutes,
      nightLockEnabled,
      nightLockStart,
      nightLockEnd,
      unlockSession,
      setAutoLockEnabled,
      setAutoLockMinutes,
      setNightLockEnabled,
      setNightLockStart,
      setNightLockEnd,
      validateDataIntegrity,
      importBackupJSON,
      sincronizacionManual: SINCRONIZACION_MANUAL,
      hayCambiosRemotos,
      recargarExpediente,
      hojaRegistrada,
      registrarHojaFamiliar,
      pendingInvitations,
      invitations,
      createInvitation,
      acceptInvitation,
      revokeInvitation,
      createNewFamily,
      checkPendingInvitations,
      estadoCierre,
      solicitarCierreDeSesion,
      despacharCierre,
      reintentarSincronizacion,
      cerrarSesionYPurgar,
      avisoPurgaDiferida,
      descartarAvisoPurgaDiferida,
      estadoBloqueo,
      errorRestauracion,
      origenDatos,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
