'use client';

/**
 * FormularioHistorialVet — registrar una atención veterinaria (D4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se apunta lo que **ya ocurrió**: por eso la fecha no admite el futuro. Una
 * cita que aún no ha pasado no es historial, es agenda, y ahí ya tiene su
 * sitio.
 *
 * El diagnóstico es obligatorio y el tratamiento no. Al revés de lo que parece:
 * una entrada sin diagnóstico no dice nada dentro de un año, mientras que
 * muchas consultas terminan sin tratamiento y obligar a escribir «ninguno»
 * solo enseña a rellenar por rellenar.
 *
 * La validación es la del dominio; aquí solo se enseña lo que ella decida.
 */

import React, { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import {
  NOMBRE_TIPO_HISTORIAL,
  TIPOS_HISTORIAL,
  hoyLocal,
  type ProblemaValidacion,
  type TipoHistorialVet,
  type Validacion,
} from '@/domain/mascotas';
import { Save } from 'lucide-react';

export interface EntradaHistorial {
  fecha: string;
  tipo: TipoHistorialVet;
  diagnostico: string;
  tratamiento: string | null;
  veterinario: string | null;
}

export interface FormularioHistorialVetProps {
  abierto: boolean;
  nombreMascota: string;
  onCerrar: () => void;
  onGuardar: (entrada: EntradaHistorial) => Validacion;
}

export default function FormularioHistorialVet({
  abierto,
  nombreMascota,
  onCerrar,
  onGuardar,
}: FormularioHistorialVetProps) {
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState<TipoHistorialVet>('CONSULTA');
  const [diagnostico, setDiagnostico] = useState('');
  const [tratamiento, setTratamiento] = useState('');
  const [veterinario, setVeterinario] = useState('');
  const [problemas, setProblemas] = useState<ProblemaValidacion[]>([]);
  const [preparado, setPreparado] = useState(false);

  if (abierto && !preparado) {
    setPreparado(true);
    setFecha(hoyLocal());
    setTipo('CONSULTA');
    setDiagnostico('');
    setTratamiento('');
    setVeterinario('');
    setProblemas([]);
  }
  if (!abierto && preparado) setPreparado(false);

  if (!abierto) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const resultado = onGuardar({
      fecha,
      tipo,
      diagnostico,
      tratamiento: tratamiento.trim() || null,
      veterinario: veterinario.trim() || null,
    });
    if (resultado.valido) {
      setProblemas([]);
      onCerrar();
    } else {
      setProblemas(resultado.problemas);
    }
  };

  const clases =
    'h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors';
  const problemaDe = (campo: string) => problemas.find((p) => p.campo === campo);

  return (
    <Dialog abierto titulo="Registrar atención" descripcion={nombreMascota} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        {problemas.length > 0 && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-800 leading-relaxed"
          >
            <ul className="flex flex-col gap-1">
              {problemas.map((p) => (
                <li key={p.campo}>{p.mensaje}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="histvet-fecha" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Fecha
            </label>
            <input
              id="histvet-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-invalid={problemaDe('fecha') ? true : undefined}
              className={clases}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="histvet-tipo" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Tipo de atención
            </label>
            <select
              id="histvet-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoHistorialVet)}
              aria-invalid={problemaDe('tipo') ? true : undefined}
              className={clases}
            >
              {TIPOS_HISTORIAL.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO_HISTORIAL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="histvet-diagnostico"
            className="text-[10px] font-extrabold text-slate-700 uppercase"
          >
            Diagnóstico o motivo
          </label>
          <input
            id="histvet-diagnostico"
            type="text"
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            aria-invalid={problemaDe('diagnostico') ? true : undefined}
            placeholder="Ej. Otitis en el oído derecho"
            className={clases}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="histvet-tratamiento"
            className="text-[10px] font-extrabold text-slate-700 uppercase"
          >
            Tratamiento indicado
          </label>
          <textarea
            id="histvet-tratamiento"
            value={tratamiento}
            onChange={(e) => setTratamiento(e.target.value)}
            aria-describedby="histvet-tratamiento-ayuda"
            placeholder="Gotas cada 12 horas durante una semana…"
            className="h-20 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
          />
        </div>

        <p id="histvet-tratamiento-ayuda" className="text-[10px] text-slate-500 font-semibold -mt-2">
          Opcional. Muchas consultas terminan sin tratamiento, y no pasa nada por dejarlo en blanco.
        </p>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="histvet-veterinario"
            className="text-[10px] font-extrabold text-slate-700 uppercase"
          >
            Veterinario o clínica
          </label>
          <input
            id="histvet-veterinario"
            type="text"
            value={veterinario}
            onChange={(e) => setVeterinario(e.target.value)}
            className={clases}
          />
        </div>

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
            className="flex-1 h-11 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs rounded-xl shadow-md shadow-teal-900/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            <span>Guardar atención</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
