'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Cloud, 
  Grid3X3, 
  ShieldCheck, 
  LogOut, 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  FileSpreadsheet,
  CheckCircle2,
  Download,
  Database,
  RotateCcw,
  Trash2,
  Calendar,
  Clock,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
  Check,
  Settings,
  Info,
  Mail,
  Plus,
  Edit
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { 
    user, 
    driveSyncEnabled, 
    setDriveSync, 
    calendarSyncEnabled,
    setCalendarSync,
    exportToSheets, 
    signOut, 
    isLoading,
    clearAllData,
    restoreDemoData,
    clearDemoData,
    exportState,
    driveStatus,
    driveError,
    lastDriveAuthTime,
    connectDrive,
    calendarStatus,
    calendarError,
    lastCalendarAuthTime,
    connectCalendar,
    sheetsAccessToken,
    sheetsStatus,
    sheetsError,
    lastSheetsAuthTime,
    lastExportMetadata,
    connectSheets,
    currentUserRole,
    simulatedRole,
    simulatedEmail,
    setSimulatedRole,
    setSimulatedEmail,
    runAppointmentRetentionCleanup,
    appointments,
    members,
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
    sharedReports,
    revokeMemberReportShare,
    documents,
    revokeDocumentShare,
    syncInitStatus,
    syncInitMessage,
    pendingSyncCount,
    autoSyncEnabled,
    setAutoSyncEnabled,
    needsGoogleAuth,
    reconnectGoogle,
    flushPendingSync,
    checkForExistingDatabase,
    repairGoogleNativeDatabase,
    emailSources,
    addEmailSource,
    updateEmailSource,
    deleteEmailSource
  } = useApp();

  const [isExporting, setIsExporting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showLegal, setShowLegal] = useState(false);

  // States for Gmail source forms
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [newSourceEmail, setNewSourceEmail] = useState('');
  const [newSourceLabel, setNewSourceLabel] = useState('');
  
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceEmail, setEditingSourceEmail] = useState('');
  const [editingSourceLabel, setEditingSourceLabel] = useState('');

  const activeApptsCount = appointments.filter(a => (a.retentionStatus || 'ACTIVE') !== 'PURGED').length;
  const purgedApptsCount = appointments.filter(a => (a.retentionStatus || 'ACTIVE') === 'PURGED').length;
  
  const now = new Date();
  const eligibleCount = appointments.filter(a => {
    if ((a.retentionStatus || 'ACTIVE') === 'PURGED') return false;
    const scheduledDate = new Date(a.scheduledAt);
    if (a.status === 'COMPLETED') {
      const completedDate = a.completedAt ? new Date(a.completedAt) : scheduledDate;
      const diffYears = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      return diffYears >= 2;
    } else if (a.status !== 'CANCELLED') {
      const diffYears = (now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      return diffYears >= 1;
    }
    return false;
  }).length;

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportToSheets('family-001');
    } catch (err) {
      console.error('Error during Google Sheets export:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800 leading-tight">Configuración</h2>
        <p className="text-xs font-semibold text-slate-400">Administra tus servicios conectados, respaldos y cuenta.</p>
      </section>

      {/* User profile card */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
        {user.photoUrl ? (
          <img 
            src={user.photoUrl} 
            alt="Foto de perfil" 
            className="h-14 w-14 rounded-full border border-slate-200 shrink-0 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-teal-600/10 text-teal-700 border border-teal-600/20 flex items-center justify-center font-black text-base shrink-0">
            {user.displayName.substring(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-extrabold text-slate-800 leading-none mb-1.5">{user.displayName}</h3>
          <p className="text-[11px] text-slate-400 font-bold truncate leading-none mb-2">{user.email}</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            {user.provider === 'google' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-600 border border-blue-100">
                Google Conectado
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-600 border border-amber-100">
                Sesión Demo local
              </span>
            )}
            {user.loggedAt && (
              <span className="text-[8px] text-slate-400 font-bold leading-none">
                Conectado: {new Date(user.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </section>      {/* ── PANEL DE DIAGNÓSTICO Y RESPALDO DE GOOGLE-NATIVE ── */}
      {user.provider === 'google' && (
        <div className="flex flex-col gap-6">
          
          {/* Ficha 1: Diagnóstico General y Estado de Sincronización */}
          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Diagnóstico de Sincronización</h4>
                  <p className="text-[10px] text-slate-400 font-semibold">Estado en tiempo real de tu base Google-native.</p>
                </div>
              </div>
              <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full border uppercase leading-none ${
                needsGoogleAuth ? 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse' :
                opSyncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                opSyncStatus === 'syncing' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
                opSyncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {needsGoogleAuth ? 'Autenticación Requerida' :
                 opSyncStatus === 'synced' ? 'Sincronizado' :
                 opSyncStatus === 'syncing' ? 'Sincronizando' :
                 opSyncStatus === 'error' ? 'Error de Sincronización' : 'Desconectado'}
              </span>
            </div>

            <hr className="border-slate-50" />

            {/* Banner de alerta de consentimiento */}
            {needsGoogleAuth && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col gap-3 font-semibold text-[10px] text-amber-800 leading-relaxed shadow-sm">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-950 block text-[11px] mb-0.5">Necesitamos permiso para sincronizar tus datos</span>
                    <p>Por políticas de Google, requerimos tu consentimiento explícito para guardar tus datos en Sheets y Drive. Si no autorizas, tus cambios se guardarán localmente como pendientes.</p>
                  </div>
                </div>
                <button
                  id="btn-reconnect-consent-banner"
                  onClick={() => reconnectGoogle()}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Autorizar sincronización</span>
                </button>
              </div>
            )}

            {/* Grid de Diagnóstico */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-4 font-semibold text-[11px] text-slate-500 leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3.5 gap-x-6">
                
                <div className="flex flex-col">
                  <span className="text-slate-400 font-bold uppercase text-[9px] leading-none mb-1">Estado de Conexión</span>
                  <div className="flex items-center gap-1.5 font-extrabold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>Conectado con Google ({user.email})</span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-slate-400 font-bold uppercase text-[9px] leading-none mb-1">Base Google-Native</span>
                  <div className="flex items-center gap-1.5 font-extrabold text-slate-700">
                    {databaseSpreadsheetId ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>Encontrada (Activa)</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                        <span>No encontrada (Falta crear)</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col border-t border-slate-100/70 pt-2.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px] leading-none mb-1">Última Sincronización</span>
                  <span className="font-extrabold text-slate-700">{lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-CO') : 'Nunca'}</span>
                </div>

                <div className="flex flex-col border-t border-slate-100/70 pt-2.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px] leading-none mb-1">Cambios locales pendientes</span>
                  <span className={`font-black ${pendingSyncCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                    {pendingSyncCount} {pendingSyncCount === 1 ? 'cambio' : 'cambios'}
                  </span>
                </div>

                <div className="flex flex-col border-t border-slate-100/70 pt-2.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px] leading-none mb-1">Último Pull (Descarga)</span>
                  <span className="font-extrabold text-slate-700">{lastPullAt ? new Date(lastPullAt).toLocaleString('es-CO') : 'Nunca'}</span>
                </div>

                <div className="flex flex-col border-t border-slate-100/70 pt-2.5">
                  <span className="text-slate-400 font-bold uppercase text-[9px] leading-none mb-1">Último Push (Subida)</span>
                  <span className="font-extrabold text-slate-700">{lastPushAt ? new Date(lastPushAt).toLocaleString('es-CO') : 'Nunca'}</span>
                </div>
              </div>

              {opSyncError && (
                <div className="bg-rose-50 p-3 rounded-xl border border-rose-100/60 text-rose-600 text-[10px] flex flex-col gap-1 font-semibold leading-relaxed">
                  <strong className="text-rose-700">Último error registrado:</strong>
                  <p>{opSyncError}</p>
                </div>
              )}

              {/* Toggle de Auto-Sync */}
              <div className="flex items-center justify-between border-t border-slate-100/70 pt-3.5 mt-1.5">
                <div>
                  <span className="font-extrabold text-slate-700 block text-xs mb-0.5">Sincronización Automática en Fondo</span>
                  <p className="text-[10px] text-slate-400 font-semibold">Sube cambios de forma silenciosa tras 4 segundos de inactividad.</p>
                </div>
                <button 
                  id="btn-toggle-auto-sync"
                  type="button"
                  onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                  className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-200 focus:outline-none flex ${
                    autoSyncEnabled ? 'bg-teal-600 justify-end' : 'bg-slate-200 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow self-center" />
                </button>
              </div>
            </div>
          </section>

          {/* Ficha 2: Permisos Específicos por Servicio */}
          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Permisos de Servicios</h4>
                <p className="text-[10px] text-slate-400 font-semibold">Verifica el estado individual de consentimiento de las APIs de Google.</p>
              </div>
            </div>

            <hr className="border-slate-50" />

            <div className="grid grid-cols-1 gap-4">
              
              {/* Servicio: Google Drive */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-blue-600" />
                    <div>
                      <span className="font-extrabold text-slate-800 block text-xs mb-0.5">Google Drive (Carpeta de la App)</span>
                      <span className="text-[9px] text-slate-400 block leading-none">Guardado seguro de PDFs y documentos clínicos</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                    driveStatus === 'connected' || driveStatus === 'subido' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    driveStatus === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {driveStatus === 'connected' || driveStatus === 'subido' ? 'Autorizado' :
                     driveStatus === 'connecting' || driveStatus === 'authorizing' || driveStatus === 'subiendo' ? 'Conectando...' :
                     driveStatus === 'error' ? 'Error' : 'Sin permiso'}
                  </span>
                </div>
                
                {driveError && (
                  <p className="text-[9px] text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100/50">{driveError}</p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100/60 pt-2.5 mt-1">
                  <span className="text-[9px] text-slate-400 font-bold">Último token: {lastDriveAuthTime ? new Date(lastDriveAuthTime).toLocaleTimeString() : 'N/A'}</span>
                  <button
                    id="btn-reconnect-drive"
                    onClick={() => connectDrive()}
                    className="py-1.5 px-3 bg-white border border-slate-200 hover:border-teal-500 text-slate-700 font-extrabold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    <span>Reconectar Drive</span>
                  </button>
                </div>
              </div>

              {/* Servicio: Google Calendar */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-teal-600" />
                    <div>
                      <span className="font-extrabold text-slate-800 block text-xs mb-0.5">Google Calendar</span>
                      <span className="text-[9px] text-slate-400 block leading-none">Agendamiento y sincronización de citas médicas</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                    calendarStatus === 'connected' || calendarStatus === 'sincronizado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    calendarStatus === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {calendarStatus === 'connected' || calendarStatus === 'sincronizado' ? 'Autorizado' :
                     calendarStatus === 'connecting' || calendarStatus === 'authorizing' || calendarStatus === 'sincronizando' ? 'Conectando...' :
                     calendarStatus === 'error' ? 'Error' : 'Sin permiso'}
                  </span>
                </div>

                {calendarError && (
                  <p className="text-[9px] text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100/50">{calendarError}</p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100/60 pt-2.5 mt-1">
                  <span className="text-[9px] text-slate-400 font-bold">Último token: {lastCalendarAuthTime ? new Date(lastCalendarAuthTime).toLocaleTimeString() : 'N/A'}</span>
                  <button
                    id="btn-reconnect-calendar"
                    onClick={() => connectCalendar()}
                    className="py-1.5 px-3 bg-white border border-slate-200 hover:border-teal-500 text-slate-700 font-extrabold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    <span>Reconectar Calendar</span>
                  </button>
                </div>
              </div>

              {/* Servicio: Google Sheets */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    <div>
                      <span className="font-extrabold text-slate-800 block text-xs mb-0.5">Google Sheets (Base y Exportación)</span>
                      <span className="text-[9px] text-slate-400 block leading-none">Guardado de tablas operacionales y reportes familiares</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                    sheetsStatus === 'connected' || sheetsStatus === 'exportado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    sheetsStatus === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {sheetsStatus === 'connected' || sheetsStatus === 'exportado' ? 'Autorizado' :
                     sheetsStatus === 'connecting' || sheetsStatus === 'authorizing' || sheetsStatus === 'exportando' ? 'Conectando...' :
                     sheetsStatus === 'error' ? 'Error' : 'Sin permiso'}
                  </span>
                </div>

                {sheetsError && (
                  <p className="text-[9px] text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100/50">{sheetsError}</p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100/60 pt-2.5 mt-1">
                  <span className="text-[9px] text-slate-400 font-bold">Último token: {lastSheetsAuthTime ? new Date(lastSheetsAuthTime).toLocaleTimeString() : 'N/A'}</span>
                  <button
                    id="btn-reconnect-sheets"
                    onClick={() => connectSheets()}
                    className="py-1.5 px-3 bg-white border border-slate-200 hover:border-teal-500 text-slate-700 font-extrabold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    <span>Reconectar Sheets</span>
                  </button>
                </div>
              </div>

            </div>
          </section>

          {/* Ficha: Correos para programación de citas */}
          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Correos para programación de citas</h4>
                  <p className="text-[10px] text-slate-400 font-semibold">Configura las direcciones desde donde recibes programaciones de citas para importarlas automáticamente.</p>
                </div>
              </div>
              
              {!isAddingSource && !editingSourceId && (
                <button
                  id="btn-add-email-source"
                  onClick={() => {
                    setNewSourceEmail('');
                    setNewSourceLabel('');
                    setIsAddingSource(true);
                  }}
                  className="py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[10px] rounded-lg shadow-sm flex items-center gap-1 transition-all"
                >
                  <Plus className="h-3 w-3" />
                  <span>Agregar fuente</span>
                </button>
              )}
            </div>

            <hr className="border-slate-50" />

            {/* Banner explicativo */}
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 text-[10px] font-semibold leading-relaxed">
              <p>“La app solo leerá correos de los remitentes que configures para detectar programaciones de citas médicas.”</p>
            </div>

            {/* Formulario Agregar Fuente */}
            {isAddingSource && (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-3 font-semibold text-[11px] text-slate-500">
                <span className="font-bold text-slate-800 text-[11px]">Nueva fuente de correo</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-400">Etiqueta (ej: Clinica, EPS)</label>
                    <input
                      type="text"
                      value={newSourceLabel}
                      onChange={(e) => setNewSourceLabel(e.target.value)}
                      placeholder="Ej. Clínica del Norte"
                      className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-teal-500 text-slate-900"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-400">Dirección de correo remitente</label>
                    <input
                      type="email"
                      value={newSourceEmail}
                      onChange={(e) => setNewSourceEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-teal-500 text-slate-900"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => setIsAddingSource(false)}
                    className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (!newSourceLabel.trim() || !newSourceEmail.trim()) {
                        alert('Por favor completa todos los campos.');
                        return;
                      }
                      if (!newSourceEmail.includes('@')) {
                        alert('Ingresa una dirección de correo válida.');
                        return;
                      }
                      const exists = emailSources.some(s => s.email.toLowerCase() === newSourceEmail.trim().toLowerCase());
                      if (exists) {
                        alert('Esta dirección de correo ya está configurada.');
                        return;
                      }
                      addEmailSource({
                        email: newSourceEmail.trim().toLowerCase(),
                        label: newSourceLabel.trim(),
                        enabled: true
                      });
                      setIsAddingSource(false);
                    }}
                    className="py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] rounded-lg"
                  >
                    Guardar Fuente
                  </button>
                </div>
              </div>
            )}

            {/* Formulario Editar Fuente */}
            {editingSourceId && (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-3 font-semibold text-[11px] text-slate-500">
                <span className="font-bold text-slate-800 text-[11px]">Editar fuente de correo</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-400">Etiqueta</label>
                    <input
                      type="text"
                      value={editingSourceLabel}
                      onChange={(e) => setEditingSourceLabel(e.target.value)}
                      placeholder="Ej. Clínica del Norte"
                      className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-teal-500 text-slate-900"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-400">Dirección de correo remitente</label>
                    <input
                      type="email"
                      value={editingSourceEmail}
                      onChange={(e) => setEditingSourceEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-teal-500 text-slate-900"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={() => setEditingSourceId(null)}
                    className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (!editingSourceLabel.trim() || !editingSourceEmail.trim()) {
                        alert('Por favor completa todos los campos.');
                        return;
                      }
                      if (!editingSourceEmail.includes('@')) {
                        alert('Ingresa una dirección de correo válida.');
                        return;
                      }
                      const exists = emailSources.some(s => s.id !== editingSourceId && s.email.toLowerCase() === editingSourceEmail.trim().toLowerCase());
                      if (exists) {
                        alert('Esta dirección de correo ya está configurada para otra fuente.');
                        return;
                      }
                      updateEmailSource(editingSourceId, {
                        email: editingSourceEmail.trim().toLowerCase(),
                        label: editingSourceLabel.trim()
                      });
                      setEditingSourceId(null);
                    }}
                    className="py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] rounded-lg"
                  >
                    Actualizar Fuente
                  </button>
                </div>
              </div>
            )}

            {/* Listado de Fuentes */}
            <div className="flex flex-col gap-3">
              {emailSources.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                  No hay remitentes configurados. Agrega uno arriba.
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {emailSources.map((source) => (
                    <div
                      key={source.id}
                      className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-semibold text-[11px]"
                    >
                      <div className="flex-1 min-w-0 flex items-start gap-3">
                        <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${source.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800 text-xs">{source.label}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase leading-none ${
                              source.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                            }`}>
                              {source.enabled ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{source.email}</p>
                          
                          {/* Scan status */}
                          {(source.lastScannedAt || source.lastError) && (
                            <div className="mt-2 pt-2 border-t border-slate-200/40 text-[9px] text-slate-400 font-semibold space-y-1">
                              {source.lastScannedAt && (
                                <p>Último escaneo: {new Date(source.lastScannedAt).toLocaleString('es-CO')}</p>
                              )}
                              {source.lastScanResult && (
                                <p className="text-slate-500 font-bold">Resultado: {source.lastScanResult}</p>
                              )}
                              {source.lastError && (
                                <p className="text-rose-500 font-extrabold">Error: {source.lastError}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => {
                            updateEmailSource(source.id, { enabled: !source.enabled });
                          }}
                          className={`py-1 px-2.5 rounded-lg border text-[9px] font-black transition-colors ${
                            source.enabled ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
                          }`}
                        >
                          {source.enabled ? 'Desactivar' : 'Activar'}
                        </button>

                        <button
                          onClick={() => {
                            setEditingSourceId(source.id);
                            setEditingSourceEmail(source.email);
                            setEditingSourceLabel(source.label);
                            setIsAddingSource(false);
                          }}
                          className="p-1.5 bg-white border border-slate-200 hover:border-teal-500 text-slate-600 rounded-lg shadow-sm transition-colors"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`¿Estás seguro de eliminar el remitente "${source.label}"?`)) {
                              deleteEmailSource(source.id);
                            }
                          }}
                          className="p-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Ficha 3: Acciones Manuales de Respaldo y Diagnóstico */}
          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">Acciones Manuales de Respaldo</h4>
                <p className="text-[10px] text-slate-400 font-semibold">Ejecuta operaciones de respaldo secundarias para resolver conflictos.</p>
              </div>
            </div>

            <hr className="border-slate-50" />

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              
              {/* Botón 1: Sincronizar Ahora */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px] justify-between">
                <div>
                  <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Sincronizar ahora</span>
                  <p className="text-[9px] text-slate-400 leading-normal mb-2">Descarga cambios de la nube y sube tus cambios pendientes.</p>
                </div>
                <button
                  id="btn-sync-now"
                  onClick={() => syncNow()}
                  disabled={opSyncStatus === 'syncing' || needsGoogleAuth}
                  className="py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 w-full text-[10px]"
                >
                  {opSyncStatus === 'syncing' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  <span>Sincronizar ahora</span>
                </button>
              </div>

              {/* Botón 2: Reconectar Google */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px] justify-between">
                <div>
                  <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Reconectar Google</span>
                  <p className="text-[9px] text-slate-400 leading-normal mb-2">Solicita y renueva el token global abriendo la ventana de Google.</p>
                </div>
                <button
                  id="btn-reconnect-google"
                  onClick={() => reconnectGoogle()}
                  className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold rounded-xl transition-all border border-slate-300 flex items-center justify-center gap-1.5 w-full text-[10px]"
                >
                  <Wifi className="h-3 w-3" />
                  <span>Reconectar Google</span>
                </button>
              </div>

              {/* Botón 3: Reparar base Google-native */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px] justify-between">
                <div>
                  <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Reparar base Google-native</span>
                  <p className="text-[9px] text-slate-400 leading-normal mb-2">Reconstruye pestañas dañadas en Sheets y fuerza la subida local.</p>
                </div>
                <button
                  id="btn-repair-database"
                  onClick={() => repairGoogleNativeDatabase()}
                  disabled={opSyncStatus === 'syncing' || isRepairing}
                  className="py-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-extrabold rounded-xl transition-all border border-rose-100 flex items-center justify-center gap-1.5 w-full disabled:opacity-50 text-[10px]"
                >
                  {isRepairing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  <span>Reparar base</span>
                </button>
              </div>

              {/* Botón 4: Crear base si no existe */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px] justify-between">
                <div>
                  <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Crear base si no existe</span>
                  <p className="text-[9px] text-slate-400 leading-normal mb-2">Crea una base en blanco en tu Drive si no tienes ninguna.</p>
                </div>
                <button
                  id="btn-create-database"
                  onClick={() => createGoogleNativeDatabase()}
                  disabled={opSyncStatus === 'syncing' || !!databaseSpreadsheetId}
                  className="py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 w-full shadow-sm text-[10px]"
                >
                  <span>Crear base</span>
                </button>
              </div>

              {/* Botón 5: Descargar datos (Pull) */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px] justify-between">
                <div>
                  <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Cargar desde Google</span>
                  <p className="text-[9px] text-slate-400 leading-normal mb-2">Sobrescribe el estado local con la versión de Google Sheets.</p>
                </div>
                <button
                  id="btn-pull-google"
                  onClick={() => pullFromGoogle()}
                  disabled={opSyncStatus === 'syncing' || !databaseSpreadsheetId}
                  className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold rounded-xl transition-all border border-slate-300 disabled:opacity-50 w-full text-[10px]"
                >
                  <span>Cargar desde Google</span>
                </button>
              </div>

              {/* Botón 6: Enviar datos locales (Push) */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px] justify-between">
                <div>
                  <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Subir cambios locales</span>
                  <p className="text-[9px] text-slate-400 leading-normal mb-2">Sube todos tus datos locales actuales a Google Sheets.</p>
                </div>
                <button
                  id="btn-push-google"
                  onClick={() => pushToGoogle()}
                  disabled={opSyncStatus === 'syncing' || !databaseSpreadsheetId}
                  className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold rounded-xl transition-all border border-slate-300 disabled:opacity-50 w-full text-[10px]"
                >
                  <span>Subir cambios locales</span>
                </button>
              </div>

            </div>

            {/* Enlaces Rápidos a Google Drive / Sheets */}
            {databaseSpreadsheetUrl && (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2.5 font-semibold text-[11px] text-slate-500">
                <a
                  id="btn-open-spreadsheet"
                  href={databaseSpreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 text-center w-full"
                >
                  <Grid3X3 className="h-4.5 w-4.5" />
                  <span>Abrir hoja operacional actual</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                
                <div className="flex justify-between text-[9px] border-t border-slate-200/50 pt-2.5">
                  <span>ID Hoja de Cálculo:</span>
                  <span className="font-bold text-slate-700 truncate max-w-[220px]">{databaseSpreadsheetId || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span>Dispositivo ID:</span>
                  <span className="font-bold text-slate-700 truncate max-w-[220px]">{deviceId || 'N/A'}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}


      {/* Compartición Google-native */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Compartición Google-native</h4>
        <hr className="border-slate-50" />
        
        <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 text-amber-700 text-[10px] leading-relaxed font-semibold">
          <p className="font-extrabold mb-1">ℹ Resguardo de Privacidad:</p>
          <p>La base operacional completa de tu familia <strong>NO se comparte automáticamente por seguridad</strong>. Solo se concede acceso a reportes clínicos individuales o documentos específicos que tú selecciones explícitamente.</p>
        </div>

        {/* Shared Reports list */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide px-1">Reportes Clínicos Compartidos (Sheets)</span>
          {sharedReports.length === 0 ? (
            <p className="text-[10px] text-slate-400 font-semibold italic px-1">No hay reportes de cálculo Sheets compartidos actualmente.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sharedReports.map((rep) => (
                <div key={rep.id} className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-semibold text-[10px]">
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-slate-800">Reporte para {rep.memberName}</p>
                    <p className="text-[9px] text-slate-400">Destinatario: {rep.sharedWithEmail}</p>
                    <p className="text-[8px] text-slate-400 font-bold">Fecha: {new Date(rep.sharedAt).toLocaleDateString('es-CO')}</p>
                    <span className={`inline-block w-fit text-[8px] font-black px-1.5 py-0.5 rounded uppercase mt-1 leading-none ${
                      rep.shareStatus === 'SHARED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {rep.shareStatus === 'SHARED' ? 'Compartido' : 'Acceso Revocado'}
                    </span>
                  </div>
                  {rep.shareStatus === 'SHARED' && (
                    <div className="flex gap-2 shrink-0">
                      <a 
                        href={rep.spreadsheetUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="bg-white border border-slate-200 text-slate-700 hover:text-teal-600 px-3 py-1.5 rounded-xl font-bold transition-all text-center flex items-center justify-center animate-none"
                      >
                        Abrir
                      </a>
                      <button
                        onClick={async () => {
                          try {
                            await revokeMemberReportShare(rep.id);
                          } catch (err: any) {
                            alert(`Error al revocar: ${err.message}`);
                          }
                        }}
                        className="bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded-xl font-bold transition-all text-center"
                      >
                        Revocar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shared Documents list */}
        <div className="flex flex-col gap-3 mt-2">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide px-1">Documentos Clínicos Compartidos (Drive)</span>
          {documents.filter(d => d.shareStatus === 'SHARED').length === 0 ? (
            <p className="text-[10px] text-slate-400 font-semibold italic px-1">No hay PDFs o imágenes compartidos actualmente.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {documents
                .filter(d => d.shareStatus === 'SHARED')
                .map((doc) => (
                  <div key={doc.id} className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-semibold text-[10px]">
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-slate-800 truncate">{doc.fileName}</p>
                      <p className="text-[9px] text-slate-400">Destinatario: {doc.sharedWithEmail}</p>
                      <p className="text-[8px] text-slate-400 font-bold">Fecha carga: {new Date(doc.uploadedAt).toLocaleDateString('es-CO')}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {doc.driveUrl && (
                        <a 
                          href={doc.driveUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="bg-white border border-slate-200 text-slate-700 hover:text-teal-600 px-3 py-1.5 rounded-xl font-bold transition-all text-center flex items-center justify-center animate-none"
                        >
                          Abrir
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            await revokeDocumentShare(doc.id);
                          } catch (err: any) {
                            alert(`Error al revocar: ${err.message}`);
                          }
                        }}
                        className="bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded-xl font-bold transition-all text-center"
                      >
                        Revocar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* Simulador de Permisos y Roles (Testing) */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Simulador de Roles y Permisos (QA)</h4>
        <hr className="border-slate-50" />
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3.5 font-semibold text-[10px] text-slate-500">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-extrabold text-slate-600 uppercase">Rol del portal actual</label>
            <select
              value={simulatedRole || 'FAMILY_ADMIN'}
              onChange={(e) => {
                const val = e.target.value;
                setSimulatedRole(val === 'FAMILY_ADMIN' ? null : val as any);
                alert(`Rol simulado cambiado a: ${val}. La app filtrará vistas correspondientes.`);
              }}
              className="h-10 px-3 bg-white border border-slate-200 focus:border-teal-500 rounded-xl text-xs font-semibold text-slate-900 outline-none text-slate-900"
            >
              <option value="FAMILY_ADMIN">Administrador Familiar (Completo)</option>
              <option value="MEMBER_SELF">Miembro Familiar Propio (MEMBER_SELF)</option>
              <option value="VIEWER">Visualizador (Viewer)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-extrabold text-slate-600 uppercase">Correo de simulación</label>
            <div className="flex gap-2">
              <input
                type="email"
                defaultValue={simulatedEmail || ''}
                placeholder="Escribe el email del miembro habilitado..."
                onBlur={(e) => {
                  const val = e.target.value;
                  setSimulatedEmail(val.trim() || null);
                }}
                className="flex-1 h-10 px-3 bg-white border border-slate-200 focus:border-teal-500 rounded-xl text-xs font-semibold text-slate-900 outline-none text-slate-900"
              />
              <button
                type="button"
                onClick={() => alert(`Correo de simulación establecido.`)}
                className="h-10 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl transition-colors shrink-0"
              >
                Aplicar
              </button>
            </div>
            <p className="text-[8px] text-slate-400 mt-0.5">
              Si el correo coincide con un miembro activo que tiene habilitado el acceso, la app limitará su vista y permisos automáticamente al guardar los cambios o recargar la pestaña.
            </p>
          </div>
        </div>
      </section>

      {/* Retención de Historial Clínico */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Retención y Depuración de Historial</h4>
        <hr className="border-slate-50" />
        
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl shrink-0 mt-0.5">
              <Clock className="h-4.5 w-4.5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight">Políticas de Depuración de Citas</h5>
              <div className="text-[10px] text-slate-400 font-semibold leading-normal mt-1 space-y-1">
                <p>• Citas completadas: Depuradas 2 años después de finalizar.</p>
                <p>• Citas no completadas: Depuradas 1 año después del agendamiento.</p>
              </div>
            </div>
          </div>

          {/* Metrics list */}
          <div className="grid grid-cols-3 gap-2.5 mt-1 select-none">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 text-center flex flex-col gap-0.5">
              <span className="text-[8px] font-extrabold text-slate-400 uppercase leading-none">Citas Activas</span>
              <strong className="text-sm font-black text-slate-700 leading-none mt-1">{activeApptsCount}</strong>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 text-center flex flex-col gap-0.5">
              <span className="text-[8px] font-extrabold text-slate-400 uppercase leading-none">Depuradas</span>
              <strong className="text-sm font-black text-slate-700 leading-none mt-1">{purgedApptsCount}</strong>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 text-center flex flex-col gap-0.5">
              <span className="text-[8px] font-extrabold text-slate-400 uppercase leading-none">Elegibles</span>
              <strong className={`text-sm font-black leading-none mt-1 ${eligibleCount > 0 ? 'text-amber-600 animate-pulse' : 'text-slate-700'}`}>{eligibleCount}</strong>
            </div>
          </div>

          <p className="text-[9px] font-semibold leading-relaxed text-amber-600 bg-amber-50 p-2.5 rounded-xl border border-amber-100/60">
            ⚠ Advertencia: La depuración de citas realiza un borrado lógico ocultando los registros del expediente. Los eventos en tu Google Calendar y archivos asociados en Drive <strong>no</strong> se borrarán. Te recomendamos exportar a Sheets o JSON antes de depurar.
          </p>

          <button
            onClick={() => {
              runAppointmentRetentionCleanup();
              alert(`Limpieza de citas ejecutada con éxito. Se analizaron todos los registros.`);
            }}
            className="w-full h-10 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <span>Ejecutar limpieza de historial</span>
          </button>
        </div>
      </section>

      {/* Estado PWA / Instalación Offline */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Aplicación Instalable (PWA)</h4>
        <hr className="border-slate-50" />

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight mb-0.5">Soporte Offline y PWA Activo</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                Esta aplicación está lista para instalarse en tu celular o computador y abrirse sin conexión a Internet.
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2 font-semibold text-[10px] text-slate-500 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-xs mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>Estado: Lista para Instalar</span>
            </div>
            <p>
              • <strong>Cómo instalar:</strong> Abre el menú de opciones de tu navegador (Chrome, Safari, Edge) y presiona <strong>&quot;Instalar aplicación&quot;</strong> o <strong>&quot;Agregar a la pantalla de inicio&quot;</strong>.
            </p>
            <p className="text-amber-600 font-bold bg-amber-50 p-2 rounded-lg border border-amber-100/55">
              ⚠ Importante: Los datos clínicos ingresados se guardan localmente en este navegador. Si cambias de dispositivo o borras la caché, la información se perderá.
            </p>
            <p>
              • <strong>Recomendación:</strong> Utiliza la herramienta de <strong>Copia de Seguridad (.json)</strong> a continuación para respaldar y transferir tus datos de forma manual cuando lo requieras.
            </p>
          </div>
        </div>
      </section>

      {/* Administración de Datos Local */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Administración de Datos</h4>
        <hr className="border-slate-50" />
        
        {/* Backup JSON */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Download className="h-4.5 w-4.5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight">Copia de Seguridad</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-none mt-1">Descarga todo tu expediente familiar en formato JSON</p>
            </div>
          </div>
          <button
            onClick={exportState}
            className="w-full h-10 mt-1 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors border border-indigo-100"
          >
            <Download className="h-4 w-4" />
            <span>Exportar Copia de Seguridad (.json)</span>
          </button>
        </div>

        <hr className="border-slate-50 my-1" />

        {/* Database state tools */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <Database className="h-4.5 w-4.5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight">Almacenamiento Local</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-none mt-1">Restaura la demostración o limpia los datos locales</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-1">
            {user?.provider === 'mock' ? (
              <>
                <button
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseas restaurar la base de datos de demostración? Esto sobrescribirá todos tus cambios actuales.')) {
                      restoreDemoData();
                      alert('Base de datos demo restaurada con éxito.');
                    }
                  }}
                  className="h-10 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-amber-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Restaurar Demo</span>
                </button>
                
                <button
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseas eliminar los datos de demostración de este navegador?')) {
                      clearDemoData();
                      clearAllData();
                      alert('Datos demo eliminados de este navegador.');
                      router.push('/login');
                    }
                  }}
                  className="h-10 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-100"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Limpiar Datos Demo</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseas reiniciar tu cuenta en este navegador? Esto eliminará tus datos locales de esta cuenta pero conservará intactos tus archivos en Google Drive y Sheets.')) {
                      clearAllData();
                      alert('Datos locales de la cuenta reiniciados con éxito.');
                      router.push('/login');
                    }
                  }}
                  className="h-10 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-100"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Reiniciar Cuenta Actual</span>
                </button>

                <button
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseas eliminar los datos demo de este navegador? Esto no afectará a tus datos reales.')) {
                      clearDemoData();
                      alert('Datos demo eliminados de este navegador con éxito.');
                    }
                  }}
                  className="h-10 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-slate-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Limpiar Datos Demo</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Security & privacy details */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <button
          onClick={() => setShowLegal(!showLegal)}
          className="flex items-center justify-between w-full focus:outline-none"
        >
          <div className="flex items-center gap-3 text-slate-800">
            <ShieldCheck className="h-5 w-5 text-slate-500" />
            <span className="text-xs font-extrabold">Políticas de Privacidad y Disclaimer</span>
          </div>
          {showLegal ? <ChevronUp className="h-4.5 w-4.5 text-slate-400" /> : <ChevronDown className="h-4.5 w-4.5 text-slate-400" />}
        </button>

        {showLegal && (
          <div className="flex flex-col gap-2 mt-2 text-[11px] text-slate-500 leading-relaxed font-semibold animate-in fade-in duration-200">
            <p>
              Esta aplicación está diseñada exclusivamente para la autogestión y control organizado de la salud del núcleo familiar.
            </p>
            <p>
              <strong>Seguridad de los datos:</strong> Los datos se almacenan localmente en el navegador del dispositivo. No se sincronizan en la nube todavía y pueden eliminarse si el usuario borra datos del sitio.
            </p>
            <p>
              No se guardan claves, credenciales ni tokens reales en esta etapa de desarrollo del MVP. El almacenamiento local (LocalStorage) no se encuentra cifrado; para mayor seguridad futura se recomienda la implementación de autenticación real, cifrado de datos o un backend centralizado seguro.
            </p>
            <p>
              Se aconseja encarecidamente descargar copias de respaldo de forma periódica con la herramienta de <strong>Copia de Seguridad (.json)</strong> a continuación para evitar pérdidas accidentales.
            </p>
            <p className="italic text-rose-500/90 border-t border-slate-50 pt-2 mt-1">
              Advertencia: La información contenida en esta aplicación es de carácter organizativo y no reemplaza el diagnóstico médico profesional, tratamiento ni prescripciones de un médico calificado.
            </p>
          </div>
        )}
      </section>

      {/* Logout button */}
      <button
        onClick={() => signOut()}
        className="w-full h-13.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-rose-600/10 active:translate-y-0.5 transition-all duration-200"
      >
        <LogOut className="h-5 w-5" />
        <span>Cerrar Sesión</span>
      </button>

      {/* Loading Backdrop Overlay for Exporting */}
      {(isExporting || sheetsStatus === 'exportando') && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="bg-white p-6 rounded-3xl shadow-xl flex flex-col items-center gap-3 border border-slate-100 max-w-xs text-center">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <h4 className="text-sm font-extrabold text-slate-800">Exportando expediente clínico</h4>
            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
              Estamos creando tu libro de cálculo en Google Sheets y aplicando estilos y formatos. Por favor, no cierres la aplicación.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
