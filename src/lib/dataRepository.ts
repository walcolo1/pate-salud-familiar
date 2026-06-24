/**
 * DataRepository — Paté Salud Familiar
 *
 * Central abstraction layer that decouples AppContext from any specific
 * data backend (Google Sheets or Firebase/Firestore).
 *
 * USAGE
 * ─────
 * const repo = getDataRepository();       // singleton, picked once at startup
 * const data = await repo.loadAll(ctx);
 * const unsub = repo.watchAll(ctx, cb);   // firebase only; no-op for sheets
 * await repo.saveMember(ctx, member);
 *
 * CONTEXT
 * ───────
 * Every method receives a RepositoryContext so the repository can decide
 * which family / user it is operating on without being a singleton that
 * holds stale auth state.
 */

import type {
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
  MedicalOrder,
  MedicationPrescription,
  MedicationDoseReminder,
  AppointmentEmailSource,
  ImportedEmailAppointmentCandidate,
} from '../domain/models';
import type { FamilySettings, FamilyInvitation } from './firestoreService';

import { isFirebaseBackend } from './dataBackend';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Context passed to every repository call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime context required by every repository operation.
 * Sheets: `sheetsToken` and `spreadsheetId` are required.
 * Firebase: `familyId` and `uid` are required.
 */
