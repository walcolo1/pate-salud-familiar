'use client';

/**
 * Historial clínico veterinario de una mascota (Bloque D, D4).
 *
 * Esta pantalla mira hacia atrás. La agenda mira hacia delante, y no se mezclan:
 * una consulta de hace dos años en la agenda solo serviría para enterrar lo que
 * está por venir. Por eso el historial no crea eventos ni avisos.
 *
 * El orden, el agrupado por año y los recuentos viven en `lib/historialVet`,
 * donde se pueden probar sin abrir un navegador.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoError from '@/components/ui/EstadoError';
import EstadoVacio from '@/components/ui/EstadoVacio';
import FormularioHistorialVet from '@/components/miembros/FormularioHistorialVet';
import { NOMBRE_ESPECIE, NOMBRE_TIPO_HISTORIAL, TIPOS_HISTORIAL } from '@/domain/mascotas';
import {
  FILTRO_TODOS,
  agruparPorAnio,
  descripcionEntrada,
  esFechaUtil,
  filtrarPorTipo,
  historialDe,
  resumenHistorial,
  type FiltroTipo,
} from '@/lib/historialVet';
import { fechaLarga } from '@/lib/vacunasMascota';
import { ArrowLeft, ClipboardList, Plus, Stethoscope } from 'lucide-react';

/** Cada tipo con su color. El nombre va siempre en texto: el color acompaña. */
const COLOR_TIPO: Record<string, string> = {
  CONSULTA: 'bg-teal-50 text-teal-700 border-teal-100',
  URGENCIA: 'bg-rose-50 text-rose-700 border-rose-100',
  CIRUGIA: 'bg-violet-50 text-violet-700 border-violet-100',
  DESPARASITACION: 'bg-amber-50 text-amber-700 border-amber-100',
  REVISION: 'bg-sky-50 text-sky-700 border-sky-100',
  OTRO: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function HistorialMascotaPage() {
  const router = useRouter();
  const params = useParams<{ id: string; petId: string }>();
  const id = params?.id ?? '';
  const petId = params?.petId ?? '';

  const { user, isLoading, members, pets, petHistory, addPetHistory } = useApp();
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroTipo>(FILTRO_TODOS);

  React.useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const member = members.find((m) => m.id === id);
  const mascota = (pets ?? []).find((p) => p.id === petId && !p.deletedAt);

  const todas = useMemo(() => historialDe(petHistory ?? [], petId), [petHistory, petId]);
  const resumen = useMemo(() => resumenHistorial(todas), [todas]);
  const visibles = useMemo(() => filtrarPorTipo(todas, filtro), [todas, filtro]);
  const grupos = useMemo(() => agruparPorAnio(visibles), [visibles]);

  if (isLoading || !user) return <EstadoCarga mensaje="Cargando tu expediente…" />;

  if (!member || !mascota) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Mascota no encontrada"
        mensaje="Tu expediente se abrió correctamente, pero no hay ninguna mascota con ese identificador. Puede que se haya eliminado, o que el enlace esté mal."
        accionSecundaria={{ etiqueta: 'Volver a las mascotas', href: `/members/${id}/pets` }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      <section className="flex justify-between items-center gap-3">
        <Link
          href={`/members/${id}/pets`}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>Mascotas</span>
        </Link>

        <button
          onClick={() => setFormularioAbierto(true)}
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md active:translate-y-0.5 transition-all duration-200"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          <span>Registrar atención</span>
        </button>
      </section>

      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <Stethoscope className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-800 leading-tight">
              Historial de {mascota.nombre}
            </h2>
            <p className="text-[10px] text-slate-500 font-semibold leading-none mt-1">
              {NOMBRE_ESPECIE[mascota.especie]} ·{' '}
              {resumen.total === 0
                ? 'sin atenciones registradas'
                : `${resumen.total} ${resumen.total === 1 ? 'atención' : 'atenciones'}`}
            </p>
          </div>
        </div>

        {resumen.ultima && (
          <p className="text-[11px] font-semibold text-slate-700 leading-relaxed">
            Última atención: {descripcionEntrada(resumen.ultima)}
          </p>
        )}

        {resumen.tipos.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Atenciones por tipo">
            {resumen.tipos.map((t) => (
              <li
                key={t.tipo}
                className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                  COLOR_TIPO[t.tipo] ?? COLOR_TIPO.OTRO
                }`}
              >
                {t.nombre}: {t.total}
              </li>
            ))}
          </ul>
        )}
      </section>

      {todas.length > 0 && (
        <section className="flex items-center gap-2">
          <label
            htmlFor="histvet-filtro"
            className="text-[10px] font-extrabold text-slate-700 uppercase"
          >
            Ver solo
          </label>
          <select
            id="histvet-filtro"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as FiltroTipo)}
            className="h-10 px-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
          >
            <option value={FILTRO_TODOS}>Todas las atenciones</option>
            {TIPOS_HISTORIAL.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_HISTORIAL[t]}
              </option>
            ))}
          </select>
        </section>
      )}

      <section className="flex flex-col gap-5" aria-label="Historial veterinario">
        {todas.length === 0 ? (
          <EstadoVacio
            icono={ClipboardList}
            titulo="Aún no hay atenciones registradas"
            descripcion="Apunta cada consulta, urgencia o cirugía con su diagnóstico. Dentro de un año, esto es lo que el veterinario querrá leer."
            accion={{
              tipo: 'boton',
              etiqueta: 'Registrar atención',
              onClick: () => setFormularioAbierto(true),
            }}
          />
        ) : visibles.length === 0 ? (
          // Filtrar y no encontrar nada NO es lo mismo que no tener historial:
          // el camino de salida es quitar el filtro, no registrar algo.
          <EstadoVacio
            icono={ClipboardList}
            titulo="Ninguna atención de ese tipo"
            descripcion="Hay atenciones registradas, pero ninguna del tipo que estás viendo. Cambia el filtro para verlas todas."
            accion={{
              tipo: 'boton',
              etiqueta: 'Ver todas las atenciones',
              onClick: () => setFiltro(FILTRO_TODOS),
            }}
          />
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.etiqueta} className="flex flex-col gap-3">
              <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">
                {grupo.etiqueta}
              </h3>

              {grupo.entradas.map((entrada) => (
                <article
                  key={entrada.id}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        COLOR_TIPO[entrada.tipo] ?? COLOR_TIPO.OTRO
                      }`}
                    >
                      {NOMBRE_TIPO_HISTORIAL[entrada.tipo] ?? 'Atención'}
                    </span>
                    <p className="text-[10px] font-bold text-slate-600">
                      {esFechaUtil(entrada.fecha)
                        ? fechaLarga(entrada.fecha)
                        : 'Fecha no reconocible'}
                    </p>
                  </div>

                  <h4 className="text-xs font-extrabold text-slate-800 leading-snug">
                    {entrada.diagnostico}
                  </h4>

                  {entrada.tratamiento && (
                    <p className="text-[11px] text-slate-700 font-semibold leading-relaxed">
                      Tratamiento: {entrada.tratamiento}
                    </p>
                  )}

                  {entrada.veterinario && (
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      Atendió: {entrada.veterinario}
                    </p>
                  )}
                </article>
              ))}
            </div>
          ))
        )}
      </section>

      <FormularioHistorialVet
        abierto={formularioAbierto}
        nombreMascota={mascota.nombre}
        onCerrar={() => setFormularioAbierto(false)}
        onGuardar={(entrada) => addPetHistory({ petId, ...entrada })}
      />
    </div>
  );
}
