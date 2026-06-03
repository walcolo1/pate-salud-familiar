export type Relationship = 'SELF' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'GRANDPARENT' | 'OTHER';

export type BloodType = 'A_POSITIVE' | 'A_NEGATIVE' | 'B_POSITIVE' | 'B_NEGATIVE' | 'AB_POSITIVE' | 'AB_NEGATIVE' | 'O_POSITIVE' | 'O_NEGATIVE' | 'UNKNOWN';

export type HealthEventStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE' | 'IN_FOLLOW_UP';

export type DocumentType = 'PDF' | 'IMAGE' | 'LAB_RESULT' | 'PRESCRIPTION' | 'CERTIFICATE' | 'MEDICAL_ORDER' | 'OTHER';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_DONE' | 'OVERDUE';

export type ReminderStatus = 'PENDING' | 'DONE' | 'OVERDUE' | 'SNOOZED';

export type ReminderType = 'APPOINTMENT' | 'VACCINE' | 'EXAM' | 'MEDICATION' | 'CHECKUP' | 'OTHER';

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export type HistoryEventType = 'APPOINTMENT' | 'CHECKUP' | 'VACCINE' | 'EXAM' | 'DOCUMENT' | 'REMINDER' | 'OTHER';

export interface UserAccount {
  id: string;
  googleId?: string | null;
  displayName: string;
  email: string;
  photoUrl?: string | null;
  createdAt: string;
  provider?: 'google' | 'mock';
  loggedAt?: string;
}

export interface FamilyGroup {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
}

export interface MemberPermissions {
  canManageOwnProfile: boolean;
  canManageOwnAppointments: boolean;
  canManageOwnDocuments: boolean;
  canViewOwnHistory: boolean;
  canUploadDocuments: boolean;
  canExportOwnData: boolean;
  canViewFamilyData: boolean;
  canManageFamilyData: boolean;
}

export interface FamilyMember {
  id: string;
  familyGroupId: string;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  relationship: Relationship;
  bloodType?: BloodType | null;
  photoUrl?: string | null;
  notes?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  email?: string | null;
  canAccessPortal?: boolean;
  permissionStatus?: 'NONE' | 'INVITED' | 'ACTIVE' | 'REVOKED' | null;
  permissions?: MemberPermissions | null;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
}

export interface HealthProfile {
  id: string;
  memberId: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  primaryDoctor?: string | null;
  insuranceInfo?: string | null;
  emergencyContact?: string | null;
  lastUpdated: string;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
}

export interface VaccineRecord {
  id: string;
  memberId: string;
  vaccineName: string;
  dateApplied: string;
  nextDoseDate?: string | null;
  batchNumber?: string | null;
  institution?: string | null;
  doseNumber: number;
  notes?: string | null;
  status: HealthEventStatus;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
}

export interface MedicalAppointment {
  id: string;
  memberId: string;
  doctorName: string;
  specialty: string;
  scheduledAt: string; // YYYY-MM-DDTHH:mm
  location?: string | null;
  reason: string;
  notes?: string | null;
  status: HealthEventStatus;
  documentIds: string[];
  googleCalendarEventId?: string | null;
  googleCalendarHtmlLink?: string | null;
  calendarSyncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  calendarSyncedAt?: string | null;
  calendarError?: string | null;
  reminderPolicy?: string | null;
  completedAt?: string | null;
  retentionStatus?: 'ACTIVE' | 'ELIGIBLE_FOR_PURGE' | 'PURGED' | null;
  retentionReason?: string | null;
  purgedAt?: string | null;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  lastSyncedAt?: string | null;
}

export interface PeriodicCheckup {
  id: string;
  memberId: string;
  checkupType: string;
  scheduledDate: string; // YYYY-MM-DD
  completedDate?: string | null;
  results?: string | null;
  status: HealthEventStatus;
  nextCheckupDate?: string | null;
  doctorName?: string | null;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
}

export interface MedicalExam {
  id: string;
  memberId: string;
  examName: string;
  orderedBy?: string | null;
  orderedDate: string;
  performedDate?: string | null;
  laboratory?: string | null;
  status: HealthEventStatus;
  resultSummary?: string | null;
  documentIds: string[];
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
}

export interface ExamResult {
  id: string;
  examId: string;
  parameterName: string;
  value: string;
  unit?: string | null;
  referenceRange?: string | null;
  isAbnormal: boolean;
  recordedAt: string;
}

export interface ClinicalDocument {
  id: string;
  memberId: string;
  relatedEventId?: string | null;
  documentType: DocumentType;
  fileName: string;
  localPath?: string | null;
  driveFileId?: string | null;
  driveUrl?: string | null;
  uploadedAt: string;
  syncStatus: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR';
  description?: string | null;
  fileSize?: number;
  mimeType?: string;
  clinicalCategory?: string;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  lastSyncedAt?: string | null;
  sharedWithEmail?: string | null;
  permissionId?: string | null;
  sharedAt?: string | null;
  revokedAt?: string | null;
  shareStatus?: 'NOT_SHARED' | 'SHARED' | 'REVOKED' | 'ERROR' | null;
  shareError?: string | null;
}

export interface MedicalHistoryEvent {
  id: string;
  memberId: string;
  eventType: HistoryEventType;
  title: string;
  description?: string | null;
  eventDate: string;
  relatedEntityId?: string | null;
  createdAt: string;
  ownerEmail?: string | null;
  ownerGoogleId?: string | null;
  sourceDeviceId?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
  syncStatus?: 'LOCAL_ONLY' | 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR' | null;
  lastSyncedAt?: string | null;
}

export interface Reminder {
  id: string;
  memberId: string;
  title: string;
  description?: string | null;
  dueDate: string;
  reminderType: ReminderType;
  status: ReminderStatus;
  relatedEventId?: string | null;
}

export interface FollowUpTask {
  id: string;
  memberId: string;
  title: string;
  description?: string | null;
  createdAt: string;
  dueDate?: string | null;
  status: TaskStatus;
  priority: Priority;
}

export interface LastExportMetadata {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  exportedAt: string | null;
  exportedBy: string | null;
  sheetsSyncStatus: 'NOT_EXPORTED' | 'EXPORTED' | 'ERROR' | null;
  sheetsError?: string | null;
}

export interface SharedMemberReport {
  id: string;
  memberId: string;
  memberName: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sharedWithEmail: string;
  sharedAt: string;
  revokedAt?: string | null;
  permissionId?: string | null;
  shareStatus: 'SHARED' | 'REVOKED' | 'ERROR';
  shareError?: string | null;
}

