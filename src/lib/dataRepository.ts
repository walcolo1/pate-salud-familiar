/**
 * El contrato del repositorio (Bloque G, G4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La capa que separa `AppContext` de dónde viven los datos. Durante la
 * migración tuvo **dos** implementaciones y una bandera para elegir; desde G4
 * tiene **una**: `RepositorioBackend`, contra el router del titular.
 *
 * La bandera no se cambió: **se retiró**. Dejarla puesta era dejar el camino de
 * vuelta a un sitio al que no queremos volver — un servicio central donde los
 * expedientes de varias familias se tocan.
 *
 * USO
 * ───
 *   const repo = await getDataRepository();
 *   const datos = await repo.loadAll(ctx);
 *   await repo.saveMember(ctx, miembro);
 *
 * Cada método recibe su `RepositoryContext` en vez de que el repositorio sea un
 * singleton con estado de sesión dentro, que es como se quedan viejas las
 * credenciales sin que nadie se entere.
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
import type { FamilySettings, FamilyInvitation, FamilyAccess } from './tiposAcceso';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Context passed to every repository call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que toda operación necesita saber.
 *
 * `uid` y `familyId` son herencia de Firestore y hoy no los usa el backend del
 * titular: la familia **es la hoja**, y a quien llama lo identifica su
 * `id_token`. Se conservan porque quitarlos toca `AppContext` entero; queda
 * anotado como deuda de nombres, no como necesidad.
 */
export interface RepositoryContext {
  /** Herencia de Firebase Auth. Ya no identifica a nadie. */
  uid: string;
  /** El correo de quien llama. */
  email: string;
  /** Herencia de Firestore. La familia es la hoja del despliegue. */
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

  /** El expediente entero. */
  loadAll(ctx: RepositoryContext): Promise<AllFamilyData>;

  /** Devuelve `null`: la familia es la hoja y no hay documento que resolver. */
  initFamily(ctx: Omit<RepositoryContext, 'familyId'> & { displayName?: string }): Promise<string | null>;

  /**
   * La hoja no avisa cuando cambia: devuelve un desuscriptor vacío.
   *
   * Lo que sustituye a los eventos en tiempo real es el sondeo de G2
   * (`sondeoRevision.ts`), que pregunta la revisión y no la hoja.
   */
  watchAll(ctx: RepositoryContext, callback: (update: DataUpdate) => void): () => void;

  /**
   * `darDeBajaX`, y no `deleteX` (G4b).
   *
   * **Nada se borra.** La baja escribe `borrado_en` y la fila se queda: es una
   * de las decisiones que sostienen el proyecto, y en las reglas de Firestore
   * era `allow delete: if false`.
   *
   * El nombre viejo decía lo contrario de lo que pasa, y un contrato que
   * miente sobre lo que hace es el sitio donde alguien escribe un borrado de
   * verdad creyendo que ya lo era.
   */

  // ── Members ───────────────────────────────────────────────────────────────
  saveMember(ctx: RepositoryContext, member: FamilyMember): Promise<void>;
  darDeBajaMember(ctx: RepositoryContext, memberId: string): Promise<void>;

  // ── Health Profiles ───────────────────────────────────────────────────────
  saveHealthProfile(ctx: RepositoryContext, memberId: string, profile: HealthProfile): Promise<void>;

  // ── Appointments ──────────────────────────────────────────────────────────
  saveAppointment(ctx: RepositoryContext, appt: MedicalAppointment): Promise<void>;
  darDeBajaAppointment(ctx: RepositoryContext, apptId: string): Promise<void>;

  // ── Checkups ──────────────────────────────────────────────────────────────
  saveCheckup(ctx: RepositoryContext, checkup: PeriodicCheckup): Promise<void>;
  darDeBajaCheckup(ctx: RepositoryContext, checkupId: string): Promise<void>;

  // ── Vaccines ──────────────────────────────────────────────────────────────
  saveVaccine(ctx: RepositoryContext, vaccine: VaccineRecord): Promise<void>;
  darDeBajaVaccine(ctx: RepositoryContext, vaccineId: string): Promise<void>;

