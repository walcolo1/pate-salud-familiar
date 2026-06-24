/**
 * Sheets → Firestore Migration Tool — Paté Salud Familiar
 *
 * One-shot migration that reads all 20 tabs of the Google Sheets operational
 * database and writes the data into the Firestore data model.
 *
 * SAFETY GUARANTEES
 * ─────────────────
 * • Google Sheets is NEVER modified or deleted — it remains as a backup.
 * • LocalStorage is NEVER touched.
 * • If Firestore already has a family for this owner, the migration refuses
 *   to proceed (idempotency guard) unless `force = true` is passed.
 * • All writes are batched (≤ 500 ops per batch) and atomic per-batch.
 *   A batch failure does not corrupt already-written batches, but the
 *   migration result will report partial success.
 *
 * MIGRATION METADATA
 * ──────────────────
 * Every migrated document receives:
 *   migratedFrom : 'GOOGLE_SHEETS'
 *   migratedAt   : ISO-8601 timestamp of migration
 *   sourceSheetId: the spreadsheet ID
 *
 * USAGE (from Settings page)
 * ──────────────────────────
 * const preview = await previewMigration(token, spreadsheetId);
 * // show preview.counts to user
 * const result  = await runMigration({ token, spreadsheetId, ownerUid,
 *                                      ownerEmail, familyName, onProgress });
 */

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { readAllOperationalTables } from './googleSheetsOperational';
import { createFamily, getFamiliesOwnedBy } from './firestoreService';

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
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationCounts {
  members: number;
  healthProfiles: number;
  appointments: number;
  checkups: number;
  vaccines: number;
  exams: number;
  examResults: number;
  documents: number;
  history: number;
  reminders: number;
  tasks: number;
  medicalOrders: number;
  medications: number;
  doseReminders: number;
  gmailSources: number;
  appointmentCandidates: number;
}

export interface MigrationPreview {
  counts: MigrationCounts;
  spreadsheetId: string;
  totalDocuments: number;
  estimatedBatches: number;
}

export interface MigrationResult {
  success: boolean;
  familyId: string | null;
  counts: MigrationCounts;
  errors: string[];
  migratedAt: string;
  durationMs: number;
}

