'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Plus, 
  Save, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ExternalLink, 
  Loader2, 
  FileText, 
  Calendar,
  Sparkles,
  Pill,
  Heart,
  Ban,
  Activity,
  History,
  Trash2,
  AlertCircle,
  TrendingUp,
  FileCheck
} from 'lucide-react';
import { MedicationPrescription, MedicationDoseReminder, DoseReminderStatus, PrescriptionStatus, FrequencyType, QuantityUnit } from '@/domain/models';

const frequencyLabelMap: Record<FrequencyType, string> = {
  ONCE_DAILY: 'Una vez al día (08:00)',
  TWICE_DAILY: 'Dos veces al día (08:00, 20:00)',
  THREE_TIMES_DAILY: 'Tres veces al día (08:00, 14:00, 20:00)',
  EVERY_X_HOURS: 'Cada X horas',
  SPECIFIC_TIMES: 'Horarios específicos',
  OTHER: 'Otro esquema'
};

const statusLabelMap: Record<PrescriptionStatus, string> = {
  ACTIVE: 'Activo',
  COMPLETED: 'Finalizado',
  SUSPENDED: 'Suspendido',
  CANCELLED: 'Cancelado'
};

export default function MedicationsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { 
    user, 
    members, 
    medicationPrescriptions, 
    medicationDoseReminders,
    documents,
    addMedicationPrescription, 
    updateMedicationPrescription, 
    deleteMedicationPrescription,
    markDoseReminder,
    isLoading,
    calendarSyncEnabled,
    calendarStatus
  } = useApp();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>('tablets');
  const [durationDays, setDurationDays] = useState(5);
  const [frequencyType, setFrequencyType] = useState<FrequencyType>('ONCE_DAILY');
  const [frequencyIntervalHours, setFrequencyIntervalHours] = useState(8);
  const [specificTimes, setSpecificTimes] = useState<string[]>(['08:00']);
  const [newTimeInput, setNewTimeInput] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [syncToCalendarInput, setSyncToCalendarInput] = useState(true);

  // Warnings confirmations
  const [durationConfirmed, setDurationConfirmed] = useState(false);
  const [calendarExcessConfirmed, setCalendarExcessConfirmed] = useState(false);

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

  // Filter Prescriptions for this member
  const memberPrescriptions = medicationPrescriptions.filter(
    p => p.memberId === id && !p.deletedAt
  );

  const activePrescriptions = memberPrescriptions.filter(p => p.status === 'ACTIVE');
  const inactivePrescriptions = memberPrescriptions.filter(
    p => p.status === 'COMPLETED' || p.status === 'SUSPENDED' || p.status === 'CANCELLED'
  );

  // Filter Dose Reminders for today
  const todayStr = new Date().toISOString().split('T')[0];
  const memberDoses = medicationDoseReminders.filter(
    d => d.memberId === id && !d.deletedAt
  );

  const todayDoses = memberDoses
    .filter(d => d.scheduledAt.startsWith(todayStr))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // Dynamic calculations for dynamic estimated doses
  const calculateEstimatedDoses = (): number => {
    if (durationDays <= 0) return 0;
    
    let dosesPerDay = 1;
    if (frequencyType === 'EVERY_X_HOURS' && frequencyIntervalHours > 0) {
      dosesPerDay = 24 / frequencyIntervalHours;
    } else if (frequencyType === 'SPECIFIC_TIMES') {
      dosesPerDay = specificTimes.length;
    } else if (frequencyType === 'TWICE_DAILY') {
      dosesPerDay = 2;
    } else if (frequencyType === 'THREE_TIMES_DAILY') {
      dosesPerDay = 3;
    } else if (frequencyType === 'ONCE_DAILY') {
      dosesPerDay = 1;
    }

    return Math.ceil(dosesPerDay * durationDays);
  };

  const estimatedDoses = calculateEstimatedDoses();
  const showDurationWarning = durationDays > 180;
  const showCalendarWarning = syncToCalendarInput && estimatedDoses > 20;

  const handleAddTime = () => {
    if (!newTimeInput) return;
    if (specificTimes.includes(newTimeInput)) return;
    setSpecificTimes([...specificTimes, newTimeInput].sort());
    setNewTimeInput('');
  };

  const handleRemoveTime = (time: string) => {
    setSpecificTimes(specificTimes.filter(t => t !== time));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || durationDays <= 0) return;

    // Check custom rules warning before submit
    if (showDurationWarning && !durationConfirmed) {
      alert('Por favor confirma la advertencia de duración de tratamiento mayor a 180 días.');
      return;
    }

    if (showCalendarWarning && !calendarExcessConfirmed) {
      const proceed = window.confirm(
        `Atención: Sincronizarás más de 20 eventos (${estimatedDoses}) en Google Calendar. Esto puede tomar unos instantes y saturar tu agenda. ¿Deseas continuar?`
      );
      if (!proceed) {
        return;
      }
      setCalendarExcessConfirmed(true);
    }

    // Calculate endDate: startDate + durationDays
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000 - 60000);
    const endDate = end.toISOString().split('T')[0];

    addMedicationPrescription({
      memberId: id,
      name,
      dose,
      quantity,
      quantityUnit,
      durationDays,
      frequencyType,
      frequencyIntervalHours: frequencyType === 'EVERY_X_HOURS' ? frequencyIntervalHours : null,
      specificTimes: frequencyType === 'SPECIFIC_TIMES' ? specificTimes : null,
      instructions: instructions || null,
      prescribedBy: prescribedBy || null,
      documentId: documentId || null,
      startDate,
      endDate,
      status: 'ACTIVE'
    });

    // Reset Form
    setName('');
    setDose('');
    setQuantity(1);
    setQuantityUnit('tablets');
    setDurationDays(5);
    setFrequencyType('ONCE_DAILY');
    setFrequencyIntervalHours(8);
    setSpecificTimes(['08:00']);
    setInstructions('');
    setPrescribedBy('');
    setDocumentId('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setSyncToCalendarInput(true);
    setDurationConfirmed(false);
    setCalendarExcessConfirmed(false);
    setShowAddForm(false);
  };

  // Get prescription stats helper (progress bar)
  const getPrescriptionStats = (prescriptionId: string) => {
    const doses = memberDoses.filter(d => d.prescriptionId === prescriptionId);
    const total = doses.length;
    const taken = doses.filter(d => d.status === 'TAKEN').length;
    const skipped = doses.filter(d => d.status === 'SKIPPED').length;
    const missed = doses.filter(d => d.status === 'MISSED').length;
    const pending = doses.filter(d => d.status === 'PENDING').length;

    const processed = total - pending;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

    return { total, taken, skipped, missed, pending, percent };
  };

  const getDoseStatusBadge = (status: DoseReminderStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="text-[10px] font-extrabold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-600/10">Pendiente</span>;
      case 'TAKEN':
        return <span className="text-[10px] font-extrabold bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full border border-teal-600/10">Tomado</span>;
      case 'SKIPPED':
        return <span className="text-[10px] font-extrabold bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full border border-slate-200">Omitido</span>;
      case 'MISSED':
        return <span className="text-[10px] font-extrabold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-600/10">No Tomado</span>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: PrescriptionStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-600/10 shrink-0">Activo</span>;
      case 'COMPLETED':
        return <span className="text-[10px] font-extrabold bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-600/10 shrink-0">Finalizado</span>;
      case 'SUSPENDED':
        return <span className="text-[10px] font-extrabold bg-amber-50 text-amber-600 px-2.5 py-0.5 rounded-full border border-amber-600/10 shrink-0">Suspendido</span>;
      case 'CANCELLED':
        return <span className="text-[10px] font-extrabold bg-slate-50 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200 shrink-0">Cancelado</span>;
      default:
        return null;
    }
  };

  // Find prescription documents (Prescriptions)
  const prescriptionDocs = documents.filter(
    d => d.memberId === id && !d.deletedAt && (d.documentType === 'PRESCRIPTION' || d.documentType === 'MEDICAL_ORDER' || d.documentType === 'OTHER')
  );

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
          <span>Registrar Medicamento</span>
        </button>
      </section>

      {/* Header Info & Medical Disclaimer */}
      <section className="flex flex-col gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Medicamentos de {member.fullName.split(' ')[0]}</h3>
          <p className="text-xs font-semibold text-slate-400">Controla prescripciones médicas, dosis y recordatorios de toma.</p>
        </div>

        {/* PROMINENT MEDICAL DISCLAIMER */}
        <div className="bg-amber-50/70 border border-amber-600/10 p-4.5 rounded-3xl flex gap-3 text-xs text-amber-800 font-semibold leading-relaxed">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-extrabold">Descargo de Responsabilidad Médica</p>
            <p className="text-[11px] text-amber-700/90 mt-0.5">
              La app solo registra recordatorios según la información ingresada por el usuario. No reemplaza indicaciones médicas.
            </p>
          </div>
        </div>
      </section>

      {/* Today's Dose reminders timeline */}
      <section className="flex flex-col gap-3.5">
        <h4 className="font-extrabold text-slate-800 text-xs tracking-wide uppercase px-1">Tomas Programadas para Hoy</h4>
        
        {todayDoses.length === 0 ? (
          <div className="bg-white p-6.5 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-2">
            <Pill className="h-8 w-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-800">No hay tomas programadas para hoy</p>
            <p className="text-[10px] text-slate-400">Las tomas se generan automáticamente al registrar un medicamento activo.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {todayDoses.map((dose) => (
              <div 
                key={dose.id}
                className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    dose.status === 'TAKEN' ? 'bg-teal-50 text-teal-600' :
                    dose.status === 'SKIPPED' ? 'bg-slate-100 text-slate-400' :
                    dose.status === 'MISSED' ? 'bg-rose-50 text-rose-600' :
                    'bg-amber-50 text-amber-500'
                  }`}>
                    <Pill className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-extrabold text-slate-800 leading-tight mb-0.5">{dose.medicationName}</h5>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-semibold leading-none">
                      <span>Dosis: {dose.dose}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>Hora: {dose.scheduledAt.split('T')[1]}</span>
                      </span>
                      <span>·</span>
                      {getDoseStatusBadge(dose.status)}
                    </div>
                  </div>
                </div>

                {/* Dose Actions */}
                {dose.status === 'PENDING' ? (
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      onClick={() => markDoseReminder(dose.id, 'TAKEN')}
                      className="px-3.5 h-8.5 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-extrabold rounded-lg shadow-sm shadow-teal-600/10 active:translate-y-0.5 transition-all duration-150"
                    >
                      Tomar
                    </button>
                    <button
                      onClick={() => markDoseReminder(dose.id, 'SKIPPED')}
                      className="px-3.5 h-8.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-extrabold rounded-lg transition-all duration-150"
                    >
                      Omitir
                    </button>
                    <button
                      onClick={() => markDoseReminder(dose.id, 'MISSED')}
                      className="px-3.5 h-8.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-extrabold rounded-lg border border-rose-200/40 transition-all duration-150"
                    >
                      No Tomar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 self-end sm:self-auto leading-none">
                    {dose.takenAt && (
                      <span>Registrado: {new Date(dose.takenAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    <button
                      onClick={() => markDoseReminder(dose.id, 'PENDING')}
                      className="text-[10px] text-teal-600 hover:underline font-bold"
                    >
                      Cambiar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tabs list (Active vs History) */}
      <section className="flex items-center border-b border-slate-100 gap-6">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`pb-3 text-xs font-extrabold tracking-wide uppercase transition-all duration-200 relative ${
            activeTab === 'ACTIVE' 
              ? 'text-teal-600' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>Tratamientos Activos ({activePrescriptions.length})</span>
          {activeTab === 'ACTIVE' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.75 bg-teal-600 rounded-full animate-in fade-in slide-in-from-bottom-1 duration-150" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('INACTIVE')}
          className={`pb-3 text-xs font-extrabold tracking-wide uppercase transition-all duration-200 relative ${
            activeTab === 'INACTIVE' 
              ? 'text-teal-600' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>Historial / Inactivos ({inactivePrescriptions.length})</span>
          {activeTab === 'INACTIVE' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.75 bg-teal-600 rounded-full animate-in fade-in slide-in-from-bottom-1 duration-150" />
          )}
        </button>
      </section>

      {/* Prescriptions List Grid */}
      <section className="flex flex-col gap-4">
        {activeTab === 'ACTIVE' ? (
          activePrescriptions.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
              <Activity className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-800">No hay medicamentos activos</p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Registra tus prescripciones para calcular automáticamente tus tomas y recibir alertas de recordatorio.
              </p>
            </div>
          ) : (
            activePrescriptions.map((prescription) => {
              const stats = getPrescriptionStats(prescription.id);
              const document = documents.find(d => d.id === prescription.documentId);
              return (
                <div 
                  key={prescription.id}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl shrink-0 mt-0.5">
                        <Pill className="h-5.5 w-5.5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-800 leading-tight mb-0.5">{prescription.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold mb-1">
                          {prescription.dose} · {frequencyLabelMap[prescription.frequencyType]}
                        </p>
                        <span className="text-[9px] font-extrabold bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-slate-500 uppercase leading-none">
                          Fórmula: {prescription.quantity} {prescription.quantityUnit === 'tablets' ? 'Pastillas' : prescription.quantityUnit === 'capsules' ? 'Cápsulas' : prescription.quantityUnit === 'ml' ? 'Mililitros' : 'Unidades'}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(prescription.status)}
                  </div>

                  <hr className="border-slate-50" />

                  {/* Progress Indicator */}
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500">
                      <span>Progreso de tomas</span>
                      <span>{stats.percent}% ({stats.taken} de {stats.total} tomas)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-teal-600 transition-all duration-300"
                        style={{ width: `${stats.percent}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-4 text-center text-[9px] font-extrabold text-slate-400 gap-1.5 mt-0.5">
                      <div className="bg-slate-50 py-1 rounded">PENDIENTE: {stats.pending}</div>
                      <div className="bg-teal-50 text-teal-600 py-1 rounded">TOMADO: {stats.taken}</div>
                      <div className="bg-slate-100 text-slate-500 py-1 rounded">OMITIDO: {stats.skipped}</div>
                      <div className="bg-rose-50 text-rose-600 py-1 rounded">VENCIDO: {stats.missed}</div>
                    </div>
                  </div>

                  {/* Additional details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500 font-semibold">
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">Duración</span>
                      <span>{prescription.durationDays} días ({new Date(prescription.startDate).toLocaleDateString('es-CO')} al {new Date(prescription.endDate).toLocaleDateString('es-CO')})</span>
                    </div>
                    {prescription.prescribedBy && (
                      <div>
                        <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">Médico que formuló</span>
                        <span>{prescription.prescribedBy}</span>
                      </div>
                    )}
                  </div>

                  {prescription.instructions && (
                    <div className="p-3 bg-slate-50/50 rounded-xl">
                      <span className="text-[9px] text-slate-400 font-extrabold block leading-none mb-1 uppercase">Instrucciones de Toma</span>
                      <p className="text-xs text-slate-500 italic">{prescription.instructions}</p>
                    </div>
                  )}

                  {/* Connected support file */}
                  {document && (
                    <div className="bg-slate-50/30 p-3 rounded-2xl border border-slate-100/50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-teal-600" />
                        <span className="text-xs font-bold text-slate-700 truncate max-w-xs">{document.fileName}</span>
                      </div>
                      {document.driveUrl && (
                        <a 
                          href={document.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-teal-600 hover:underline font-extrabold flex items-center gap-0.5 shrink-0"
                        >
                          <span>Ver soporte</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Calendar Integration status */}
                  {prescription.googleCalendarEventId && (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-teal-600 bg-teal-50/30 p-2 rounded-lg border border-teal-600/10">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Sincronizado con Google Calendar como eventos individuales</span>
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex gap-2 justify-end mt-1">
                    <button
                      onClick={() => updateMedicationPrescription(prescription.id, { status: 'SUSPENDED' })}
                      className="px-3.5 h-8.5 text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-600/10 hover:bg-amber-100 rounded-xl transition-colors flex items-center gap-1"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Suspender
                    </button>
                    <button
                      onClick={() => updateMedicationPrescription(prescription.id, { status: 'COMPLETED' })}
                      className="px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-600/10 hover:bg-teal-100 rounded-xl transition-colors flex items-center gap-1"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Marcar Finalizado
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('¿Estás seguro de que deseas eliminar este medicamento y todos sus recordatorios asociados?')) {
                          deleteMedicationPrescription(prescription.id);
                        }
                      }}
                      className="px-3.5 h-8.5 text-[10px] font-extrabold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })
          )
        ) : (
          inactivePrescriptions.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
              <History className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-800">No hay historial inactivo</p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Aquí aparecerán los tratamientos que hayas marcado como finalizados, suspendidos o cancelados.
              </p>
            </div>
          ) : (
            inactivePrescriptions.map((prescription) => {
              const stats = getPrescriptionStats(prescription.id);
              return (
                <div 
                  key={prescription.id}
                  className="bg-slate-50 p-5 rounded-3xl border border-slate-100/70 flex flex-col gap-3.5 opacity-80"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 bg-slate-200/60 text-slate-500 rounded-2xl shrink-0 mt-0.5">
                        <Pill className="h-5.5 w-5.5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-700 leading-tight mb-0.5">{prescription.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold mb-1">
                          {prescription.dose} · {frequencyLabelMap[prescription.frequencyType]}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(prescription.status)}
                  </div>

                  <hr className="border-slate-200/50" />

                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 font-semibold">
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">Duración</span>
                      <span>{prescription.durationDays} días ({new Date(prescription.startDate).toLocaleDateString('es-CO')} al {new Date(prescription.endDate).toLocaleDateString('es-CO')})</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 block uppercase leading-none mb-1">Tomas logradas</span>
                      <span>{stats.taken} de {stats.total} ({stats.percent}%)</span>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex gap-2 justify-end mt-1">
                    <button
                      onClick={() => updateMedicationPrescription(prescription.id, { status: 'ACTIVE' })}
                      className="px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-600/10 hover:bg-teal-100 rounded-xl transition-colors flex items-center gap-1"
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                      Reactivar Tratamiento
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('¿Estás seguro de que deseas eliminar definitivamente este registro del historial?')) {
                          deleteMedicationPrescription(prescription.id);
                        }
                      }}
                      className="px-3.5 h-8.5 text-[10px] font-extrabold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}
      </section>

      {/* Add Medication Prescription Modal Backdrop */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[95vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4">Registrar Nuevo Medicamento</h3>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Nombre del Medicamento</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Acetaminofén o Losartán"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Dose */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Dosis a Tomar</label>
                <input
                  type="text"
                  required
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  placeholder="Ej. 1 tableta de 500mg, 5ml, etc."
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Formula Quantity */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Cantidad Formulada</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Unidad</label>
                  <select
                    value={quantityUnit}
                    onChange={(e) => setQuantityUnit(e.target.value as QuantityUnit)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  >
                    <option value="tablets">Pastillas / Tabletas</option>
                    <option value="capsules">Cápsulas</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="units">Unidades / Aplicación</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>

              {/* Start Date & Duration */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha de Inicio</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Duración (Días)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={durationDays}
                    onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 1)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Frequency Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Frecuencia de Tomas</label>
                <select
                  value={frequencyType}
                  onChange={(e) => setFrequencyType(e.target.value as FrequencyType)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="ONCE_DAILY">Una vez al día (08:00)</option>
                  <option value="TWICE_DAILY">Dos veces al día (08:00, 20:00)</option>
                  <option value="THREE_TIMES_DAILY">Tres veces al día (08:00, 14:00, 20:00)</option>
                  <option value="EVERY_X_HOURS">Cada X horas</option>
                  <option value="SPECIFIC_TIMES">Horarios específicos personalizados</option>
                </select>
              </div>

              {/* Conditional Frequency UI */}
              {frequencyType === 'EVERY_X_HOURS' && (
                <div className="flex flex-col gap-1.5 p-3.5 bg-slate-50 rounded-xl">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Intervalo en Horas</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={frequencyIntervalHours}
                    onChange={(e) => setFrequencyIntervalHours(parseInt(e.target.value, 10) || 8)}
                    className="h-10 px-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-lg text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                  <span className="text-[9px] font-bold text-slate-400 leading-normal">
                    Se generará una toma cada {frequencyIntervalHours} horas empezando desde las 08:00 del primer día.
                  </span>
                </div>
              )}

              {frequencyType === 'SPECIFIC_TIMES' && (
                <div className="flex flex-col gap-2.5 p-3.5 bg-slate-50 rounded-xl">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Configurar Horarios</label>
                  
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={newTimeInput}
                      onChange={(e) => setNewTimeInput(e.target.value)}
                      className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-teal-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAddTime}
                      className="h-9 px-3 bg-slate-800 text-white font-extrabold text-[10px] rounded-lg"
                    >
                      Añadir Hora
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {specificTimes.map(t => (
                      <span 
                        key={t}
                        className="bg-white border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 rounded-lg flex items-center gap-1.5"
                      >
                        <span>{t}</span>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveTime(t)}
                          className="text-rose-500 font-bold text-[10px]"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked prescription document (Select) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fórmula médica de soporte (Opcional)</label>
                <select
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="">-- Selecciona un documento cargado --</option>
                  {prescriptionDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.fileName} ({doc.uploadedAt.split('T')[0]})</option>
                  ))}
                </select>
              </div>

              {/* Prescribed by Doctor & Instructions */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Médico que formuló</label>
                  <input
                    type="text"
                    value={prescribedBy}
                    onChange={(e) => setPrescribedBy(e.target.value)}
                    placeholder="Ej. Dr. Juan Gómez"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Instrucciones de Toma</label>
                  <input
                    type="text"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Ej. Tomar con el desayuno"
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Google Calendar sync toggle */}
              {calendarSyncEnabled && (
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <input
                    type="checkbox"
                    id="syncToCalendarInput"
                    checked={syncToCalendarInput}
                    onChange={(e) => setSyncToCalendarInput(e.target.checked)}
                    className="h-4.5 w-4.5 text-teal-600 border-slate-300 focus:ring-teal-500 rounded cursor-pointer"
                  />
                  <label htmlFor="syncToCalendarInput" className="text-xs font-bold text-slate-700 cursor-pointer">
                    Sincronizar tomas individuales con Google Calendar
                  </label>
                </div>
              )}

              {/* Total generated doses count status */}
              <div className="text-[11px] font-bold text-slate-500">
                Se generarán <span className="text-teal-600 font-extrabold">{estimatedDoses}</span> recordatorios de toma.
              </div>

              {/* WARNING BANNERS */}
              {showDurationWarning && (
                <div className="bg-rose-50 border border-rose-200 p-4.5 rounded-2xl flex flex-col gap-2.5 text-xs text-rose-800">
                  <div className="flex gap-2 items-center">
                    <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
                    <h5 className="font-extrabold">Advertencia: Duración Mayor a 180 Días</h5>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-normal">
                    Crear recordatorios para un tratamiento de más de 180 días generará una cantidad masiva de eventos ({estimatedDoses} tomas) y puede sobrecargar la base de datos de la aplicación.
                  </p>
                  <label className="flex items-center gap-2 font-black cursor-pointer text-slate-700 select-none bg-white p-2 rounded-lg border border-rose-100/50">
                    <input
                      type="checkbox"
                      checked={durationConfirmed}
                      onChange={(e) => setDurationConfirmed(e.target.checked)}
                      className="h-4.5 w-4.5 text-rose-600 rounded"
                    />
                    <span>Confirmo que deseo continuar con {durationDays} días</span>
                  </label>
                </div>
              )}

              {showCalendarWarning && (
                <div className="bg-amber-50 border border-amber-200 p-4.5 rounded-2xl flex flex-col gap-2 text-xs text-amber-800">
                  <div className="flex gap-2 items-center">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    <h5 className="font-extrabold">Sincronización Mayor a 20 Eventos</h5>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-normal">
                    Se van a crear {estimatedDoses} eventos en tu Google Calendar. Te recomendamos desactivar la sincronización de calendario si no quieres saturar tu agenda de actividades diarias.
                  </p>
                </div>
              )}

              {/* MEDICAL DISCLAIMER DUPLICATE AT BOTTOM */}
              <p className="text-[10px] text-slate-400 italic text-center font-semibold px-4">
                "La app solo registra recordatorios según la información ingresada por el usuario. No reemplaza indicaciones médicas."
              </p>

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
                  disabled={showDurationWarning && !durationConfirmed}
                  className={`flex-1 h-11 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all duration-150 ${
                    showDurationWarning && !durationConfirmed
                      ? 'bg-slate-300 cursor-not-allowed shadow-none'
                      : 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 shadow-teal-600/10'
                  }`}
                >
                  <Save className="h-4 w-4" />
                  <span>Guardar Prescripción</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
