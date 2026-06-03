'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  ArrowLeft, 
  Plus, 
  Calendar, 
  Beaker, 
  ShieldAlert, 
  Check, 
  Info, 
  Save, 
  Heart 
} from 'lucide-react';
import { MedicalExam, ExamResult } from '@/domain/models';

export default function ExamsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, members, exams, examResults, addExam, isLoading } = useApp();

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedExam, setSelectedExam] = useState<MedicalExam | null>(null);

  // New exam form state
  const [examName, setExamName] = useState('');
  const [orderedBy, setOrderedBy] = useState('');
  const [orderedDate, setOrderedDate] = useState('2026-05-28');
  const [laboratory, setLaboratory] = useState('');

  // Mock results to inject automatically when completing
  const [glucoseValue, setGlucoseValue] = useState('95');
  const [cholesterolValue, setCholesterolValue] = useState('210');

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
    if (!examName) return;

    // Automatically define mock result parameters
    const mockParameters = [
      {
        parameterName: 'Glucosa en ayunas',
        value: glucoseValue,
        unit: 'mg/dL',
        referenceRange: '70 - 100',
        isAbnormal: Number(glucoseValue) > 100 || Number(glucoseValue) < 70
      },
      {
        parameterName: 'Colesterol Total',
        value: cholesterolValue,
        unit: 'mg/dL',
        referenceRange: 'Menos de 200',
        isAbnormal: Number(cholesterolValue) >= 200
      }
    ];

    addExam(
      {
        memberId: id,
        examName,
        orderedBy: orderedBy || null,
        orderedDate,
        laboratory: laboratory || null,
        status: 'COMPLETED',
        performedDate: orderedDate,
        resultSummary: mockParameters.some(p => p.isAbnormal) 
          ? 'Colesterol elevado. Revisión médica requerida.' 
          : 'Resultados estables dentro del rango de referencia.'
      },
      mockParameters
    );

    // Reset
    setExamName('');
    setOrderedBy('');
    setLaboratory('');
    setGlucoseValue('95');
    setCholesterolValue('210');
    setShowAddForm(false);
  };

  const memberExams = exams
    .filter(e => e.memberId === id)
    .sort((a, b) => new Date(b.orderedDate).getTime() - new Date(a.orderedDate).getTime());

  const currentResults = selectedExam ? (examResults[selectedExam.id] || []) : [];

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
          <span>Registrar examen</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Exámenes de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-400">Resultados de laboratorio clínico y análisis diagnósticos.</p>
      </section>

      {/* Exams List */}
      <section className="flex flex-col gap-3.5">
        {memberExams.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
            <Beaker className="h-10 w-10 text-slate-300 animate-pulse" />
            <p className="text-sm font-bold text-slate-800">Sin exámenes clínicos</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Registra hemogramas, lipidogramas u otros análisis de laboratorio para ver las métricas de salud.
            </p>
          </div>
        ) : (
          memberExams.map((exam) => {
            const resultsForThis = examResults[exam.id] || [];
            const hasAlert = resultsForThis.some(r => r.isAbnormal);

            return (
              <div 
                key={exam.id}
                onClick={() => setSelectedExam(exam)}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col gap-3 group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800 group-hover:text-teal-600 transition-colors leading-tight mb-0.5">{exam.examName}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">{exam.orderedBy} · {exam.laboratory || 'Lab'}</span>
                  </div>
                  {hasAlert ? (
                    <span className="text-[9px] font-extrabold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-100 uppercase animate-pulse">Alerta</span>
                  ) : (
                    <span className="text-[9px] font-extrabold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-600/10 uppercase">Estable</span>
                  )}
                </div>

                <hr className="border-slate-50" />

                {/* Details summary */}
                <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-teal-600" />
                    <span>Realizado: {new Date(exam.orderedDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <span className="text-[10px] font-extrabold text-teal-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                    Ver valores <Info className="h-3.5 w-3.5" />
                  </span>
                </div>

                {exam.resultSummary && (
                  <p className="text-[11px] text-slate-500 font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100/50 leading-relaxed italic">{exam.resultSummary}</p>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Show Results Detail Modal */}
      {selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-0.5">Resultados de Laboratorio</h3>
            <p className="text-xs text-slate-400 font-semibold mb-4">{selectedExam.examName}</p>

            <div className="flex flex-col gap-3 mb-6">
              {currentResults.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold text-center py-4">No se capturaron métricas individuales.</p>
              ) : (
                currentResults.map((res) => (
                  <div 
                    key={res.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                      res.isAbnormal 
                        ? 'bg-rose-50/50 border-rose-100 text-rose-800' 
                        : 'bg-slate-50/50 border-slate-100 text-slate-700'
                    }`}
                  >
                    <div>
                      <h5 className="text-xs font-bold leading-tight">{res.parameterName}</h5>
                      <span className="text-[9px] text-slate-400 font-bold block">Ref: {res.referenceRange}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-black block ${res.isAbnormal ? 'text-rose-600 font-black' : 'text-slate-800'}`}>
                        {res.value} <span className="text-[10px] font-normal">{res.unit}</span>
                      </span>
                      {res.isAbnormal && (
                        <span className="text-[8px] font-extrabold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded uppercase">Anormal</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setSelectedExam(null)}
              className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl"
            >
              Cerrar Resultados
            </button>
          </div>
        </div>
      )}

      {/* Add Exam Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="font-extrabold text-base text-slate-800 mb-4.5">Registrar Examen Clínico</h3>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              {/* Exam Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Nombre del Examen</label>
                <input
                  type="text"
                  required
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Ej. Examen de Glucosa, Hemograma Completo"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Ordered Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Fecha Realización</label>
                <input
                  type="date"
                  required
                  value={orderedDate}
                  onChange={(e) => setOrderedDate(e.target.value)}
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                />
              </div>

              {/* Ordered By */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Médico que ordena (Opcional)</label>
                <input
                  type="text"
                  value={orderedBy}
                  onChange={(e) => setOrderedBy(e.target.value)}
                  placeholder="Ej. Dr. Ramírez"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              {/* Laboratory */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-slate-700 uppercase">Laboratorio (Opcional)</label>
                <input
                  type="text"
                  value={laboratory}
                  onChange={(e) => setLaboratory(e.target.value)}
                  placeholder="Ej. Laboratorio Clínico Niza"
                  className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors"
                />
              </div>

              <hr className="border-slate-50" />
              <h5 className="text-[10px] font-black text-slate-800 uppercase px-0.5">Captura de Valores de Referencia</h5>

              {/* Grid for parameters */}
              <div className="grid grid-cols-2 gap-4">
                {/* Glucose */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-extrabold text-slate-700">Glucosa en ayunas (mg/dL)</label>
                  <input
                    type="number"
                    value={glucoseValue}
                    onChange={(e) => setGlucoseValue(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>

                {/* Cholesterol */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-extrabold text-slate-700">Colesterol Total (mg/dL)</label>
                  <input
                    type="number"
                    value={cholesterolValue}
                    onChange={(e) => setCholesterolValue(e.target.value)}
                    className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
                  />
                </div>
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
