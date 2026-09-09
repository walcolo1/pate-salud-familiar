'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
// ── DataRepository abstraction (Phase 8) ─────────────────────────────────────
import { isFirebaseBackend } from '../lib/dataBackend';
import { getDataRepository, resetDataRepository } from '../lib/dataRepository';
import type { DataUpdate } from '../lib/dataRepository';
import type { FamilyInvitation, FamilyAccess } from '../lib/firestoreService';

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
  addMedicalOrder: (order: Omit<MedicalOrder, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void;
  updateMedicalOrder: (id: string, fields: Partial<MedicalOrder>) => void;
  deleteMedicalOrder: (id: string) => void;
  createAppointmentFromOrder: (orderId: string, apptData: Omit<MedicalAppointment, 'id' | 'documentIds' | 'medicalOrderId'>) => void;
  addMedicationPrescription: (prescription: Omit<MedicationPrescription, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void;
  updateMedicationPrescription: (id: string, fields: Partial<MedicationPrescription>) => void;
  deleteMedicationPrescription: (id: string) => void;
  markDoseReminder: (reminderId: string, status: DoseReminderStatus, takenAt?: string | null) => void;
  generateDoseReminders: (prescription: MedicationPrescription) => MedicationDoseReminder[];

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
  isFirebaseBackend: boolean;
  firebaseAuthReady: boolean;
  familyId: string | null;
  pendingInvitations: FamilyInvitation[];
  invitations: FamilyInvitation[];
  createInvitation: (email: string, memberId: string, role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER') => Promise<string>;
  acceptInvitation: (targetFamilyId: string, invitationId: string) => Promise<void>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  createNewFamily: (name: string) => Promise<void>;
  checkPendingInvitations: () => Promise<FamilyInvitation[]>;
  testFirebaseConnection: () => Promise<void>;

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  // C1.3b · Ambos proveedores envuelven a este en el layout, de modo que el
  // contexto puede preguntar y avisar sin recurrir a los cuadros del navegador.
  const confirmar = useConfirmacion();
  const avisar = useAviso();

  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Cambiar este número vuelve a disparar el efecto de carga inicial.
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState<boolean>(false);
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
  const [pendingInvitations, setPendingInvitations] = useState<FamilyInvitation[]>([]);
  const [invitations, setInvitations] = useState<FamilyInvitation[]>([]);

  // Refs to prevent React state stale closures during async sync/pull operations
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
      medicationDoseReminders
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
    isLoading
  ]);

  // Persist settings to Firebase when they change
  useEffect(() => {
    if (!isFirebaseBackend || isLoading || !user || !currentUserFamilyAccess) return;

    // Check if the user has permission to write family settings (OWNER or CAREGIVER)
    const role = currentUserFamilyAccess.role;
    if (role !== 'OWNER' && role !== 'CAREGIVER') {
      console.warn(`[AppContext] Skipping settings persist because user role ${role} is not OWNER or CAREGIVER`);
      return;
    }
    
    firebasePersist(async (repo, ctx) => {
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

  // Sincronizar el estado de Firebase Auth SDK con el React Context
  useEffect(() => {
    if (!isFirebaseBackend) return;
    if (purgaDiferidaPendiente) return; // A6-F2: ningún listener antes de limpiar

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const initFirebaseAuth = async () => {
      try {
        const { firebaseAuth } = await import('../lib/firebase');
        if (!isMounted) return;
        
        unsubscribe = firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
          if (!isMounted) return;

          if (firebaseUser) {
            // console.info('[AppContext] Firebase Auth user detected:', firebaseUser.email);
            const realUser: UserAccount = {
              id: `user-${firebaseUser.uid}`,
              googleId: firebaseUser.uid,
              displayName: firebaseUser.displayName || firebaseUser.email || '',
              email: firebaseUser.email || '',
              photoUrl: firebaseUser.photoURL || null,
              createdAt: new Date().toISOString(),
              provider: 'google',
              loggedAt: new Date().toISOString()
            };

            setUser(realUser);
            setActiveUser(realUser);

            // Cargar datos familiares desde Firestore
            try {
              console.info(`[Instrumentación] operation: initFamily, authReady: false, firebaseAuth.currentUser?.uid: ${firebaseUser.uid}, user.id: user-${firebaseUser.uid}, user.googleId: ${firebaseUser.uid}, email: ${firebaseUser.email || ''}, path/query: users/${firebaseUser.uid}`);
              setSyncInitStatus('checking');
              setSyncInitMessage('Sincronizando con Firebase...');
              const repo = await getDataRepository();
              const fid = await repo.initFamily({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || firebaseUser.email || '',
              });
              
              if (!isMounted) return;
              setFamilyId(fid);

              if (fid) {
                console.info(`[Instrumentación] operation: loadAll, authReady: false, firebaseAuth.currentUser?.uid: ${firebaseUser.uid}, user.id: user-${firebaseUser.uid}, user.googleId: ${firebaseUser.uid}, email: ${firebaseUser.email || ''}, path/query: families/${fid}`);
                const data = await repo.loadAll({
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  familyId: fid,
                });
                
                if (!isMounted) return;
                
                // Aplicar datos a React state
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

                const isNew = data.members.length === 0;
                setSyncInitStatus(isNew ? 'no_remote_data' : 'loaded_from_google');
                setSyncInitMessage(
                  isNew
                    ? 'Base Firebase lista. Agrega tu primer miembro familiar.'
                    : `${data.members.length} miembro(s) cargado(s) desde Firebase.`
                );
              } else {
                setSyncInitStatus('idle');
                setSyncInitMessage('Listo para aceptar invitación.');
              }
            } catch (err: any) {
              console.error('[AppContext] Error cargando datos de Firebase:', err);
              if (isMounted) {
                setSyncInitStatus('error');
                setSyncInitMessage('Error al sincronizar con Firebase.');
              }
            } finally {
              if (isMounted) {
                setIsLoading(false);
                setFirebaseAuthReady(true);
              }
            }
          } else {
            // // console.info('[AppContext] No Firebase Auth user.');
            const active = getActiveUser();
            if (active && active !== 'demo') {
              setUser(null);
              clearAppState();
            }
            if (isMounted) {
              setIsLoading(false);
              setFirebaseAuthReady(true);
            }
          }
        });
      } catch (err) {
        console.error('[AppContext] Failed to initialize Firebase Auth listener:', err);
        if (isMounted) setIsLoading(false);
      }
    };

    initFirebaseAuth();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [purgaDiferidaPendiente]);

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

      // ── FIREBASE BACKEND BRANCH ─────────────────────────────────────────────
      if (isFirebaseBackend) {
        try {
          if (idToken) {
            try {
              const { signInWithCredential, GoogleAuthProvider } = await import('firebase/auth');
              const { firebaseAuth } = await import('../lib/firebase');
              const credential = GoogleAuthProvider.credential(idToken);
              const userCredential = await signInWithCredential(firebaseAuth, credential);
              if (userCredential.user) {
                realUser.googleId = userCredential.user.uid;
                realUser.id = `user-${userCredential.user.uid}`;
              }
            } catch (authErr: any) {
              console.error('[AppContext] Detailed Firebase Auth SDK login failed:', authErr);
              alert('Error de configuración de Google/Firebase. Verifica el Client ID.');
              setUser(null);
              setActiveUser(null);
              setIsLoading(false);
              setSyncInitStatus('error');
              setSyncInitMessage('Error de configuración de autenticación.');
              return;
            }
          }

          setUser(realUser);
          setActiveUser(realUser);
          setSyncInitStatus('checking');
          setSyncInitMessage('Conectando con Firebase...');

          const repo = await getDataRepository();

          // Resolve or create the Firestore family document.
          console.info(`[Instrumentación] operation: initFamily, authReady: ${firebaseAuthReady}, firebaseAuth.currentUser?.uid: ${realUser.googleId}, user.id: ${realUser.id}, user.googleId: ${realUser.googleId}, email: ${realUser.email}, path/query: users/${realUser.googleId}`);
          const fid = await repo.initFamily({
            uid: realUser.googleId ?? realUser.id,
            email: realUser.email,
            displayName: realUser.displayName,
          });
          setFamilyId(fid);

          if (fid) {
            // Load all data from Firestore (returns EMPTY_FAMILY_DATA on first login).
            console.info(`[Instrumentación] operation: loadAll, authReady: ${firebaseAuthReady}, firebaseAuth.currentUser?.uid: ${realUser.googleId}, user.id: ${realUser.id}, user.googleId: ${realUser.googleId}, email: ${realUser.email}, path/query: families/${fid}`);
            const data = await repo.loadAll({
              uid:      realUser.googleId ?? realUser.id,
              email:    realUser.email,
              familyId: fid,
            });

            // Apply data to React state.
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
            setEmailSources(
              data.gmailSources.length > 0
                ? data.gmailSources
                : [
                    {
                      id: 'source-default',
                      email: 'noreply@informacion.saludsis.mil.co',
                      label: 'Salud SIS (Defecto)',
                      enabled: true,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  ],
            );
            setAppointmentCandidates(data.appointmentCandidates);
            setGmailOnlyFutureAppointments(data.gmailOnlyFutureAppointments);

            const isNew = data.members.length === 0;
            setSyncInitStatus(isNew ? 'no_remote_data' : 'loaded_from_google');
            setSyncInitMessage(
              isNew
                ? 'Base Firebase lista. Agrega tu primer miembro familiar.'
                : `${data.members.length} miembro(s) cargado(s) desde Firebase.`,
            );
          } else {
            // Guest user: clear all data
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
            setEmailSources([]);
            setAppointmentCandidates([]);

            // Fetch pending invitations
            const invs = await repo.getInvitationsForEmail(realUser.email);
            setPendingInvitations(invs);
            
            setSyncInitStatus('no_remote_data');
            setSyncInitMessage('Invitaciones pendientes detectadas.');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[AppContext] Firebase signIn error:', err);
          setSyncInitStatus('error');
          setSyncInitMessage(`Error al conectar con Firebase: ${msg}`);
          // Do not block the user — allow the app to work offline
          setUser(realUser);
        } finally {
          setIsLoading(false);
          setFirebaseAuthReady(true);
        }
        return;
      }
      // ── END FIREBASE BRANCH ─────────────────────────────────────────────────

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
      if (isFirebaseBackend) {
        const { firebaseAuth } = await import('../lib/firebase');
        await firebaseAuth.signOut();
      }
    } catch (err) {
      console.error('[AppContext] Error signing out from Firebase:', err);
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

  // ── FIREBASE: Real-time watchers (Phase 8) ──────────────────────────────────
  // When familyId becomes available (after firebase signIn) start listening to
  // all Firestore collections. Tears down automatically when familyId clears.
  useEffect(() => {
    if (!isFirebaseBackend || !familyId) return;
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

  // ── FIREBASE: Watch user's family access records (Phase A) ──────────────────
  useEffect(() => {
    if (!isFirebaseBackend || !user) {
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
  }, [isFirebaseBackend, user, familyId, purgaDiferidaPendiente, sessionLocked]);

  // ── FIREBASE: State snapshot and rollback for optimistic updates ───────────
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

  // ── FIREBASE: firebasePersist helper ────────────────────────────────────────
  // Non-blocking fire-and-forget helper for individual entity writes.
  // No-op when the backend is Sheets (AppContext's existing scheduleAutoSync
  // handles persistence for that path).
  const firebasePersist = useCallback(
    (fn: (repo: Awaited<ReturnType<typeof getDataRepository>>, ctx: { uid: string; email: string; familyId: string }) => Promise<void>) => {
      if (!isFirebaseBackend || !familyIdRef.current) return;
      // A6-F3 · Guarda estructural del modo demostración.
      if (origenDatosRef.current === 'DEMO') return;
      const fid = familyIdRef.current;

      // Capture the state snapshot before the async operation starts
      const snap = { ...stateRef.current };

      getDataRepository().then(async (repo) => {
        try {
          await fn(repo, { uid: user?.googleId ?? user?.id ?? '', email: user?.email ?? '', familyId: fid });
        } catch (err: any) {
          console.error('[AppContext] firebasePersist error — rolling back state:', err);

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

          alert(`Error al guardar en base de datos Firebase: ${err.message || 'Permisos insuficientes o error de red.'}`);
        }
      }).catch((err) => {
        console.error('[AppContext] firebasePersist setup error:', err);
      });
    },
    [user],  
  );

  // ── FIREBASE: Family Invitations & Access Actions ─────────────────────────
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

  const testFirebaseConnection = useCallback(async (): Promise<void> => {
    try {
      const { firebaseAuth } = await import('../lib/firebase');
      const authUid = firebaseAuth.currentUser?.uid;
      
      console.info(`[Instrumentación] operation: testFirebaseConnection, authReady: ${firebaseAuthReady}, firebaseAuth.currentUser?.uid: ${authUid || 'null'}, user.id: ${user?.id || 'null'}, user.googleId: ${user?.googleId || 'null'}, email: ${user?.email || 'null'}, path/query: test_connection/${authUid || 'null'}`);
      
      if (isFirebaseBackend) {
        if (!firebaseAuthReady || !firebaseAuth.currentUser) {
          alert('Error: Firebase Auth no está listo o no está autenticado.');
          return;
        }
      }

      const uid = authUid || (user?.googleId ?? user?.id ?? '');
      if (!uid) {
        alert('Error: No hay un usuario autenticado.');
        return;
      }
      const rawUid = uid.replace('user-', '');
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      
      const testRef = doc(db, 'test_connection', rawUid);
      await setDoc(testRef, {
        testedAt: serverTimestamp(),
        status: 'OK',
        uid: rawUid
      });
      avisar('Conexión a Firebase correcta: la escritura de prueba funcionó.');
    } catch (err: any) {
      console.error('[HealthCheck] Firebase test write failed:', err);
      alert(`Error al escribir en Firebase: [${err.code || 'UNKNOWN'}] - ${err.message}`);
    }
  }, [user, firebaseAuthReady]);

  const checkPendingInvitations = useCallback(async (): Promise<FamilyInvitation[]> => {
    if (isFirebaseBackend) {
      const { firebaseAuth } = await import('../lib/firebase');
      console.info(`[Instrumentación] operation: checkPendingInvitations, authReady: ${firebaseAuthReady}, firebaseAuth.currentUser?.uid: ${firebaseAuth.currentUser?.uid || 'null'}, user.id: ${user?.id || 'null'}, user.googleId: ${user?.googleId || 'null'}, email: ${user?.email || 'null'}, path/query: collectionGroup(invitations).where(invitedEmail, ==, ${user?.email || 'null'})`);
      if (!firebaseAuthReady || !firebaseAuth.currentUser || !user?.email) {
        console.info('[Instrumentación] Bloqueando checkPendingInvitations: Auth no lista o usuario incompleto.');
        return [];
      }
    }
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
  }, [user, firebaseAuthReady]);

  // ── FUNCIONES DE AUTO-SYNC ────────────────────────────────────────────────

  /**
   * scheduleAutoSync — Programa sincronización automática con debounce de 4s.
   * Cancela el timer anterior si existía. No sincroniza si: no hay base de datos,
   * el auto-sync está deshabilitado, o ya hay una sync en progreso.
   * Si no hay token disponible, marca como pending_sync en lugar de fallar.
   */
  const scheduleAutoSync = (reason: string) => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    if (isFirebaseBackend) return; // Firebase writes go through firebasePersist, not Sheets
    if (!autoSyncEnabled) return;
    if (typeof window === 'undefined') return;

    // Cancelar timer anterior
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      autoSyncTimerRef.current = null;

      if (isSyncInProgress.current) return;

      try {
        isSyncInProgress.current = true;
        
        // Intentar asegurar el token de forma silenciosa si no está disponible o expiró
        let token = getOperationalTokenIfValid();
        if (!token) {
          try {
            token = await ensureGoogleNativeReady(true);
          } catch (_) {
            token = null;
          }
        }

        if (token) {
          await syncNow();
          setPendingSyncCount(0);
          setNeedsGoogleAuth(false);
        } else {
          // Sin token disponible: marcar como pendiente
          setPendingSyncCount(prev => prev + 1);
          setSyncInitStatus('pending_sync');
          setSyncInitMessage('Cambios pendientes de sincronizar. Conecta con Google para enviarlos.');
          setNeedsGoogleAuth(true);
        }
      } catch (_) {
        // Error silencioso en auto-sync — no interrumpir UX
        setPendingSyncCount(prev => prev + 1);
        setSyncInitStatus('pending_sync');
        setNeedsGoogleAuth(true);
      } finally {
        isSyncInProgress.current = false;
      }
    }, 4000);
  };

  /**
   * flushPendingSync — Sincroniza inmediatamente si hay cambios pendientes y token válido.
   */
  const flushPendingSync = async (): Promise<void> => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    if (isSyncInProgress.current) return;
    if (pendingSyncCount === 0) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    try {
      isSyncInProgress.current = true;
      const token = await ensureOperationalToken(clientId, false);
      if (token) {
        await syncNow();
        setPendingSyncCount(0);
        pendingSyncCountRef.current = 0; // espejo sincrono: el reintento lo consulta de inmediato
        setNeedsGoogleAuth(false);
      }
    } catch (_) {
      // Si falla: mantener pending
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
      syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC'
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
    setTimeout(() => scheduleAutoSync('member_added'), 100);

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

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC'
        };
        return updatedMember;
      }
      return m;
    }));
    setTimeout(() => scheduleAutoSync('member_updated'), 100);

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC'
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
    setTimeout(() => scheduleAutoSync('member_deleted'), 100);

    firebasePersist(async (repo, ctx) => {
      await repo.deleteMember(ctx, id);
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
          syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC'
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
    setTimeout(() => scheduleAutoSync('member_inactivated'), 100);

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC'
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
    setTimeout(() => scheduleAutoSync('member_reactivated'), 100);

    firebasePersist(async (repo, ctx) => {
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
      setTimeout(() => scheduleAutoSync('retention_cleanup'), 100);
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
    setTimeout(() => scheduleAutoSync('health_profile_saved'), 100);

    firebasePersist(async (repo, ctx) => {
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
      syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
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
    setTimeout(() => scheduleAutoSync('appointment_added'), 100);

    // Sincronizar en segundo plano con Google Calendar si está habilitado
    if (calendarSyncEnabled) {
      setTimeout(() => {
        syncAppointmentToCalendar(newId, newAppt);
      }, 200);
    }

    firebasePersist(async (repo, ctx) => {
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
    setTimeout(() => scheduleAutoSync('appointment_status_updated'), 100);

    firebasePersist(async (repo, ctx) => {
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
    setTimeout(() => scheduleAutoSync('checkup_added'), 100);

    firebasePersist(async (repo, ctx) => {
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
    setTimeout(() => scheduleAutoSync('vaccine_added'), 100);

    firebasePersist(async (repo, ctx) => {
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
    setTimeout(() => scheduleAutoSync('exam_added'), 100);

    firebasePersist(async (repo, ctx) => {
      await repo.saveExam(ctx, newExam);
      await repo.saveExamResults(ctx, examId, newResults);
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
          setTimeout(() => scheduleAutoSync('document_uploaded'), 100);

          firebasePersist(async (repo, ctx) => {
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
    setTimeout(() => scheduleAutoSync('document_uploaded_local'), 100);

    firebasePersist(async (repo, ctx) => {
      await repo.saveDocument(ctx, newDoc);
      await repo.saveHistoryEvent(ctx, newEvent);
    });

    return docId;
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setTimeout(() => scheduleAutoSync('document_deleted'), 100);

    firebasePersist(async (repo, ctx) => {
      await repo.deleteDocument(ctx, id);
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
    setTimeout(() => scheduleAutoSync('task_completed'), 100);

    firebasePersist(async (repo, ctx) => {
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
              syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
            };
            return updatedDose;
          }
          return d;
        }));
      }

      return updated;
    });
    setTimeout(() => scheduleAutoSync('reminder_toggled'), 100);

    firebasePersist(async (repo, ctx) => {
      if (updatedReminder) {
        await repo.saveReminder(ctx, updatedReminder);
      }
      if (updatedDose) {
        await repo.saveDoseReminder(ctx, updatedDose);
      }
    });
  };

  const generateDoseReminders = (prescription: MedicationPrescription): MedicationDoseReminder[] => {
    const list: MedicationDoseReminder[] = [];
    const startDate = new Date(prescription.startDate + 'T08:00:00');
    const endDate = new Date(prescription.endDate + 'T23:59:59');
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return [];
    }

    const email = user?.email || 'titular@correo.com';
    const uid = user?.googleId || user?.id || 'unknown';
    const nowIso = new Date().toISOString();

    const addDose = (time: Date) => {
      const year = time.getFullYear();
      const month = String(time.getMonth() + 1).padStart(2, '0');
      const day = String(time.getDate()).padStart(2, '0');
      const hours = String(time.getHours()).padStart(2, '0');
      const minutes = String(time.getMinutes()).padStart(2, '0');
      const scheduledAt = `${year}-${month}-${day}T${hours}:${minutes}`;

      list.push({
        id: `dose-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        prescriptionId: prescription.id,
        memberId: prescription.memberId,
        medicationName: prescription.name,
        dose: prescription.dose,
        scheduledAt,
        status: 'PENDING',
        createdAt: nowIso,
        updatedAt: nowIso,
        syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
        ownerEmail: email,
        ownerGoogleId: uid,
        sourceDeviceId: deviceId || null
      });
    };

    if (prescription.frequencyType === 'EVERY_X_HOURS' && prescription.frequencyIntervalHours) {
      const intervalMs = prescription.frequencyIntervalHours * 60 * 60 * 1000;
      let current = new Date(startDate.getTime());
      while (current.getTime() <= endDate.getTime()) {
        addDose(new Date(current.getTime()));
        current = new Date(current.getTime() + intervalMs);
      }
    } else if (prescription.frequencyType === 'SPECIFIC_TIMES' && prescription.specificTimes) {
      const currentDay = new Date(startDate.getTime());
      while (currentDay.getTime() <= endDate.getTime()) {
        prescription.specificTimes.forEach(tStr => {
          const [hStr, mStr] = tStr.split(':');
          const timeVal = new Date(currentDay.getTime());
          timeVal.setHours(parseInt(hStr, 10), parseInt(mStr, 10), 0, 0);
          if (timeVal.getTime() >= startDate.getTime() && timeVal.getTime() <= endDate.getTime()) {
            addDose(timeVal);
          }
        });
        currentDay.setDate(currentDay.getDate() + 1);
      }
    } else {
      let times: string[] = ['08:00'];
      if (prescription.frequencyType === 'TWICE_DAILY') {
        times = ['08:00', '20:00'];
      } else if (prescription.frequencyType === 'THREE_TIMES_DAILY') {
        times = ['08:00', '14:00', '20:00'];
      } else if (prescription.frequencyType === 'ONCE_DAILY') {
        times = ['08:00'];
      }
      
      const currentDay = new Date(startDate.getTime());
      while (currentDay.getTime() <= endDate.getTime()) {
        times.forEach(tStr => {
          const [hStr, mStr] = tStr.split(':');
          const timeVal = new Date(currentDay.getTime());
          timeVal.setHours(parseInt(hStr, 10), parseInt(mStr, 10), 0, 0);
          if (timeVal.getTime() >= startDate.getTime() && timeVal.getTime() <= endDate.getTime()) {
            addDose(timeVal);
          }
        });
        currentDay.setDate(currentDay.getDate() + 1);
      }
    }

    return list;
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
      syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
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

    setTimeout(() => scheduleAutoSync('medical_order_added'), 100);

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
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

    setTimeout(() => scheduleAutoSync('medical_order_updated'), 100);

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
          updatedAt: nowIso
        };
        return deletedOrder;
      }
      return o;
    }));
    setTimeout(() => scheduleAutoSync('medical_order_deleted'), 100);

    firebasePersist(async (repo, ctx) => {
      await repo.deleteMedicalOrder(ctx, id);
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
      syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
        };
        return updatedOrder;
      }
      return o;
    }));

    setTimeout(() => scheduleAutoSync('appointment_created_from_order'), 100);

    if (calendarSyncEnabled) {
      setTimeout(() => {
        syncAppointmentToCalendar(newId, newAppt);
      }, 200);
    }

    firebasePersist(async (repo, ctx) => {
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
              syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC'
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
      syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
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

    setTimeout(() => scheduleAutoSync('medication_prescription_added'), 100);

    if (calendarSyncEnabled && generatedDoses.length > 0 && generatedDoses.length <= 20) {
      setTimeout(() => {
        syncMedicationCalendarEvents(newId, generatedDoses, newPrescription);
      }, 200);
    }

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
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
                const skippedDose = { ...d, status: 'SKIPPED' as const, updatedAt: nowIso, syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any };
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
    setTimeout(() => scheduleAutoSync('medication_prescription_updated'), 100);

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
          updatedAt: nowIso
        };
        deletedDoses.push(delDose);
        return delDose;
      }
      return d;
    }));

    setReminders(prev => prev.filter(r => r.relatedEventId !== id));
    setTimeout(() => scheduleAutoSync('medication_prescription_deleted'), 100);

    firebasePersist(async (repo, ctx) => {
      if (deletedPrescription) {
        await repo.deleteMedication(ctx, id);
      }
      for (const d of deletedDoses) {
        await repo.deleteDoseReminder(ctx, d.id);
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
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

    setTimeout(() => scheduleAutoSync('medication_dose_marked'), 100);

    firebasePersist(async (repo, ctx) => {
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
        updatedCandidate = { ...candidate, updatedAt: new Date().toISOString(), syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any };
        updated[idx] = updatedCandidate;
        return updated;
      }
      updatedCandidate = { ...candidate, syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any };
      return [...prev, updatedCandidate];
    });

    firebasePersist(async (repo, ctx) => {
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
        };
        return updatedCandidate;
      }
      return c;
    }));

    firebasePersist(async (repo, ctx) => {
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
      syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any
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

    firebasePersist(async (repo, ctx) => {
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
      syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
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
      medicationDoseReminders
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
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
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
      await pullFromGoogleInternal(token, remoteSheetId);

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
          await pullFromGoogleInternal(token, foundSheetId);
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

      // 4. Enviar los datos locales actuales a la hoja
      await pushToGoogleInternal(token, sheetId);
      
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

  const pullFromGoogleInternal = async (token: string, sheetId: string) => {
    setOpSyncStatus('syncing');
    try {
      const remoteState = await readAllOperationalTables(token, sheetId);
      
      // Integración y resolución de conflictos mediante Last-Write-Wins (LWW)
      const mergeEntities = <T extends { id: string; updatedAt?: string; deletedAt?: string | null; syncStatus?: any }>(
        localArray: T[],
        remoteArray: T[],
        tableName: string
      ): T[] => {
        const merged: T[] = [...localArray];

        remoteArray.forEach(remoteItem => {
          const localIdx = merged.findIndex(l => l.id === remoteItem.id);
          
          if (localIdx >= 0) {
            const localItem = merged[localIdx];
            if (tableName === 'Miembros') {
              // Fusionar miembros de forma segura usando el helper mergeMemberSafely
              const localM = localItem as unknown as FamilyMember;
              const remoteM = remoteItem as unknown as FamilyMember;
              merged[localIdx] = mergeMemberSafely(localM, remoteM) as unknown as T;
            } else {
              const localUpdate = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
              const remoteUpdate = remoteItem.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;

              if (remoteUpdate > localUpdate) {
                // Conflicto: Sobrescribir local si el remoto es más reciente
                if (localItem.syncStatus === 'PENDING_SYNC') {
                  // Registrar conflicto en historia
                  const conflictLog: MedicalHistoryEvent = {
                    id: `hist-conf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    memberId: (remoteItem as any).memberId || (localItem as any).memberId || 'family-owner',
                    eventType: 'OTHER',
                    title: 'Conflicto de sincronización resuelto',
                    description: `Conflicto en tabla ${tableName} para ID: ${remoteItem.id} resuelto aplicando versión remota más reciente (LWW).`,
                    eventDate: new Date().toISOString().split('T')[0],
                    createdAt: new Date().toISOString()
                  };
                  setTimeout(() => setHistory(h => [conflictLog, ...h]), 50);
                }
                merged[localIdx] = { ...remoteItem, syncStatus: 'SYNCED' } as T;
              } else {
                // El local es más reciente o igual, mantener local
                merged[localIdx] = { ...localItem };
              }
            }
          } else {
            // No existe localmente, agregar
            const isDeleted = remoteItem.deletedAt || (remoteItem as any).status === 'DELETED';
            if (!isDeleted) {
              merged.push({ ...remoteItem, syncStatus: 'SYNCED' });
            }
          }
        });

        // Si se borró en Sheets manualmente, quitar del estado local aquellos items que estaban sincronizados
        return merged.filter(localItem => {
          if (localItem.syncStatus === 'LOCAL_ONLY' || localItem.syncStatus === 'PENDING_SYNC') {
            return true;
          }
          if (localItem.deletedAt || (localItem as any).status === 'DELETED') {
            return true;
          }
          const existsInRemote = remoteArray.some(r => r.id === localItem.id);
          return existsInRemote;
        });
      };

      // Fusión de tablas
      if (remoteState.Miembros) {
        setMembers(prev => mergeEntities(prev, remoteState.Miembros, 'Miembros'));
      }

      if (remoteState.FichasMedicas) {
        const remoteProfiles = remoteState.FichasMedicas.reduce((acc: any, hp: any) => {
          acc[hp.memberId] = hp;
          return acc;
        }, {});
        setHealthProfiles(prev => {
          const merged = { ...prev };
          Object.entries(remoteProfiles).forEach(([mId, remoteProf]: [string, any]) => {
            const localProf = merged[mId];
            const localUpdate = localProf?.updatedAt ? new Date(localProf.updatedAt).getTime() : 0;
            const remoteUpdate = remoteProf.updatedAt ? new Date(remoteProf.updatedAt).getTime() : 0;
            if (!localProf || remoteUpdate > localUpdate) {
              merged[mId] = { ...remoteProf, syncStatus: 'SYNCED' };
            }
          });
          return merged;
        });
      }

      if (remoteState.Citas) {
        const remoteCitasSanitized = remoteState.Citas.map(sanitizeRemoteAppointment);
        setAppointments(prev => mergeEntities(prev, remoteCitasSanitized, 'Citas'));
      }
      if (remoteState.Controles) {
        setCheckups(prev => mergeEntities(prev, remoteState.Controles, 'Controles'));
      }
      if (remoteState.Vacunas) {
        setVaccines(prev => mergeEntities(prev, remoteState.Vacunas, 'Vacunas'));
      }
      if (remoteState.Examenes) {
        setExams(prev => mergeEntities(prev, remoteState.Examenes, 'Exámenes'));
      }
      if (remoteState.Documentos) {
        setDocuments(prev => mergeEntities(prev, remoteState.Documentos, 'Documentos'));
      }
      if (remoteState.HistorialClinico) {
        setHistory(prev => mergeEntities(prev, remoteState.HistorialClinico, 'Historial'));
      }
      if (remoteState.FuentesCorreoCitas) {
        setEmailSources(prev => mergeEntities(prev, remoteState.FuentesCorreoCitas, 'FuentesCorreoCitas'));
      }
      if (remoteState.CandidatosCorreoCitas) {
        setAppointmentCandidates(prev => mergeEntities(prev, remoteState.CandidatosCorreoCitas, 'CandidatosCorreoCitas'));
      }
      if (remoteState.OrdenesMedicas) {
        setMedicalOrders(prev => mergeEntities(prev, remoteState.OrdenesMedicas, 'OrdenesMedicas'));
      }
      if (remoteState.Medicamentos) {
        setMedicationPrescriptions(prev => mergeEntities(prev, remoteState.Medicamentos, 'Medicamentos'));
      }
      if (remoteState.TomasMedicamentos) {
        setMedicationDoseReminders(prev => mergeEntities(prev, remoteState.TomasMedicamentos, 'TomasMedicamentos'));
      }

      setLastPullAt(new Date().toISOString());
      setLastSyncAt(new Date().toISOString());
      setOpSyncStatus('synced');
    } catch (err: any) {
      console.error('Error jalando datos de Google Sheets:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al descargar datos remotos.');
      throw err;
    }
  };

  const pullFromGoogle = async () => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    const token = await requestGoogleNativeToken();
    if (!token) return;

    let sheetId = databaseSpreadsheetId;
    if (!sheetId) {
      // Buscar en appdata
      const configId = await findConfigInAppData(token);
      if (configId) {
        const remoteConfig = await readConfigFromAppData(token, configId);
        if (remoteConfig && remoteConfig.databaseSpreadsheetId) {
          sheetId = remoteConfig.databaseSpreadsheetId;
          setDatabaseSpreadsheetId(sheetId);
          setDatabaseSpreadsheetUrl(remoteConfig.databaseSpreadsheetUrl);
          setAppDataFileId(configId);
          if (remoteConfig.permissionRefs && remoteConfig.permissionRefs.sharedReports) {
            setSharedReports(remoteConfig.permissionRefs.sharedReports);
          }
        }
      }
    }

    if (!sheetId) {
      setOpSyncStatus('error');
      setOpSyncError('No existe una base operacional configurada.');
      alert('No se encontró ninguna base operacional de Google. Créala primero en Configuración.');
      return;
    }

    await pullFromGoogleInternal(token, sheetId);
  };

  const pushToGoogleInternal = async (token: string, sheetId: string) => {
    setOpSyncStatus('syncing');
    try {
      const email = user?.email || 'titular@correo.com';
      const uid = user?.googleId || user?.id || 'unknown';

      // 1. Estructura de Snapshot
      const operationalStateSnapshot = {
        Config: [
          { Key: 'ownerEmail', Value: email, Description: 'Dueño de la base', updatedAt: new Date().toISOString() },
          { Key: 'ownerGoogleId', Value: uid, Description: 'Google ID del dueño', updatedAt: new Date().toISOString() },
          { Key: 'familyGroupId', Value: 'family-001', Description: 'ID de familia', updatedAt: new Date().toISOString() }
        ],
        Usuarios: [
          { id: user?.id || 'user-01', googleId: uid, displayName: user?.displayName || 'Titular', email: email, photoUrl: user?.photoUrl || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        ],
        Familias: [
          { id: 'family-001', ownerId: user?.id || 'user-01', name: 'Grupo Familiar', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        ],
        Miembros: membersRef.current.map(m => ({
          ...m,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        Permisos: membersRef.current.map(m => ({
          memberId: m.id,
          canManageOwnProfile: m.permissions?.canManageOwnProfile ?? true,
          canManageOwnAppointments: m.permissions?.canManageOwnAppointments ?? true,
          canManageOwnDocuments: m.permissions?.canManageOwnDocuments ?? true,
          canViewOwnHistory: m.permissions?.canViewOwnHistory ?? true,
          canUploadDocuments: m.permissions?.canUploadDocuments ?? true,
          canExportOwnData: m.permissions?.canExportOwnData ?? false,
          canViewFamilyData: m.permissions?.canViewFamilyData ?? false,
          canManageFamilyData: m.permissions?.canManageFamilyData ?? false,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        FichasMedicas: Object.values(healthProfilesRef.current).map(hp => ({
          ...hp,
          ownerEmail: hp.ownerEmail || email,
          ownerGoogleId: hp.ownerGoogleId || uid,
          sourceDeviceId: hp.sourceDeviceId || deviceId,
          createdAt: hp.createdAt || new Date().toISOString(),
          updatedAt: hp.updatedAt || new Date().toISOString(),
          deletedAt: hp.deletedAt || null
        })),
        Citas: appointmentsRef.current.map(a => {
          let date = '';
          let time = '';
          if (a.scheduledAt && a.scheduledAt.includes('T')) {
            [date, time] = a.scheduledAt.split('T');
          } else if (a.scheduledAt) {
            date = a.scheduledAt;
          }
          return {
            ...a,
            doctor: a.doctor || a.doctorName,
            date,
            time,
            ownerEmail: a.ownerEmail || email,
            ownerGoogleId: a.ownerGoogleId || uid,
            sourceDeviceId: a.sourceDeviceId || deviceId,
            createdAt: a.createdAt || new Date().toISOString(),
            updatedAt: a.updatedAt || new Date().toISOString(),
            deletedAt: a.deletedAt || null
          };
        }),
        Controles: checkupsRef.current.map(c => ({
          ...c,
          ownerEmail: c.ownerEmail || email,
          ownerGoogleId: c.ownerGoogleId || uid,
          sourceDeviceId: c.sourceDeviceId || deviceId,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString(),
          deletedAt: c.deletedAt || null
        })),
        Vacunas: vaccinesRef.current.map(v => ({
          ...v,
          ownerEmail: v.ownerEmail || email,
          ownerGoogleId: v.ownerGoogleId || uid,
          sourceDeviceId: v.sourceDeviceId || deviceId,
          createdAt: v.createdAt || new Date().toISOString(),
          updatedAt: v.updatedAt || new Date().toISOString(),
          deletedAt: v.deletedAt || null
        })),
        Examenes: examsRef.current.map(e => ({
          ...e,
          ownerEmail: e.ownerEmail || email,
          ownerGoogleId: e.ownerGoogleId || uid,
          sourceDeviceId: e.sourceDeviceId || deviceId,
          createdAt: e.createdAt || new Date().toISOString(),
          updatedAt: e.updatedAt || new Date().toISOString(),
          deletedAt: e.deletedAt || null
        })),
        Documentos: documentsRef.current.map(d => ({
          ...d,
          ownerEmail: d.ownerEmail || email,
          ownerGoogleId: d.ownerGoogleId || uid,
          sourceDeviceId: d.sourceDeviceId || deviceId,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
          deletedAt: d.deletedAt || null
        })),
        HistorialClinico: historyRef.current.map(h => ({
          ...h,
          ownerEmail: h.ownerEmail || email,
          ownerGoogleId: h.ownerGoogleId || uid,
          sourceDeviceId: h.sourceDeviceId || deviceId,
          createdAt: h.createdAt || new Date().toISOString(),
          updatedAt: h.updatedAt || new Date().toISOString(),
          deletedAt: h.deletedAt || null
        })),
        Auditoria: historyRef.current.filter(h => h.title.includes('Miembro') || h.title.includes('Borrado') || h.title.includes('Permisos') || h.title.includes('Cita')).map(h => ({
          id: h.id,
          timestamp: h.createdAt || new Date().toISOString(),
          userId: uid,
          userEmail: email,
          action: h.title,
          details: h.description || '',
          deviceId: deviceId || 'unknown',
          createdAt: h.createdAt || new Date().toISOString()
        })),
        Retencion: [],
        SyncLog: historyRef.current.filter(h => h.title.includes('sincronización') || h.title.includes('Conflicto')).map(h => ({
          id: h.id,
          timestamp: h.createdAt || new Date().toISOString(),
          deviceId: deviceId || 'unknown',
          actorEmail: email,
          tableName: 'history',
          entityId: h.id,
          actionType: 'SYNC',
          fieldName: 'syncStatus',
          localValue: h.title,
          remoteValue: h.description,
          resolution: 'LWW',
          createdAt: h.createdAt || new Date().toISOString()
        })),
        FuentesCorreoCitas: emailSourcesRef.current.map(s => ({
          ...s,
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: s.updatedAt || new Date().toISOString()
        })),
        CandidatosCorreoCitas: appointmentCandidatesRef.current.map(c => ({
          ...c,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString()
        })),
        OrdenesMedicas: medicalOrdersRef.current.map(o => ({
          ...o,
          ownerEmail: o.ownerEmail || email,
          ownerGoogleId: o.ownerGoogleId || uid,
          sourceDeviceId: o.sourceDeviceId || deviceId,
          createdAt: o.createdAt || new Date().toISOString(),
          updatedAt: o.updatedAt || new Date().toISOString(),
          deletedAt: o.deletedAt || null
        })),
        Medicamentos: medicationPrescriptionsRef.current.map(m => ({
          ...m,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        TomasMedicamentos: medicationDoseRemindersRef.current.map(t => ({
          ...t,
          ownerEmail: t.ownerEmail || email,
          ownerGoogleId: t.ownerGoogleId || uid,
          sourceDeviceId: t.sourceDeviceId || deviceId,
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
          deletedAt: t.deletedAt || null
        }))
      };

      await writeAllOperationalTables(token, sheetId, operationalStateSnapshot);

      // Validación post-push de citas
      try {
        const verifyState = await readAllOperationalTables(token, sheetId);
        const verifyCitas: MedicalAppointment[] = verifyState.Citas ? verifyState.Citas.map(sanitizeRemoteAppointment) : [];
        const localActiveAppts = appointmentsRef.current.filter(a => !a.deletedAt);
        for (const localAppt of localActiveAppts) {
          const found = verifyCitas.some(r => r.id === localAppt.id);
          if (!found) {
            throw new Error(`La cita con ID ${localAppt.id} (${localAppt.doctorName}) no fue escrita en Google Sheets.`);
          }
        }
      } catch (verifyErr: any) {
        console.error('Fallo en la validación post-push de citas:', verifyErr);
        throw new Error(`Validación post-push fallida: ${verifyErr.message || 'La cita no fue escrita en Google Sheets.'}`);
      }

      // Actualizar estados locales a synced
      const updateSyncStatus = <T extends { syncStatus?: any; lastSyncedAt?: string | null }>(arr: T[]): T[] => {
        return arr.map(item => ({
          ...item,
          syncStatus: 'SYNCED' as const,
          lastSyncedAt: new Date().toISOString()
        }));
      };

      setMembers(prev => updateSyncStatus(prev));
      setAppointments(prev => updateSyncStatus(prev));
      setCheckups(prev => updateSyncStatus(prev));
      setVaccines(prev => updateSyncStatus(prev));
      setExams(prev => updateSyncStatus(prev));
      setDocuments(prev => updateSyncStatus(prev));
      setMedicalOrders(prev => updateSyncStatus(prev));
      setMedicationPrescriptions(prev => updateSyncStatus(prev));
      setMedicationDoseReminders(prev => updateSyncStatus(prev));

      setLastPushAt(new Date().toISOString());
      setLastSyncAt(new Date().toISOString());
      setOpSyncStatus('synced');
    } catch (err: any) {
      console.error('Error subiendo datos a Google Sheets:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al subir datos remotos.');
      throw err;
    }
  };

  const pushToGoogle = async () => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    const token = await requestGoogleNativeToken();
    if (!token) return;

    if (!databaseSpreadsheetId) {
      setOpSyncStatus('error');
      setOpSyncError('No existe una base operacional configurada.');
      alert('No se encontró base operacional para subir cambios.');
      return;
    }

    // Pull obligatorio antes de push
    const now = Date.now();
    const lastPullTime = lastPullAt ? new Date(lastPullAt).getTime() : 0;
    const isStale = (now - lastPullTime) > MUST_PULL_BEFORE_PUSH_MS;

    if (!lastPullAt || isStale) {
      // Sincronización automática previa al push por falta de pull reciente
      await syncNow();
      return;
    }

    // Regla: No hacer push si local está vacío y no se ha hecho pull en esta sesión (o nunca)
    if (!lastPullAt && members.length === 0) {
      const aceptado = await confirmar({
        titulo: 'Sincronizar antes de subir',
        descripcion: 'Este dispositivo aún no ha descargado nada desde Google. Para no sobrescribir lo que ya hay allí, primero se hará una sincronización completa.',
        etiquetaConfirmar: 'Sincronizar primero',
        tono: 'primario',
      });
      if (aceptado) {
        await syncNow();
        return;
      }
      return;
    }

    await pushToGoogleInternal(token, databaseSpreadsheetId);
  };

  const syncNow = async () => {
    // A6-F3 · Guarda estructural del modo demostración.
    if (origenDatosRef.current === 'DEMO') return;
    const token = await requestGoogleNativeToken();
    if (!token) return;

    let sheetId = databaseSpreadsheetId;
    if (!sheetId) {
      // Buscar en appdata
      const configId = await findConfigInAppData(token);
      if (configId) {
        const remoteConfig = await readConfigFromAppData(token, configId);
        if (remoteConfig && remoteConfig.databaseSpreadsheetId) {
          sheetId = remoteConfig.databaseSpreadsheetId;
          setDatabaseSpreadsheetId(sheetId);
          setDatabaseSpreadsheetUrl(remoteConfig.databaseSpreadsheetUrl);
          setAppDataFileId(configId);
          if (remoteConfig.permissionRefs?.sharedReports) {
            setSharedReports(remoteConfig.permissionRefs.sharedReports);
          }
        }
      }
    }

    if (!sheetId) {
      setOpSyncStatus('error');
      setOpSyncError('No existe una base operacional configurada.');
      alert('No se encontró base operacional para sincronizar. Créala primero en Configuración.');
      return;
    }

    try {
      setOpSyncStatus('syncing');
      
      // FASE 1: Pull — Leer el estado remoto y obtener el estado fusionado
      const remoteState = await readAllOperationalTables(token, sheetId);

      // Sanitizar las citas remotas
      const remoteCitasSanitized = remoteState.Citas ? remoteState.Citas.map(sanitizeRemoteAppointment) : [];

      // Función de merge LWW reutilizable
      const mergeEntitiesSync = <T extends { id: string; updatedAt?: string; deletedAt?: string | null; syncStatus?: any }>(
        localArray: T[],
        remoteArray: T[],
        tableName: string
      ): T[] => {
        const merged: T[] = [...localArray];
        remoteArray.forEach(remoteItem => {
          const localIdx = merged.findIndex(l => l.id === remoteItem.id);
          if (localIdx >= 0) {
            const localItem = merged[localIdx];
            if (tableName === 'Miembros') {
              // Fusionar miembros de forma segura usando el helper mergeMemberSafely
              const localM = localItem as unknown as FamilyMember;
              const remoteM = remoteItem as unknown as FamilyMember;
              merged[localIdx] = mergeMemberSafely(localM, remoteM) as unknown as T;
            } else {
              const localUpdate = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
              const remoteUpdate = remoteItem.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;
              if (remoteUpdate > localUpdate) {
                // Conflicto: Sobrescribir local si el remoto es más reciente
                if (localItem.syncStatus === 'PENDING_SYNC') {
                  const conflictLog: MedicalHistoryEvent = {
                    id: `hist-conf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    memberId: (remoteItem as any).memberId || (localItem as any).memberId || 'family-owner',
                    eventType: 'OTHER',
                    title: 'Conflicto de sincronización resuelto',
                    description: `Conflicto en tabla ${tableName} para ID: ${remoteItem.id} resuelto aplicando versión remota más reciente (LWW).`,
                    eventDate: new Date().toISOString().split('T')[0],
                    createdAt: new Date().toISOString()
                  };
                  setTimeout(() => setHistory(h => [conflictLog, ...h]), 50);
                }
                merged[localIdx] = { ...remoteItem, syncStatus: 'SYNCED' } as T;
              } else {
                // El local es igual o más reciente
                merged[localIdx] = { ...localItem };
              }
            }
          } else {
            // No existe localmente, agregar
            const isDeleted = remoteItem.deletedAt || (remoteItem as any).status === 'DELETED';
            if (!isDeleted) {
              merged.push({ ...remoteItem, syncStatus: 'SYNCED' });
            }
          }
        });

        // Si se borró en Sheets manualmente, quitar del estado local aquellos items que estaban sincronizados
        return merged.filter(localItem => {
          if (localItem.syncStatus === 'LOCAL_ONLY' || localItem.syncStatus === 'PENDING_SYNC') {
            return true;
          }
          if (localItem.deletedAt || (localItem as any).status === 'DELETED') {
            return true;
          }
          const existsInRemote = remoteArray.some(r => r.id === localItem.id);
          return existsInRemote;
        });
      };

      // Obtener estados actuales de las referencias (Refs) para evitar stale closures
      const currentMembers = membersRef.current;
      const currentAppointments = appointmentsRef.current;
      const currentCheckups = checkupsRef.current;
      const currentVaccines = vaccinesRef.current;
      const currentExams = examsRef.current;
      const currentDocuments = documentsRef.current;
      const currentHistory = historyRef.current;
      const currentHealthProfiles = healthProfilesRef.current;
      const currentSources = emailSourcesRef.current;
      const currentCandidates = appointmentCandidatesRef.current;
      const currentOrders = medicalOrdersRef.current;
      const currentPrescriptions = medicationPrescriptionsRef.current;
      const currentDoseReminders = medicationDoseRemindersRef.current;

      const mergedMembers = remoteState.Miembros ? mergeEntitiesSync(currentMembers, remoteState.Miembros, 'Miembros') : currentMembers;
      const mergedAppointments = remoteState.Citas ? mergeEntitiesSync(currentAppointments, remoteCitasSanitized, 'Citas') : currentAppointments;
      const mergedCheckups = remoteState.Controles ? mergeEntitiesSync(currentCheckups, remoteState.Controles, 'Controles') : currentCheckups;
      const mergedVaccines = remoteState.Vacunas ? mergeEntitiesSync(currentVaccines, remoteState.Vacunas, 'Vacunas') : currentVaccines;
      const mergedExams = remoteState.Examenes ? mergeEntitiesSync(currentExams, remoteState.Examenes, 'Exámenes') : currentExams;
      const mergedDocuments = remoteState.Documentos ? mergeEntitiesSync(currentDocuments, remoteState.Documentos, 'Documentos') : currentDocuments;
      const mergedHistory = remoteState.HistorialClinico ? mergeEntitiesSync(currentHistory, remoteState.HistorialClinico, 'Historial') : currentHistory;
      const mergedSources = remoteState.FuentesCorreoCitas ? mergeEntitiesSync(currentSources, remoteState.FuentesCorreoCitas, 'FuentesCorreoCitas') : currentSources;
      const mergedCandidates = remoteState.CandidatosCorreoCitas ? mergeEntitiesSync(currentCandidates, remoteState.CandidatosCorreoCitas, 'CandidatosCorreoCitas') : currentCandidates;
      const mergedOrders = remoteState.OrdenesMedicas ? mergeEntitiesSync(currentOrders, remoteState.OrdenesMedicas, 'OrdenesMedicas') : currentOrders;
      const mergedPrescriptions = remoteState.Medicamentos ? mergeEntitiesSync(currentPrescriptions, remoteState.Medicamentos, 'Medicamentos') : currentPrescriptions;
      const mergedDoseReminders = remoteState.TomasMedicamentos ? mergeEntitiesSync(currentDoseReminders, remoteState.TomasMedicamentos, 'TomasMedicamentos') : currentDoseReminders;

      // Merge health profiles (Record<string, HealthProfile>)
      const mergedProfiles = { ...currentHealthProfiles };
      if (remoteState.FichasMedicas) {
        remoteState.FichasMedicas.forEach((remoteProf: any) => {
          const localProf = mergedProfiles[remoteProf.memberId];
          const localUpdate = localProf?.updatedAt ? new Date(localProf.updatedAt).getTime() : 0;
          const remoteUpdate = remoteProf.updatedAt ? new Date(remoteProf.updatedAt).getTime() : 0;
          if (!localProf || remoteUpdate > localUpdate) {
            mergedProfiles[remoteProf.memberId] = { ...remoteProf, syncStatus: 'SYNCED' };
          }
        });
      }

      // Actualizar React state con el resultado fusionado
      setMembers(mergedMembers);
      setAppointments(mergedAppointments);
      setCheckups(mergedCheckups);
      setVaccines(mergedVaccines);
      setExams(mergedExams);
      setDocuments(mergedDocuments);
      setHistory(mergedHistory);
      setHealthProfiles(mergedProfiles);
      setEmailSources(mergedSources);
      setAppointmentCandidates(mergedCandidates);
      setMedicalOrders(mergedOrders);
      setMedicationPrescriptions(mergedPrescriptions);
      setMedicationDoseReminders(mergedDoseReminders);
      setLastPullAt(new Date().toISOString());

      // FASE 2: Push — Usar el estado fusionado calculado
      const email = user?.email || 'titular@correo.com';
      const uid = user?.googleId || user?.id || 'unknown';

      const operationalStateSnapshot = {
        Config: [
          { Key: 'ownerEmail', Value: email, Description: 'Dueño de la base', updatedAt: new Date().toISOString() },
          { Key: 'ownerGoogleId', Value: uid, Description: 'Google ID del dueño', updatedAt: new Date().toISOString() },
          { Key: 'familyGroupId', Value: 'family-001', Description: 'ID de familia', updatedAt: new Date().toISOString() }
        ],
        Usuarios: [
          { id: user?.id || 'user-01', googleId: uid, displayName: user?.displayName || 'Titular', email: email, photoUrl: user?.photoUrl || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        ],
        Familias: [
          { id: 'family-001', ownerId: user?.id || 'user-01', name: 'Grupo Familiar', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        ],
        Miembros: mergedMembers.map(m => ({
          ...m,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        Permisos: mergedMembers.map(m => ({
          memberId: m.id,
          canManageOwnProfile: m.permissions?.canManageOwnProfile ?? true,
          canManageOwnAppointments: m.permissions?.canManageOwnAppointments ?? true,
          canManageOwnDocuments: m.permissions?.canManageOwnDocuments ?? true,
          canViewOwnHistory: m.permissions?.canViewOwnHistory ?? true,
          canUploadDocuments: m.permissions?.canUploadDocuments ?? true,
          canExportOwnData: m.permissions?.canExportOwnData ?? false,
          canViewFamilyData: m.permissions?.canViewFamilyData ?? false,
          canManageFamilyData: m.permissions?.canManageFamilyData ?? false,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        FichasMedicas: Object.values(mergedProfiles).map(hp => ({
          ...hp,
          ownerEmail: (hp as any).ownerEmail || email,
          ownerGoogleId: (hp as any).ownerGoogleId || uid,
          sourceDeviceId: (hp as any).sourceDeviceId || deviceId,
          createdAt: (hp as any).createdAt || new Date().toISOString(),
          updatedAt: (hp as any).updatedAt || new Date().toISOString(),
          deletedAt: (hp as any).deletedAt || null
        })),
        Citas: mergedAppointments.map(a => {
          let date = '';
          let time = '';
          if (a.scheduledAt && a.scheduledAt.includes('T')) {
            [date, time] = a.scheduledAt.split('T');
          } else if (a.scheduledAt) {
            date = a.scheduledAt;
          }
          return {
            ...a,
            doctor: a.doctor || a.doctorName,
            date,
            time,
            ownerEmail: a.ownerEmail || email,
            ownerGoogleId: a.ownerGoogleId || uid,
            sourceDeviceId: a.sourceDeviceId || deviceId,
            createdAt: a.createdAt || new Date().toISOString(),
            updatedAt: a.updatedAt || new Date().toISOString(),
            deletedAt: a.deletedAt || null
          };
        }),
        Controles: mergedCheckups.map(c => ({
          ...c,
          ownerEmail: c.ownerEmail || email,
          ownerGoogleId: c.ownerGoogleId || uid,
          sourceDeviceId: c.sourceDeviceId || deviceId,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString(),
          deletedAt: c.deletedAt || null
        })),
        Vacunas: mergedVaccines.map(v => ({
          ...v,
          ownerEmail: v.ownerEmail || email,
          ownerGoogleId: v.ownerGoogleId || uid,
          sourceDeviceId: v.sourceDeviceId || deviceId,
          createdAt: v.createdAt || new Date().toISOString(),
          updatedAt: v.updatedAt || new Date().toISOString(),
          deletedAt: v.deletedAt || null
        })),
        Examenes: mergedExams.map(e => ({
          ...e,
          ownerEmail: e.ownerEmail || email,
          ownerGoogleId: e.ownerGoogleId || uid,
          sourceDeviceId: e.sourceDeviceId || deviceId,
          createdAt: e.createdAt || new Date().toISOString(),
          updatedAt: e.updatedAt || new Date().toISOString(),
          deletedAt: e.deletedAt || null
        })),
        Documentos: mergedDocuments.map(d => ({
          ...d,
          ownerEmail: d.ownerEmail || email,
          ownerGoogleId: d.ownerGoogleId || uid,
          sourceDeviceId: d.sourceDeviceId || deviceId,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
          deletedAt: d.deletedAt || null
        })),
        HistorialClinico: mergedHistory.map(h => ({
          ...h,
          ownerEmail: h.ownerEmail || email,
          ownerGoogleId: h.ownerGoogleId || uid,
          sourceDeviceId: h.sourceDeviceId || deviceId,
          createdAt: h.createdAt || new Date().toISOString(),
          updatedAt: h.updatedAt || new Date().toISOString(),
          deletedAt: h.deletedAt || null
        })),
        Auditoria: mergedHistory
          .filter(h => h.title.includes('Miembro') || h.title.includes('Borrado') || h.title.includes('Permisos') || h.title.includes('Cita'))
          .map(h => ({
            id: h.id,
            timestamp: h.createdAt || new Date().toISOString(),
            userId: uid,
            userEmail: email,
            action: h.title,
            details: h.description || '',
            deviceId: deviceId || 'unknown',
            createdAt: h.createdAt || new Date().toISOString()
          })),
        Retencion: [],
        SyncLog: mergedHistory
          .filter(h => h.title.includes('sincronización') || h.title.includes('Conflicto'))
          .map(h => ({
            id: h.id,
            timestamp: h.createdAt || new Date().toISOString(),
            deviceId: deviceId || 'unknown',
            actorEmail: email,
            tableName: 'history',
            entityId: h.id,
            actionType: 'SYNC',
            fieldName: 'syncStatus',
            localValue: h.title,
            remoteValue: h.description,
            resolution: 'LWW',
            createdAt: h.createdAt || new Date().toISOString()
          })),
        FuentesCorreoCitas: mergedSources.map(s => ({
          ...s,
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: s.updatedAt || new Date().toISOString()
        })),
        CandidatosCorreoCitas: mergedCandidates.map(c => ({
          ...c,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString()
        })),
        OrdenesMedicas: mergedOrders.map(o => ({
          ...o,
          ownerEmail: o.ownerEmail || email,
          ownerGoogleId: o.ownerGoogleId || uid,
          sourceDeviceId: o.sourceDeviceId || deviceId,
          createdAt: o.createdAt || new Date().toISOString(),
          updatedAt: o.updatedAt || new Date().toISOString(),
          deletedAt: o.deletedAt || null
        })),
        Medicamentos: mergedPrescriptions.map(m => ({
          ...m,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        TomasMedicamentos: mergedDoseReminders.map(t => ({
          ...t,
          ownerEmail: t.ownerEmail || email,
          ownerGoogleId: t.ownerGoogleId || uid,
          sourceDeviceId: t.sourceDeviceId || deviceId,
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
          deletedAt: t.deletedAt || null
        }))
      };

      await writeAllOperationalTables(token, sheetId, operationalStateSnapshot);

      // Validación post-push de citas
      try {
        const verifyState = await readAllOperationalTables(token, sheetId);
        const verifyCitas: MedicalAppointment[] = verifyState.Citas ? verifyState.Citas.map(sanitizeRemoteAppointment) : [];
        const localActiveAppts = mergedAppointments.filter(a => !a.deletedAt);
        for (const localAppt of localActiveAppts) {
          const found = verifyCitas.some(r => r.id === localAppt.id);
          if (!found) {
            throw new Error(`La cita con ID ${localAppt.id} (${localAppt.doctorName}) no fue escrita en Google Sheets.`);
          }
        }
      } catch (verifyErr: any) {
        console.error('Fallo en la validación post-push de citas:', verifyErr);
        throw new Error(`Validación post-push fallida: ${verifyErr.message || 'La cita no fue escrita en Google Sheets.'}`);
      }

      // Marcar todos como SYNCED
      const now = new Date().toISOString();
      setMembers(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setAppointments(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setCheckups(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setVaccines(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setExams(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setDocuments(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setEmailSources(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setAppointmentCandidates(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setMedicalOrders(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setMedicationPrescriptions(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setMedicationDoseReminders(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));

      setLastPushAt(now);
      setLastSyncAt(now);
      setOpSyncStatus('synced');
    } catch (err: any) {
      console.error('Error durante la sincronización total:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error de sincronización.');
    }
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
      await pushToGoogleInternal(token, sheetId);
      
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
          await pullFromGoogleInternal(token, remoteSheetId);
          
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
      await pushToGoogleInternal(token, sheetId);
      
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
  } else if (isFirebaseBackend && currentUserFamilyAccess) {
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
        syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
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
      setTimeout(() => scheduleAutoSync('document_shared'), 100);

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
        syncStatus: isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC',
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

      setTimeout(() => scheduleAutoSync('document_share_revoked'), 100);

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
            syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
            updatedAt: new Date().toISOString()
          };
        }
        return {
          ...localMember,
          syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
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
            syncStatus: (isFirebaseBackend ? 'SYNCED' : 'PENDING_SYNC') as any,
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
    // 4. Actualizar LocalStorage local (se gatilla reactivamente al llamar setMembers en pullFromGoogleInternal)
    await pullFromGoogleInternal(token, sheetId);
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

    if (origen === 'REAL' && isFirebaseBackend) {
      try {
        const { firebaseAuth } = await import('../lib/firebase');
        if (!firebaseAuth.currentUser) { alLogin(); return; }
      } catch {
        alLogin();
        return;
      }
    }

    // (3) Restauracion segun el origen.
    try {
      if (origen === 'DEMO') {
        const guardado = loadAppState('demo');
        if (!guardado) throw new Error('sin_estado_demo');
        aplicarEstadoRestaurado(guardado);
      } else if (isFirebaseBackend) {
        const repo = await getDataRepository();
        const fid = familyIdRef.current;
        if (!fid) throw new Error('sin_familia');
        const data = await repo.loadAll({
          uid: user.googleId || user.id || '',
          email: user.email,
          familyId: fid,
        });
        aplicarDatosRemotos(data);
      } else {
        // Backend Sheets con sesion real: la fuente de verdad es la hoja.
        await pullFromGoogle();
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
      firebaseAuthReady,
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
      addMedicalOrder,
      updateMedicalOrder,
      deleteMedicalOrder,
      createAppointmentFromOrder,
      addMedicationPrescription,
      updateMedicationPrescription,
      deleteMedicationPrescription,
      markDoseReminder,
      generateDoseReminders,

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
      isFirebaseBackend,
      pendingInvitations,
      invitations,
      createInvitation,
      acceptInvitation,
      revokeInvitation,
      createNewFamily,
      checkPendingInvitations,
      testFirebaseConnection,
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