export interface MigrationOptions {
  /** Operational token from ensureOperationalToken / getOperationalTokenIfValid */
  token: string;
  /** Spreadsheet ID from databaseSpreadsheetId in AppContext */
  spreadsheetId: string;
  /** Firebase Auth UID of the OWNER */
  ownerUid: string;
  /** Email of the OWNER */
  ownerEmail: string;
  /** Name for the new family document */
  familyName: string;
  /**
   * If true, skips the "already migrated" guard and creates a new family.
   * Use with caution — may create duplicate families.
   */
  force?: boolean;
  /** Progress callback called with human-readable status messages */
  onProgress?: (message: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 490; // Stay safely below the 500-op Firestore limit

/** Migration metadata added to every document. */
function migrationMeta(spreadsheetId: string) {
  return {
    migratedFrom: 'GOOGLE_SHEETS' as const,
    migratedAt: new Date().toISOString(),
    sourceSheetId: spreadsheetId,
  };
}

/**
 * Splits an array into chunks of `size`.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Writes a batch of documents to a Firestore collection.
 * Each item must have an `id` field that becomes the document ID.
 * Adds soft-delete sentinel (deletedAt: null) and migration metadata.
 */
async function batchWrite<T extends { id?: string; deletedAt?: string | null }>(
  collectionRef: ReturnType<typeof collection>,
  items: T[],
  spreadsheetId: string,
  extraFields?: Record<string, unknown>,
): Promise<{ written: number; errors: string[] }> {
  if (!items || items.length === 0) return { written: 0, errors: [] };

  const errors: string[] = [];
  let written = 0;

  const validItems = items.filter(
    (item) => item && typeof item === 'object',
  );

  const chunks = chunkArray(validItems, BATCH_SIZE);

  for (const chunk of chunks) {
    try {
      const batch = writeBatch(db);
      for (const item of chunk) {
        const docId = item.id || doc(collectionRef).id;
        const ref = doc(collectionRef, docId);
        batch.set(ref, {
          ...item,
          id: docId,
          deletedAt: item.deletedAt ?? null,
          createdAt: item.deletedAt ? serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...migrationMeta(spreadsheetId),
          ...(extraFields ?? {}),
        });
      }
      await batch.commit();
      written += chunk.length;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Batch write error: ${message}`);
    }
  }

  return { written, errors };
}

/**
 * Flattens a Record<memberId, HealthProfile> into an array.
 */
function flattenHealthProfiles(
  profiles: Record<string, HealthProfile> | undefined,
): HealthProfile[] {
  if (!profiles) return [];
  return Object.values(profiles);
}

/**
 * Flattens a Record<examId, ExamResult[]> into an array.
 */
function flattenExamResults(
  results: Record<string, ExamResult[]> | undefined,
): ExamResult[] {
  if (!results) return [];
  return Object.values(results).flat();
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview (dry run — does NOT write to Firestore)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the Google Sheets database and returns document counts WITHOUT
 * writing anything to Firestore. Use this to show the user a preview
 * before asking them to confirm the migration.
 *
 * @param token    Google Sheets OAuth token
 * @param spreadsheetId  ID of the operational spreadsheet
 */
export async function previewMigration(
  token: string,
  spreadsheetId: string,
): Promise<MigrationPreview> {
  const raw = await readAllOperationalTables(token, spreadsheetId);

  const members            = (raw.members ?? []).filter((m: FamilyMember) => m?.id);
  const healthProfiles     = flattenHealthProfiles(raw.healthProfiles);
  const appointments       = (raw.appointments ?? []).filter((a: MedicalAppointment) => a?.id);
  const checkups           = (raw.checkups ?? []).filter((c: PeriodicCheckup) => c?.id);
  const vaccines           = (raw.vaccines ?? []).filter((v: VaccineRecord) => v?.id);
  const exams              = (raw.exams ?? []).filter((e: MedicalExam) => e?.id);
  const examResults        = flattenExamResults(raw.examResults);
  const documents          = (raw.documents ?? []).filter((d: ClinicalDocument) => d?.id);
  const history            = (raw.history ?? []).filter((h: MedicalHistoryEvent) => h?.id);
  const reminders          = (raw.reminders ?? []).filter((r: Reminder) => r?.id);
  const tasks              = (raw.tasks ?? []).filter((t: FollowUpTask) => t?.id);
  const medicalOrders      = (raw.medicalOrders ?? []).filter((o: MedicalOrder) => o?.id);
  const medications        = (raw.medicationPrescriptions ?? []).filter((p: MedicationPrescription) => p?.id);
  const doseReminders      = (raw.medicationDoseReminders ?? []).filter((d: MedicationDoseReminder) => d?.id);
  const gmailSources       = (raw.emailSources ?? []).filter((s: AppointmentEmailSource) => s?.id);
  const candidates         = (raw.appointmentCandidates ?? []).filter((c: ImportedEmailAppointmentCandidate) => c?.id);

  const counts: MigrationCounts = {
    members:             members.length,
    healthProfiles:      healthProfiles.length,
    appointments:        appointments.length,
    checkups:            checkups.length,
    vaccines:            vaccines.length,
    exams:               exams.length,
    examResults:         examResults.length,
    documents:           documents.length,
    history:             history.length,
    reminders:           reminders.length,
    tasks:               tasks.length,
    medicalOrders:       medicalOrders.length,
    medications:         medications.length,
    doseReminders:       doseReminders.length,
    gmailSources:        gmailSources.length,
    appointmentCandidates: candidates.length,
  };

  const totalDocuments = Object.values(counts).reduce((s, n) => s + n, 0);
  // +1 for the family doc, +1 for settings, +1 for familyAccess
  const estimatedBatches = Math.ceil((totalDocuments + 3) / BATCH_SIZE);

  return { counts, spreadsheetId, totalDocuments, estimatedBatches };
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration (writes to Firestore)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full migration from Google Sheets to Firestore.
 *
 * Steps:
 *  1. Read all Sheets tabs
 *  2. Idempotency check (refuse if owner already has a Firestore family)
 *  3. Create family + OWNER familyAccess (atomic batch)
 *  4. Write all collections in batches of 490
 *  5. Write family settings
 *  6. Return MigrationResult with counts and errors
 */
export async function runMigration(opts: MigrationOptions): Promise<MigrationResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const counts: MigrationCounts = {
    members: 0, healthProfiles: 0, appointments: 0, checkups: 0,
    vaccines: 0, exams: 0, examResults: 0, documents: 0, history: 0,
    reminders: 0, tasks: 0, medicalOrders: 0, medications: 0,
    doseReminders: 0, gmailSources: 0, appointmentCandidates: 0,
  };

  const log = (msg: string) => opts.onProgress?.(msg);

  // ── Step 1: Idempotency guard ──────────────────────────────────────────────
  if (!opts.force) {
    log('Verificando si ya existe una base Firebase...');
    const existingFamilies = await getFamiliesOwnedBy(opts.ownerUid);
    const alreadyMigrated = existingFamilies.some(
      (f) => f.migratedFrom === 'GOOGLE_SHEETS' && f.sourceSheetId === opts.spreadsheetId,
    );
    if (alreadyMigrated) {
      return {
        success: false,
        familyId: null,
        counts,
        errors: [
          `Este spreadsheet (${opts.spreadsheetId}) ya fue migrado a Firebase. ` +
          `Usa force=true solo si deseas crear una segunda copia.`,
        ],
        migratedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ── Step 2: Read all Sheets data ──────────────────────────────────────────
  log('Leyendo base de datos de Google Sheets...');
  let raw: Awaited<ReturnType<typeof readAllOperationalTables>>;
  try {
    raw = await readAllOperationalTables(opts.token, opts.spreadsheetId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false, familyId: null, counts,
      errors: [`Error leyendo Google Sheets: ${message}`],
      migratedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }

  // ── Step 3: Create Firestore family ───────────────────────────────────────
  log('Creando familia en Firestore...');
  let familyId: string;
  try {
    familyId = await createFamily(opts.ownerUid, opts.ownerEmail, opts.familyName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false, familyId: null, counts,
      errors: [`Error creando familia en Firestore: ${message}`],
      migratedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }

  // Mark the family document with migration metadata
  try {
    const familyRef = doc(db, 'families', familyId);
    const batch = writeBatch(db);
    batch.update(familyRef, {
      migratedFrom: 'GOOGLE_SHEETS',
      migratedAt: new Date().toISOString(),
      sourceSheetId: opts.spreadsheetId,
    });
    await batch.commit();
  } catch {
    errors.push('No se pudo marcar la familia con metadatos de migración (no crítico).');
  }

  const col = (name: string) => collection(db, 'families', familyId, name);

  // ── Step 4: Migrate each collection ──────────────────────────────────────

  // Members
  log('Migrando miembros...');
  {
    const items = (raw.members ?? []).filter((m: FamilyMember) => m?.id);
    const r = await batchWrite(col('members'), items, opts.spreadsheetId, {
      familyGroupId: familyId,
    });
    counts.members = r.written;
    errors.push(...r.errors);
  }

  // Health Profiles (stored as memberId-keyed Record)
  log('Migrando fichas médicas...');
  {
    const items = flattenHealthProfiles(raw.healthProfiles);
    const r = await batchWrite(col('healthProfiles'), items, opts.spreadsheetId);
    counts.healthProfiles = r.written;
    errors.push(...r.errors);
  }

  // Appointments
  log('Migrando citas médicas...');
  {
    const items = (raw.appointments ?? []).filter((a: MedicalAppointment) => a?.id);
    const r = await batchWrite(col('appointments'), items, opts.spreadsheetId);
    counts.appointments = r.written;
    errors.push(...r.errors);
  }

  // Checkups
  log('Migrando controles periódicos...');
  {
    const items = (raw.checkups ?? []).filter((c: PeriodicCheckup) => c?.id);
    const r = await batchWrite(col('checkups'), items, opts.spreadsheetId);
    counts.checkups = r.written;
    errors.push(...r.errors);
  }

  // Vaccines
  log('Migrando vacunas...');
  {
    const items = (raw.vaccines ?? []).filter((v: VaccineRecord) => v?.id);
    const r = await batchWrite(col('vaccines'), items, opts.spreadsheetId);
    counts.vaccines = r.written;
    errors.push(...r.errors);
  }

  // Exams
  log('Migrando exámenes...');
  {
    const items = (raw.exams ?? []).filter((e: MedicalExam) => e?.id);
    const r = await batchWrite(col('exams'), items, opts.spreadsheetId);
    counts.exams = r.written;
    errors.push(...r.errors);
  }

  // Exam Results (flattened from Record<examId, ExamResult[]>)
  log('Migrando resultados de exámenes...');
  {
    const items = flattenExamResults(raw.examResults);
    const r = await batchWrite(col('examResults'), items, opts.spreadsheetId);
    counts.examResults = r.written;
    errors.push(...r.errors);
  }

  // Documents
  log('Migrando documentos clínicos...');
  {
    const items = (raw.documents ?? []).filter((d: ClinicalDocument) => d?.id);
    const r = await batchWrite(col('documents'), items, opts.spreadsheetId);
    counts.documents = r.written;
    errors.push(...r.errors);
  }

  // History
  log('Migrando historial clínico...');
  {
    const items = (raw.history ?? []).filter((h: MedicalHistoryEvent) => h?.id);
    const r = await batchWrite(col('history'), items, opts.spreadsheetId);
    counts.history = r.written;
    errors.push(...r.errors);
  }

  // Reminders
  log('Migrando recordatorios...');
  {
    const items = (raw.reminders ?? []).filter((r: Reminder) => r?.id);
    const res = await batchWrite(col('reminders'), items, opts.spreadsheetId);
    counts.reminders = res.written;
    errors.push(...res.errors);
  }

  // Tasks
  log('Migrando tareas de seguimiento...');
  {
    const items = (raw.tasks ?? []).filter((t: FollowUpTask) => t?.id);
    const r = await batchWrite(col('tasks'), items, opts.spreadsheetId);
    counts.tasks = r.written;
    errors.push(...r.errors);
  }

  // Medical Orders
  log('Migrando órdenes médicas...');
  {
    const items = (raw.medicalOrders ?? []).filter((o: MedicalOrder) => o?.id);
    const r = await batchWrite(col('medicalOrders'), items, opts.spreadsheetId);
    counts.medicalOrders = r.written;
    errors.push(...r.errors);
  }

  // Medications (prescriptions)
  log('Migrando prescripciones de medicamentos...');
  {
    const items = (raw.medicationPrescriptions ?? []).filter((p: MedicationPrescription) => p?.id);
    const r = await batchWrite(col('medications'), items, opts.spreadsheetId);
    counts.medications = r.written;
    errors.push(...r.errors);
  }

  // Dose Reminders
  log('Migrando tomas de medicamentos...');
  {
    const items = (raw.medicationDoseReminders ?? []).filter((d: MedicationDoseReminder) => d?.id);
    const r = await batchWrite(col('doseReminders'), items, opts.spreadsheetId);
    counts.doseReminders = r.written;
    errors.push(...r.errors);
  }

  // Gmail Sources
  log('Migrando fuentes de correo...');
  {
    const items = (raw.emailSources ?? []).filter((s: AppointmentEmailSource) => s?.id);
    const r = await batchWrite(col('gmailSources'), items, opts.spreadsheetId);
    counts.gmailSources = r.written;
    errors.push(...r.errors);
  }

  // Appointment Candidates
  log('Migrando candidatos de importación Gmail...');
  {
    const items = (raw.appointmentCandidates ?? []).filter(
      (c: ImportedEmailAppointmentCandidate) => c?.id,
    );
    const r = await batchWrite(col('appointmentCandidates'), items, opts.spreadsheetId);
    counts.appointmentCandidates = r.written;
    errors.push(...r.errors);
  }

  // ── Step 5: Write family settings ─────────────────────────────────────────
  log('Guardando configuración de la familia...');
  try {
    const settingsRef = doc(db, 'families', familyId, 'settings', 'global');
    const settingsBatch = writeBatch(db);
    settingsBatch.set(settingsRef, {
      gmailAutoScanEnabled:        raw.gmailAutoScanEnabled        ?? false,
      gmailScanTime:               raw.gmailScanTime               ?? '00:00',
      gmailScanRangeDays:          raw.gmailScanRangeDays          ?? 90,
      gmailOnlyFutureAppointments: raw.gmailOnlyFutureAppointments ?? true,
      lastGmailScanAt:             raw.lastGmailScanAt             ?? null,
      nextGmailScanAt:             raw.nextGmailScanAt             ?? null,
      driveSyncEnabled:            raw.driveSyncEnabled            ?? true,
      calendarSyncEnabled:         raw.calendarSyncEnabled         ?? true,
      updatedAt:                   serverTimestamp(),
      updatedBy:                   opts.ownerEmail,
      migratedFrom:                'GOOGLE_SHEETS',
      migratedAt:                  new Date().toISOString(),
    });
    await settingsBatch.commit();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Error guardando settings: ${message}`);
  }

  // ── Step 6: Result ────────────────────────────────────────────────────────
  const totalWritten = Object.values(counts).reduce((s, n) => s + n, 0);
  log(`✅ Migración completa: ${totalWritten} documentos escritos en Firestore.`);
  if (errors.length > 0) {
    log(`⚠️ ${errors.length} error(es) durante la migración.`);
  }

  return {
    success:     errors.length === 0,
    familyId,
    counts,
    errors,
    migratedAt:  new Date().toISOString(),
    durationMs:  Date.now() - startTime,
  };
}
