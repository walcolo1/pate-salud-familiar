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
  Clock
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
    revokeDocumentShare
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

      {/* Google Integration Services */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Servicios de Google</h4>
        <hr className="border-slate-50" />

        {/* Sync with Drive */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight mb-0.5">Sincronizar con Google Drive</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">Respaldo privado de PDFs y recetas clínicas</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setDriveSync(!driveSyncEnabled)}
            className={`w-12 h-6.5 rounded-full p-1.5 transition-colors duration-200 focus:outline-none ${
              driveSyncEnabled ? 'bg-teal-600 flex justify-end' : 'bg-slate-200 flex justify-start'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white shadow" />
          </button>
        </div>

        {/* Google Drive Status Section */}
        {driveSyncEnabled && (
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500 leading-relaxed -mt-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-600">Estado de Google Drive:</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  driveStatus === 'connected' || driveStatus === 'subido' ? 'bg-emerald-500' :
                  driveStatus === 'error' ? 'bg-rose-500 animate-pulse' :
                  driveStatus === 'authorizing' || driveStatus === 'connecting' || driveStatus === 'subiendo' ? 'bg-blue-500 animate-pulse' :
                  'bg-slate-400'
                }`} />
                <span className="text-[11px] font-bold uppercase text-slate-700">
                  {driveStatus === 'connected' || driveStatus === 'subido' ? 'Conectado' :
                   driveStatus === 'authorizing' ? 'Esperando autorización' :
                   driveStatus === 'connecting' ? 'Conectando...' :
                   driveStatus === 'subiendo' ? 'Subiendo...' :
                   driveStatus === 'error' ? 'Error' : 'No conectado'}
                </span>
              </div>
            </div>

            <div className="flex justify-between text-[9px]">
              <span>Último permiso otorgado:</span>
              <span className="font-bold text-slate-700">
                {lastDriveAuthTime ? new Date(lastDriveAuthTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Ninguno en esta sesión'}
              </span>
            </div>

            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100/60 text-amber-700 text-[9px] flex flex-col gap-1">
              <span className="font-bold">⚠ Consentimiento Requerido:</span>
              <p>Por políticas de seguridad, el token de acceso se almacena temporalmente solo en memoria. Google Drive requiere autorización manual en cada nueva sesión.</p>
            </div>

            <button
              onClick={() => connectDrive()}
              disabled={driveStatus === 'connecting' || driveStatus === 'authorizing' || driveStatus === 'subiendo'}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              {driveStatus === 'connecting' || driveStatus === 'authorizing' || driveStatus === 'subiendo' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Autorizando...</span>
                </>
              ) : (
                <span>Autorizar Google Drive</span>
              )}
            </button>

            {driveError && (
              <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/60 text-rose-600 text-[9px] flex flex-col gap-1">
                <strong>Error de autorización:</strong>
                <p className="font-semibold leading-relaxed">
                  {driveError.toLowerCase().includes('access_denied') || driveError.toLowerCase().includes('403')
                    ? 'La cuenta no está autorizada como tester en Google Cloud. Agrega este correo en OAuth Test Users y vuelve a intentar.'
                    : driveError}
                </p>
              </div>
            )}
          </div>
        )}

        <hr className="border-slate-50 my-1" />

        {/* Sync with Calendar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight mb-0.5">Sincronizar con Google Calendar</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">Guarda las citas médicas y recibe alertas automáticas</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setCalendarSync(!calendarSyncEnabled)}
            className={`w-12 h-6.5 rounded-full p-1.5 transition-colors duration-200 focus:outline-none ${
              calendarSyncEnabled ? 'bg-teal-600 flex justify-end' : 'bg-slate-200 flex justify-start'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white shadow" />
          </button>
        </div>

        {/* Google Calendar Status Section */}
        {calendarSyncEnabled && (
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500 leading-relaxed -mt-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-600">Estado de Google Calendar:</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  calendarStatus === 'connected' || calendarStatus === 'sincronizado' ? 'bg-emerald-500' :
                  calendarStatus === 'error' ? 'bg-rose-500 animate-pulse' :
                  calendarStatus === 'authorizing' || calendarStatus === 'connecting' || calendarStatus === 'sincronizando' ? 'bg-blue-500 animate-pulse' :
                  'bg-slate-400'
                }`} />
                <span className="text-[11px] font-bold uppercase text-slate-700">
                  {calendarStatus === 'connected' || calendarStatus === 'sincronizado' ? 'Conectado' :
                   calendarStatus === 'authorizing' ? 'Esperando autorización' :
                   calendarStatus === 'connecting' ? 'Conectando...' :
                   calendarStatus === 'sincronizando' ? 'Sincronizando...' :
                   calendarStatus === 'error' ? 'Error' : 'No conectado'}
                </span>
              </div>
            </div>

            <div className="flex justify-between text-[9px]">
              <span>Último permiso otorgado:</span>
              <span className="font-bold text-slate-700">
                {lastCalendarAuthTime ? new Date(lastCalendarAuthTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Ninguno en esta sesión'}
              </span>
            </div>

            <div className="bg-teal-50/50 p-2.5 rounded-xl border border-teal-100/40 text-teal-800 text-[9px] flex flex-col gap-1">
              <span className="font-bold">📅 Alertas Automáticas:</span>
              <p>Las citas médicas se guardarán en tu Google Calendar y programarán recordatorios emergentes automáticamente <strong>1 día antes</strong> y <strong>3 horas antes</strong> de la consulta.</p>
              <p className="mt-1">Por políticas de seguridad, el token se mantiene solo en memoria y expira al cerrar la pestaña.</p>
            </div>

            <button
              onClick={() => connectCalendar()}
              disabled={calendarStatus === 'connecting' || calendarStatus === 'authorizing' || calendarStatus === 'sincronizando'}
              className="w-full py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              {calendarStatus === 'connecting' || calendarStatus === 'authorizing' || calendarStatus === 'sincronizando' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Autorizando...</span>
                </>
              ) : (
                <span>Autorizar Google Calendar</span>
              )}
            </button>

            {calendarError && (
              <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/60 text-rose-600 text-[9px] flex flex-col gap-1">
                <strong>Error de autorización:</strong>
                <p className="font-semibold leading-relaxed">
                  {calendarError.toLowerCase().includes('access_denied') || calendarError.toLowerCase().includes('403')
                    ? 'La cuenta no está autorizada como tester en Google Calendar OAuth. Agrega este correo en OAuth Test Users y vuelve a intentar.'
                    : calendarError}
                </p>
              </div>
            )}
          </div>
        )}

        <hr className="border-slate-50 my-1" />

        {/* Google Sheets Export */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h5 className="text-xs font-extrabold text-slate-800 leading-tight mb-0.5">Exportar a Google Sheets</h5>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">Organiza y genera un expediente clínico familiar en hojas de cálculo</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500 leading-relaxed">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-600">Estado de Google Sheets:</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  sheetsStatus === 'connected' || sheetsStatus === 'exportado' ? 'bg-emerald-500' :
                  sheetsStatus === 'error' ? 'bg-rose-500 animate-pulse' :
                  sheetsStatus === 'authorizing' || sheetsStatus === 'connecting' || sheetsStatus === 'exportando' ? 'bg-blue-500 animate-pulse' :
                  'bg-slate-400'
                }`} />
                <span className="text-[11px] font-bold uppercase text-slate-700">
                  {sheetsStatus === 'connected' || sheetsStatus === 'exportado' ? 'Conectado' :
                   sheetsStatus === 'authorizing' ? 'Esperando autorización' :
                   sheetsStatus === 'connecting' ? 'Conectando...' :
                   sheetsStatus === 'exportando' ? 'Exportando...' :
                   sheetsStatus === 'error' ? 'Error' : 'No conectado'}
                </span>
              </div>
            </div>

            <div className="flex justify-between text-[9px]">
              <span>Última autorización:</span>
              <span className="font-bold text-slate-700">
                {lastSheetsAuthTime ? new Date(lastSheetsAuthTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Ninguna en esta sesión'}
              </span>
            </div>

            <div className="flex flex-col gap-2 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100/40 text-emerald-800 text-[9px]">
              <span className="font-bold">📊 Expediente Estructurado:</span>
              <p>Genera 10 pestañas (Resumen, Miembros, Citas, Vacunas, Exámenes, Documentos, Fichas, etc.) con formato premium y congelación de paneles.</p>
              <p className="mt-1">Los datos se exportan directamente desde tu base local de forma segura.</p>
            </div>

            {/* Acciones de autorización y exportación */}
            <div className="flex gap-2">
              <button
                onClick={() => connectSheets()}
                disabled={sheetsStatus === 'connecting' || sheetsStatus === 'authorizing' || sheetsStatus === 'exportando'}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                {sheetsStatus === 'connecting' || sheetsStatus === 'authorizing' ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Autorizando...</span>
                  </>
                ) : (
                  <span>Autorizar Sheets</span>
                )}
              </button>

              <button
                onClick={handleExport}
                disabled={isExporting || sheetsStatus === 'exportando'}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                {isExporting || sheetsStatus === 'exportando' ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Exportando...</span>
                  </>
                ) : (
                  <span>Exportar Expediente</span>
                )}
              </button>
            </div>

            {/* Metadatos del último reporte exportado */}
            {lastExportMetadata && lastExportMetadata.sheetsSyncStatus === 'EXPORTED' && (
              <div className="p-3 bg-emerald-50 border border-emerald-100/80 rounded-xl flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>✓ Expediente exportado con éxito</span>
                </div>
                <div className="text-[9px] text-emerald-700 space-y-1">
                  <p><strong>Fecha:</strong> {lastExportMetadata.exportedAt ? new Date(lastExportMetadata.exportedAt).toLocaleString('es-CO') : 'Desconocido'}</p>
                  <p><strong>Exportado por:</strong> {lastExportMetadata.exportedBy || 'N/A'}</p>
                </div>
                {lastExportMetadata.spreadsheetUrl && (
                  <a 
                    href={lastExportMetadata.spreadsheetUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] font-extrabold text-emerald-800 underline hover:text-emerald-950 mt-1 self-start flex items-center gap-1"
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                    <span>Abrir hoja exportada</span>
                  </a>
                )}
              </div>
            )}

            {/* Errores de exportación/autenticación */}
            {(sheetsError || (lastExportMetadata && lastExportMetadata.sheetsSyncStatus === 'ERROR')) && (
              <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/60 text-rose-600 text-[9px] flex flex-col gap-1 mt-1">
                <strong>Error en Google Sheets:</strong>
                <p className="font-semibold leading-relaxed">
                  {(sheetsError || lastExportMetadata?.sheetsError || '').toLowerCase().includes('access_denied') || (sheetsError || lastExportMetadata?.sheetsError || '').toLowerCase().includes('403')
                    ? 'La cuenta no está autorizada como tester en Google Cloud. Agrega este correo en OAuth Test Users y vuelve a intentar.'
                    : (sheetsError || lastExportMetadata?.sheetsError || 'Error desconocido al sincronizar.')}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Capa de Persistencia Google-native Foundation */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-extrabold text-xs text-slate-800 tracking-wide uppercase px-1">Base de Datos Google-native</h4>
            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed px-1">Tus datos médicos estructurados viven 100% en tu propia cuenta Google</p>
          </div>
          <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase leading-none ${
            opSyncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            opSyncStatus === 'syncing' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
            opSyncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
            'bg-slate-50 text-slate-400 border-slate-200'
          }`}>
            {opSyncStatus === 'synced' ? 'Sincronizado' :
             opSyncStatus === 'syncing' ? 'Sincronizando' :
             opSyncStatus === 'error' ? 'Error' : 'No conectada'}
          </span>
        </div>
        
        <hr className="border-slate-50" />

        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 font-semibold text-[10px] text-slate-500 leading-relaxed">
          <div className="flex justify-between">
            <span>Dueño de la Base:</span>
            <span className="font-bold text-slate-700">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span>ID Hoja Operacional:</span>
            <span className="font-bold text-slate-700 truncate max-w-[150px]">{databaseSpreadsheetId || 'No creada'}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>Última Sincronización:</span>
            <span className="font-bold text-slate-700">{lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-CO') : 'Nunca'}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>Último Pull (Descarga):</span>
            <span className="font-bold text-slate-700">{lastPullAt ? new Date(lastPullAt).toLocaleString('es-CO') : 'Nunca'}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>Último Push (Carga):</span>
            <span className="font-bold text-slate-700">{lastPushAt ? new Date(lastPushAt).toLocaleString('es-CO') : 'Nunca'}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>Identificador Dispositivo:</span>
            <span className="font-bold text-slate-700 truncate max-w-[150px]">{deviceId || 'Desconocido'}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span>Estrategia de Conflictos:</span>
            <span className="font-bold text-slate-700">Last-Write-Wins (LWW)</span>
          </div>

          <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100/60 text-amber-700 text-[9px] flex flex-col gap-1.5 mt-1">
            <span className="font-bold">🔒 Advertencia de Privacidad Familiar:</span>
            <p>Esta base pertenece a tu cuenta Google y reside en tu Drive personal. Si compartes la hoja completa de forma manual con otras personas, podrían ver información médica confidencial de todos los familiares registrados. Se recomienda compartir archivos individuales si necesitas enviarlos a terceros.</p>
          </div>

          {opSyncError && (
            <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100/60 text-rose-600 text-[9px] flex flex-col gap-1 mt-1">
              <strong>Error de Sincronización:</strong>
              <p>{opSyncError}</p>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col gap-2 mt-2">
            {!databaseSpreadsheetId ? (
              <button
                onClick={() => createGoogleNativeDatabase()}
                disabled={opSyncStatus === 'syncing'}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                {opSyncStatus === 'syncing' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Inicializando...</span>
                  </>
                ) : (
                  <span>Crear base Google-native</span>
                )}
              </button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => syncNow()}
                    disabled={opSyncStatus === 'syncing'}
                    className="py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    {opSyncStatus === 'syncing' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span>Sincronizar ahora</span>
                    )}
                  </button>
                  <button
                    onClick={() => exportBackupJSON()}
                    className="py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Respaldar JSON</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => pullFromGoogle()}
                    disabled={opSyncStatus === 'syncing'}
                    className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-200 transition-colors"
                  >
                    <span>Cargar desde Google</span>
                  </button>
                  <button
                    onClick={() => pushToGoogle()}
                    disabled={opSyncStatus === 'syncing'}
                    className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] rounded-xl border border-slate-200 transition-colors"
                  >
                    <span>Enviar cambios locales</span>
                  </button>
                </div>

                {databaseSpreadsheetUrl && (
                  <a
                    href={databaseSpreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-extrabold text-[10px] rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 text-center mt-1"
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                    <span>Ver hoja operacional</span>
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </section>


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
          
          <div className="grid grid-cols-2 gap-2.5 mt-1">
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
                if (window.confirm('¿Estás seguro de que deseas eliminar TODOS los datos locales de salud familiar? Esta acción no se puede deshacer.')) {
                  clearAllData();
                  alert('Datos locales eliminados. Por favor inicia sesión de nuevo.');
                  router.push('/login');
                }
              }}
              className="h-10 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-100 animate-pulse"
            >
              <Trash2 className="h-4 w-4" />
              <span>Limpiar Datos</span>
            </button>
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
