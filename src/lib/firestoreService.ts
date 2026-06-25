/**
 * Firestore Service — Paté Salud Familiar
 *
 * Complete CRUD + real-time listener layer for the Firestore backend.
 * All operations are isolated from AppContext.tsx and ready to be wired
 * up by the DataRepository abstraction layer in Phase 8.
 *
 * DATA MODEL PATHS
 * ─────────────────
 * users/{uid}
 * users/{uid}/familyAccess/{familyId}
 * families/{familyId}
 * families/{familyId}/settings/global          ← single document
 * families/{familyId}/members/{memberId}
 * families/{familyId}/healthProfiles/{memberId} ← memberId as doc ID
 * families/{familyId}/appointments/{id}
 * families/{familyId}/checkups/{id}
 * families/{familyId}/vaccines/{id}
 * families/{familyId}/exams/{id}
 * families/{familyId}/examResults/{id}         ← flat, query by examId
 * families/{familyId}/documents/{id}
 * families/{familyId}/history/{id}
 * families/{familyId}/reminders/{id}
 * families/{familyId}/tasks/{id}
 * families/{familyId}/medicalOrders/{id}
 * families/{familyId}/medications/{id}
 * families/{familyId}/doseReminders/{id}
 * families/{familyId}/gmailSources/{id}
 * families/{familyId}/appointmentCandidates/{id}
 * families/{familyId}/invitations/{id}
 *
 * SOFT-DELETE CONVENTION
 * ────────────────────────
 * Logical deletion: set deletedAt = serverTimestamp() + status = 'DELETED'.
 * All read helpers filter out documents where deletedAt is not null OR
 * status === 'DELETED'. New documents always include deletedAt: null so
 * the query `where('deletedAt', '==', null)` works correctly.
 *
 * TIMESTAMPS
 * ───────────
 * Firestore Timestamps are stored server-side and converted to ISO-8601
 * strings on read so the existing domain models continue to work unchanged.
 *
 * REAL-TIME LISTENERS
 * ────────────────────
 * Every `watchX` function returns an unsubscribe callback. The caller is
 * responsible for calling it when the component unmounts.
 *
 * Firebase SDK version: 12.x (modular tree-shakable API)
 */

import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
  FieldValue,
  QuerySnapshot,
  DocumentSnapshot,
  Unsubscribe,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore';

import { db } from './firebase';

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
  MemberPermissions,
} from '../domain/models';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Auxiliary types
// ─────────────────────────────────────────────────────────────────────────────

/** Roles a user can have inside a family. */
export type FamilyRole = 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER';

/** Access record stored at users/{uid}/familyAccess/{familyId}. */
export interface FamilyAccess {
  familyId: string;
  role: FamilyRole;
  memberId: string | null;       // own memberId for MEMBER role
  assignedMemberIds: string[];   // list of memberIds for CAREGIVER role
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  createdAt: string;             // ISO-8601
  acceptedAt: string | null;
}

/** Top-level family document at families/{familyId}. */
export interface FamilyDocument {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
  migratedFrom: 'GOOGLE_SHEETS' | null;
  migratedAt: string | null;
  sourceSheetId: string | null;
}

