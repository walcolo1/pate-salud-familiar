/**
 * FirebaseRepository — Paté Salud Familiar
 *
 * Concrete DataRepository implementation for the Firebase/Firestore backend.
 * Delegates all operations to the functions exported by firestoreService.ts.
 *
 * EMPTY FIRESTORE / FIRST-USER HANDLING
 * ──────────────────────────────────────
 * loadAll() returns EMPTY_FAMILY_DATA when Firestore has no documents for
 * this family. The caller (AppContext) is responsible for routing the user
 * through the onboarding flow in this case.
 *
 * initFamily() either returns an existing familyId (found in
 * users/{uid}/familyAccess) or creates a new family document and OWNER
 * access record atomically.
 */

import type { DataRepository, RepositoryContext, AllFamilyData, DataUpdate } from './dataRepository';
import { EMPTY_FAMILY_DATA } from './dataRepository';
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

import {
  // Users & Family
  upsertUserProfile,
  getUserFamilyAccess,
  createFamily,
  getFamily,
  getFamiliesOwnedBy,
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  getInvitationsForEmail,
  watchInvitations,
  FamilyInvitation,
  watchUserFamilyAccess,
  FamilyAccess,
  // Settings
  saveFamilySettings,
  getFamilySettings,
  // Bulk load & watch
  loadAllFamilyData,
  watchAllFamilyData,
  // Members
  createMember,
  updateMember,
  deleteMember,
  // Health Profiles
  saveHealthProfile as fsaveHealthProfile,
  // Appointments
  createAppointment,
  updateAppointment,
  deleteAppointment,
  // Checkups
  createCheckup,
  updateCheckup,
  deleteCheckup,
  // Vaccines
  createVaccine,
  updateVaccine,
  deleteVaccine,
  // Exams
  createExam,
  updateExam,
  deleteExam,
  saveExamResults as fsaveExamResults,
  // Documents
  createDocument,
  updateDocument,
  deleteDocument,
  // History
  createHistoryEvent,
  // Reminders
  createReminder,
  updateReminder,
  // Tasks
  createTask,
  updateTask,
  // Medical Orders
  createMedicalOrder,
  updateMedicalOrder,
  deleteMedicalOrder,
  // Medications
  createMedication,
  updateMedication,
  deleteMedication,
  // Dose Reminders
  createDoseReminder,
  updateDoseReminder,
  deleteDoseReminder as fdeleteDoseReminder,
  // Gmail
  createGmailSource,
  updateGmailSource,
  deleteGmailSource,
  // Candidates
  createAppointmentCandidate,
  updateAppointmentCandidate,
} from './firestoreService';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function requireFamilyId(ctx: RepositoryContext): string {
  if (!ctx.familyId) {
    throw new Error(
      '[FirebaseRepository] familyId is required but was null. ' +
      'Call initFamily() first.',
    );
  }
  return ctx.familyId;
}

// ─────────────────────────────────────────────────────────────────────────────
// FirebaseRepository class
// ─────────────────────────────────────────────────────────────────────────────

export class FirebaseRepository implements DataRepository {

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Resolves (or creates) the Firestore family for the authenticated user.
   *
   * Steps:
   *  1. Upsert the user profile document.
   *  2. Look up familyAccess records for this UID.
   *  3. If an ACTIVE access exists → return that familyId.
   *  4. Otherwise → create a new family + OWNER access → return the new familyId.
   */
  async initFamily(ctx: Omit<RepositoryContext, 'familyId'> & { displayName?: string }): Promise<string | null> {
    // 1. Upsert user profile (safe to call on every login)
    await upsertUserProfile(ctx.uid, {
      email: ctx.email,
      displayName: ctx.displayName ?? ctx.email,
    });

    // 2. Look up existing family access
    const accessList = await getUserFamilyAccess(ctx.uid);
    const active = accessList.find((a) => a.status === 'ACTIVE');
    if (active) {
      // console.info(`[FirebaseRepository] Using existing family: ${active.familyId}`);
      return active.familyId;
    }

    // 3. Check for pending invitations. If any exist, return null to let user accept first.
    const pendingInvs = await getInvitationsForEmail(ctx.email);
    if (pendingInvs.length > 0) {
      // console.info(`[FirebaseRepository] Found ${pendingInvs.length} pending invitations. Skipping auto-creation.`);
      return null;
    }

    // 4. No family yet and no pending invitations → create one
    const familyName = ctx.displayName
      ? `Familia ${ctx.displayName}`
      : `Familia de ${ctx.email}`;

    const familyId = await createFamily(ctx.uid, ctx.email, familyName);
    // console.info(`[FirebaseRepository] Created new family: ${familyId}`);
    return familyId;
  }