  // ── Exams ─────────────────────────────────────────────────────────────────
  saveExam(ctx: RepositoryContext, exam: MedicalExam): Promise<void>;
  darDeBajaExam(ctx: RepositoryContext, examId: string): Promise<void>;
  /**
   * `memberId` es opcional por compatibilidad y **hace falta** contra el
   * backend del titular: `EXAMENES_RESULTADOS` no tiene columna de paciente y
   * el router deniega toda mutación que no diga sobre quién actúa, incluso al
   * titular. Firestore lo ignora.
   */
  saveExamResults(
    ctx: RepositoryContext,
    examId: string,
    results: ExamResult[],
    memberId?: string,
  ): Promise<void>;

  // ── Documents ─────────────────────────────────────────────────────────────
  saveDocument(ctx: RepositoryContext, doc: ClinicalDocument): Promise<void>;
  darDeBajaDocument(ctx: RepositoryContext, docId: string): Promise<void>;

  // ── History ───────────────────────────────────────────────────────────────
  saveHistoryEvent(ctx: RepositoryContext, event: MedicalHistoryEvent): Promise<void>;

  // ── Reminders ─────────────────────────────────────────────────────────────
  saveReminder(ctx: RepositoryContext, reminder: Reminder): Promise<void>;

  // ── Tasks ─────────────────────────────────────────────────────────────────
  saveTask(ctx: RepositoryContext, task: FollowUpTask): Promise<void>;

  // ── Medical Orders ────────────────────────────────────────────────────────
  saveMedicalOrder(ctx: RepositoryContext, order: MedicalOrder): Promise<void>;
  darDeBajaMedicalOrder(ctx: RepositoryContext, orderId: string): Promise<void>;

  // ── Medications ───────────────────────────────────────────────────────────
  saveMedication(ctx: RepositoryContext, prescription: MedicationPrescription): Promise<void>;
  darDeBajaMedication(ctx: RepositoryContext, prescriptionId: string): Promise<void>;

  // ── Dose Reminders ────────────────────────────────────────────────────────
  saveDoseReminder(ctx: RepositoryContext, reminder: MedicationDoseReminder): Promise<void>;
  darDeBajaDoseReminder(ctx: RepositoryContext, reminderId: string): Promise<void>;

  // ── Gmail Sources ─────────────────────────────────────────────────────────
  saveGmailSource(ctx: RepositoryContext, source: AppointmentEmailSource): Promise<void>;
  darDeBajaGmailSource(ctx: RepositoryContext, sourceId: string): Promise<void>;

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

  watchUserFamilyAccess(
    uid: string,
    callback: (accessList: FamilyAccess[]) => void
  ): () => void;

  uploadMemberAvatar?(
    ctx: RepositoryContext,
    memberId: string,
    file: File,
    oldAvatarPath?: string | null
  ): Promise<{ url: string; path: string }>;

  /**
   * Una acción del usuario como UN lote (G4b).
   *
   * Las escrituras hechas sobre lo que devuelve se acumulan y salen juntas al
   * `confirmar()`. El router valida el lote entero antes de escribir nada, así
   * que o entra todo o no entra nada: sin familiares a medias en la hoja.
   */
  transaccion?(): DataRepository & { confirmar(): Promise<void> };

  /**
   * La dirección de la hoja de la familia, para «Abrir la hoja» (cierre de G4).
   * Solo el titular. Se pide cada vez y no se guarda.
   */
  urlDeLaHoja?(): Promise<string>;

  deleteMemberAvatar?(
    ctx: RepositoryContext,
    avatarPath: string
  ): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Singleton factory
// ─────────────────────────────────────────────────────────────────────────────

let _instance: DataRepository | null = null;

/**
 * El repositorio. Uno, y siempre el mismo.
 *
 * Sigue siendo asíncrono y con importación diferida aunque ya no haya nada que
 * elegir: `RepositorioBackend` arrastra la sesión de Google, y cargarla en el
 * servidor no tendría sentido.
 *
 * Llamar solo desde el cliente —dentro de un efecto o de un manejador—, nunca
 * al cargar el módulo ni desde un componente de servidor.
 */
export async function getDataRepository(): Promise<DataRepository> {
  if (_instance) return _instance;

  const { RepositorioBackend } = await import('./repositorioBackend');
  _instance = new RepositorioBackend();

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