/** App-wide family settings stored at families/{familyId}/settings/global. */
export interface FamilySettings {
  gmailAutoScanEnabled: boolean;
  gmailScanTime: string;              // "HH:mm"
  gmailScanRangeDays: number;
  gmailOnlyFutureAppointments: boolean;
  lastGmailScanAt: string | null;
  nextGmailScanAt: string | null;
  driveSyncEnabled: boolean;
  calendarSyncEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Invitation stored at families/{familyId}/invitations/{id}. */
export interface FamilyInvitation {
  id: string;
  familyId: string;
  invitedEmail: string;            // normalized lowercase
  invitedMemberId: string;         // memberId the invited user maps to
  role: FamilyRole;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  token: string;                   // UUID for deep-link
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUid: string | null;
  createdBy: string;               // UID of OWNER
}

/** Input shape for creating a new invitation. */
export interface FamilyInvitationInput {
  invitedEmail: string;
  invitedMemberId: string;
  role: FamilyRole;
  token: string;
  expiresAt: string;
  createdBy: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Timestamp conversion helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts any Firestore Timestamp, Date, or string to an ISO-8601 string.
 * Returns null if the value is null / undefined.
 */
function tsToISO(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

/** Converts a Firestore document's timestamps to ISO strings. */
function normalizeTimestamps<T extends Record<string, unknown>>(data: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val instanceof Timestamp) {
      result[key] = val.toDate().toISOString();
    } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = normalizeTimestamps(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Soft-delete filtering helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a Firestore document should be treated as deleted.
 * Matches: deletedAt !== null  OR  status === 'DELETED'.
 */
function isDeleted(data: DocumentData): boolean {
  if (data.deletedAt !== null && data.deletedAt !== undefined) return true;
  if (data.status === 'DELETED') return true;
  return false;
}

/**
 * Converts a QuerySnapshot to a typed array, normalizing timestamps and
 * filtering out soft-deleted documents.
 */
function snapshotToArray<T>(snapshot: QuerySnapshot): T[] {
  return snapshot.docs
    .filter((d) => !isDeleted(d.data()))
    .map((d) => normalizeTimestamps({ id: d.id, ...d.data() }) as T);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Collection path helpers
// ─────────────────────────────────────────────────────────────────────────────

const col = {
  users:          () => collection(db, 'users'),
  familyAccess:   (uid: string) => collection(db, 'users', uid, 'familyAccess'),
  families:       () => collection(db, 'families'),
  members:        (fid: string) => collection(db, 'families', fid, 'members'),
  healthProfiles: (fid: string) => collection(db, 'families', fid, 'healthProfiles'),
  appointments:   (fid: string) => collection(db, 'families', fid, 'appointments'),
  checkups:       (fid: string) => collection(db, 'families', fid, 'checkups'),
  vaccines:       (fid: string) => collection(db, 'families', fid, 'vaccines'),
  exams:          (fid: string) => collection(db, 'families', fid, 'exams'),
  examResults:    (fid: string) => collection(db, 'families', fid, 'examResults'),
  documents:      (fid: string) => collection(db, 'families', fid, 'documents'),
  history:        (fid: string) => collection(db, 'families', fid, 'history'),
  reminders:      (fid: string) => collection(db, 'families', fid, 'reminders'),
  tasks:          (fid: string) => collection(db, 'families', fid, 'tasks'),
  medicalOrders:  (fid: string) => collection(db, 'families', fid, 'medicalOrders'),
  medications:    (fid: string) => collection(db, 'families', fid, 'medications'),
  doseReminders:  (fid: string) => collection(db, 'families', fid, 'doseReminders'),
  gmailSources:   (fid: string) => collection(db, 'families', fid, 'gmailSources'),
  candidates:     (fid: string) => collection(db, 'families', fid, 'appointmentCandidates'),
  invitations:    (fid: string) => collection(db, 'families', fid, 'invitations'),
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Users & Family Access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates or updates the user profile document at users/{uid}.
 * Safe to call on every login (upsert).
 */
export async function upsertUserProfile(
  uid: string,
  data: { email: string; displayName: string; photoUrl?: string | null },
): Promise<void> {
  const ref = doc(col.users(), uid);
  await setDoc(
    ref,
    {
      uid,
      email: data.email,
      displayName: data.displayName,
      photoUrl: data.photoUrl ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Returns all family access records for a user (both PENDING and ACTIVE).
 */
export async function getUserFamilyAccess(uid: string): Promise<FamilyAccess[]> {
  const snap = await getDocs(col.familyAccess(uid));
  return snap.docs.map((d) => normalizeTimestamps(d.data()) as FamilyAccess);
}

/**
 * Returns a single family access record, or null if it doesn't exist.
 */
export async function getFamilyAccess(
  uid: string,
  familyId: string,
): Promise<FamilyAccess | null> {
  const ref = doc(col.familyAccess(uid), familyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeTimestamps(snap.data()) as FamilyAccess;
}

/**
 * Creates or updates the family access record for a user.
 * Used when: OWNER creates the family, MEMBER accepts an invitation.
 */
export async function setFamilyAccess(
  uid: string,
  familyId: string,
  access: Omit<FamilyAccess, 'createdAt'> & { createdAt?: string },
): Promise<void> {
  const ref = doc(col.familyAccess(uid), familyId);
  await setDoc(
    ref,
    {
      ...access,
      familyId,
      createdAt: access.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Real-time listener for a user's family access records.
 * Fires immediately with current data, then on every change.
 *
 * @returns Unsubscribe function — call on component unmount.
 */
export function watchUserFamilyAccess(
  uid: string,
  callback: (access: FamilyAccess[]) => void,
): Unsubscribe {
  return onSnapshot(col.familyAccess(uid), (snap) => {
    const records = snap.docs.map(
      (d) => normalizeTimestamps(d.data()) as FamilyAccess,
    );
    callback(records);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Families
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new family document. Also creates the OWNER access record
 * for the creating user in a single atomic batch.
 *
 * @returns The new familyId.
 */
export async function createFamily(
  uid: string,
  ownerEmail: string,
  name: string,
): Promise<string> {
  const familyRef = doc(col.families());
  const familyId = familyRef.id;

  const batch = writeBatch(db);

  // Family document
  batch.set(familyRef, {
    id: familyId,
    ownerUid: uid,
    ownerEmail,
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    syncVersion: 1,
    migratedFrom: null,
    migratedAt: null,
    sourceSheetId: null,
  });

  // Family access for the OWNER
  const accessRef = doc(col.familyAccess(uid), familyId);
  batch.set(accessRef, {
    familyId,
    role: 'OWNER',
    memberId: null,
    assignedMemberIds: [],
    status: 'ACTIVE',
    createdAt: serverTimestamp(),
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return familyId;
}

/**
 * Returns a family document by ID, or null if it doesn't exist.
 */
export async function getFamily(familyId: string): Promise<FamilyDocument | null> {
  const snap = await getDoc(doc(col.families(), familyId));
  if (!snap.exists()) return null;
  return normalizeTimestamps({ id: snap.id, ...snap.data() }) as FamilyDocument;
}

/**
 * Returns all families where the given user is OWNER (rare query, for admin).
 */
export async function getFamiliesOwnedBy(ownerUid: string): Promise<FamilyDocument[]> {
  const q = query(col.families(), where('ownerUid', '==', ownerUid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeTimestamps({ id: d.id, ...d.data() }) as FamilyDocument);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Family Settings
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_DOC = 'global';

/**
 * Saves (merge) family-level settings.
 * Partial updates are safe — only the provided fields are written.
 */
export async function saveFamilySettings(
  familyId: string,
  settings: Partial<Omit<FamilySettings, 'updatedAt'>>,
  updatedBy: string,
): Promise<void> {
  const ref = doc(db, 'families', familyId, 'settings', SETTINGS_DOC);
  await setDoc(
    ref,
    { ...settings, updatedBy, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Returns the family settings document, or null if it hasn't been created yet.
 */
export async function getFamilySettings(
  familyId: string,
): Promise<FamilySettings | null> {
  const snap = await getDoc(doc(db, 'families', familyId, 'settings', SETTINGS_DOC));
  if (!snap.exists()) return null;
  return normalizeTimestamps(snap.data()) as FamilySettings;
}

/**
 * Real-time listener for family settings.
 */
export function watchFamilySettings(
  familyId: string,
  callback: (settings: FamilySettings | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'families', familyId, 'settings', SETTINGS_DOC),
    (snap) => {
      if (!snap.exists()) { callback(null); return; }
      callback(normalizeTimestamps(snap.data()) as FamilySettings);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Members
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new member. The caller provides the full member payload;
 * timestamps are set server-side.
 *
 * @returns The Firestore-assigned document ID.
 */
export async function createMember(
  familyId: string,
  data: Omit<FamilyMember, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.members(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    familyGroupId: familyId,
    deletedAt: null,
    status: data.status ?? 'ACTIVE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
    syncVersion: 1,
  });
  return ref.id;
}

/**
 * Updates specific fields of a member document.
 */
export async function updateMember(
  familyId: string,
  memberId: string,
  fields: Partial<FamilyMember>,
  updatedBy: string,
): Promise<void> {
  const ref = doc(col.members(familyId), memberId);
  await updateDoc(ref, {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/**
 * Logical deletion: sets deletedAt + status = 'DELETED'.
 * Does NOT call deleteDoc — the document remains in Firestore for audit.
 */
export async function deleteMember(
  familyId: string,
  memberId: string,
  deletedBy: string,
): Promise<void> {
  const ref = doc(col.members(familyId), memberId);
  await updateDoc(ref, {
    status: 'DELETED',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

/**
 * Returns all active members of a family (excludes soft-deleted).
 */
export async function getMembers(
  familyId: string,
  memberId?: string | null,
): Promise<FamilyMember[]> {
  if (memberId) {
    const snap = await getDoc(doc(col.members(familyId), memberId));
    if (snap.exists() && !isDeleted(snap.data())) {
      return [normalizeTimestamps({ id: snap.id, ...snap.data() }) as FamilyMember];
    }
    return [];
  }
  const snap = await getDocs(
    query(col.members(familyId), where('deletedAt', '==', null)),
  );
  return snapshotToArray<FamilyMember>(snap);
}

/**
 * Real-time listener for family members (excludes soft-deleted).
 */
export function watchMembers(
  familyId: string,
  callback: (members: FamilyMember[]) => void,
  memberId?: string | null,
): Unsubscribe {
  if (memberId) {
    return onSnapshot(doc(col.members(familyId), memberId), (snap) => {
      if (snap.exists() && !isDeleted(snap.data())) {
        callback([normalizeTimestamps({ id: snap.id, ...snap.data() }) as FamilyMember]);
      } else {
        callback([]);
      }
    });
  }
  const q = query(col.members(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<FamilyMember>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Health Profiles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves (upsert) a health profile. Uses memberId as document ID so there
 * is always exactly one profile per member.
 */
export async function saveHealthProfile(
  familyId: string,
  memberId: string,
  data: Omit<HealthProfile, 'id'>,
  updatedBy: string,
): Promise<void> {
  const ref = doc(col.healthProfiles(familyId), memberId);
  await setDoc(
    ref,
    {
      ...data,
      id: memberId,
      memberId,
      deletedAt: null,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
}

/**
 * Returns the health profile for a specific member, or null if not found.
 */
export async function getHealthProfile(
  familyId: string,
  memberId: string,
): Promise<HealthProfile | null> {
  const snap = await getDoc(doc(col.healthProfiles(familyId), memberId));
  if (!snap.exists() || isDeleted(snap.data())) return null;
  return normalizeTimestamps({ id: snap.id, ...snap.data() }) as HealthProfile;
}

/**
 * Returns all health profiles for the family as a Record<memberId, HealthProfile>.
 */
export async function getAllHealthProfiles(
  familyId: string,
  memberId?: string | null,
): Promise<Record<string, HealthProfile>> {
  if (memberId) {
    const snap = await getDoc(doc(col.healthProfiles(familyId), memberId));
    const result: Record<string, HealthProfile> = {};
    if (snap.exists() && !isDeleted(snap.data())) {
      const profile = normalizeTimestamps({ id: snap.id, ...snap.data() }) as HealthProfile;
      result[snap.id] = profile;
    }
    return result;
  }
  const snap = await getDocs(col.healthProfiles(familyId));
  const result: Record<string, HealthProfile> = {};
  snap.docs.forEach((d) => {
    if (!isDeleted(d.data())) {
      const profile = normalizeTimestamps({ id: d.id, ...d.data() }) as HealthProfile;
      result[d.id] = profile;
    }
  });
  return result;
}

/**
 * Real-time listener for all health profiles.
 * Callback receives a Record<memberId, HealthProfile>.
 */
export function watchHealthProfiles(
  familyId: string,
  callback: (profiles: Record<string, HealthProfile>) => void,
  memberId?: string | null,
): Unsubscribe {
  if (memberId) {
    return onSnapshot(doc(col.healthProfiles(familyId), memberId), (snap) => {
      const result: Record<string, HealthProfile> = {};
      if (snap.exists() && !isDeleted(snap.data())) {
        result[snap.id] = normalizeTimestamps({ id: snap.id, ...snap.data() }) as HealthProfile;
      }
      callback(result);
    });
  }
  return onSnapshot(col.healthProfiles(familyId), (snap) => {
    const result: Record<string, HealthProfile> = {};
    snap.docs.forEach((d) => {
      if (!isDeleted(d.data())) {
        result[d.id] = normalizeTimestamps({ id: d.id, ...d.data() }) as HealthProfile;
      }
    });
    callback(result);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: Appointments
// ─────────────────────────────────────────────────────────────────────────────

export async function createAppointment(
  familyId: string,
  data: Omit<MedicalAppointment, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.appointments(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    documentIds: data.documentIds ?? [],
    deletedAt: null,
    retentionStatus: data.retentionStatus ?? 'ACTIVE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
    syncVersion: 1,
  });
  return ref.id;
}

export async function updateAppointment(
  familyId: string,
  appointmentId: string,
  fields: Partial<MedicalAppointment>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.appointments(familyId), appointmentId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteAppointment(
  familyId: string,
  appointmentId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.appointments(familyId), appointmentId), {
    retentionStatus: 'PURGED',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getAppointments(
  familyId: string,
  memberId?: string | null,
): Promise<MedicalAppointment[]> {
  const q = memberId
    ? query(col.appointments(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.appointments(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<MedicalAppointment>(snap);
}

/**
 * Returns appointments for a specific member.
 */
export async function getAppointmentsForMember(
  familyId: string,
  memberId: string,
): Promise<MedicalAppointment[]> {
  const snap = await getDocs(
    query(
      col.appointments(familyId),
      where('memberId', '==', memberId),
      where('deletedAt', '==', null),
    ),
  );
  return snapshotToArray<MedicalAppointment>(snap);
}

export function watchAppointments(
  familyId: string,
  callback: (appts: MedicalAppointment[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.appointments(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.appointments(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<MedicalAppointment>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: Periodic Checkups
// ─────────────────────────────────────────────────────────────────────────────

export async function createCheckup(
  familyId: string,
  data: Omit<PeriodicCheckup, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.checkups(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateCheckup(
  familyId: string,
  checkupId: string,
  fields: Partial<PeriodicCheckup>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.checkups(familyId), checkupId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteCheckup(
  familyId: string,
  checkupId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.checkups(familyId), checkupId), {
    status: 'DELETED',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getCheckups(
  familyId: string,
  memberId?: string | null,
): Promise<PeriodicCheckup[]> {
  const q = memberId
    ? query(col.checkups(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.checkups(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<PeriodicCheckup>(snap);
}

export function watchCheckups(
  familyId: string,
  callback: (checkups: PeriodicCheckup[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.checkups(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.checkups(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<PeriodicCheckup>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: Vaccine Records
// ─────────────────────────────────────────────────────────────────────────────

export async function createVaccine(
  familyId: string,
  data: Omit<VaccineRecord, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.vaccines(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateVaccine(
  familyId: string,
  vaccineId: string,
  fields: Partial<VaccineRecord>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.vaccines(familyId), vaccineId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteVaccine(
  familyId: string,
  vaccineId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.vaccines(familyId), vaccineId), {
    status: 'DELETED',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getVaccines(
  familyId: string,
  memberId?: string | null,
): Promise<VaccineRecord[]> {
  const q = memberId
    ? query(col.vaccines(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.vaccines(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<VaccineRecord>(snap);
}

export function watchVaccines(
  familyId: string,
  callback: (vaccines: VaccineRecord[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.vaccines(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.vaccines(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<VaccineRecord>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: Medical Exams
// ─────────────────────────────────────────────────────────────────────────────

export async function createExam(
  familyId: string,
  data: Omit<MedicalExam, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.exams(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    documentIds: data.documentIds ?? [],
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateExam(
  familyId: string,
  examId: string,
  fields: Partial<MedicalExam>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.exams(familyId), examId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteExam(
  familyId: string,
  examId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.exams(familyId), examId), {
    status: 'DELETED',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getExams(
  familyId: string,
  memberId?: string | null,
): Promise<MedicalExam[]> {
  const q = memberId
    ? query(col.exams(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.exams(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<MedicalExam>(snap);
}

export function watchExams(
  familyId: string,
  callback: (exams: MedicalExam[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.exams(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.exams(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<MedicalExam>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14: Exam Results
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves a batch of exam results for a given exam. Replaces all existing
 * results for that exam (delete-then-write in a batch).
 */
export async function saveExamResults(
  familyId: string,
  examId: string,
  results: Omit<ExamResult, 'id'>[],
): Promise<void> {
  // Delete existing results for this exam
  const existing = await getDocs(
    query(col.examResults(familyId), where('examId', '==', examId)),
  );
  const batch = writeBatch(db);
  existing.docs.forEach((d) => batch.delete(d.ref));

  // Write new results
  results.forEach((result) => {
    const ref = doc(col.examResults(familyId));
    batch.set(ref, { ...result, id: ref.id, examId });
  });

  await batch.commit();
}

/**
 * Returns all exam results grouped as Record<examId, ExamResult[]>.
 * Matches the existing domain model shape.
 */
export async function getAllExamResults(
  familyId: string,
): Promise<Record<string, ExamResult[]>> {
  const snap = await getDocs(col.examResults(familyId));
  const result: Record<string, ExamResult[]> = {};
  snap.docs.forEach((d) => {
    const data = normalizeTimestamps({ id: d.id, ...d.data() }) as ExamResult;
    if (!result[data.examId]) result[data.examId] = [];
    result[data.examId].push(data);
  });
  return result;
}

/**
 * Returns exam results filtered by a list of examIds (chunked by 30).
 */
export async function getExamResultsForExams(
  familyId: string,
  examIds: string[],
): Promise<Record<string, ExamResult[]>> {
  if (examIds.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < examIds.length; i += 30) {
    chunks.push(examIds.slice(i, i + 30));
  }
  const result: Record<string, ExamResult[]> = {};
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(col.examResults(familyId), where('examId', 'in', chunk))),
    ),
  );
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const data = normalizeTimestamps({ id: d.id, ...d.data() }) as ExamResult;
      if (!result[data.examId]) result[data.examId] = [];
      result[data.examId].push(data);
    });
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15: Clinical Documents
// ─────────────────────────────────────────────────────────────────────────────

export async function createDocument(
  familyId: string,
  data: Omit<ClinicalDocument, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.documents(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateDocument(
  familyId: string,
  documentId: string,
  fields: Partial<ClinicalDocument>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.documents(familyId), documentId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteDocument(
  familyId: string,
  documentId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.documents(familyId), documentId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getDocuments(
  familyId: string,
  memberId?: string | null,
): Promise<ClinicalDocument[]> {
  const q = memberId
    ? query(col.documents(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.documents(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<ClinicalDocument>(snap);
}

export function watchDocuments(
  familyId: string,
  callback: (documents: ClinicalDocument[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.documents(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.documents(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<ClinicalDocument>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16: Medical History Events
// ─────────────────────────────────────────────────────────────────────────────

export async function createHistoryEvent(
  familyId: string,
  data: Omit<MedicalHistoryEvent, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.history(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function getHistory(
  familyId: string,
  memberId?: string | null,
): Promise<MedicalHistoryEvent[]> {
  const q = memberId
    ? query(col.history(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.history(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<MedicalHistoryEvent>(snap);
}

export function watchHistory(
  familyId: string,
  callback: (history: MedicalHistoryEvent[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.history(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.history(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<MedicalHistoryEvent>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17: Reminders
// ─────────────────────────────────────────────────────────────────────────────

export async function createReminder(
  familyId: string,
  data: Omit<Reminder, 'id'>,
): Promise<string> {
  const ref = doc(col.reminders(familyId));
  await setDoc(ref, { ...data, id: ref.id, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateReminder(
  familyId: string,
  reminderId: string,
  fields: Partial<Reminder>,
): Promise<void> {
  await updateDoc(doc(col.reminders(familyId), reminderId), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function getReminders(
  familyId: string,
  memberId?: string | null,
): Promise<Reminder[]> {
  const q = memberId
    ? query(col.reminders(familyId), where('memberId', '==', memberId))
    : col.reminders(familyId);
  const snap = await getDocs(q);
  return snapshotToArray<Reminder>(snap);
}

export function watchReminders(
  familyId: string,
  callback: (reminders: Reminder[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.reminders(familyId), where('memberId', '==', memberId))
    : col.reminders(familyId);
  return onSnapshot(q, (snap) => callback(snapshotToArray<Reminder>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 18: Follow-Up Tasks
// ─────────────────────────────────────────────────────────────────────────────

export async function createTask(
  familyId: string,
  data: Omit<FollowUpTask, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.tasks(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
  });
  return ref.id;
}

export async function updateTask(
  familyId: string,
  taskId: string,
  fields: Partial<FollowUpTask>,
): Promise<void> {
  await updateDoc(doc(col.tasks(familyId), taskId), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function getTasks(
  familyId: string,
  memberId?: string | null,
): Promise<FollowUpTask[]> {
  const q = memberId
    ? query(col.tasks(familyId), where('memberId', '==', memberId))
    : col.tasks(familyId);
  const snap = await getDocs(q);
  return snapshotToArray<FollowUpTask>(snap);
}

export function watchTasks(
  familyId: string,
  callback: (tasks: FollowUpTask[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.tasks(familyId), where('memberId', '==', memberId))
    : col.tasks(familyId);
  return onSnapshot(q, (snap) => callback(snapshotToArray<FollowUpTask>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 19: Medical Orders
// ─────────────────────────────────────────────────────────────────────────────

export async function createMedicalOrder(
  familyId: string,
  data: Omit<MedicalOrder, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.medicalOrders(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateMedicalOrder(
  familyId: string,
  orderId: string,
  fields: Partial<MedicalOrder>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.medicalOrders(familyId), orderId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteMedicalOrder(
  familyId: string,
  orderId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.medicalOrders(familyId), orderId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getMedicalOrders(
  familyId: string,
  memberId?: string | null,
): Promise<MedicalOrder[]> {
  const q = memberId
    ? query(col.medicalOrders(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.medicalOrders(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<MedicalOrder>(snap);
}

export function watchMedicalOrders(
  familyId: string,
  callback: (orders: MedicalOrder[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.medicalOrders(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.medicalOrders(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) => callback(snapshotToArray<MedicalOrder>(snap)));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 20: Medication Prescriptions
// ─────────────────────────────────────────────────────────────────────────────

export async function createMedication(
  familyId: string,
  data: Omit<MedicationPrescription, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.medications(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateMedication(
  familyId: string,
  prescriptionId: string,
  fields: Partial<MedicationPrescription>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.medications(familyId), prescriptionId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteMedication(
  familyId: string,
  prescriptionId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.medications(familyId), prescriptionId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getMedications(
  familyId: string,
  memberId?: string | null,
): Promise<MedicationPrescription[]> {
  const q = memberId
    ? query(col.medications(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.medications(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<MedicationPrescription>(snap);
}

export function watchMedications(
  familyId: string,
  callback: (prescriptions: MedicationPrescription[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.medications(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.medications(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) =>
    callback(snapshotToArray<MedicationPrescription>(snap)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 21: Medication Dose Reminders
// ─────────────────────────────────────────────────────────────────────────────

export async function createDoseReminder(
  familyId: string,
  data: Omit<MedicationDoseReminder, 'id'>,
  createdBy: string,
): Promise<string> {
  const ref = doc(col.doseReminders(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    updatedBy: createdBy,
  });
  return ref.id;
}

export async function updateDoseReminder(
  familyId: string,
  reminderId: string,
  fields: Partial<MedicationDoseReminder>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(col.doseReminders(familyId), reminderId), {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function deleteDoseReminder(
  familyId: string,
  reminderId: string,
  deletedBy: string,
): Promise<void> {
  await updateDoc(doc(col.doseReminders(familyId), reminderId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });
}

export async function getDoseReminders(
  familyId: string,
  memberId?: string | null,
): Promise<MedicationDoseReminder[]> {
  const q = memberId
    ? query(col.doseReminders(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.doseReminders(familyId), where('deletedAt', '==', null));
  const snap = await getDocs(q);
  return snapshotToArray<MedicationDoseReminder>(snap);
}

/**
 * Returns dose reminders for a specific prescription.
 */
export async function getDoseRemindersForPrescription(
  familyId: string,
  prescriptionId: string,
): Promise<MedicationDoseReminder[]> {
  const snap = await getDocs(
    query(
      col.doseReminders(familyId),
      where('prescriptionId', '==', prescriptionId),
      where('deletedAt', '==', null),
    ),
  );
  return snapshotToArray<MedicationDoseReminder>(snap);
}

export function watchDoseReminders(
  familyId: string,
  callback: (reminders: MedicationDoseReminder[]) => void,
  memberId?: string | null,
): Unsubscribe {
  const q = memberId
    ? query(col.doseReminders(familyId), where('memberId', '==', memberId), where('deletedAt', '==', null))
    : query(col.doseReminders(familyId), where('deletedAt', '==', null));
  return onSnapshot(q, (snap) =>
    callback(snapshotToArray<MedicationDoseReminder>(snap)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 22: Gmail Sources
// ─────────────────────────────────────────────────────────────────────────────

export async function createGmailSource(
  familyId: string,
  data: Omit<AppointmentEmailSource, 'id'>,
): Promise<string> {
  const ref = doc(col.gmailSources(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateGmailSource(
  familyId: string,
  sourceId: string,
  fields: Partial<AppointmentEmailSource>,
): Promise<void> {
  await updateDoc(doc(col.gmailSources(familyId), sourceId), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGmailSource(
  familyId: string,
  sourceId: string,
): Promise<void> {
  // Hard delete — email sources don't need audit trail
  await deleteDoc(doc(col.gmailSources(familyId), sourceId));
}

export async function getGmailSources(
  familyId: string,
): Promise<AppointmentEmailSource[]> {
  const snap = await getDocs(col.gmailSources(familyId));
  return snap.docs.map(
    (d) => normalizeTimestamps({ id: d.id, ...d.data() }) as AppointmentEmailSource,
  );
}

export function watchGmailSources(
  familyId: string,
  callback: (sources: AppointmentEmailSource[]) => void,
): Unsubscribe {
  return onSnapshot(col.gmailSources(familyId), (snap) => {
    callback(
      snap.docs.map(
        (d) => normalizeTimestamps({ id: d.id, ...d.data() }) as AppointmentEmailSource,
      ),
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 23: Appointment Candidates (Gmail Import)
// ─────────────────────────────────────────────────────────────────────────────

export async function createAppointmentCandidate(
  familyId: string,
  data: Omit<ImportedEmailAppointmentCandidate, 'id'>,
): Promise<string> {
  const ref = doc(col.candidates(familyId));
  await setDoc(ref, {
    ...data,
    id: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAppointmentCandidate(
  familyId: string,
  candidateId: string,
  fields: Partial<ImportedEmailAppointmentCandidate>,
): Promise<void> {
  await updateDoc(doc(col.candidates(familyId), candidateId), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Returns only PENDING_REVIEW candidates (the inbox for the import UI).
 */
export async function getPendingAppointmentCandidates(
  familyId: string,
): Promise<ImportedEmailAppointmentCandidate[]> {
  const snap = await getDocs(
    query(
      col.candidates(familyId),
      where('status', '==', 'PENDING_REVIEW'),
      orderBy('receivedAt', 'desc'),
    ),
  );
  return snap.docs.map(
    (d) =>
      normalizeTimestamps({ id: d.id, ...d.data() }) as ImportedEmailAppointmentCandidate,
  );
}

/**
 * Returns all candidates (all statuses) for the family.
 */
export async function getAllAppointmentCandidates(
  familyId: string,
): Promise<ImportedEmailAppointmentCandidate[]> {
  const snap = await getDocs(
    query(col.candidates(familyId), orderBy('receivedAt', 'desc')),
  );
  return snap.docs.map(
    (d) =>
      normalizeTimestamps({ id: d.id, ...d.data() }) as ImportedEmailAppointmentCandidate,
  );
}

export function watchAppointmentCandidates(
  familyId: string,
  callback: (candidates: ImportedEmailAppointmentCandidate[]) => void,
): Unsubscribe {
  const q = query(
    col.candidates(familyId),
    where('status', '==', 'PENDING_REVIEW'),
    orderBy('receivedAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map(
        (d) =>
          normalizeTimestamps({ id: d.id, ...d.data() }) as ImportedEmailAppointmentCandidate,
      ),
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 24: Family Invitations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new pending invitation.
 * The OWNER calls this from the member edit form.
 */
export async function createInvitation(
  familyId: string,
  input: FamilyInvitationInput,
): Promise<string> {
  const ref = doc(col.invitations(familyId));
  const invitationId = ref.id;

  await setDoc(ref, {
    id: invitationId,
    familyId,
    invitedEmail: input.invitedEmail.toLowerCase().trim(),
    invitedMemberId: input.invitedMemberId,
    role: input.role,
    status: 'PENDING',
    token: input.token,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    acceptedAt: null,
    acceptedByUid: null,
  });

  return invitationId;
}

/**
 * Accepts an invitation: marks it ACCEPTED and creates the family access
 * record for the invited user — all in a single atomic batch.
 */
export async function acceptInvitation(
  familyId: string,
  invitationId: string,
  acceptingUid: string,
  acceptingEmail: string,
): Promise<void> {
  const invRef = doc(col.invitations(familyId), invitationId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) throw new Error('Invitation not found.');

  const inv = invSnap.data() as FamilyInvitation;
  if (inv.status !== 'PENDING') {
    throw new Error(`Cannot accept invitation with status: ${inv.status}`);
  }
  if (inv.invitedEmail !== acceptingEmail.toLowerCase().trim()) {
    throw new Error('Email mismatch: this invitation was not sent to your account.');
  }

  const batch = writeBatch(db);

  // Update invitation
  batch.update(invRef, {
    status: 'ACCEPTED',
    acceptedAt: serverTimestamp(),
    acceptedByUid: acceptingUid,
  });

  // Create family access for the invited user
  const accessRef = doc(col.familyAccess(acceptingUid), familyId);
  batch.set(accessRef, {
    familyId,
    role: inv.role,
    memberId: inv.invitedMemberId,
    assignedMemberIds: [],
    status: 'ACTIVE',
    createdAt: serverTimestamp(),
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Update the associated member document's permissionStatus to ACTIVE
  if (inv.invitedMemberId) {
    const memberRef = doc(col.members(familyId), inv.invitedMemberId);
    batch.update(memberRef, {
      permissionStatus: 'ACTIVE',
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

/**
 * Revokes a PENDING invitation (OWNER only).
 */
export async function revokeInvitation(
  familyId: string,
  invitationId: string,
): Promise<void> {
  await updateDoc(doc(col.invitations(familyId), invitationId), {
    status: 'REVOKED',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Looks up all PENDING invitations sent to a specific email address.
 * Called when a new user logs in to check if they have pending invitations.
 */
export async function getInvitationsForEmail(
  email: string,
): Promise<FamilyInvitation[]> {
  const snap = await getDocs(
    query(
      collectionGroup(db, 'invitations'),
      where('invitedEmail', '==', email.toLowerCase().trim()),
      where('status', '==', 'PENDING'),
    ),
  );
  return snap.docs.map(
    (d) => normalizeTimestamps({ id: d.id, ...d.data() }) as FamilyInvitation,
  );
}

/**
 * Returns all invitations for a family (for the OWNER management UI).
 */
export async function getAllInvitations(familyId: string): Promise<FamilyInvitation[]> {
  const snap = await getDocs(col.invitations(familyId));
  return snap.docs.map(
    (d) => normalizeTimestamps({ id: d.id, ...d.data() }) as FamilyInvitation,
  );
}

export function watchInvitations(
  familyId: string,
  callback: (invitations: FamilyInvitation[]) => void,
): Unsubscribe {
  return onSnapshot(col.invitations(familyId), (snap) => {
    callback(
      snap.docs.map(
        (d) => normalizeTimestamps({ id: d.id, ...d.data() }) as FamilyInvitation,
      ),
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 25: Batch family data loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-shot loader: fetches ALL collections for a family in parallel.
 * Returns the data shaped the same way AppContext expects it.
 *
 * This is the function the DataRepository.loadInitialData() implementation
 * will call in Phase 8.
 */
export async function loadAllFamilyData(
  familyId: string,
  role?: FamilyRole | null,
  memberId?: string | null,
  permissions?: MemberPermissions | null,
): Promise<{
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
  medicalOrders: MedicalOrder[];
  medications: MedicationPrescription[];
  doseReminders: MedicationDoseReminder[];
  gmailSources: AppointmentEmailSource[];
  appointmentCandidates: ImportedEmailAppointmentCandidate[];
  settings: FamilySettings | null;
}> {
  const isRestrictedMember = role === 'MEMBER' && permissions?.canViewFamilyData !== true;
  const mId = isRestrictedMember ? memberId : null;

  if (isRestrictedMember) {
    // 1. Fetch exams first so we can extract their IDs for results chunking
    const exams = await getExams(familyId, mId);
    const examIds = exams.map((e) => e.id);

    // 2. Fetch other collections in parallel
    const [
      members,
      healthProfiles,
      appointments,
      checkups,
      vaccines,
      examResults,
      documents,
      history,
      reminders,
      tasks,
      medicalOrders,
      medications,
      doseReminders,
      settings,
    ] = await Promise.all([
      getMembers(familyId, mId),
      getAllHealthProfiles(familyId, mId),
      getAppointments(familyId, mId),
      getCheckups(familyId, mId),
      getVaccines(familyId, mId),
      getExamResultsForExams(familyId, examIds),
      getDocuments(familyId, mId),
      getHistory(familyId, mId),
      getReminders(familyId, mId),
      getTasks(familyId, mId),
      getMedicalOrders(familyId, mId),
      getMedications(familyId, mId),
      getDoseReminders(familyId, mId),
      getFamilySettings(familyId),
    ]);

    return {
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
      medications,
      doseReminders,
      gmailSources: [],
      appointmentCandidates: [],
      settings,
    };
  }

  // Normal flow (Owner / Caregiver / Viewer / Member with canViewFamilyData)
  const [
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
    medications,
    doseReminders,
    gmailSources,
    appointmentCandidates,
    settings,
  ] = await Promise.all([
    getMembers(familyId),
    getAllHealthProfiles(familyId),
    getAppointments(familyId),
    getCheckups(familyId),
    getVaccines(familyId),
    getExams(familyId),
    getAllExamResults(familyId),
    getDocuments(familyId),
    getHistory(familyId),
    getReminders(familyId),
    getTasks(familyId),
    getMedicalOrders(familyId),
    getMedications(familyId),
    getDoseReminders(familyId),
    getGmailSources(familyId),
    getAllAppointmentCandidates(familyId),
    getFamilySettings(familyId),
  ]);

  return {
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
    medications,
    doseReminders,
    gmailSources,
    appointmentCandidates,
    settings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 26: Composite real-time watcher
// ─────────────────────────────────────────────────────────────────────────────

export type FamilyDataUpdate =
  | { type: 'members';              data: FamilyMember[] }
  | { type: 'healthProfiles';       data: Record<string, HealthProfile> }
  | { type: 'appointments';         data: MedicalAppointment[] }
  | { type: 'checkups';             data: PeriodicCheckup[] }
  | { type: 'vaccines';             data: VaccineRecord[] }
  | { type: 'exams';                data: MedicalExam[] }
  | { type: 'documents';            data: ClinicalDocument[] }
  | { type: 'history';              data: MedicalHistoryEvent[] }
  | { type: 'reminders';            data: Reminder[] }
  | { type: 'tasks';                data: FollowUpTask[] }
  | { type: 'medicalOrders';        data: MedicalOrder[] }
  | { type: 'medications';          data: MedicationPrescription[] }
  | { type: 'doseReminders';        data: MedicationDoseReminder[] }
  | { type: 'gmailSources';         data: AppointmentEmailSource[] }
  | { type: 'appointmentCandidates';data: ImportedEmailAppointmentCandidate[] }
  | { type: 'settings';             data: FamilySettings | null };

/**
 * Subscribes to ALL family collections simultaneously using independent
 * onSnapshot listeners. Calls `callback` with a typed discriminated union
 * whenever any collection changes.
 *
 * Returns a single `unsubscribeAll` function that tears down every listener.
 *
 * Usage in DataRepository (Phase 8):
 *   const unsub = watchAllFamilyData(familyId, (update) => {
 *     if (update.type === 'members') setMembers(update.data);
 *     // …
 *   });
 *   return unsub; // call on unmount
 */
export function watchAllFamilyData(
  familyId: string,
  callback: (update: FamilyDataUpdate) => void,
  role?: FamilyRole | null,
  memberId?: string | null,
  permissions?: MemberPermissions | null,
): Unsubscribe {
  const isRestrictedMember = role === 'MEMBER' && permissions?.canViewFamilyData !== true;
  const mId = isRestrictedMember ? memberId : null;

  const unsubs: Unsubscribe[] = [
    watchMembers(familyId,              (data) => callback({ type: 'members', data }), mId),
    watchHealthProfiles(familyId,       (data) => callback({ type: 'healthProfiles', data }), mId),
    watchAppointments(familyId,         (data) => callback({ type: 'appointments', data }), mId),
    watchCheckups(familyId,             (data) => callback({ type: 'checkups', data }), mId),
    watchVaccines(familyId,             (data) => callback({ type: 'vaccines', data }), mId),
    watchExams(familyId,                (data) => callback({ type: 'exams', data }), mId),
    watchDocuments(familyId,            (data) => callback({ type: 'documents', data }), mId),
    watchHistory(familyId,              (data) => callback({ type: 'history', data }), mId),
    watchReminders(familyId,            (data) => callback({ type: 'reminders', data }), mId),
    watchTasks(familyId,                (data) => callback({ type: 'tasks', data }), mId),
    watchMedicalOrders(familyId,        (data) => callback({ type: 'medicalOrders', data }), mId),
    watchMedications(familyId,          (data) => callback({ type: 'medications', data }), mId),
    watchDoseReminders(familyId,        (data) => callback({ type: 'doseReminders', data }), mId),
    isRestrictedMember
      ? () => {}
      : watchGmailSources(familyId,     (data) => callback({ type: 'gmailSources', data })),
    isRestrictedMember
      ? () => {}
      : watchAppointmentCandidates(familyId,(data) => callback({ type: 'appointmentCandidates', data })),
    watchFamilySettings(familyId,       (data) => callback({ type: 'settings', data })),
  ];

  if (isRestrictedMember) {
    // Immediately emit empty lists for gmail sources and candidates to avoid loading states
    setTimeout(() => {
      callback({ type: 'gmailSources', data: [] });
      callback({ type: 'appointmentCandidates', data: [] });
    }, 0);
  }

  return () => unsubs.forEach((fn) => fn());
}