  /**
   * Loads the full family data snapshot from Firestore.
   * Returns EMPTY_FAMILY_DATA if the family exists but has no records yet
   * (first-time user scenario).
   */
  async loadAll(ctx: RepositoryContext): Promise<AllFamilyData> {
    const familyId = requireFamilyId(ctx);

    try {
      const raw = await loadAllFamilyData(familyId);

      return {
        members:               raw.members,
        healthProfiles:        raw.healthProfiles,
        appointments:          raw.appointments,
        checkups:              raw.checkups,
        vaccines:              raw.vaccines,
        exams:                 raw.exams,
        examResults:           raw.examResults,
        documents:             raw.documents,
        history:               raw.history,
        reminders:             raw.reminders,
        tasks:                 raw.tasks,
        medicalOrders:         raw.medicalOrders,
        medications:           raw.medications,
        doseReminders:         raw.doseReminders,
        gmailSources:          raw.gmailSources,
        appointmentCandidates: raw.appointmentCandidates,

        // Settings (merge defaults with Firestore values)
        gmailAutoScanEnabled:        raw.settings?.gmailAutoScanEnabled        ?? false,
        gmailScanTime:               raw.settings?.gmailScanTime               ?? '00:00',
        gmailScanRangeDays:          raw.settings?.gmailScanRangeDays          ?? 90,
        gmailOnlyFutureAppointments: raw.settings?.gmailOnlyFutureAppointments ?? true,
        lastGmailScanAt:             raw.settings?.lastGmailScanAt             ?? null,
        nextGmailScanAt:             raw.settings?.nextGmailScanAt             ?? null,
      };
    } catch (err) {
      console.error('[FirebaseRepository] loadAll failed, returning empty data:', err);
      return { ...EMPTY_FAMILY_DATA };
    }
  }

