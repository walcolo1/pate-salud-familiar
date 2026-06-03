'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  SharedMemberReport
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
import { loadAppState, saveAppState, clearAppState, exportDataAsJSON, getActiveUser, setActiveUser } from '../data/persistence';
import { requestDrivePermission, resolveDrivePath, uploadFile, shareFileWithUser, revokeFileShare } from '../lib/googleDrive';
import { requestCalendarPermission, createCalendarEvent } from '../lib/googleCalendar';
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
  createIndividualMemberReport
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
} from '../lib/googleTokenManager';


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
  
  signIn: (googleUser?: Omit<UserAccount, 'id' | 'createdAt'>) => Promise<void>;
  signOut: () => Promise<void>;
  addMember: (member: Omit<FamilyMember, 'id' | 'familyGroupId'>) => void;
  updateMember: (id: string, member: Partial<FamilyMember>) => void;
  deleteMember: (id: string) => boolean;
  saveHealthProfile: (memberId: string, profile: Partial<HealthProfile>) => void;
  addAppointment: (appt: Omit<MedicalAppointment, 'id' | 'documentIds'>) => void;
  updateAppointmentStatus: (id: string, status: HealthEventStatus) => void;
  addCheckup: (chk: Omit<PeriodicCheckup, 'id'>) => void;
  addVaccine: (vac: Omit<VaccineRecord, 'id'>) => void;
  addExam: (exam: Omit<MedicalExam, 'id' | 'documentIds'>, results: Omit<ExamResult, 'id' | 'examId' | 'recordedAt'>[]) => void;
  uploadDocument: (memberId: string, doc: { fileName: string; fileType: string; description?: string }, file?: File) => Promise<void>;
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
  syncAppointmentToCalendar: (apptId: string, customAppt?: MedicalAppointment) => Promise<void>;

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
  exportBackupJSON: () => void;

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

  // Secure Google-Native Sharing Phase 3B
  sharedReports: SharedMemberReport[];
  shareDocumentWithMember: (documentId: string, email: string) => Promise<void>;
  revokeDocumentShare: (documentId: string) => Promise<void>;
  generateAndShareMemberReport: (memberId: string, email: string) => Promise<void>;
  revokeMemberReportShare: (reportId: string) => Promise<void>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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


  // 1. Carga inicial controlada del LocalStorage (únicamente del lado del cliente)
  useEffect(() => {
    try {
      const activeUser = getActiveUser();
      
      if (activeUser) {
        const userEmailOrId = activeUser === 'demo' ? 'demo' : (activeUser.googleId || activeUser.email);
        const savedState = loadAppState(userEmailOrId);
        
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
          setSharedReports(savedState.sharedReports || []);
          setDriveSyncEnabled(savedState.driveSyncEnabled !== undefined ? savedState.driveSyncEnabled : true);
          setCalendarSyncEnabled(savedState.calendarSyncEnabled !== undefined ? savedState.calendarSyncEnabled : true);
          setLastExportMetadata(savedState.lastExportMetadata !== undefined ? savedState.lastExportMetadata : null);
          setSimulatedRole(savedState.simulatedRole !== undefined ? savedState.simulatedRole : null);
          setSimulatedEmail(savedState.simulatedEmail !== undefined ? savedState.simulatedEmail : null);

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
        
        let devId = typeof window !== 'undefined' ? window.localStorage.getItem('pate_salud_device_id') : null;
        if (!devId) {
          devId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('pate_salud_device_id', devId);
          }
        }
        setDeviceId(devId);

      }

      // Registro del Service Worker para soporte PWA y Offline
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .then((reg) => console.log('Service Worker registrado con éxito. Scope:', reg.scope))
            .catch((err) => console.error('Error al registrar el Service Worker:', err));
        });
      }
    } catch (e) {
      console.error('Error al cargar la persistencia local:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Reactividad de Autoguardado: Sincroniza cualquier cambio en caliente al LocalStorage
  useEffect(() => {
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
      sharedReports
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
    isLoading
  ]);

  // Ejecutar limpieza de retención de citas al iniciar la app
  useEffect(() => {
    if (!isLoading) {
      runAppointmentRetentionCleanup();
    }
  }, [isLoading]);

  const signIn = async (googleUser?: Omit<UserAccount, 'id' | 'createdAt'>) => {
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
      
      // Establecer usuario activo en LocalStorage
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
        setSharedReports(savedState.sharedReports || []);
        setDriveSyncEnabled(savedState.driveSyncEnabled !== undefined ? savedState.driveSyncEnabled : true);
        setCalendarSyncEnabled(savedState.calendarSyncEnabled !== undefined ? savedState.calendarSyncEnabled : true);
        setLastExportMetadata(savedState.lastExportMetadata || null);
        setSimulatedRole(savedState.simulatedRole || null);
        setSimulatedEmail(savedState.simulatedEmail || null);
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
        setSharedReports(savedState.sharedReports || []);
        setDriveSyncEnabled(savedState.driveSyncEnabled !== undefined ? savedState.driveSyncEnabled : true);
        setCalendarSyncEnabled(savedState.calendarSyncEnabled !== undefined ? savedState.calendarSyncEnabled : true);
        setLastExportMetadata(savedState.lastExportMetadata !== undefined ? savedState.lastExportMetadata : null);
        setSimulatedRole(savedState.simulatedRole !== undefined ? savedState.simulatedRole : null);
        setSimulatedEmail(savedState.simulatedEmail !== undefined ? savedState.simulatedEmail : null);
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
      }
    }
    
    setIsLoading(false);
  };

  const signOut = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Cancelar timer de auto-sync pendiente
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    // Limpiar tokens en memoria (seguridad)
    invalidateAllTokens();
    setActiveUser(null);
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

  // ── FUNCIONES DE AUTO-SYNC ────────────────────────────────────────────────

  /**
   * scheduleAutoSync — Programa sincronización automática con debounce de 4s.
   * Cancela el timer anterior si existía. No sincroniza si: no hay base de datos,
   * el auto-sync está deshabilitado, o ya hay una sync en progreso.
   * Si no hay token disponible, marca como pending_sync en lugar de fallar.
   */
  const scheduleAutoSync = (reason: string) => {
    if (!autoSyncEnabled) return;
    if (typeof window === 'undefined') return;

    // Cancelar timer anterior
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      autoSyncTimerRef.current = null;

      if (isSyncInProgress.current) return;

      const token = getOperationalTokenIfValid();
      if (!token) {
        // Sin token disponible: marcar como pendiente
        setPendingSyncCount(prev => prev + 1);
        setSyncInitStatus('pending_sync');
        setSyncInitMessage('Cambios pendientes de sincronizar. Conecta con Google para enviarlos.');
        setNeedsGoogleAuth(true);
        return;
      }

      // Con token: sincronizar automáticamente
      isSyncInProgress.current = true;
      try {
        await syncNow();
        setPendingSyncCount(0);
        setNeedsGoogleAuth(false);
      } catch (_) {
        // Error silencioso en auto-sync — no interrumpir UX
        setPendingSyncCount(prev => prev + 1);
      } finally {
        isSyncInProgress.current = false;
      }
    }, 4000);
  };

  /**
   * flushPendingSync — Sincroniza inmediatamente si hay cambios pendientes y token válido.
   */
  const flushPendingSync = async (): Promise<void> => {
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
      await ensureOperationalToken(clientId, false);
      setNeedsGoogleAuth(false);
      setSyncInitStatus('checking');
      setSyncInitMessage('Conectado. Sincronizando datos pendientes...');
      await flushPendingSync();
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

  const addMember = (member: Omit<FamilyMember, 'id' | 'familyGroupId'>) => {
    const newId = `member-${Date.now()}`;
    const newMember: FamilyMember = {
      ...member,
      id: newId,
      familyGroupId: 'family-001',
      status: 'ACTIVE'
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
  };

  const updateMember = (id: string, updatedFields: Partial<FamilyMember>) => {
    setMembers((prev) => prev.map((m) => {
      if (m.id === id) {
        const permissionsChanged = JSON.stringify(m.permissions) !== JSON.stringify(updatedFields.permissions) || 
          m.email !== updatedFields.email || 
          m.canAccessPortal !== updatedFields.canAccessPortal || 
          m.permissionStatus !== updatedFields.permissionStatus;

        if (permissionsChanged) {
          const newEvent: MedicalHistoryEvent = {
            id: `hist-${Date.now()}`,
            memberId: id,
            eventType: 'OTHER',
            title: 'Permisos actualizados',
            description: `Se actualizaron los permisos de acceso al portal y configuración de correo para ${m.fullName}.`,
            eventDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent, ...h]), 50);
        } else {
          const newEvent: MedicalHistoryEvent = {
            id: `hist-${Date.now()}`,
            memberId: id,
            eventType: 'OTHER',
            title: 'Perfil familiar editado',
            description: `Se editó y actualizó la información de perfil para ${m.fullName}.`,
            eventDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent, ...h]), 50);
        }
        return { ...m, ...updatedFields };
      }
      return m;
    }));
    setTimeout(() => scheduleAutoSync('member_updated'), 100);
  };

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

    setMembers((prev) => prev.filter((m) => m.id !== id));
    
    const adminMember = members.find(m => m.relationship === 'SELF') || members[0];
    if (adminMember) {
      const newEvent: MedicalHistoryEvent = {
        id: `hist-${Date.now()}`,
        memberId: adminMember.id,
        eventType: 'OTHER',
        title: 'Miembro familiar eliminado',
        description: `Se eliminó permanentemente a ${memberName} (sin historial clínico asociado).`,
        eventDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      setHistory(prev => [newEvent, ...prev]);
    }
    setTimeout(() => scheduleAutoSync('member_deleted'), 100);
    return true; 
  };

  const inactivateMember = (memberId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'INACTIVE' } : m));
    
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
  };

  const reactivateMember = (memberId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'ACTIVE' } : m));
    
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
  };

  const runAppointmentRetentionCleanup = () => {
    const now = new Date();
    let updatedCount = 0;
    
    setAppointments(prev => prev.map(appt => {
      if (appt.retentionStatus === 'PURGED') return appt;
      
      const scheduledDate = new Date(appt.scheduledAt);
      
      if (appt.status === 'COMPLETED') {
        const completedDate = appt.completedAt ? new Date(appt.completedAt) : scheduledDate;
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
    setHealthProfiles((prev) => {
      const current = prev[memberId] || {
        id: `hp-${Date.now()}`,
        memberId,
        allergies: [],
        chronicConditions: [],
        currentMedications: [],
        lastUpdated: ''
      };
      return {
        ...prev,
        [memberId]: {
          ...current,
          ...profileFields,
          lastUpdated: new Date().toISOString()
        }
      };
    });
    setTimeout(() => scheduleAutoSync('health_profile_saved'), 100);
  };

  const addAppointment = (appt: Omit<MedicalAppointment, 'id' | 'documentIds'>) => {
    const newId = `appt-${Date.now()}`;
    const newAppt: MedicalAppointment = {
      ...appt,
      id: newId,
      documentIds: [],
      calendarSyncStatus: calendarSyncEnabled ? 'PENDING_SYNC' : 'LOCAL_ONLY'
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
  };

  const updateAppointmentStatus = (id: string, status: HealthEventStatus) => {
    setAppointments((prev) => prev.map((a) => {
      if (a.id === id) {
        const completedAt = status === 'COMPLETED' ? new Date().toISOString() : a.completedAt;
        
        if (status === 'COMPLETED' && a.status !== 'COMPLETED') {
          const newEvent: MedicalHistoryEvent = {
            id: `hist-${Date.now()}`,
            memberId: a.memberId,
            eventType: 'APPOINTMENT',
            title: 'Cita médica realizada',
            description: `La cita con ${a.doctorName} (${a.specialty}) ha sido marcada como completada.`,
            eventDate: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setTimeout(() => setHistory(h => [newEvent, ...h]), 50);
        }

        return { ...a, status, completedAt };
      }
      return a;
    }));
    
    if (status === 'COMPLETED') {
      setReminders((prev) => prev.map((r) => r.relatedEventId === id ? { ...r, status: 'DONE' } : r));
    }
    setTimeout(() => scheduleAutoSync('appointment_status_updated'), 100);
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
  };

  const addVaccine = (vac: Omit<VaccineRecord, 'id'>) => {
    const newId = `vac-${Date.now()}`;
    const newVac: VaccineRecord = {
      ...vac,
      id: newId
    };
    setVaccines((prev) => [...prev, newVac]);

    if (vac.status === 'SCHEDULED') {
      const newReminder: Reminder = {
        id: `rem-${Date.now()}`,
        memberId: vac.memberId,
        title: `Vacuna: ${vac.vaccineName} (Dosis ${vac.doseNumber})`,
        description: `Aplicación en ${vac.institution || 'Centro de Salud'}`,
        dueDate: new Date(vac.dateApplied).toISOString(),
        reminderType: 'VACCINE',
        status: 'PENDING',
        relatedEventId: newId
      };
      setReminders((prev) => [...prev, newReminder]);
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
  };

  const connectDrive = async (): Promise<string | null> => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
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
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setCalendarStatus('error');
      setCalendarError('NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.');
      return null;
    }

    setCalendarStatus('authorizing');
    setCalendarError(null);
    try {
      // Usar TokenManager: intenta caché en memoria primero, luego popup
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

  const syncAppointmentToCalendar = async (apptId: string, customAppt?: MedicalAppointment) => {
    const appt = customAppt || appointments.find((a) => a.id === apptId);
    if (!appt) return;

    const member = members.find((m) => m.id === appt.memberId);
    const memberName = member ? member.fullName : 'Familiar';

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === apptId
            ? {
                ...a,
                calendarSyncStatus: 'SYNC_ERROR',
                calendarError: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID no configurada.'
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
    const clientId2 = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    let token = calendarAccessToken;
    if (!token && clientId2) {
      try {
        token = await ensureCalendarToken(clientId2, false);
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
  };

  const uploadDocument = async (
    memberId: string, 
    doc: { fileName: string; fileType: string; description?: string },
    file?: File
  ) => {
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
          return;
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
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setTimeout(() => scheduleAutoSync('document_deleted'), 100);
  };

  const completeTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'DONE' } : t)));
    setTimeout(() => scheduleAutoSync('task_completed'), 100);
  };

  const toggleReminder = (id: string) => {
    setReminders((prev) => 
      prev.map((r) => 
        r.id === id ? { ...r, status: r.status === 'DONE' ? 'PENDING' : 'DONE' } : r
      )
    );
    setTimeout(() => scheduleAutoSync('reminder_toggled'), 100);
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
    setReminders([]);
    setTasks([]);
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
      appDataFileId: null
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
      sharedReports
    });
  };


  // ── AUTO-SYNC AL LOGIN (intento silencioso) ───────────────────────────────

  /**
   * autoSyncOnLogin — Busca automáticamente en Google appDataFolder si existe
   * una base operacional. Usa prompt:'' para intentar token SILENCIOSO sin popup.
   * Si Google requiere consentimiento, setea needs_auth y muestra banner.
   * NO bloquea el UX — el usuario puede usar la app mientras esto corre.
   */
  const autoSyncOnLogin = async (loggedUser: UserAccount): Promise<void> => {
    if (!loggedUser || loggedUser.provider !== 'google') return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    setSyncInitStatus('checking');
    setSyncInitMessage('Buscando tu base de datos en Google...');

    try {
      // ① Intento SILENCIOSO — no abre popup (prompt: '')
      // Si GIS no puede renovar silenciosamente → lanza error 'interaction_required'
      const token = await ensureOperationalToken(clientId, true /* silent */);

      // ② Con token: buscar config en appDataFolder
      const configFileId = await findConfigInAppData(token);

      if (!configFileId) {
        setSyncInitStatus('no_remote_data');
        setSyncInitMessage('Esta cuenta todavía no tiene datos en Google. Crea tu base desde Configuración.');
        return;
      }

      const remoteConfig = await readConfigFromAppData(token, configFileId);

      if (!remoteConfig || !remoteConfig.databaseSpreadsheetId) {
        setSyncInitStatus('no_remote_data');
        setSyncInitMessage('La configuración remota existe pero no tiene base operacional asociada.');
        return;
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

      setSyncInitMessage('Base encontrada. Cargando datos...');
      await pullFromGoogleInternal(token, remoteSheetId);

      setSyncInitStatus('loaded_from_google');
      setSyncInitMessage(`✅ Datos cargados desde Google (${new Date().toLocaleTimeString('es-CO')})`);
      setNeedsGoogleAuth(false);
      setPendingSyncCount(0);

    } catch (err: any) {
      const errCode = err?.error || err?.message || '';
      const needsInteraction =
        errCode === 'interaction_required' ||
        errCode === 'consent_required' ||
        errCode === 'login_required' ||
        errCode === 'access_denied' ||
        errCode === 'popup_closed_by_user' ||
        errCode === 'popup_failed_to_open';

      if (needsInteraction) {
        // No es un error — solo se requiere consentimiento del usuario
        setSyncInitStatus('needs_auth');
        setSyncInitMessage(
          'Conecta con Google para cargar tus datos y habilitar la sincronización automática.'
        );
        setNeedsGoogleAuth(true);
      } else {
        // Error de red u otro error técnico
        setSyncInitStatus('error');
        setSyncInitMessage(`Error al conectar: ${errCode || 'error desconocido'}. Intenta desde Configuración.`);
      }
    }
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
    const token = await requestGoogleNativeToken();
    if (!token) return;

    try {
      setOpSyncStatus('syncing');
      
      // 1. Verificar si ya existe pate-salud-config.json en appDataFolder
      let configId = await findConfigInAppData(token);
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
          
          alert('Se ha encontrado una base operacional existente en tu cuenta de Google. Procederemos a cargar tu historial desde ella.');
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
        }
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
              merged[localIdx] = { ...remoteItem, syncStatus: 'SYNCED' };
            } else {
              // El local es más reciente o igual, mantener local
              merged[localIdx] = { ...localItem };
            }
          } else {
            // No existe localmente, agregar
            if (!remoteItem.deletedAt) {
              merged.push({ ...remoteItem, syncStatus: 'SYNCED' });
            }
          }
        });

        return merged;
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
        setAppointments(prev => mergeEntities(prev, remoteState.Citas, 'Citas'));
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
        Miembros: members.map(m => ({
          ...m,
          ownerEmail: m.ownerEmail || email,
          ownerGoogleId: m.ownerGoogleId || uid,
          sourceDeviceId: m.sourceDeviceId || deviceId,
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString(),
          deletedAt: m.deletedAt || null
        })),
        Permisos: members.map(m => ({
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
        FichasMedicas: Object.values(healthProfiles).map(hp => ({
          ...hp,
          ownerEmail: hp.ownerEmail || email,
          ownerGoogleId: hp.ownerGoogleId || uid,
          sourceDeviceId: hp.sourceDeviceId || deviceId,
          createdAt: hp.createdAt || new Date().toISOString(),
          updatedAt: hp.updatedAt || new Date().toISOString(),
          deletedAt: hp.deletedAt || null
        })),
        Citas: appointments.map(a => ({
          ...a,
          ownerEmail: a.ownerEmail || email,
          ownerGoogleId: a.ownerGoogleId || uid,
          sourceDeviceId: a.sourceDeviceId || deviceId,
          createdAt: a.createdAt || new Date().toISOString(),
          updatedAt: a.updatedAt || new Date().toISOString(),
          deletedAt: a.deletedAt || null
        })),
        Controles: checkups.map(c => ({
          ...c,
          ownerEmail: c.ownerEmail || email,
          ownerGoogleId: c.ownerGoogleId || uid,
          sourceDeviceId: c.sourceDeviceId || deviceId,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString(),
          deletedAt: c.deletedAt || null
        })),
        Vacunas: vaccines.map(v => ({
          ...v,
          ownerEmail: v.ownerEmail || email,
          ownerGoogleId: v.ownerGoogleId || uid,
          sourceDeviceId: v.sourceDeviceId || deviceId,
          createdAt: v.createdAt || new Date().toISOString(),
          updatedAt: v.updatedAt || new Date().toISOString(),
          deletedAt: v.deletedAt || null
        })),
        Examenes: exams.map(e => ({
          ...e,
          ownerEmail: e.ownerEmail || email,
          ownerGoogleId: e.ownerGoogleId || uid,
          sourceDeviceId: e.sourceDeviceId || deviceId,
          createdAt: e.createdAt || new Date().toISOString(),
          updatedAt: e.updatedAt || new Date().toISOString(),
          deletedAt: e.deletedAt || null
        })),
        Documentos: documents.map(d => ({
          ...d,
          ownerEmail: d.ownerEmail || email,
          ownerGoogleId: d.ownerGoogleId || uid,
          sourceDeviceId: d.sourceDeviceId || deviceId,
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: d.updatedAt || new Date().toISOString(),
          deletedAt: d.deletedAt || null
        })),
        HistorialClinico: history.map(h => ({
          ...h,
          ownerEmail: h.ownerEmail || email,
          ownerGoogleId: h.ownerGoogleId || uid,
          sourceDeviceId: h.sourceDeviceId || deviceId,
          createdAt: h.createdAt || new Date().toISOString(),
          updatedAt: h.updatedAt || new Date().toISOString(),
          deletedAt: h.deletedAt || null
        })),
        Auditoria: history.filter(h => h.title.includes('Miembro') || h.title.includes('Borrado') || h.title.includes('Permisos') || h.title.includes('Cita')).map(h => ({
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
        SyncLog: history.filter(h => h.title.includes('sincronización') || h.title.includes('Conflicto')).map(h => ({
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
        }))
      };

      await writeAllOperationalTables(token, sheetId, operationalStateSnapshot);

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
    const token = await requestGoogleNativeToken();
    if (!token) return;

    if (!databaseSpreadsheetId) {
      setOpSyncStatus('error');
      setOpSyncError('No existe una base operacional configurada.');
      alert('No se encontró base operacional para subir cambios.');
      return;
    }

    await pushToGoogleInternal(token, databaseSpreadsheetId);
  };

  const syncNow = async () => {
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
      // IMPORTANTE: No llamamos pullFromGoogleInternal porque ese método actualiza
      // React state, y el push inmediato capturaría el closure viejo (race condition).
      // En cambio, leemos directamente el estado remoto y construimos el merge aquí.
      const remoteState = await readAllOperationalTables(token, sheetId);

      // Función de merge LWW reutilizable
      const mergeEntitiesSync = <T extends { id: string; updatedAt?: string; deletedAt?: string | null }>(localArray: T[], remoteArray: T[]): T[] => {
        const merged: T[] = [...localArray];
        remoteArray.forEach(remoteItem => {
          const localIdx = merged.findIndex(l => l.id === remoteItem.id);
          if (localIdx >= 0) {
            const localUpdate = merged[localIdx].updatedAt ? new Date(merged[localIdx].updatedAt!).getTime() : 0;
            const remoteUpdate = remoteItem.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;
            if (remoteUpdate > localUpdate) {
              merged[localIdx] = { ...remoteItem, syncStatus: 'SYNCED' } as any;
            }
          } else if (!remoteItem.deletedAt) {
            merged.push({ ...remoteItem, syncStatus: 'SYNCED' } as any);
          }
        });
        return merged;
      };

      // Calcular el estado fusionado sin depender de React state post-set
      // Capturamos el estado actual (pre-pull) de las colecciones locales
      // y lo mergeamos con el remoto para obtener el estado final correcto.
      const mergedMembers = remoteState.Miembros ? mergeEntitiesSync(members, remoteState.Miembros) : members;
      const mergedAppointments = remoteState.Citas ? mergeEntitiesSync(appointments, remoteState.Citas) : appointments;
      const mergedCheckups = remoteState.Controles ? mergeEntitiesSync(checkups, remoteState.Controles) : checkups;
      const mergedVaccines = remoteState.Vacunas ? mergeEntitiesSync(vaccines, remoteState.Vacunas) : vaccines;
      const mergedExams = remoteState.Examenes ? mergeEntitiesSync(exams, remoteState.Examenes) : exams;
      const mergedDocuments = remoteState.Documentos ? mergeEntitiesSync(documents, remoteState.Documentos) : documents;
      const mergedHistory = remoteState.HistorialClinico ? mergeEntitiesSync(history, remoteState.HistorialClinico) : history;

      // Merge health profiles (Record<string, HealthProfile>)
      const mergedProfiles = { ...healthProfiles };
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
      setLastPullAt(new Date().toISOString());

      // FASE 2: Push — Usar el estado fusionado calculado (no el closure viejo)
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
        Citas: mergedAppointments.map(a => ({
          ...a,
          ownerEmail: a.ownerEmail || email,
          ownerGoogleId: a.ownerGoogleId || uid,
          sourceDeviceId: a.sourceDeviceId || deviceId,
          createdAt: a.createdAt || new Date().toISOString(),
          updatedAt: a.updatedAt || new Date().toISOString(),
          deletedAt: a.deletedAt || null
        })),
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
          }))
      };

      await writeAllOperationalTables(token, sheetId, operationalStateSnapshot);

      // Marcar todos como SYNCED
      const now = new Date().toISOString();
      setMembers(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setAppointments(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setCheckups(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setVaccines(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setExams(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));
      setDocuments(prev => prev.map(item => ({ ...item, syncStatus: 'SYNCED' as const, lastSyncedAt: now })));

      setLastPushAt(now);
      setLastSyncAt(now);
      setOpSyncStatus('synced');
    } catch (err: any) {
      console.error('Error durante la sincronización total:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error de sincronización.');
    }
  };

  const exportBackupJSON = () => {
    exportState();
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
    canManageOwnProfile: true,
    canManageOwnAppointments: true,
    canManageOwnDocuments: true,
    canViewOwnHistory: true,
    canUploadDocuments: true,
    canExportOwnData: false,
    canViewFamilyData: true, // Default to true for Admin titular
    canManageFamilyData: true  // Default to true for Admin titular
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
    if (!email) throw new Error('El miembro familiar debe poseer un correo electrónico registrado.');

    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const doc = documents.find(d => d.id === documentId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!doc.driveFileId) throw new Error('El archivo no ha sido subido a Google Drive aún.');

    if (!window.confirm(`¿Deseas compartir el documento "${doc.fileName}" con el correo ${email}?`)) {
      return;
    }

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
        syncStatus: 'PENDING_SYNC',
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

      alert(`El documento "${doc.fileName}" se compartió con éxito.`);
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

    if (!window.confirm(`¿Estás seguro de que deseas revocar el acceso a "${doc.fileName}" para ${targetEmail}?`)) {
      return;
    }

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
        syncStatus: 'PENDING_SYNC',
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

      alert(`Se revocó con éxito el acceso de ${targetEmail} al documento.`);
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
    if (!email) throw new Error('El miembro familiar debe poseer un correo electrónico registrado.');

    const token = await requestGoogleNativeToken();
    if (!token) throw new Error('No se pudo obtener autorización de Google.');

    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember) throw new Error('Familiar no encontrado.');

    if (!window.confirm(`¿Deseas crear y compartir un Reporte Clínico individual de Sheets para ${targetMember.fullName} con el correo ${email}?`)) {
      return;
    }

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
      
      alert(`Reporte clínico individual para ${targetMember.fullName} creado y compartido.`);
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

    if (!window.confirm(`¿Estás seguro de que deseas revocar el acceso al Reporte Clínico de Sheets para ${rep.memberName} a ${rep.sharedWithEmail}?`)) {
      return;
    }

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
      alert(`Se revocó con éxito el acceso de ${rep.sharedWithEmail} al reporte.`);
    } catch (err: any) {
      console.error('Error al revocar acceso al reporte individual:', err);
      setOpSyncStatus('error');
      setOpSyncError(err.message || 'Error al revocar reporte individual.');
      throw err;
    }
  };

  const exposedAppointments = filterByRole(appointments);
  const exposedVaccines = filterByRole(vaccines);
  const exposedCheckups = filterByRole(checkups);
  const exposedExams = filterByRole(exams);
  const exposedDocuments = filterByRole(documents);
  const exposedHistory = filterByRole(history);
  const exposedReminders = filterByRole(reminders);
  const exposedTasks = filterByRole(tasks);

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
      exportBackupJSON,

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

      // Secure Google-Native Sharing Phase 3B Bindings
      sharedReports,
      shareDocumentWithMember,
      revokeDocumentShare,
      generateAndShareMemberReport,
      revokeMemberReportShare
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
