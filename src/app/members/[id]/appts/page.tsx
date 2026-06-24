'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Calendar, 
  Plus, 
  MapPin, 
  Clock, 
  ChevronDown, 
  FileText,
  Save,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { HealthEventStatus } from '@/domain/models';

export default function AppointmentsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { 
    user, 
    members, 
    appointments, 
    addAppointment, 
    updateAppointmentStatus, 
    isLoading,
    calendarSyncEnabled,
    calendarStatus,
    calendarError,
    syncAppointmentToCalendar,
    pushToGoogle,
    syncNow,
    isFirebaseBackend
  } = useApp();

  const [filter, setFilter] = useState<HealthEventStatus | 'ALL'>('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  
  // New appointment form state
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('Pediatría');
  const [scheduledAt, setScheduledAt] = useState('2026-06-05T09:00');
  const [location, setLocation] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

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

  const member = members.find(m => m.id === id);

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <h3 className="font-extrabold text-slate-800 text-lg">Familiar no encontrado</h3>
      </div>
    );
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorName || !reason) return;

    addAppointment({
      memberId: id,
      doctorName,
      specialty,
      scheduledAt,
      location,
      reason,
      notes: notes || null,
      status: 'SCHEDULED'
    });

    // Reset form
    setDoctorName('');
    setLocation('');
    setReason('');
    setNotes('');
    setShowAddForm(false);
  };

  const filteredAppts = appointments.filter(a => {
    const isMember = a.memberId === id;
    const isNotPurged = (a.retentionStatus || 'ACTIVE') !== 'PURGED';
    if (!isNotPurged) return false;
    if (filter === 'ALL') return isMember;
    return isMember && a.status === filter;
  }).sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()); // Latest first

  const getStatusBadge = (status: HealthEventStatus) => {
    switch (status) {
      case 'SCHEDULED':
        return <span className="text-[10px] font-extrabold bg-teal-50 text-teal-600 px-2.5 py-0.5 rounded-full border border-teal-600/10">Programada</span>;
      case 'COMPLETED':
        return <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-600/10">Completada</span>;
      case 'OVERDUE':
        return <span className="text-[10px] font-extrabold bg-rose-50 text-rose-600 px-2.5 py-0.5 rounded-full border border-rose-600/10">Vencida</span>;
      case 'CANCELLED':
        return <span className="text-[10px] font-extrabold bg-slate-50 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200">Cancelada</span>;
      default:
        return null;
    }
  };

  const getSheetsSyncBadge = (appt: any) => {
    const status = appt.syncStatus || 'PENDING_SYNC';
    switch (status) {
      case 'SYNCED':
        return (
          <span className="text-[9px] font-extrabold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full border border-teal-600/10 uppercase">
            ✓ Nube Sheets
          </span>
        );
      case 'PENDING_SYNC':
        return (
          <span className="text-[9px] font-extrabold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-600/10 uppercase animate-pulse">
            Pendiente Sheets
          </span>
        );
      case 'SYNC_ERROR':
        return (
          <span className="text-[9px] font-extrabold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-600/10 uppercase">
            Error Sheets
          </span>
        );
      case 'LOCAL_ONLY':
      default:
        return (
          <span className="text-[9px] font-extrabold bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full border border-slate-200 uppercase">
            Local Only
          </span>
        );
    }
  };

  const getCalendarSyncBadge = (appt: any) => {
    const status = appt.calendarSyncStatus || 'LOCAL_ONLY';
    switch (status) {
      case 'SYNCED':
        return (
          <span className="text-[9px] font-extrabold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full border border-teal-600/10 uppercase">
            ✓ Calendar
          </span>
        );
      case 'PENDING_CALENDAR_SYNC':
      case 'PENDING_SYNC':
        return (
          <span className="text-[9px] font-extrabold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-600/10 uppercase animate-pulse">
            Pendiente Calendar
          </span>
        );
      case 'SYNC_ERROR':
        return (
          <span className="text-[9px] font-extrabold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-600/10 uppercase">
            Error Calendar
          </span>
        );
      case 'LOCAL_ONLY':
      default:
        return (
          <span className="text-[9px] font-extrabold bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full border border-slate-200 uppercase">
            Local Only
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Navigation Header */}
      <section className="flex justify-between items-center">
        <Link 
          href={`/members/${id}`} 
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al perfil</span>
        </Link>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md active:translate-y-0.5 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          <span>Programar cita</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Citas Médicas de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Historial y agenda de consultas con especialistas.</p>
      </section>

      {/* Filters row */}
      <section className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
        {[
          { label: 'Todas', value: 'ALL' },
          { label: 'Programadas', value: 'SCHEDULED' },
          { label: 'Completadas', value: 'COMPLETED' },
          { label: 'Vencidas', value: 'OVERDUE' }
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value as any)}
            className={`px-4 h-9.5 text-xs font-bold rounded-full transition-all duration-200 shrink-0 ${
              filter === item.value 
                ? 'bg-slate-800 text-white' 
                : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </section>

      {/* Appointments List */}
      <section className="flex flex-col gap-3.5">
        {filteredAppts.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <Calendar className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">No hay citas médicas</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              No se encontraron citas correspondientes al filtro seleccionado.
            </p>
          </div>
        ) : (
          filteredAppts.map((appt) => (
            <div 
              key={appt.id}
              className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 leading-tight mb-0.5">{appt.doctorName}</h4>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-bold">{appt.specialty}</span>
                    {!isFirebaseBackend && (
                      <>
                        <span className="text-slate-300 text-[10px]">·</span>
                        {getSheetsSyncBadge(appt)}
                      </>
                    )}
                    <span className="text-slate-300 text-[10px]">·</span>
                    {getCalendarSyncBadge(appt)}
                  </div>
                </div>
                {getStatusBadge(appt.status)}
              </div>

              <hr className="border-slate-50" />

              {/* Time and location */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Clock className="h-4 w-4 text-teal-600" />
                  <span>Programada: {new Date(appt.scheduledAt).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {appt.status === 'COMPLETED' && appt.completedAt && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CheckCircle className="h-4 w-4 text-emerald-600 animate-pulse" />
                    <span>Realizada el: {new Date(appt.completedAt).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                {appt.location && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <MapPin className="h-4 w-4 text-rose-500" />
                    <span>{appt.location}</span>
                  </div>
                )}
                {/* Retention warnings */}
                {appt.status === 'COMPLETED' && (
                  <p className="text-[9px] text-slate-400 font-bold px-1 italic">
                    ℹ Política de retención: Esta cita será depurada el {new Date(new Date(appt.completedAt || appt.scheduledAt).getTime() + 2 * 365 * 24 * 60 * 60 * 1000).toLocaleDateString('es-CO')}.
                  </p>
                )}
                {appt.status === 'SCHEDULED' && (
                  <p className="text-[9px] text-slate-400 font-bold px-1 italic">
                    ℹ Política de retención: Si no se marca como completada, se depurará el {new Date(new Date(appt.scheduledAt).getTime() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('es-CO')}.
                  </p>
                )}
              </div>

              {/* Reason */}
              <div className="p-3 bg-slate-50/50 rounded-xl">
                <span className="text-[9px] text-slate-400 font-extrabold block leading-none mb-1 uppercase">Motivo de consulta</span>
                <p className="text-xs text-slate-600 font-semibold">{appt.reason}</p>
                {appt.notes && (
                  <>
                    <hr className="border-slate-100 my-2" />
                    <span className="text-[9px] text-slate-400 font-extrabold block leading-none mb-1 uppercase">Indicaciones / Preparación</span>
                    <p className="text-xs text-slate-500 font-semibold italic">{appt.notes}</p>
                  </>
                )}
              </div>

              {/* Completing appt shortcut */}
              {appt.status === 'SCHEDULED' && (
                <div className="flex gap-2 justify-end mt-1">
                  <button 
                    onClick={() => updateAppointmentStatus(appt.id, 'COMPLETED')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-extrabold rounded-lg transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Marcar Completada
                  </button>
                  <button 
                    onClick={() => updateAppointmentStatus(appt.id, 'CANCELLED')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 text-[10px] font-extrabold rounded-lg transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                </div>
              )}

              {/* Cloud Integration Panel */}
              <div className="flex flex-col gap-2 mt-1 text-[11px] font-semibold bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    {/* Google Sheets Sync Info */}
                    {!isFirebaseBackend && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="font-extrabold text-[10px] uppercase text-slate-400">Base de Datos:</span>
                        {appt.syncStatus === 'SYNCED' ? (
                          <span className="text-teal-600">✓ Sincronizado en la Base Operacional</span>
                        ) : appt.syncStatus === 'SYNC_ERROR' ? (
                          <span className="text-rose-600 font-semibold">Error al sincronizar con Sheets</span>
                        ) : (
                          <span className="text-amber-600 animate-pulse">Pendiente de sincronizar</span>
                        )}
                      </div>
                    )}
                    {/* Google Calendar Sync Info */}
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <span className="font-extrabold text-[10px] uppercase text-slate-400">Google Calendar:</span>
                      {appt.calendarSyncStatus === 'SYNCED' ? (
                        <span className="text-teal-600">✓ Evento creado</span>
                      ) : appt.calendarSyncStatus === 'SYNC_ERROR' ? (
                        <span className="text-rose-600 font-semibold truncate max-w-[200px]" title={appt.calendarError || ''}>
                          {appt.calendarError || 'Error de sincronización'}
                        </span>
                      ) : (
                        <span className="text-amber-600 animate-pulse">Pendiente de crear evento</span>
                      )}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {!isFirebaseBackend && appt.syncStatus !== 'SYNCED' && (
                      <button
                        onClick={async () => {
                          try {
                            await syncNow();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="text-[10px] font-black text-amber-700 hover:text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-100 transition-colors"
                      >
                        Reintentar subir a Google
                      </button>
                    )}
                    {appt.calendarSyncStatus !== 'SYNCED' && (
                      <button
                        onClick={() => syncAppointmentToCalendar(appt.id, undefined, true)}
                        className="text-[10px] font-black text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100 transition-colors"
                      >
                        Reintentar Calendar
                      </button>
                    )}
                    {appt.googleCalendarHtmlLink && (
                      <a
                        href={appt.googleCalendarHtmlLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-black text-teal-600 hover:text-teal-700 bg-teal-50 px-2.5 py-1.5 rounded-lg border border-teal-100 flex items-center gap-1 transition-colors"
                      >
                        <span>Abrir en Calendar</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Add Appointment Modal Backdrop */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          {/* Card */}
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Programar Nueva Cita</h3>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Doctor */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Nombre del Médico</label>
                <input
                  type="text"
                  required
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Ej. Dr. Andrés Restrepo"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>
 
              {/* Specialty */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Especialidad</label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="Medicina General">Medicina General</option>
                  <option value="Pediatría">Pediatría</option>
                  <option value="Cardiología">Cardiología</option>
                  <option value="Ginecología">Ginecología</option>
                  <option value="Odontología">Odontología</option>
                  <option value="Oftalmología">Oftalmología</option>
                  <option value="Dermatología">Dermatología</option>
                </select>
              </div>
 
              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha y Hora</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                />
              </div>
 
              {/* Location */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Lugar de Consulta</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej. Centro Médico Sura 100"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>
 
              {/* Reason */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Motivo / Síntomas</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. Fiebre persistente o chequeo general"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>
 
              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Notas adicionales (Opcional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Llevar ayunas de 8 horas, reportes previos..."
                  className="h-16 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
                />
              </div>
 
              {/* Actions */}
              <div className="flex gap-2.5 mt-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  <span>Programar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Sincronización Overlay */}
      {(calendarStatus === 'connecting' || calendarStatus === 'authorizing' || calendarStatus === 'sincronizando') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center gap-5 text-center">
            <Loader2 className="h-10 w-10 text-teal-600 animate-spin" />
            <div>
              <h4 className="text-sm font-extrabold text-slate-800 mb-1">
                {calendarStatus === 'connecting' ? 'Conectando con Google Calendar' :
                 calendarStatus === 'authorizing' ? 'Esperando autorización' :
                 'Sincronizando cita...'}
              </h4>
              <p className="text-xs text-slate-400 px-2 leading-relaxed">
                {calendarStatus === 'authorizing' 
                  ? 'Por favor, concede permisos en la ventana de Google...' 
                  : 'Registrando el evento con alertas automáticas (1 día y 3 horas antes)...'}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
