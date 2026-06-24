/**
 * SheetsRepository — Paté Salud Familiar
 *
 * Concrete DataRepository implementation for the existing Google Sheets backend.
 *
 * This is intentionally a THIN WRAPPER. The AppContext already contains
 * the full Sheets logic (pullFromGoogleInternal, pushToGoogleInternal, etc.).
 * This class does NOT duplicate that logic — it simply satisfies the
 * DataRepository interface and delegates heavy operations back to AppContext
 * via callbacks registered at initialisation time.
 *
 * For the Sheets backend:
 * - loadAll()   → no-op (data is loaded by AppContext's pullFromGoogle)
 * - watchAll()  → no-op (Sheets has no real-time events)
 * - initFamily()→ returns null (family is implicit in the spreadsheet)
 * - save*()     → no-op (Sheets writes are batched by AppContext's pushToGoogle)
 *
 * WHY NO-OPS?
 * ───────────
 * In the Sheets architecture, data is loaded once at sign-in via
 * readAllOperationalTables and flushed periodically via writeAllOperationalTables.
 * AppContext manages this entire lifecycle through scheduleAutoSync().
 * Duplicating those calls here would cause double-writes and conflicts.
 *
 * When DATA_BACKEND=sheets, the DataRepository abstraction is transparent:
 * AppContext calls these methods but they do nothing — the existing Sheets
 * pipeline continues to handle persistence as before.
 */

import type {
  DataRepository,
  RepositoryContext,
  AllFamilyData,
  DataUpdate,
} from './dataRepository';
import { EMPTY_FAMILY_DATA } from './dataRepository';
import type { FamilyInvitation } from './firestoreService';
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

// ─────────────────────────────────────────────────────────────────────────────
// SheetsRepository class
// ─────────────────────────────────────────────────────────────────────────────

export class SheetsRepository implements DataRepository {

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Family identity is implicit in the spreadsheet — no Firestore family doc.
   * Always returns null for the Sheets backend.
   */
  async initFamily(_ctx: Omit<RepositoryContext, 'familyId'>): Promise<null> {
    return null;
  }

  /**
   * Data loading is handled by AppContext's pullFromGoogleInternal.
   * This method returns EMPTY_FAMILY_DATA; AppContext ignores the return
   * value and uses its own pull mechanism instead.
   */
  async loadAll(_ctx: RepositoryContext): Promise<AllFamilyData> {
    return { ...EMPTY_FAMILY_DATA };
  }

  /**
   * Sheets has no real-time events. Returns a no-op unsubscribe.
   */
  watchAll(
    _ctx: RepositoryContext,
    _callback: (update: DataUpdate) => void,
  ): () => void {
    return () => {};
  }

  // ── All CRUD methods are no-ops for the Sheets backend ───────────────────
  // AppContext's scheduleAutoSync() batches all writes into a single
  // writeAllOperationalTables() call. Individual entity writes are not needed.

  async saveMember(_ctx: RepositoryContext, _m: FamilyMember): Promise<void> {}
  async deleteMember(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveHealthProfile(
    _ctx: RepositoryContext,
    _memberId: string,
    _profile: HealthProfile,
  ): Promise<void> {}

  async saveAppointment(_ctx: RepositoryContext, _a: MedicalAppointment): Promise<void> {}
  async deleteAppointment(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveCheckup(_ctx: RepositoryContext, _c: PeriodicCheckup): Promise<void> {}
  async deleteCheckup(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveVaccine(_ctx: RepositoryContext, _v: VaccineRecord): Promise<void> {}
  async deleteVaccine(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveExam(_ctx: RepositoryContext, _e: MedicalExam): Promise<void> {}
  async deleteExam(_ctx: RepositoryContext, _id: string): Promise<void> {}
  async saveExamResults(
    _ctx: RepositoryContext,
    _examId: string,
    _results: ExamResult[],
  ): Promise<void> {}

  async saveDocument(_ctx: RepositoryContext, _d: ClinicalDocument): Promise<void> {}
  async deleteDocument(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveHistoryEvent(_ctx: RepositoryContext, _e: MedicalHistoryEvent): Promise<void> {}

  async saveReminder(_ctx: RepositoryContext, _r: Reminder): Promise<void> {}

  async saveTask(_ctx: RepositoryContext, _t: FollowUpTask): Promise<void> {}

  async saveMedicalOrder(_ctx: RepositoryContext, _o: MedicalOrder): Promise<void> {}
  async deleteMedicalOrder(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveMedication(_ctx: RepositoryContext, _p: MedicationPrescription): Promise<void> {}
  async deleteMedication(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveDoseReminder(_ctx: RepositoryContext, _r: MedicationDoseReminder): Promise<void> {}
  async deleteDoseReminder(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveGmailSource(_ctx: RepositoryContext, _s: AppointmentEmailSource): Promise<void> {}
  async deleteGmailSource(_ctx: RepositoryContext, _id: string): Promise<void> {}

  async saveAppointmentCandidate(
    _ctx: RepositoryContext,
    _c: ImportedEmailAppointmentCandidate,
  ): Promise<void> {}

  async saveSettings(
    _ctx: RepositoryContext,
    _settings: Parameters<DataRepository['saveSettings']>[1],
  ): Promise<void> {}

  // ── Invitaciones y Creación de Familias (no-ops for sheets) ───────────────
  async createFamily(_ctx: Omit<RepositoryContext, 'familyId'>, _name: string): Promise<string> {
    return 'mock-family-id';
  }

  async createInvitation(
    _ctx: RepositoryContext,
    _invitedEmail: string,
    _invitedMemberId: string,
    _role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER'
  ): Promise<string> {
    return 'mock-invitation-id';
  }

  async acceptInvitation(
    _ctx: RepositoryContext,
    _familyId: string,
    _invitationId: string
  ): Promise<void> {}

  async revokeInvitation(
    _ctx: RepositoryContext,
    _invitationId: string
  ): Promise<void> {}

  async getInvitationsForEmail(
    _email: string
  ): Promise<FamilyInvitation[]> {
    return [];
  }

  watchInvitations(
    _ctx: RepositoryContext,
    _callback: (invitations: FamilyInvitation[]) => void
  ): () => void {
    return () => {};
  }
}
