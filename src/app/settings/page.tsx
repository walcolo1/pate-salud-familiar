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
  Info
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
    checkForExistingDatabase
  } = useApp();

  const [isExporting, setIsExporting] = useState(false);
  const [showLegal, setShowLegal] = useState(false);

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
      </section>

      {/* ── PANEL DE CONFIGURACIÓN INICIAL GOOGLE-NATIVE (Si no hay base vinculada) ── */}
      {!databaseSpreadsheetId && (
        <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-slate-500" />
            <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase">Configurar Sincronización Google-native</h4>
          </div>
          <hr className="border-slate-50" />

          <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
            Vincula tu cuenta de Google para respaldar tus datos clínicos en tu Drive personal y mantenerlos sincronizados en tiempo real en todos tus dispositivos.
          </p>

          {/* Estado: Requiere autorización */}
          {(needsGoogleAuth || syncInitStatus === 'needs_auth') ? (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col gap-3 font-semibold text-[10px] text-amber-800 leading-relaxed shadow-sm">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-950 block text-[11px] mb-0.5">Conecta Google para buscar tu base existente</span>
                  <p>Inicia sesión y otorga los permisos necesarios. La aplicación buscará automáticamente si ya tienes un expediente de Paté Salud Familiar guardado para evitar duplicados.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                <button
                  onClick={() => reconnectGoogle()}
                  className="py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Wifi className="h-4 w-4" />
                  <span>Conectar Google para buscar</span>
                </button>
                <button
                  onClick={() => checkForExistingDatabase(undefined, false)}
                  className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Buscar base existente</span>
                </button>
                <button
                  onClick={() => pullFromGoogle()}
                  className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Cargar desde Google</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Si estamos buscando */}
              {syncInitStatus === 'checking' && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3 font-semibold text-[10px] text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-blue-600" />
                  <div>
                    <span className="font-bold block text-[11px] text-blue-900">Buscando expediente en la nube...</span>
                    <p className="text-[9px] opacity-80">Buscando archivos de configuración en tu cuenta Google Drive.</p>
                  </div>
                </div>
              )}

              {/* Si buscamos y no se encontró base remota */}
              {syncInitStatus === 'no_remote_data' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-3 font-semibold text-[10px] text-slate-600 leading-relaxed shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block text-[11px] mb-0.5">No existe base Google-native para esta cuenta</span>
                      <p>Hemos verificado tu Google Drive y no encontramos ningún expediente previo de Paté Salud Familiar vinculado a este correo. Si deseas empezar de cero, puedes crear una nueva base de datos vacía.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                    <button
                      onClick={() => createGoogleNativeDatabase()}
                      className="py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Crear nueva base Google-native</span>
                    </button>
                    <button
                      onClick={() => checkForExistingDatabase(undefined, false)}
                      className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Buscar otra vez</span>
                    </button>
                    <button
                      onClick={() => pullFromGoogle()}
                      className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Cargar desde Google</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Si estamos conectados pero no hemos corrido la búsqueda manual */}
              {syncInitStatus !== 'checking' && syncInitStatus !== 'no_remote_data' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-3 font-semibold text-[10px] text-slate-600 leading-relaxed shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block text-[11px] mb-0.5">Cuenta vinculada correctamente</span>
                      <p>Tu sesión de Google está activa. Presiona el botón de abajo para buscar si tienes un expediente guardado en Drive de Paté Salud Familiar.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => checkForExistingDatabase(undefined, false)}
                      className="py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Buscar base existente</span>
                    </button>
                    <button
                      onClick={() => pullFromGoogle()}
                      className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Cargar desde Google</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── SECCIÓN 1: ESTADO DE SINCRONIZACIÓN GOOGLE-NATIVE ───────────────── */}
      {databaseSpreadsheetId && (
        <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-5 w-5 ${opSyncStatus === 'syncing' ? 'animate-spin text-teal-600' : 'text-slate-500'}`} />
              <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase">Estado de Sincronización</h4>
            </div>
            <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase leading-none ${
              needsGoogleAuth ? 'bg-amber-50 text-amber-600 border-amber-100' :
              opSyncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
              opSyncStatus === 'syncing' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
              opSyncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
              'bg-slate-50 text-slate-400 border-slate-200'
            }`}>
              {needsGoogleAuth ? 'Autenticación Requerida' :
               opSyncStatus === 'synced' ? 'Sincronizado' :
               opSyncStatus === 'syncing' ? 'Sincronizando' :
               opSyncStatus === 'error' ? 'Error' : 'No Conectada'}
            </span>
          </div>
          <hr className="border-slate-50" />

          {/* Banner de Estado de Inicialización Automática o requerimiento de consentimiento */}
          {user?.provider === 'google' && (needsGoogleAuth || syncInitStatus === 'needs_auth') && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col gap-3 font-semibold text-[10px] text-amber-800 leading-relaxed shadow-sm">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-950 block text-[11px] mb-0.5">Conectar Google para sincronizar</span>
                  <p>Por políticas de seguridad de Google, necesitamos tu consentimiento para iniciar la base de datos operacional en memoria. Si no autorizas ahora, tus cambios se guardarán localmente como pendientes.</p>
                </div>
              </div>
              <button
                onClick={() => reconnectGoogle()}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <Wifi className="h-3.5 w-3.5" />
                <span>Conectar Google</span>
              </button>
            </div>
          )}

          {/* Otro banner de inicialización técnica */}
          {user?.provider === 'google' && syncInitStatus !== 'idle' && syncInitStatus !== 'needs_auth' && !needsGoogleAuth && (
            <div className={`p-3 rounded-2xl border text-[10px] font-semibold leading-relaxed flex items-start gap-2.5 ${
              syncInitStatus === 'checking'
                ? 'bg-blue-50 border-blue-100 text-blue-700'
                : syncInitStatus === 'loaded_from_google'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : syncInitStatus === 'no_remote_data'
                ? 'bg-amber-50 border-amber-100 text-amber-700'
                : syncInitStatus === 'local_only'
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : syncInitStatus === 'error'
                ? 'bg-rose-50 border-rose-100 text-rose-700'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              {syncInitStatus === 'checking' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-extrabold block">
                  {syncInitStatus === 'checking' && 'Buscando base de datos en Google...'}
                  {syncInitStatus === 'loaded_from_google' && '✅ Datos cargados desde Google'}
                  {syncInitStatus === 'no_remote_data' && '⚠️ Esta cuenta todavía no tiene datos en Google'}
                  {syncInitStatus === 'local_only' && '💾 Datos cargados desde caché local'}
                  {syncInitStatus === 'error' && '❌ Error al conectar con Google'}
                </span>
                {syncInitMessage && syncInitStatus !== 'checking' && (
                  <span className="block text-[9px] font-medium opacity-80 mt-0.5">{syncInitMessage}</span>
                )}
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500 leading-relaxed">
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              <div className="flex flex-col">
                <span className="text-slate-400 font-bold uppercase text-[8px] leading-none mb-1">Estado General</span>
                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                  {user?.provider === 'google' && !needsGoogleAuth ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Conectado con Google</span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      <span>Desconectado / Pendiente</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-slate-400 font-bold uppercase text-[8px] leading-none mb-1">Base Google-Native</span>
                <span className="font-bold text-slate-700">
                  {databaseSpreadsheetId ? 'Encontrada (Habilitada ✅)' : 'No encontrada (Falta crear ⚠️)'}
                </span>
              </div>

              <div className="flex flex-col border-t border-slate-100/70 pt-2">
                <span className="text-slate-400 font-bold uppercase text-[8px] leading-none mb-1">Última Sincronización</span>
                <span className="font-bold text-slate-700">{lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-CO') : 'Nunca'}</span>
              </div>

              <div className="flex flex-col border-t border-slate-100/70 pt-2">
                <span className="text-slate-400 font-bold uppercase text-[8px] leading-none mb-1">Cambios Pendientes</span>
                <span className={`font-bold ${pendingSyncCount > 0 ? 'text-amber-600 font-black' : 'text-slate-700'}`}>
                  {pendingSyncCount} {pendingSyncCount === 1 ? 'cambio' : 'cambios'}
                </span>
              </div>

              <div className="flex flex-col border-t border-slate-100/70 pt-2">
                <span className="text-slate-400 font-bold uppercase text-[8px] leading-none mb-1">Último Pull (Bajar)</span>
                <span className="font-bold text-slate-700">{lastPullAt ? new Date(lastPullAt).toLocaleString('es-CO') : 'Nunca'}</span>
              </div>

              <div className="flex flex-col border-t border-slate-100/70 pt-2">
                <span className="text-slate-400 font-bold uppercase text-[8px] leading-none mb-1">Último Push (Subir)</span>
                <span className="font-bold text-slate-700">{lastPushAt ? new Date(lastPushAt).toLocaleString('es-CO') : 'Nunca'}</span>
              </div>
            </div>

            {opSyncError && (
              <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/60 text-rose-600 text-[9px] flex flex-col gap-1 mt-1 font-semibold leading-relaxed">
                <strong className="text-rose-700">Último error de sincronización:</strong>
                <p>{opSyncError}</p>
              </div>
            )}

            {/* Toggle de Sincronización Automática */}
            <div className="flex items-center justify-between border-t border-slate-100/70 pt-3 mt-1">
              <div>
                <span className="font-extrabold text-slate-700 block text-xs mb-0.5">Sincronización Automática</span>
                <p className="text-[9px] text-slate-400">Guarda los cambios de forma automática en la nube (Debounce 4s)</p>
              </div>
              <button 
                type="button"
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-200 focus:outline-none flex ${
                  autoSyncEnabled ? 'bg-teal-600 justify-end' : 'bg-slate-200 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow self-center" />
              </button>
            </div>

            {/* Botón Principal de Sincronización Ahora */}
            <button
              onClick={() => syncNow()}
              disabled={opSyncStatus === 'syncing' || needsGoogleAuth}
              className="w-full mt-2 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              {opSyncStatus === 'syncing' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Sincronizando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Sincronizar ahora</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* ── SECCIÓN 2: PERMISOS DE SERVICIOS GOOGLE ─────────────────────────── */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-slate-500" />
          <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase">Permisos de Servicios</h4>
        </div>
        <hr className="border-slate-50" />

        <p className="text-[10px] text-slate-400 font-semibold leading-relaxed px-1">
          Configura y reconecta los permisos específicos otorgados por Google en tu sesión. Los tokens viven estrictamente en memoria por seguridad.
        </p>

        {/* Servicio 1: Google Drive */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-4.5 w-4.5 text-blue-600" />
              <div>
                <span className="font-extrabold text-slate-800 block text-xs leading-none mb-1">Google Drive</span>
                <span className="text-[9px] text-slate-400">Respaldo privado de PDFs y recetas</span>
              </div>
            </div>
            
            <button 
              type="button"
              onClick={() => setDriveSync(!driveSyncEnabled)}
              className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex ${
                driveSyncEnabled ? 'bg-teal-600 justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow self-center" />
            </button>
          </div>

          {driveSyncEnabled && (
            <div className="flex flex-col gap-2.5 border-t border-slate-100/70 pt-2.5">
              <div className="flex items-center justify-between text-[9px]">
                <span>Estado de Autorización:</span>
                <span className={`font-bold uppercase ${
                  driveStatus === 'connected' || driveStatus === 'subido' ? 'text-emerald-600' :
                  driveStatus === 'error' ? 'text-rose-500 animate-pulse' :
                  'text-slate-400'
                }`}>
                  {driveStatus === 'connected' || driveStatus === 'subido' ? 'Conectado ✅' :
                   driveStatus === 'authorizing' || driveStatus === 'connecting' || driveStatus === 'subiendo' ? 'Conectando...' :
                   driveStatus === 'error' ? 'Error ❌' : 'Sin permiso ⚠️'}
                </span>
              </div>

              <div className="flex justify-between text-[9px]">
                <span>Último permiso en sesión:</span>
                <span className="font-bold text-slate-700">
                  {lastDriveAuthTime ? new Date(lastDriveAuthTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ninguno'}
                </span>
              </div>

              <button
                onClick={() => connectDrive()}
                disabled={driveStatus === 'connecting' || driveStatus === 'authorizing' || driveStatus === 'subiendo'}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 font-extrabold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {driveStatus === 'connecting' || driveStatus === 'authorizing' || driveStatus === 'subiendo' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span>Reconectar Drive</span>
                )}
              </button>

              {driveError && (
                <p className="text-[9px] text-rose-500 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-100">
                  {driveError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Servicio 2: Google Calendar */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-teal-600" />
              <div>
                <span className="font-extrabold text-slate-800 block text-xs leading-none mb-1">Google Calendar</span>
                <span className="text-[9px] text-slate-400">Alertas y citas médicas automáticas</span>
              </div>
            </div>
            
            <button 
              type="button"
              onClick={() => setCalendarSync(!calendarSyncEnabled)}
              className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex ${
                calendarSyncEnabled ? 'bg-teal-600 justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow self-center" />
            </button>
          </div>

          {calendarSyncEnabled && (
            <div className="flex flex-col gap-2.5 border-t border-slate-100/70 pt-2.5">
              <div className="flex items-center justify-between text-[9px]">
                <span>Estado de Autorización:</span>
                <span className={`font-bold uppercase ${
                  calendarStatus === 'connected' || calendarStatus === 'sincronizado' ? 'text-emerald-600' :
                  calendarStatus === 'error' ? 'text-rose-500 animate-pulse' :
                  'text-slate-400'
                }`}>
                  {calendarStatus === 'connected' || calendarStatus === 'sincronizado' ? 'Conectado ✅' :
                   calendarStatus === 'authorizing' || calendarStatus === 'connecting' || calendarStatus === 'sincronizando' ? 'Conectando...' :
                   calendarStatus === 'error' ? 'Error ❌' : 'Sin permiso ⚠️'}
                </span>
              </div>

              <div className="flex justify-between text-[9px]">
                <span>Último permiso en sesión:</span>
                <span className="font-bold text-slate-700">
                  {lastCalendarAuthTime ? new Date(lastCalendarAuthTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ninguno'}
                </span>
              </div>

              <button
                onClick={() => connectCalendar()}
                disabled={calendarStatus === 'connecting' || calendarStatus === 'authorizing' || calendarStatus === 'sincronizando'}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 font-extrabold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {calendarStatus === 'connecting' || calendarStatus === 'authorizing' || calendarStatus === 'sincronizando' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span>Reconectar Calendar</span>
                )}
              </button>

              {calendarError && (
                <p className="text-[9px] text-rose-500 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-100">
                  {calendarError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Servicio 3: Google Sheets */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600" />
              <div>
                <span className="font-extrabold text-slate-800 block text-xs leading-none mb-1">Google Sheets</span>
                <span className="text-[9px] text-slate-400">Exportación de reporte completo estructurado</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-slate-100/70 pt-2.5">
            <div className="flex items-center justify-between text-[9px]">
              <span>Estado de Autorización:</span>
              <span className={`font-bold uppercase ${
                sheetsStatus === 'connected' || sheetsStatus === 'exportado' ? 'text-emerald-600' :
                sheetsStatus === 'error' ? 'text-rose-500 animate-pulse' :
                'text-slate-400'
              }`}>
                {sheetsStatus === 'connected' || sheetsStatus === 'exportado' ? 'Conectado ✅' :
                 sheetsStatus === 'authorizing' || sheetsStatus === 'connecting' || sheetsStatus === 'exportando' ? 'Conectando...' :
                 sheetsStatus === 'error' ? 'Error ❌' : 'Sin permiso ⚠️'}
              </span>
            </div>

            <div className="flex justify-between text-[9px]">
              <span>Última autorización:</span>
              <span className="font-bold text-slate-700">
                {lastSheetsAuthTime ? new Date(lastSheetsAuthTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ninguna'}
              </span>
            </div>

            <button
              onClick={() => connectSheets()}
              disabled={sheetsStatus === 'connecting' || sheetsStatus === 'authorizing' || sheetsStatus === 'exportando'}
              className="w-full py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 font-extrabold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {sheetsStatus === 'connecting' || sheetsStatus === 'authorizing' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span>Reconectar Sheets</span>
              )}
            </button>

            {sheetsError && (
              <p className="text-[9px] text-rose-500 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-100">
                {sheetsError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── SECCIÓN 3: ACCIONES MANUALES DE RESPALDO Y CONFIGURACIÓN ───────── */}
      {databaseSpreadsheetId && (
        <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-500" />
            <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase">Acciones Manuales de Respaldo</h4>
          </div>
          <hr className="border-slate-50" />

          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed px-1">
            Ejecuta operaciones manuales para forzar la sincronización, inicializar la estructura u obtener copias de seguridad de tus registros médicos.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            {/* Inicializar base de datos */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px]">
              <div>
                <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Estructura Google Sheets</span>
                <p className="text-[9px] text-slate-400 leading-normal">Crea o busca la hoja de cálculo operacional en la nube.</p>
              </div>
              <button
                onClick={() => createGoogleNativeDatabase()}
                disabled={opSyncStatus === 'syncing'}
                className="mt-auto py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{databaseSpreadsheetId ? 'Verificar base' : 'Crear base Google-native'}</span>
              </button>
            </div>

            {/* Exportar Expediente */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px]">
              <div>
                <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Exportar Expediente</span>
                <p className="text-[9px] text-slate-400 leading-normal">Genera un libro premium Sheets formateado con todas las tablas.</p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting || sheetsStatus === 'exportando'}
                className="mt-auto py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                {isExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>Exportar Expediente</span>}
              </button>
            </div>

            {/* Cargar datos desde Google */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px]">
              <div>
                <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Descargar datos (Pull)</span>
                <p className="text-[9px] text-slate-400 leading-normal">Recupera la última versión en caliente guardada por otros dispositivos.</p>
              </div>
              <button
                onClick={() => pullFromGoogle()}
                disabled={opSyncStatus === 'syncing' || !databaseSpreadsheetId}
                className="mt-auto py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold rounded-xl transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Cargar desde Google</span>
              </button>
            </div>

            {/* Enviar datos locales */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-2 font-semibold text-[10px]">
              <div>
                <span className="font-extrabold text-slate-800 block text-[11px] mb-0.5">Subir datos (Push)</span>
                <p className="text-[9px] text-slate-400 leading-normal">Fuerza la subida del estado local actual a la hoja de cálculo remota.</p>
              </div>
              <button
                onClick={() => pushToGoogle()}
                disabled={opSyncStatus === 'syncing' || !databaseSpreadsheetId}
                className="mt-auto py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold rounded-xl transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Enviar cambios locales</span>
              </button>
            </div>
          </div>

          {/* Enlaces de interés y meta */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2.5 font-semibold text-[10px] text-slate-500 mt-1">
            {databaseSpreadsheetUrl && (
              <a
                href={databaseSpreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-extrabold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 text-center text-[10px] w-full"
              >
                <Grid3X3 className="h-4 w-4" />
                <span>Ver hoja operacional (Sheets)</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {lastExportMetadata && lastExportMetadata.spreadsheetUrl && (
              <a
                href={lastExportMetadata.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold rounded-xl transition-colors flex items-center justify-center gap-1.5 text-center text-[9px] w-full"
              >
                <span>Abrir último expediente exportado</span>
                <ExternalLink className="h-3 w-3 animate-none" />
              </a>
            )}

            <div className="flex justify-between text-[9px] border-t border-slate-200/50 pt-2.5">
              <span>ID Hoja de Cálculo:</span>
              <span className="font-bold text-slate-700 truncate max-w-[200px]">{databaseSpreadsheetId || 'Ninguna'}</span>
            </div>

            <div className="flex justify-between text-[9px]">
              <span>Identificador del dispositivo:</span>
              <span className="font-bold text-slate-700 truncate max-w-[200px]">{deviceId || 'N/A'}</span>
            </div>
          </div>
        </section>
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
