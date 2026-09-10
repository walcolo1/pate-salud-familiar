'use client';

/**
 * FormularioMascota — alta y edición (Bloque D, D1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Accesible desde el primer commit, no como arreglo posterior. Todo lo que el
 * Bloque C tuvo que corregir a posteriori en 102 campos aquí ya está: cada
 * control con su `id` y su `<label htmlFor>`, el diálogo sobre `<dialog>`
 * nativo con foco atrapado, y los errores anunciados con `role="alert"`.
 *
 * La validación NO vive aquí. Vive en `domain/mascotas` y se ejecuta en el
 * contexto, porque por esa puerta también entran los datos de un respaldo
 * restaurado. Este formulario solo enseña lo que aquella decida.
 */

import React, { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import {
  ESPECIES,
  NOMBRE_ESPECIE,
  NOMBRE_SEXO,
  SEXOS,
  type BorradorMascota,
  type Especie,
  type Pet,
  type ProblemaValidacion,
  type SexoMascota,
  type Validacion,
} from '@/domain/mascotas';
import { Save } from 'lucide-react';

export interface FormularioMascotaProps {
  abierto: boolean;
  /** Si viene, se edita; si no, se crea. */
  mascota?: Pet | null;
  memberId: string;
  onCerrar: () => void;
  /** Devuelve la validación: si falla, el diálogo se queda abierto. */
  onGuardar: (borrador: BorradorMascota) => Validacion;
}

/** Campo numérico opcional: `''` significa «sin dato», no cero. */
const aNumero = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export default function FormularioMascota({
  abierto,
  mascota,
  memberId,
  onCerrar,
  onGuardar,
}: FormularioMascotaProps) {
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState<Especie>('PERRO');
  const [raza, setRaza] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [sexo, setSexo] = useState<SexoMascota>('DESCONOCIDO');
  const [pesoActual, setPesoActual] = useState('');
  const [pesoIdeal, setPesoIdeal] = useState('');
  const [notas, setNotas] = useState('');
  const [problemas, setProblemas] = useState<ProblemaValidacion[]>([]);
  const [cargado, setCargado] = useState<string | null>(null);

  // Se rellena una sola vez por apertura. Sin la guarda, cada repintado
  // pisaría lo que se esté escribiendo.
  const clave = abierto ? (mascota?.id ?? 'nueva') : null;
  if (clave !== cargado) {
    setCargado(clave);
    setProblemas([]);
    setNombre(mascota?.nombre ?? '');
    setEspecie(mascota?.especie ?? 'PERRO');
    setRaza(mascota?.raza ?? '');
    setFechaNacimiento(mascota?.fechaNacimiento ?? '');
    setSexo(mascota?.sexo ?? 'DESCONOCIDO');
    setPesoActual(mascota?.pesoActualKg != null ? String(mascota.pesoActualKg) : '');
    setPesoIdeal(mascota?.pesoIdealKg != null ? String(mascota.pesoIdealKg) : '');
    setNotas(mascota?.notas ?? '');
  }

  if (!abierto) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const resultado = onGuardar({
      memberId,
      nombre,
      especie,
      raza: raza || null,
      fechaNacimiento: fechaNacimiento || null,
      sexo,
      pesoActualKg: aNumero(pesoActual),
      pesoIdealKg: aNumero(pesoIdeal),
      notas: notas || null,
    });

    if (resultado.valido) {
      setProblemas([]);
      onCerrar();
    } else {
      setProblemas(resultado.problemas);
    }
  };

  const campo = (nombreCampo: string) => problemas.find((p) => p.campo === nombreCampo);
  const clases =
    'h-11 px-4 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-colors';

  return (
    <Dialog
      abierto
      titulo={mascota ? 'Editar mascota' : 'Registrar mascota'}
      onCerrar={onCerrar}
    >
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
          <label htmlFor="mascota-nombre" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Nombre
          </label>
          <input
            id="mascota-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={campo('nombre') ? true : undefined}
            placeholder="Ej. Nube"
            className={clases}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mascota-especie" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Especie
            </label>
            <select
              id="mascota-especie"
              value={especie}
              onChange={(e) => setEspecie(e.target.value as Especie)}
              className={clases}
            >
              {ESPECIES.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESPECIE[e]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="mascota-sexo" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Sexo
            </label>
            <select
              id="mascota-sexo"
              value={sexo}
              onChange={(e) => setSexo(e.target.value as SexoMascota)}
              className={clases}
            >
              {SEXOS.map((s) => (
                <option key={s} value={s}>
                  {NOMBRE_SEXO[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mascota-raza" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Raza (opcional)
          </label>
          <input
            id="mascota-raza"
            type="text"
            value={raza}
            onChange={(e) => setRaza(e.target.value)}
            placeholder="Ej. Criollo, Siamés…"
            className={clases}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="mascota-nacimiento"
            className="text-[10px] font-extrabold text-slate-700 uppercase"
          >
            Fecha de nacimiento (opcional)
          </label>
          <input
            id="mascota-nacimiento"
            type="date"
            value={fechaNacimiento}
            onChange={(e) => setFechaNacimiento(e.target.value)}
            aria-invalid={campo('fechaNacimiento') ? true : undefined}
            aria-describedby="mascota-nacimiento-ayuda"
            className={clases}
          />
          <p id="mascota-nacimiento-ayuda" className="text-[10px] text-slate-500 font-semibold">
            Déjalo en blanco si es adoptada y no se sabe.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="mascota-peso-actual"
              className="text-[10px] font-extrabold text-slate-700 uppercase"
            >
              Peso actual (kg)
            </label>
            <input
              id="mascota-peso-actual"
              type="number"
              step="0.01"
              min="0"
              value={pesoActual}
              onChange={(e) => setPesoActual(e.target.value)}
              aria-invalid={campo('pesoActualKg') ? true : undefined}
              placeholder="Ej. 4.3"
              className={clases}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="mascota-peso-ideal"
              className="text-[10px] font-extrabold text-slate-700 uppercase"
            >
              Peso ideal (kg)
            </label>
            <input
              id="mascota-peso-ideal"
              type="number"
              step="0.01"
              min="0"
              value={pesoIdeal}
              onChange={(e) => setPesoIdeal(e.target.value)}
              aria-invalid={campo('pesoIdealKg') ? true : undefined}
              placeholder="Ej. 4.0"
              className={clases}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mascota-notas" className="text-[10px] font-extrabold text-slate-700 uppercase">
            Notas (opcional)
          </label>
          <textarea
            id="mascota-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Alergias conocidas, carácter, indicaciones del veterinario…"
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
            <span>{mascota ? 'Guardar cambios' : 'Registrar mascota'}</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}
