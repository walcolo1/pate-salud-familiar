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
  SharedMemberReport
} from '../domain/models';

export interface SavedAppState {
  schemaVersion: number;
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
}

const STORAGE_KEY = 'pate_salud_familiar_app_state';
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Guarda de forma segura el estado de la aplicación en el LocalStorage.
 * Maneja fallos si el almacenamiento está lleno o bloqueado.
 */
export function saveAppState(state: Omit<SavedAppState, 'schemaVersion'>): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const fullState: SavedAppState = {
      ...state,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };
    
    const serialized = JSON.stringify(fullState);
    window.localStorage.setItem(STORAGE_KEY, serialized);
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
export function loadAppState(): SavedAppState | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    
    const parsed = JSON.parse(serialized) as SavedAppState;
    
    // Validación de integridad y migración
    if (!parsed || typeof parsed !== 'object') {
      console.warn('El estado guardado no es un objeto válido. Descartando...');
      return null;
    }
    
    if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      console.warn(`Discrepancia de versión del esquema (Leído: ${parsed.schemaVersion}, Esperado: ${CURRENT_SCHEMA_VERSION}). Ejecutando migraciones...`);
      // Aquí se podrían agregar migraciones si cambiara el esquema en el futuro.
    }
    
    // Validamos que contenga las propiedades mínimas para evitar errores de ejecución
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.appointments)) {
      console.error('Faltan propiedades críticas en el estado guardado. Datos corruptos.');
      return null;
    }
    
    return parsed;
  } catch (error) {
    console.error('Error al leer de LocalStorage o datos corruptos:', error);
    // Para mitigar datos corruptos, si falla la lectura se devuelve null y se limpia la clave
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    return null;
  }
}

/**
 * Remueve el estado de la aplicación del LocalStorage (Limpiar datos).
 */
export function clearAppState(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Error al limpiar LocalStorage:', error);
    return false;
  }
}

/**
 * Exporta el estado clínico completo como un archivo JSON de respaldo.
 */
export function exportDataAsJSON(state: Omit<SavedAppState, 'schemaVersion'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const fullState: SavedAppState = {
      ...state,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };
    
    const jsonString = JSON.stringify(fullState, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `pate_salud_expediente_familiar_${dateStr}.json`;
    
    document.body.appendChild(link);
    link.click();
    
    // Limpieza
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error al exportar archivo JSON:', error);
  }
}
