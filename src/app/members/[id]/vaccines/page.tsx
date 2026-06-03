'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Plus, 
  Calendar, 
  MapPin, 
  Save, 
  Syringe, 
  ShieldAlert 
} from 'lucide-react';

export default function VaccinesPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, members, vaccines, addVaccine, isLoading } = useApp();

  const [showAddForm, setShowAddForm] = useState(false);

  // New vaccine form state
  const [vaccineName, setVaccineName] = useState('');
  const [dateApplied, setDateApplied] = useState('2026-05-30');
  const [doseNumber, setDoseNumber] = useState(1);
  const [institution, setInstitution] = useState('');
  const [nextDoseDate, setNextDoseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'SCHEDULED' | 'COMPLETED'>('COMPLETED');

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
    if (!vaccineName) return;

    addVaccine({
      memberId: id,
      vaccineName,
      dateApplied,
      doseNumber: Number(doseNumber),
      institution: institution || null,
      nextDoseDate: nextDoseDate || null,
      notes: notes || null,
      status
    });

    // Reset
    setVaccineName('');
    setInstitution('');
    setNextDoseDate('');
    setNotes('');
    setStatus('COMPLETED');
    setShowAddForm(false);
  };

  const memberVaccines = vaccines
    .filter(v => v.memberId === id)
    .sort((a, b) => new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime());

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
          <span>Registrar vacuna</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Esquema de Vacunación de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Cartilla digital de inmunización, dosificaciones y refuerzos.</p>
      </section>

      {/* Vaccines List */}
      <section className="flex flex-col gap-3.5">
        {memberVaccines.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <Syringe className="h-10 w-10 text-slate-300 animate-bounce" />
            <p className="text-sm font-bold text-slate-800">Sin dosis registradas</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Registra vacunas de control o refuerzos aplicados con el botón superior.
            </p>
          </div>
        ) : (
          memberVaccines.map((vac) => (
            <div 
              key={vac.id}
              className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 leading-tight mb-0.5">{vac.vaccineName}</h4>
                  <span className="text-[10px] text-teal-600 font-extrabold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-600/10">Dosis {vac.doseNumber}</span>
                </div>
                {vac.status === 'COMPLETED' ? (
                  <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-600/10">Aplicada</span>
                ) : (
                  <span className="text-[10px] font-extrabold bg-rose-50 text-rose-600 px-2.5 py-0.5 rounded-full border border-rose-600/10">Pendiente</span>
                )}
              </div>

              <hr className="border-slate-50" />

              {/* Date and Place */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-500">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-teal-600" />
                  <span>Aplicada: {new Date(vac.dateApplied).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                {vac.institution && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-rose-500" />
                    <span>Lugar: {vac.institution}</span>
                  </div>
                )}
              </div>

              {/* Next dose details */}
              {vac.nextDoseDate && (
                <div className="p-3 bg-teal-50/50 rounded-xl text-teal-800 border border-teal-100/50 text-xs font-bold flex items-center gap-2">
                  <span>📅</span>
                  <span>Próximo refuerzo sugerido: {new Date(vac.nextDoseDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              )}

              {/* Notes */}
              {vac.notes && (
                <p className="text-xs text-slate-500 font-semibold italic px-1">Nota: {vac.notes}</p>
              )}
            </div>
          ))
        )}
      </section>

      {/* Add Vaccine Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Registrar Vacuna</h3>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Vaccine Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Nombre de la Vacuna</label>
                <input
                  type="text"
                  required
                  value={vaccineName}
                  onChange={(e) => setVaccineName(e.target.value)}
                  placeholder="Ej. Varicela, Influenza Estacional"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Grid for Dose and Date */}
              <div className="grid grid-cols-2 gap-4">
                {/* Dose Number */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Dosis No.</label>
                  <input
                    type="number"
                    required
                    value={doseNumber}
                    onChange={(e) => setDoseNumber(Number(e.target.value))}
                    min={1}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                {/* Date */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha Aplicación</label>
                  <input
                    type="date"
                    required
                    value={dateApplied}
                    onChange={(e) => setDateApplied(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Institution */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Punto de Vacunación (Opcional)</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="Ej. Cruz Roja, Hospital Infantil"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Next booster date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Próximo Refuerzo (Opcional)</label>
                <input
                  type="date"
                  value={nextDoseDate}
                  onChange={(e) => setNextDoseDate(e.target.value)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                />
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Estado</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                >
                  <option value="COMPLETED">Aplicada (Completado)</option>
                  <option value="SCHEDULED">Pendiente (Programado)</option>
                </select>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Indicaciones / Observaciones</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reacción leve, lote número 12345, cuidado del brazo..."
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
