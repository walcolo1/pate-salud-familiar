'use client';

/**
 * EditarPauta — cambiar la pauta sin borrar el historial (C3.4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta aquí no había forma de cambiar la pauta de un tratamiento: solo de
 * suspenderlo y crear otro, lo que parte el historial en dos medicamentos que
 * en realidad son el mismo. Y regenerar sin más habría borrado las tomas ya
 * registradas, que es peor: falsifica lo que de verdad pasó.
 *
 * El diálogo enseña, ANTES de guardar, cuántas tomas van a generarse y cuántas
 * se conservan. Nadie debería descubrir que se han creado cuatrocientos
 * registros después de haberlos creado.
 */

import React, { useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import {
  AVISO_DESDE_DOSIS,
  MAXIMO_DOSIS,
  aMarcaLocal,
  estimarDosis,
  type Pauta,
} from '@/lib/pautaMedicacion';
import type { FrequencyType, MedicationDoseReminder, MedicationPrescription } from '@/domain/models';
import { AlertTriangle, Save } from 'lucide-react';

const FRECUENCIAS: Array<{ valor: FrequencyType; etiqueta: string }> = [
  { valor: 'ONCE_DAILY', etiqueta: 'Una vez al día (08:00)' },
  { valor: 'TWICE_DAILY', etiqueta: 'Dos veces al día (08:00 y 20:00)' },
  { valor: 'THREE_TIMES_DAILY', etiqueta: 'Tres veces al día (08:00, 14:00 y 20:00)' },
  { valor: 'EVERY_X_HOURS', etiqueta: 'Cada X horas' },
];

export interface EditarPautaProps {
  prescripcion: MedicationPrescription | null;
  dosis: MedicationDoseReminder[];
  onCerrar: () => void;
  onGuardar: (id: string, pauta: Pauta) => void;
}

export default function EditarPauta({
  prescripcion,
  dosis,
  onCerrar,
  onGuardar,
}: EditarPautaProps) {
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [frecuencia, setFrecuencia] = useState<FrequencyType>('ONCE_DAILY');
  const [horas, setHoras] = useState(8);
  const [idCargado, setIdCargado] = useState<string | null>(null);

  // Se rellena con la pauta actual la primera vez que se abre para este
  // tratamiento. Sin la guarda, cada repintado pisaría lo que se esté
  // escribiendo.
  if (prescripcion && idCargado !== prescripcion.id) {
    setIdCargado(prescripcion.id);
    setInicio(prescripcion.startDate);
    setFin(prescripcion.endDate);
    setFrecuencia(prescripcion.frequencyType);
    setHoras(prescripcion.frequencyIntervalHours || 8);
  }

  const pauta: Pauta = useMemo(
    () => ({
      startDate: inicio,
      endDate: fin,
      frequencyType: frecuencia,
      frequencyIntervalHours: frecuencia === 'EVERY_X_HOURS' ? horas : null,
      specificTimes: null,
    }),
    [inicio, fin, frecuencia, horas],
  );

  const estimacion = useMemo(() => estimarDosis(pauta), [pauta]);

  const conservadas = useMemo(() => {
    if (!prescripcion) return 0;
    const ahora = aMarcaLocal(new Date());
    return dosis.filter(
      (d) =>
        !d.deletedAt &&
        d.prescriptionId === prescripcion.id &&
        (d.status !== 'PENDING' || d.scheduledAt <= ahora),
    ).length;
  }, [dosis, prescripcion]);

  if (!prescripcion) return null;

  const invalida = estimacion.momentos.length === 0;

  return (
    <Dialog
      abierto
      titulo="Editar pauta del tratamiento"
      descripcion={prescripcion.name}
      onCerrar={onCerrar}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalida) return;
          onGuardar(prescripcion.id, pauta);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pauta-inicio" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Inicio
            </label>
            <input
              id="pauta-inicio"
              type="date"
              required
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pauta-fin" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Fin
            </label>
            <input
              id="pauta-fin"
              type="date"
              required
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pauta-frecuencia" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Frecuencia
          </label>
          <select
            id="pauta-frecuencia"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value as FrequencyType)}
            className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
          >
            {FRECUENCIAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {frecuencia === 'EVERY_X_HOURS' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pauta-horas" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Cada cuántas horas
            </label>
            <input
              id="pauta-horas"
              type="number"
              min={1}
              max={24}
              value={horas}
              onChange={(e) => setHoras(Number(e.target.value))}
              className="h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
            />
          </div>
        )}

        {/* Lo que va a pasar, antes de que pase. */}
        <div
          role="status"
          className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-700 leading-relaxed"
        >
          {invalida ? (
            <span>Revisa las fechas: con esta pauta no sale ninguna toma.</span>
          ) : (
            <>
              <span>
                Se generarán <strong>{estimacion.momentos.length} tomas</strong> y se conservarán{' '}
                <strong>{conservadas}</strong> ya registradas.
              </span>
              {conservadas > 0 && (
                <span className="block mt-1 text-slate-600">
                  Las tomas ya marcadas y las que ya vencieron no se tocan.
                </span>
              )}
            </>
          )}
        </div>

        {estimacion.truncado && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-800 leading-relaxed"
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Esta pauta daría {estimacion.totalSinTope} tomas. Se crearán solo las{' '}
              {MAXIMO_DOSIS} primeras: más registros que eso llenan el expediente sin que nadie
              llegue a mirarlos. Acorta el tratamiento o espacia las tomas.
            </span>
          </p>
        )}

        {!estimacion.truncado && estimacion.momentos.length > AVISO_DESDE_DOSIS && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-800 leading-relaxed"
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Son bastantes tomas ({estimacion.momentos.length}). Comprueba las fechas.</span>
          </p>
        )}

        <div className="flex gap-2.5 mt-1">
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 font-extrabold text-xs text-slate-500 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={invalida}
            className="flex-1 h-11 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md shadow-teal-900/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            <span>Guardar pauta</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
