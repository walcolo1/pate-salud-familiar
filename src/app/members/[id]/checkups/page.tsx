'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  HeartPulse, 
  Plus, 
  Clock, 
  User, 
  Save, 
  CheckSquare, 
  FileText 
} from 'lucide-react';

export default function CheckupsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, members, checkups, addCheckup, isLoading } = useApp();

  const [showAddForm, setShowAddForm] = useState(false);
  
  // New checkup form state
  const [checkupType, setCheckupType] = useState('');
  const [scheduledDate, setScheduledDate] = useState('2026-06-10');
  const [doctorName, setDoctorName] = useState('');
  const [results, setResults] = useState('');
  const [status, setStatus] = useState<'SCHEDULED' | 'COMPLETED'>('SCHEDULED');

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
    if (!checkupType) return;

    addCheckup({
      memberId: id,
      checkupType,
      scheduledDate,
      doctorName: doctorName || null,
      results: results.trim() || null,
      status,
      completedDate: status === 'COMPLETED' ? scheduledDate : null
    });

    // Reset
    setCheckupType('');
    setDoctorName('');
    setResults('');
    setStatus('SCHEDULED');
    setShowAddForm(false);
  };

  const memberCheckups = checkups
    .filter(c => c.memberId === id)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

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
          <span>Registrar control</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Controles Periódicos de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Controles preventivos, físicos y chequeos de rutina.</p>
      </section>

      {/* Checkups List */}
      <section className="flex flex-col gap-3.5">
        {memberCheckups.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <HeartPulse className="h-10 w-10 text-slate-300 animate-pulse" />
            <p className="text-sm font-bold text-slate-800">Sin controles registrados</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Agrega chequeos odontológicos, pediátricos o controles generales con el botón de programar.
            </p>
          </div>
        ) : (
          memberCheckups.map((chk) => (
            <div 
              key={chk.id}
              className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <h4 className="text-sm font-extrabold text-slate-800 leading-tight">{chk.checkupType}</h4>
                {chk.status === 'COMPLETED' ? (
                  <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-600/10">Realizado</span>
                ) : (
                  <span className="text-[10px] font-extrabold bg-teal-50 text-teal-600 px-2.5 py-0.5 rounded-full border border-teal-600/10">Programado</span>
                )}
              </div>

              <hr className="border-slate-50" />

              {/* Time and Doctor */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-500">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-600" />
                  <span>{new Date(chk.scheduledDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                {chk.doctorName && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-rose-500" />
                    <span>Dra/Dr. {chk.doctorName}</span>
                  </div>
                )}
              </div>

              {/* Results */}
              {chk.results && (
                <div className="p-3 bg-slate-50/50 rounded-xl">
                  <span className="text-[9px] text-slate-400 font-extrabold block leading-none mb-1 uppercase">Resultados y Hallazgos</span>
                  <p className="text-xs text-slate-600 font-semibold leading-relaxed">{chk.results}</p>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {/* Add Checkup Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Registrar Control de Salud</h3>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Tipo de Chequeo</label>
                <input
                  type="text"
                  required
                  value={checkupType}
                  onChange={(e) => setCheckupType(e.target.value)}
                  placeholder="Ej. Limpieza Dental, Control Pediátrico"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha</label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                />
              </div>

              {/* Doctor */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Médico encargado (Opcional)</label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="Ej. Dra. Diana Restrepo"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Estado del Control</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="SCHEDULED">Programado (Planificado)</option>
                  <option value="COMPLETED">Completado (Realizado)</option>
                </select>
              </div>

              {/* Results */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Resultados y Recomendaciones</label>
                <textarea
                  value={results}
                  onChange={(e) => setResults(e.target.value)}
                  placeholder="Escribe el reporte médico, indicaciones físicas, peso, talla, estado bucal..."
                  className="h-20 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
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
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
