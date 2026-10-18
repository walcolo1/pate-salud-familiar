'use client';

import React, { useState, useEffect } from 'react';
import EstadoError from '@/components/ui/EstadoError';
import EstadoVacio from '@/components/ui/EstadoVacio';
import EstadoCarga from '@/components/ui/EstadoCarga';
import Dialog from '@/components/ui/Dialog';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Plus, 
  Calendar, 
  Beaker, 
  Info, 
} from 'lucide-react';
import { MedicalExam } from '@/domain/models';
import ComparativoHistorico, { ChipEstado } from '@/components/examenes/ComparativoHistorico';
import RegistroExamen, { type DatosExamen } from '@/components/examenes/RegistroExamen';
import {
  construirComparativo,
  esUnidadDeRecuento,
  estadoFrenteARango,
  estaFueraDeRango,
  fechaDeExamen,
  parsearNumero,
  parsearRango,
  type ResultadoParaGuardar,
} from '@/lib/resultadosLaboratorio';
import { fechaLocalHoy } from '@/lib/repositorioBackend';

export default function ExamsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, members, exams, examResults, addExam, isLoading } = useApp();

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedExam, setSelectedExam] = useState<MedicalExam | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <EstadoCarga mensaje="Cargando tu expediente…" />
    );
  }

  const member = members.find(m => m.id === id);

  if (!member) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Familiar no encontrado"
        mensaje="Tu expediente se abrió correctamente, pero no hay ningún familiar con ese identificador. Puede que se haya eliminado, o que el enlace esté mal."
        accionSecundaria={{ etiqueta: 'Volver a la lista de familiares', href: '/members' }}
      />
    );
  }

  const handleGuardar = (datos: DatosExamen, resultados: ResultadoParaGuardar[]) => {
    const fuera = resultados.filter((r) => r.isAbnormal).length;
    addExam(
      {
        memberId: id,
        examName: datos.examName,
        orderedBy: datos.orderedBy,
        orderedDate: datos.orderedDate,
        laboratory: datos.laboratory,
        status: 'COMPLETED',
        performedDate: datos.orderedDate,
        // Solo cuenta, no interpreta: la lectura clínica es del médico.
        resultSummary: resultados.length === 0
          ? null
          : `${resultados.length} ${resultados.length === 1 ? 'valor verificado' : 'valores verificados'}` +
            (fuera > 0 ? `; ${fuera} fuera del rango impreso por el laboratorio.` : '; todos dentro del rango impreso por el laboratorio.'),
      },
      resultados,
    );
    setShowAddForm(false);
  };

  const memberExams = exams
    .filter(e => e.memberId === id)
    .sort((a, b) => fechaDeExamen(b).localeCompare(fechaDeExamen(a)));

  // Las fichas de /members son personas: los rangos veterinarios nunca entran.
  const comparativo = construirComparativo(memberExams, examResults, id, { especie: 'HUMANO' });

  const currentResults = selectedExam ? (examResults[selectedExam.id] || []) : [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      
      {/* Navigation Header */}
      <section className="flex justify-end items-center">
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md active:translate-y-0.5 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          <span>Registrar examen</span>
        </button>
      </section>

      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-base leading-tight mb-1">Exámenes de {member.fullName.split(' ')[0]}</h3>
        <p className="text-xs font-semibold text-slate-500">Resultados de laboratorio clínico y análisis diagnósticos.</p>
      </section>

      <ComparativoHistorico comparativo={comparativo} />

      {/* Exams List */}
      <section className="flex flex-col gap-3.5">
        {memberExams.length === 0 ? (
          <EstadoVacio
            icono={Beaker}
            titulo="Sin exámenes clínicos"
            descripcion="Registra hemogramas, lipidogramas u otros análisis de laboratorio para ver las métricas de salud."
            accion={{ tipo: 'boton', etiqueta: 'Registrar examen', onClick: () => setShowAddForm(true) }}
          />
        ) : (
          memberExams.map((exam) => {
            const resultsForThis = examResults[exam.id] || [];
            const hasAlert = resultsForThis.some(r => r.isAbnormal);

            return (
              <button
                type="button"
                key={exam.id}
                onClick={() => setSelectedExam(exam)}
                className="w-full text-left bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col gap-3 group"
              >
                <span className="flex justify-between items-start w-full">
                  <span>
                    <span className="text-sm font-extrabold text-slate-800 group-hover:text-teal-700 transition-colors leading-tight mb-0.5 block">{exam.examName}</span>
                    <span className="text-[10px] text-slate-600 font-bold">{[exam.orderedBy, exam.laboratory].filter(Boolean).join(' · ') || 'Sin laboratorio'}</span>
                  </span>
                  {hasAlert ? (
                    <span className="text-[10px] font-extrabold bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200 uppercase">Fuera de rango</span>
                  ) : resultsForThis.length > 0 ? (
                    <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">En rango</span>
                  ) : null}
                </span>

                {/* Details summary */}
                <span className="flex justify-between items-center w-full text-xs font-semibold text-slate-600 border-t border-slate-100 pt-3">
                  <span className="flex items-center gap-2">
                    <Calendar aria-hidden className="h-4 w-4 text-teal-700" />
                    <span>Realizado: {new Date(`${fechaDeExamen(exam)}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                  <span className="text-[10px] font-extrabold text-teal-800 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                    {resultsForThis.length} {resultsForThis.length === 1 ? 'valor' : 'valores'} <Info aria-hidden className="h-3.5 w-3.5" />
                  </span>
                </span>

                {exam.resultSummary && (
                  <span className="block text-[11px] text-slate-600 font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100/50 leading-relaxed italic">{exam.resultSummary}</span>
                )}
              </button>
            );
          })
        )}
      </section>

      {/* Show Results Detail Modal */}
      <Dialog
        abierto={!!selectedExam}
        titulo="Resultados de Laboratorio"
        descripcion={selectedExam?.examName}
        onCerrar={() => setSelectedExam(null)}
      >

        <div className="flex flex-col gap-3 mb-6">
          {currentResults.length === 0 ? (
            <p className="text-xs text-slate-500 font-semibold text-center py-4">No se capturaron métricas individuales.</p>
          ) : (
            currentResults.map((res) => {
              const recuento = esUnidadDeRecuento(res.unit);
              const num = parsearNumero(String(res.value ?? '').replace(/^[<>]=?\s*/, ''), recuento);
              const rango = parsearRango(res.referenceRange, recuento);
              const estado = num !== null
                ? estadoFrenteARango(num, rango.min, rango.max)
                : estadoFrenteARango(null, null, null, res.value, res.referenceRange);
              const fuera = estaFueraDeRango(estado) || (estado === 'SIN_RANGO' && res.isAbnormal);
              return (
                <div
                  key={res.id}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border ${
                    fuera ? 'bg-rose-50/50 border-rose-100 text-rose-800' : 'bg-slate-50/50 border-slate-100 text-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold leading-tight">{res.parameterName}</h5>
                    <span className="text-[10px] text-slate-600 font-bold block">Ref.: {res.referenceRange || 'sin rango'}</span>
                    {!res.verifiedBy && <span className="text-[10px] text-slate-600 font-semibold block">Sin verificar</span>}
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-sm font-black text-slate-800">
                      {res.value} <span className="text-[10px] font-normal">{res.unit}</span>
                    </span>
                    <ChipEstado estado={estado} />
                  </div>
                </div>
              );
            })
          )}
        </div>
        <button
          onClick={() => setSelectedExam(null)}
          className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl"
        >
          Cerrar Resultados
        </button>      </Dialog>

      {/* Registro con bandeja de verificación (Bloque N) */}
      <Dialog
        abierto={showAddForm}
        titulo="Registrar examen clínico"
        descripcion="Sube el PDF, pega el texto o escribe los valores. Nada se guarda sin tu revisión."
        ancho="lg"
        onCerrar={() => setShowAddForm(false)}
      >
        {showAddForm && (
          <RegistroExamen
            especie="HUMANO"
            hoy={fechaLocalHoy()}
            onGuardar={handleGuardar}
            onCancelar={() => setShowAddForm(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
