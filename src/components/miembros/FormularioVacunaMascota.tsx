'use client';

/**
 * FormularioVacunaMascota — registrar una vacuna aplicada (D3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se registra **lo que ya se puso**, no lo que se piensa poner: por eso la
 * fecha de aplicación no admite el futuro, y lo que viene se apunta en el
 * refuerzo. La validación es la del dominio; aquí solo se enseña lo que ella
 * decida.
 *
 * El laboratorio y el lote son opcionales pero están a la vista, porque son
 * justo los dos datos que un veterinario pide cuando hay que consultar algo y
 * que nadie recuerda de memoria.
 */

import React, { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { hoyLocal, type ProblemaValidacion, type Validacion } from '@/domain/mascotas';
import { Save } from 'lucide-react';

export interface EntradaVacuna {
  vacuna: string;
  fecha: string;
  proximaDosis: string | null;
  laboratorio: string | null;
  lote: string | null;
  veterinario: string | null;
}

export interface FormularioVacunaMascotaProps {
  abierto: boolean;
  nombreMascota: string;
  onCerrar: () => void;
  onGuardar: (entrada: EntradaVacuna) => Validacion;
}

export default function FormularioVacunaMascota({
  abierto,
  nombreMascota,
  onCerrar,
  onGuardar,
}: FormularioVacunaMascotaProps) {
  const [vacuna, setVacuna] = useState('');
  const [fecha, setFecha] = useState('');
  const [proximaDosis, setProximaDosis] = useState('');
  const [laboratorio, setLaboratorio] = useState('');
  const [lote, setLote] = useState('');
  const [veterinario, setVeterinario] = useState('');
  const [problemas, setProblemas] = useState<ProblemaValidacion[]>([]);
  const [preparado, setPreparado] = useState(false);

  if (abierto && !preparado) {
    setPreparado(true);
    setVacuna('');
    setFecha(hoyLocal());
    setProximaDosis('');
    setLaboratorio('');
    setLote('');
    setVeterinario('');
    setProblemas([]);
  }
  if (!abierto && preparado) setPreparado(false);

  if (!abierto) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const resultado = onGuardar({
      vacuna,
      fecha,
      proximaDosis: proximaDosis || null,
      laboratorio: laboratorio || null,
      lote: lote || null,
      veterinario: veterinario || null,
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
    <Dialog abierto titulo="Registrar vacuna" descripcion={nombreMascota} onCerrar={onCerrar}>
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
          <label htmlFor="vacpet-nombre" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Vacuna
          </label>
          <input
            id="vacpet-nombre"
            type="text"
            value={vacuna}
            onChange={(e) => setVacuna(e.target.value)}
            aria-invalid={problemaDe('vacuna') ? true : undefined}
            placeholder="Ej. Rabia, Polivalente…"
            className={clases}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vacpet-fecha" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Fecha de aplicación
            </label>
            <input
              id="vacpet-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-invalid={problemaDe('fecha') ? true : undefined}
              className={clases}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="vacpet-refuerzo" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Próximo refuerzo
            </label>
            <input
              id="vacpet-refuerzo"
              type="date"
              value={proximaDosis}
              onChange={(e) => setProximaDosis(e.target.value)}
              aria-invalid={problemaDe('proximaDosis') ? true : undefined}
              aria-describedby="vacpet-refuerzo-ayuda"
              className={clases}
            />
          </div>
        </div>

        <p id="vacpet-refuerzo-ayuda" className="text-[10px] text-slate-500 font-semibold -mt-2">
          Si pones el refuerzo, aparecerá en la agenda y se avisará cuando se acerque.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vacpet-laboratorio" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Laboratorio (opcional)
            </label>
            <input
              id="vacpet-laboratorio"
              type="text"
              value={laboratorio}
              onChange={(e) => setLaboratorio(e.target.value)}
              className={clases}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="vacpet-lote" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Lote (opcional)
            </label>
            <input
              id="vacpet-lote"
              type="text"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              className={clases}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="vacpet-veterinario" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Veterinario (opcional)
          </label>
          <input
            id="vacpet-veterinario"
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
            <span>Guardar vacuna</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