  /**
   * Subscribes to real-time updates for all collections.
   * Returns a single unsubscribe function.
   */
  watchAll(ctx: RepositoryContext, callback: (update: DataUpdate) => void): () => void {
    if (!ctx.familyId) {
      console.warn('[FirebaseRepository] watchAll called without familyId — skipping.');
      return () => {};
    }
    return watchAllFamilyData(ctx.familyId, callback);
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async saveMember(ctx: RepositoryContext, member: FamilyMember): Promise<void> {
    const fid = requireFamilyId(ctx);
    // Check if it already exists by trying update first; create on miss
    try {
      await updateMember(fid, member.id, member, ctx.uid);
    } catch {
      await createMember(fid, member, ctx.uid);
    }
  }

  async deleteMember(ctx: RepositoryContext, memberId: string): Promise<void> {
    await deleteMember(requireFamilyId(ctx), memberId, ctx.uid);
  }

  // ── Health Profiles ───────────────────────────────────────────────────────

  async saveHealthProfile(ctx: RepositoryContext, memberId: string, profile: HealthProfile): Promise<void> {
    await fsaveHealthProfile(requireFamilyId(ctx), memberId, profile, ctx.uid);
  }

  // ── Appointments ──────────────────────────────────────────────────────────

  async saveAppointment(ctx: RepositoryContext, appt: MedicalAppointment): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateAppointment(fid, appt.id, appt, ctx.uid);
    } catch {
      await createAppointment(fid, appt, ctx.uid);
    }
  }

  async deleteAppointment(ctx: RepositoryContext, apptId: string): Promise<void> {
    await deleteAppointment(requireFamilyId(ctx), apptId, ctx.uid);
  }

  // ── Checkups ──────────────────────────────────────────────────────────────

  async saveCheckup(ctx: RepositoryContext, checkup: PeriodicCheckup): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateCheckup(fid, checkup.id, checkup, ctx.uid);
    } catch {
      await createCheckup(fid, checkup, ctx.uid);
    }
  }

  async deleteCheckup(ctx: RepositoryContext, checkupId: string): Promise<void> {
    await deleteCheckup(requireFamilyId(ctx), checkupId, ctx.uid);
  }

  // ── Vaccines ──────────────────────────────────────────────────────────────

  async saveVaccine(ctx: RepositoryContext, vaccine: VaccineRecord): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateVaccine(fid, vaccine.id, vaccine, ctx.uid);
    } catch {
      await createVaccine(fid, vaccine, ctx.uid);
    }
  }

  async deleteVaccine(ctx: RepositoryContext, vaccineId: string): Promise<void> {
    await deleteVaccine(requireFamilyId(ctx), vaccineId, ctx.uid);
  }

  // ── Exams ─────────────────────────────────────────────────────────────────

  async saveExam(ctx: RepositoryContext, exam: MedicalExam): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateExam(fid, exam.id, exam, ctx.uid);
    } catch {
      await createExam(fid, exam, ctx.uid);
    }
  }

  async deleteExam(ctx: RepositoryContext, examId: string): Promise<void> {
    await deleteExam(requireFamilyId(ctx), examId, ctx.uid);
  }

  async saveExamResults(ctx: RepositoryContext, examId: string, results: ExamResult[]): Promise<void> {
    await fsaveExamResults(requireFamilyId(ctx), examId, results);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async saveDocument(ctx: RepositoryContext, document: ClinicalDocument): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateDocument(fid, document.id, document, ctx.uid);
    } catch {
      await createDocument(fid, document, ctx.uid);
    }
  }

  async deleteDocument(ctx: RepositoryContext, docId: string): Promise<void> {
    await deleteDocument(requireFamilyId(ctx), docId, ctx.uid);
  }

  // ── History ───────────────────────────────────────────────────────────────

  async saveHistoryEvent(ctx: RepositoryContext, event: MedicalHistoryEvent): Promise<void> {
    // History events are append-only — always create
    await createHistoryEvent(requireFamilyId(ctx), event, ctx.uid);
  }

  // ── Reminders ─────────────────────────────────────────────────────────────

  async saveReminder(ctx: RepositoryContext, reminder: Reminder): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateReminder(fid, reminder.id, reminder);
    } catch {
      await createReminder(fid, reminder);
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async saveTask(ctx: RepositoryContext, task: FollowUpTask): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateTask(fid, task.id, task);
    } catch {
      await createTask(fid, task, ctx.uid);
    }
  }

  // ── Medical Orders ────────────────────────────────────────────────────────

  async saveMedicalOrder(ctx: RepositoryContext, order: MedicalOrder): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateMedicalOrder(fid, order.id, order, ctx.uid);
    } catch {
      await createMedicalOrder(fid, order, ctx.uid);
    }
  }

  async deleteMedicalOrder(ctx: RepositoryContext, orderId: string): Promise<void> {
    await deleteMedicalOrder(requireFamilyId(ctx), orderId, ctx.uid);
  }

  // ── Medications ───────────────────────────────────────────────────────────

  async saveMedication(ctx: RepositoryContext, prescription: MedicationPrescription): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateMedication(fid, prescription.id, prescription, ctx.uid);
    } catch {
      await createMedication(fid, prescription, ctx.uid);
    }
  }

  async deleteMedication(ctx: RepositoryContext, prescriptionId: string): Promise<void> {
    await deleteMedication(requireFamilyId(ctx), prescriptionId, ctx.uid);
  }

  // ── Dose Reminders ────────────────────────────────────────────────────────

  async saveDoseReminder(ctx: RepositoryContext, reminder: MedicationDoseReminder): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateDoseReminder(fid, reminder.id, reminder, ctx.uid);
    } catch {
      await createDoseReminder(fid, reminder, ctx.uid);
    }
  }

  async deleteDoseReminder(ctx: RepositoryContext, reminderId: string): Promise<void> {
    await fdeleteDoseReminder(requireFamilyId(ctx), reminderId, ctx.uid);
  }

  // ── Gmail Sources ─────────────────────────────────────────────────────────

  async saveGmailSource(ctx: RepositoryContext, source: AppointmentEmailSource): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateGmailSource(fid, source.id, source);
    } catch {
      await createGmailSource(fid, source);
    }
  }

  async deleteGmailSource(ctx: RepositoryContext, sourceId: string): Promise<void> {
    await deleteGmailSource(requireFamilyId(ctx), sourceId);
  }

  // ── Appointment Candidates ────────────────────────────────────────────────

  async saveAppointmentCandidate(
    ctx: RepositoryContext,
    candidate: ImportedEmailAppointmentCandidate,
  ): Promise<void> {
    const fid = requireFamilyId(ctx);
    try {
      await updateAppointmentCandidate(fid, candidate.id, candidate);
    } catch {
      await createAppointmentCandidate(fid, candidate);
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async saveSettings(
    ctx: RepositoryContext,
    settings: Parameters<DataRepository['saveSettings']>[1],
  ): Promise<void> {
    await saveFamilySettings(
      requireFamilyId(ctx),
      {
        gmailAutoScanEnabled:        settings.gmailAutoScanEnabled,
        gmailScanTime:               settings.gmailScanTime,
        gmailScanRangeDays:          settings.gmailScanRangeDays,
        gmailOnlyFutureAppointments: settings.gmailOnlyFutureAppointments,
        lastGmailScanAt:             settings.lastGmailScanAt,
        nextGmailScanAt:             settings.nextGmailScanAt,
      },
      ctx.uid,
    );
  }

  // ── Invitaciones y Creación de Familias ───────────────────────────────────

  async createFamily(ctx: Omit<RepositoryContext, 'familyId'>, name: string): Promise<string> {
    const familyId = await createFamily(ctx.uid, ctx.email, name);
    return familyId;
  }

  async createInvitation(
    ctx: RepositoryContext,
    invitedEmail: string,
    invitedMemberId: string,
    role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER'
  ): Promise<string> {
    const fid = requireFamilyId(ctx);
    const token = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
      
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return await createInvitation(fid, {
      invitedEmail,
      invitedMemberId,
      role,
      token,
      expiresAt: expiresAt.toISOString(),
      createdBy: ctx.uid,
    });
  }

  async acceptInvitation(
    ctx: RepositoryContext,
    familyId: string,
    invitationId: string
  ): Promise<void> {
    await acceptInvitation(familyId, invitationId, ctx.uid, ctx.email);
  }

  async revokeInvitation(
    ctx: RepositoryContext,
    invitationId: string
  ): Promise<void> {
    const fid = requireFamilyId(ctx);
    await revokeInvitation(fid, invitationId);
  }

  async getInvitationsForEmail(
    email: string
  ): Promise<FamilyInvitation[]> {
    return await getInvitationsForEmail(email);
  }

  watchInvitations(
    ctx: RepositoryContext,
    callback: (invitations: FamilyInvitation[]) => void
  ): () => void {
    const fid = requireFamilyId(ctx);
    return watchInvitations(fid, callback);
  }

  watchUserFamilyAccess(
    uid: string,
    callback: (accessList: FamilyAccess[]) => void
  ): () => void {
    return watchUserFamilyAccess(uid, callback);
  }
}
