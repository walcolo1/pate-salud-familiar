import { 
  UserAccount, 
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
  LastExportMetadata,
  SharedMemberReport,
  AppointmentEmailSource,
  ImportedEmailAppointmentCandidate,
  MedicalOrder,
  MedicationPrescription,
  MedicationDoseReminder
} from '../domain/models';
import {
  type OrigenDatos,
  origenDe,
  nombreExportacion,
  sobreExportacion,
} from '../lib/origenDatos';
import { leerExpediente, type ResultadoLectura } from '../lib/lecturaExpediente';
import type {
  MedicalHistoryEntry,
  Pet,
  VaccineEntry,
  WeightEntry,
} from '../domain/mascotas';

export interface SavedAppState {
  schemaVersion: number;
  /**
   * A6-F3 · Origen de los datos. Impide que un respaldo ficticio entre en un
   * expediente real y al reves. Ante la duda se trata como REAL.
   */
  origen: OrigenDatos;
  user: UserAccount | null;
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
  lastExportMetadata: LastExportMetadata | null;
  simulatedRole?: 'FAMILY_ADMIN' | 'MEMBER_SELF' | 'VIEWER' | null;
  simulatedEmail?: string | null;
  databaseSpreadsheetId?: string | null;
  databaseSpreadsheetUrl?: string | null;
  lastSyncAt?: string | null;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
  syncStatus?: 'disconnected' | 'connected' | 'syncing' | 'synced' | 'error' | null;
  syncError?: string | null;
  deviceId?: string | null;
  syncStrategy?: string | null;
  lastKnownRevision?: number | null;
  appDataFileId?: string | null;
  sharedReports?: SharedMemberReport[];
  emailSources?: AppointmentEmailSource[];
  appointmentCandidates?: ImportedEmailAppointmentCandidate[];
  // Gmail auto-scan configuration
  gmailAutoScanEnabled?: boolean;
  gmailScanTime?: string;           // HH:mm, default '00:00'
  lastGmailScanAt?: string | null;  // ISO timestamp of last auto-scan
  nextGmailScanAt?: string | null;  // ISO timestamp of next scheduled scan
  gmailScanRangeDays?: number;      // how many days back to search
  gmailOnlyFutureAppointments?: boolean; // filter out past appointments
  medicalOrders?: MedicalOrder[];
  medicationPrescriptions?: MedicationPrescription[];
  medicationDoseReminders?: MedicationDoseReminder[];
  /**
   * Bloque D · Mascotas.
   *
   * Se guardan como listas planas, igual que el resto del expediente, aunque
   * en Firestore sean subcolecciones: el mapeo lo hace el Bloque G. Guardarlas
   * anidadas aquí obligaría a reescribir el autoguardado, que trabaja sobre
   * listas, a cambio de nada.
   */
  pets?: Pet[];
  petWeights?: WeightEntry[];
  petVaccines?: VaccineEntry[];
  petHistory?: MedicalHistoryEntry[];
}

const ACTIVE_USER_KEY = 'pate_salud_active_user';
const DEFAULT_STORAGE_KEY = 'pate_salud_familiar_app_state_demo';
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Obtiene el usuario activo actual en la sesión (real o "demo").
 */
export function getActiveUser(): UserAccount | 'demo' | null {
  if (typeof window === 'undefined') return null;
  const val = window.localStorage.getItem(ACTIVE_USER_KEY);
  if (!val) return null;
  if (val === 'demo') return 'demo';
  try {
    return JSON.parse(val) as UserAccount;
  } catch (_) {
    return null;
  }
}

/**
 * Establece el usuario activo actual en la sesión (real o "demo").
 */
export function setActiveUser(user: UserAccount | 'demo' | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.localStorage.removeItem(ACTIVE_USER_KEY);
  } else if (user === 'demo') {
    window.localStorage.setItem(ACTIVE_USER_KEY, 'demo');
  } else {
    window.localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
  }
}

/**
 * Resuelve la clave de almacenamiento adecuada para el LocalStorage basándose en el usuario activo.
 */
export function getStorageKey(userEmailOrId?: string | null): string {
  if (userEmailOrId) {
    return `pate-salud-state:${userEmailOrId}`;
  }
  const activeUser = getActiveUser();
  if (!activeUser || activeUser === 'demo') {
    return DEFAULT_STORAGE_KEY;
  }
  return `pate-salud-state:${activeUser.googleId || activeUser.email}`;
}

/**
 * Guarda de forma segura el estado de la aplicación en el LocalStorage.
 * Maneja fallos si el almacenamiento está lleno o bloqueado.
 */
export function saveAppState(state: Omit<SavedAppState, 'schemaVersion' | 'origen'>, userEmailOrId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const fullState: SavedAppState = {
      ...state,
      origen: origenDe(state.user),
      schemaVersion: CURRENT_SCHEMA_VERSION
    };

    const key = getStorageKey(userEmailOrId);
    const serialized = JSON.stringify(fullState);
    window.localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    console.error('Error al escribir en LocalStorage:', error);
    return false;
  }
}

/**
 * Carga el estado de la aplicación desde el LocalStorage.
 * Valida la existencia, el versionamiento y maneja la corrupción de datos.
 */
export function loadAppStateDetallado(userEmailOrId?: string | null): ResultadoLectura {
  const key = getStorageKey(userEmailOrId);
  const resultado = leerExpediente(key);

  if (resultado.estado === 'OK') {
    const datos = resultado.datos as unknown as SavedAppState;
    if (datos.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      console.warn(
        `Discrepancia de version del esquema (leido ${datos.schemaVersion}, esperado ${CURRENT_SCHEMA_VERSION}). Se intentara cargar de todas formas.`,
      );
    }
  }

  return resultado;
}

/**
 * Carga el estado, o `null` si no hay nada guardado o no se pudo leer.
 *
 * C2 · Se conserva para las llamadas que solo quieren los datos. Quien
 * necesite distinguir «no hay expediente» de «no se pudo abrir» —y la interfaz
 * lo necesita— debe usar `loadAppStateDetallado`.
 */
export function loadAppState(userEmailOrId?: string | null): SavedAppState | null {
  const resultado = loadAppStateDetallado(userEmailOrId);
  return resultado.estado === 'OK' ? (resultado.datos as unknown as SavedAppState) : null;
}

/**
 * Remueve el estado de la aplicación del LocalStorage (Limpiar datos).
 */
export function clearAppState(userEmailOrId?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  
  const key = getStorageKey(userEmailOrId);
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Error al limpiar LocalStorage:', error);
    return false;
  }
}

/**
 * Exporta el estado clínico completo como un archivo JSON de respaldo.
 */
export function exportDataAsJSON(state: Omit<SavedAppState, 'schemaVersion' | 'origen'>): void {
  if (typeof window === 'undefined') return;

  try {
    const origen = origenDe(state.user);
    const fullState: SavedAppState = {
      ...state,
      origen,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };

    // A6-F3 · Un respaldo de demostracion debe ser inconfundible: prefijo en el
    // nombre y aviso como primera clave del JSON.
    const jsonString = JSON.stringify(sobreExportacion(origen, fullState), null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    link.download = nombreExportacion(origen, new Date());
    
    document.body.appendChild(link);
    link.click();
    
    // Limpieza
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al exportar archivo JSON:', error);
  }
}