export interface RepositoryContext {
  /** Firebase UID of the authenticated user. */
  uid: string;
  /** User's email address. */
  email: string;
  /** Firebase family document ID (required for firebase backend). */
  familyId: string | null;
  /** Google OAuth token for Sheets API (required for sheets backend). */
  sheetsToken?: string | null;
  /** Spreadsheet ID for the operational Sheets database. */
  spreadsheetId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Snapshot of all family data (what AppContext holds in memory)
// ─────────────────────────────────────────────────────────────────────────────

export interface AllFamilyData {
  members:                 FamilyMember[];
  healthProfiles:          Record<string, HealthProfile>;
  appointments:            MedicalAppointment[];
  checkups:                PeriodicCheckup[];
  vaccines:                VaccineRecord[];
  exams:                   MedicalExam[];
  examResults:             Record<string, ExamResult[]>;
  documents:               ClinicalDocument[];
  history:                 MedicalHistoryEvent[];
  reminders:               Reminder[];
  tasks:                   FollowUpTask[];
  medicalOrders:           MedicalOrder[];
  medications:             MedicationPrescription[];
  doseReminders:           MedicationDoseReminder[];
  gmailSources:            AppointmentEmailSource[];
  appointmentCandidates:   ImportedEmailAppointmentCandidate[];
  // Settings (not a domain model; stored as flat flags in AppContext)
  gmailAutoScanEnabled:        boolean;
  gmailScanTime:               string;
  gmailScanRangeDays:          number;
  gmailOnlyFutureAppointments: boolean;
  lastGmailScanAt:             string | null;
  nextGmailScanAt:             string | null;
}

/** The empty initial state used when Firestore (or Sheets) has no data yet. */
export const EMPTY_FAMILY_DATA: AllFamilyData = {
  members:                 [],
  healthProfiles:          {},
  appointments:            [],
  checkups:                [],
  vaccines:                [],
  exams:                   [],
  examResults:             {},
  documents:               [],
  history:                 [],
  reminders:               [],
  tasks:                   [],
  medicalOrders:           [],
  medications:             [],
  doseReminders:           [],
  gmailSources:            [],
  appointmentCandidates:   [],
  gmailAutoScanEnabled:        false,
  gmailScanTime:               '00:00',
  gmailScanRangeDays:          90,
  gmailOnlyFutureAppointments: true,
  lastGmailScanAt:             null,
  nextGmailScanAt:             null,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Discriminated-union update emitted by watchAll
// ─────────────────────────────────────────────────────────────────────────────

export type DataUpdate =
  | { type: 'members';               data: FamilyMember[] }
  | { type: 'healthProfiles';        data: Record<string, HealthProfile> }
  | { type: 'appointments';          data: MedicalAppointment[] }
  | { type: 'checkups';              data: PeriodicCheckup[] }
  | { type: 'vaccines';              data: VaccineRecord[] }
  | { type: 'exams';                 data: MedicalExam[] }
  | { type: 'documents';             data: ClinicalDocument[] }
  | { type: 'history';               data: MedicalHistoryEvent[] }
  | { type: 'reminders';             data: Reminder[] }
  | { type: 'tasks';                 data: FollowUpTask[] }
  | { type: 'medicalOrders';         data: MedicalOrder[] }
  | { type: 'medications';           data: MedicationPrescription[] }
  | { type: 'doseReminders';         data: MedicationDoseReminder[] }
  | { type: 'gmailSources';          data: AppointmentEmailSource[] }
  | { type: 'appointmentCandidates'; data: ImportedEmailAppointmentCandidate[] }
  // settings update emitted by watchFamilySettings — AppContext applies the
  // individual fields it cares about; unrecognised fields are ignored.
  | { type: 'settings';             data: FamilySettings | null };

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Repository interface
// ─────────────────────────────────────────────────────────────────────────────

export interface DataRepository {

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Loads the full family data snapshot.
   * - Sheets: calls readAllOperationalTables.
   * - Firebase: calls loadAllFamilyData(familyId). Returns EMPTY_FAMILY_DATA
   *   when Firestore has no data yet (first-time user scenario).
   */
  loadAll(ctx: RepositoryContext): Promise<AllFamilyData>;

  /**
   * Firebase-only: resolves or creates the family document for the user.
   * Returns the familyId string.
   * Sheets: returns null (family is implicit in the spreadsheet).
   */
  initFamily(ctx: Omit<RepositoryContext, 'familyId'> & { displayName?: string }): Promise<string | null>;

  /**
   * Firebase-only: subscribes to real-time updates for all collections.
   * Calls `callback` with a DataUpdate whenever any collection changes.
   * Returns an unsubscribe function (call on signOut or component unmount).
   * Sheets: immediately returns a no-op unsubscribe.
   */
  watchAll(ctx: RepositoryContext, callback: (update: DataUpdate) => void): () => void;

  // ── Members ───────────────────────────────────────────────────────────────
  saveMember(ctx: RepositoryContext, member: FamilyMember): Promise<void>;
  deleteMember(ctx: RepositoryContext, memberId: string): Promise<void>;

  // ── Health Profiles ───────────────────────────────────────────────────────
  saveHealthProfile(ctx: RepositoryContext, memberId: string, profile: HealthProfile): Promise<void>;

  // ── Appointments ──────────────────────────────────────────────────────────
  saveAppointment(ctx: RepositoryContext, appt: MedicalAppointment): Promise<void>;
  deleteAppointment(ctx: RepositoryContext, apptId: string): Promise<void>;

  // ── Checkups ──────────────────────────────────────────────────────────────
  saveCheckup(ctx: RepositoryContext, checkup: PeriodicCheckup): Promise<void>;
  deleteCheckup(ctx: RepositoryContext, checkupId: string): Promise<void>;

  // ── Vaccines ──────────────────────────────────────────────────────────────
  saveVaccine(ctx: RepositoryContext, vaccine: VaccineRecord): Promise<void>;
  deleteVaccine(ctx: RepositoryContext, vaccineId: string): Promise<void>;

  // ── Exams ─────────────────────────────────────────────────────────────────
  saveExam(ctx: RepositoryContext, exam: MedicalExam): Promise<void>;
  deleteExam(ctx: RepositoryContext, examId: string): Promise<void>;
  saveExamResults(ctx: RepositoryContext, examId: string, results: ExamResult[]): Promise<void>;

  // ── Documents ─────────────────────────────────────────────────────────────
  saveDocument(ctx: RepositoryContext, doc: ClinicalDocument): Promise<void>;
  deleteDocument(ctx: RepositoryContext, docId: string): Promise<void>;

  // ── History ───────────────────────────────────────────────────────────────
  saveHistoryEvent(ctx: RepositoryContext, event: MedicalHistoryEvent): Promise<void>;

  // ── Reminders ─────────────────────────────────────────────────────────────
  saveReminder(ctx: RepositoryContext, reminder: Reminder): Promise<void>;

  // ── Tasks ─────────────────────────────────────────────────────────────────
  saveTask(ctx: RepositoryContext, task: FollowUpTask): Promise<void>;

  // ── Medical Orders ────────────────────────────────────────────────────────
  saveMedicalOrder(ctx: RepositoryContext, order: MedicalOrder): Promise<void>;
  deleteMedicalOrder(ctx: RepositoryContext, orderId: string): Promise<void>;

  // ── Medications ───────────────────────────────────────────────────────────
  saveMedication(ctx: RepositoryContext, prescription: MedicationPrescription): Promise<void>;
  deleteMedication(ctx: RepositoryContext, prescriptionId: string): Promise<void>;

  // ── Dose Reminders ────────────────────────────────────────────────────────
  saveDoseReminder(ctx: RepositoryContext, reminder: MedicationDoseReminder): Promise<void>;
  deleteDoseReminder(ctx: RepositoryContext, reminderId: string): Promise<void>;

  // ── Gmail Sources ─────────────────────────────────────────────────────────
  saveGmailSource(ctx: RepositoryContext, source: AppointmentEmailSource): Promise<void>;
  deleteGmailSource(ctx: RepositoryContext, sourceId: string): Promise<void>;

  // ── Appointment Candidates ────────────────────────────────────────────────
  saveAppointmentCandidate(ctx: RepositoryContext, candidate: ImportedEmailAppointmentCandidate): Promise<void>;

  // ── Settings ──────────────────────────────────────────────────────────────
  saveSettings(ctx: RepositoryContext, settings: Partial<Pick<AllFamilyData,
    | 'gmailAutoScanEnabled'
    | 'gmailScanTime'
    | 'gmailScanRangeDays'
    | 'gmailOnlyFutureAppointments'
    | 'lastGmailScanAt'
    | 'nextGmailScanAt'
  >>): Promise<void>;

  // ── Invitaciones y Creación de Familias ───────────────────────────────────
  createFamily(
    ctx: Omit<RepositoryContext, 'familyId'>,
    name: string
  ): Promise<string>;

  createInvitation(
    ctx: RepositoryContext,
    invitedEmail: string,
    invitedMemberId: string,
    role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER'
  ): Promise<string>;

  acceptInvitation(
    ctx: RepositoryContext,
    familyId: string,
    invitationId: string
  ): Promise<void>;

  revokeInvitation(
    ctx: RepositoryContext,
    invitationId: string
  ): Promise<void>;

  getInvitationsForEmail(
    email: string
  ): Promise<FamilyInvitation[]>;

  watchInvitations(
    ctx: RepositoryContext,
    callback: (invitations: FamilyInvitation[]) => void
  ): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Singleton factory
// ─────────────────────────────────────────────────────────────────────────────

let _instance: DataRepository | null = null;

/**
 * Returns the singleton DataRepository for the active backend.
 * Lazy-initialised: the concrete class is only imported when first called
 * so Next.js can tree-shake the unused backend.
 *
 * IMPORTANT: Call this only on the client side (inside useEffect or event
 * handlers) — never at module level or in server components.
 */
export async function getDataRepository(): Promise<DataRepository> {
  if (_instance) return _instance;

  if (isFirebaseBackend) {
    const { FirebaseRepository } = await import('./firebaseRepository');
    _instance = new FirebaseRepository();
  } else {
    const { SheetsRepository } = await import('./sheetsRepository');
    _instance = new SheetsRepository();
  }

  return _instance;
}

/**
 * Synchronous variant — returns the cached singleton or throws if it hasn't
 * been initialised yet. Useful in callbacks that can't be async.
 */
export function getDataRepositorySync(): DataRepository {
  if (!_instance) {
    throw new Error(
      '[DataRepository] Repository not initialised. ' +
      'Call getDataRepository() once during app startup before using the sync variant.',
    );
  }
  return _instance;
}

/** Resets the singleton (useful in tests or after signOut). */
export function resetDataRepository(): void {
  _instance = null;
}
