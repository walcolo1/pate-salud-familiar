'use client';

/**
 * FormularioPeso — registrar un pesaje (D2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La fecha viene rellena con la de hoy porque casi siempre se registra el
 * pesaje recién hecho, pero se puede cambiar: apuntar el sábado lo que pesó el
 * jueves es lo normal, y bloquear la fecha obligaría a mentir.
 *
 * Lo que no se admite es una fecha futura, y de eso se encarga la validación
 * del dominio: aquí solo se enseña lo que ella diga.
 */

import React, { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { hoyLocal, type ProblemaValidacion, type Validacion } from '@/domain/mascotas';
import { Save } from 'lucide-react';

export interface FormularioPesoProps {
  abierto: boolean;
  nombreMascota: string;
  onCerrar: () => void;
  onGuardar: (entrada: { fecha: string; pesoKg: number; nota: string | null }) => Validacion;
}

export default function FormularioPeso({
  abierto,
  nombreMascota,
  onCerrar,
  onGuardar,
}: FormularioPesoProps) {
  const [fecha, setFecha] = useState('');
  const [peso, setPeso] = useState('');
  const [nota, setNota] = useState('');
  const [problemas, setProblemas] = useState<ProblemaValidacion[]>([]);
  const [preparado, setPreparado] = useState(false);

  if (abierto && !preparado) {
    setPreparado(true);
    setFecha(hoyLocal());
    setPeso('');
    setNota('');
    setProblemas([]);
  }
  if (!abierto && preparado) setPreparado(false);

  if (!abierto) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    // `Number('')` es 0, y un cero se cuela como peso si no se mira antes.
    const valor = peso.trim() === '' ? NaN : Number(peso);
    const resultado = onGuardar({ fecha, pesoKg: valor, nota: nota.trim() || null });
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
    <Dialog abierto titulo="Registrar peso" descripcion={nombreMascota} onCerrar={onCerrar}>
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="peso-fecha" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Fecha del pesaje
          </label>
          <input
            id="peso-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-invalid={problemaDe('fecha') ? true : undefined}
            className={clases}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="peso-kg" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Peso (kg)
          </label>
          <input
            id="peso-kg"
            type="number"
            step="0.01"
            min="0"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            aria-invalid={problemaDe('pesoKg') ? true : undefined}
            aria-describedby="peso-kg-ayuda"
            placeholder="Ej. 4.3"
            className={clases}
          />
          <p id="peso-kg-ayuda" className="text-[10px] text-slate-500 font-semibold">
            En kilogramos. Si lo tienes en gramos, divídelo entre 1000.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="peso-nota" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Nota (opcional)
          </label>
          <textarea
            id="peso-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Tras el cambio de pienso, control del veterinario…"
            className="h-20 p-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-colors"
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
            <span>Guardar pesaje</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
