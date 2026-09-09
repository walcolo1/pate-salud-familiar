'use client';

/**
 * Agenda unificada (C3.1).
 *
 * Hasta aquí, para saber qué le tocaba hoy a la familia había que abrir tres
 * pantallas distintas: las citas en la ficha de cada familiar, las tomas en la
 * de medicamentos y los controles en la suya. Nadie tiene una vista de «qué
 * pasa esta semana», que es justamente la pregunta que se hace a diario.
 *
 * Esta pantalla no guarda nada ni habla con ningún servicio: lee lo que ya
 * está en memoria y lo normaliza con `lib/agenda`. La sincronización con
 * Google Calendar es del Bloque E y aquí no se toca.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoVacio from '@/components/ui/EstadoVacio';
import {
  agruparPorDia,
  aFecha,
  aTexto,
  construirAgenda,
  diasDeLaSemana,
  diasDelMes,
  filtrarAgenda,
  rangoMes,
  rangoSemana,
  type EstadoEvento,
  type EventoCalendario,
  type TipoEvento,
} from '@/lib/agenda';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pill,
  Stethoscope,
  HeartPulse,
} from 'lucide-react';

type Vista = 'mes' | 'semana';

const ICONO: Record<TipoEvento, typeof Pill> = {
  cita: Stethoscope,
  dosis: Pill,
  control: HeartPulse,
};

const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  cita: 'Cita',
  dosis: 'Toma',
  control: 'Control',
};

/** Colores por estado. Todos con contraste AA sobre su propio fondo (C1.5). */
const COLOR_ESTADO: Record<EstadoEvento, string> = {
  pendiente: 'bg-teal-50 text-teal-700 border-teal-100',
  vencido: 'bg-rose-50 text-rose-700 border-rose-100',
  hecho: 'bg-slate-50 text-slate-600 border-slate-200',
  cancelado: 'bg-slate-50 text-slate-500 border-slate-200 line-through',
};

const ETIQUETA_ESTADO: Record<EstadoEvento, string> = {
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  hecho: 'Hecho',
  cancelado: 'Cancelado',
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** `2026-03-10` → `martes 10 de marzo`. */
function tituloDeDia(dia: string): string {
  const d = aFecha(dia);
  const nombre = DIAS_SEMANA[(d.getDay() + 6) % 7];
  return `${nombre} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default function AgendaPage() {
  const router = useRouter();
  const { user, isLoading, members, appointments, checkups, medicationDoseReminders } = useApp();

  const [vista, setVista] = useState<Vista>('mes');
  // El ancla es un día cualquiera dentro del periodo que se está mirando.
  const [ancla, setAncla] = useState<string>(() => aTexto(new Date()));
  const [familiarId, setFamiliarId] = useState<string>('');

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const familiares = useMemo(
    () => (members ?? []).filter((m) => !m.deletedAt && m.status !== 'DELETED'),
    [members],
  );

  const agenda = useMemo(
    () =>
      construirAgenda(
        {
          citas: appointments ?? [],
          dosis: medicationDoseReminders ?? [],
          controles: checkups ?? [],
        },
        familiares,
      ),
    [appointments, medicationDoseReminders, checkups, familiares],
  );

  const fechaAncla = aFecha(ancla);
  const rango = vista === 'mes'
    ? rangoMes(fechaAncla.getFullYear(), fechaAncla.getMonth())
    : rangoSemana(ancla);

  const dias = vista === 'mes'
    ? diasDelMes(fechaAncla.getFullYear(), fechaAncla.getMonth())
    : diasDeLaSemana(ancla);

  const visibles = useMemo(
    () => filtrarAgenda(agenda, { familiarId: familiarId || null, ...rango }),
    [agenda, familiarId, rango.desde, rango.hasta], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const porDia = useMemo(() => agruparPorDia(visibles), [visibles]);
  const diasConAlgo = dias.filter((d) => porDia[d]?.length);

  /** Mueve el ancla un mes o una semana. */
  const desplazar = (signo: 1 | -1) => {
    const d = aFecha(ancla);
    if (vista === 'mes') d.setMonth(d.getMonth() + signo);
    else d.setDate(d.getDate() + 7 * signo);
    setAncla(aTexto(d));
  };

  const titulo = vista === 'mes'
    ? `${MESES[fechaAncla.getMonth()]} de ${fechaAncla.getFullYear()}`
    : `Semana del ${aFecha(rango.desde).getDate()} al ${aFecha(rango.hasta).getDate()} de ${MESES[aFecha(rango.hasta).getMonth()]}`;

  if (isLoading || !user) {
    return <EstadoCarga mensaje="Cargando tu expediente…" />;
  }

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <CalendarDays className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 leading-tight">Agenda</h2>
            <p className="text-[10px] text-slate-500 font-semibold leading-none mt-1">
              Citas, tomas de medicamento y controles, todo junto
            </p>
          </div>
        </div>

        {/* Periodo */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => desplazar(-1)}
            aria-label={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>

          <p aria-live="polite" className="text-xs font-extrabold text-slate-800 text-center flex-1">
            {titulo}
          </p>

          <button
            type="button"
            onClick={() => desplazar(1)}
            aria-label={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Vista */}
          <div className="flex flex-col gap-1.5">
            <span id="agenda-vista-etiqueta" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Vista
            </span>
            <div role="group" aria-labelledby="agenda-vista-etiqueta" className="flex gap-1.5">
              {(['mes', 'semana'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  aria-pressed={vista === v}
                  className={`px-3.5 h-9 rounded-xl text-xs font-extrabold transition-colors ${
                    vista === v
                      ? 'bg-teal-700 text-white shadow-md shadow-teal-900/10'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {v === 'mes' ? 'Mes' : 'Semana'}
                </button>
              ))}
            </div>
          </div>

          {/* Familiar */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
            <label htmlFor="agenda-familiar" className="text-[10px] font-extrabold text-slate-700 uppercase">
              Familiar
            </label>
            <select
              id="agenda-familiar"
              value={familiarId}
              onChange={(e) => setFamiliarId(e.target.value)}
              className="h-9 px-3 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors"
            >
              <option value="">Toda la familia</option>
              {familiares.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setAncla(aTexto(new Date()))}
            className="h-9 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold transition-colors"
          >
            Hoy
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="Eventos del periodo">
        {diasConAlgo.length === 0 ? (
          <EstadoVacio
            icono={CalendarDays}
            titulo={
              familiarId
                ? 'Sin eventos de este familiar en el periodo'
                : 'Sin eventos en este periodo'
            }
            descripcion={
              familiarId
                ? 'Prueba con otro periodo, o quita el filtro para ver a toda la familia.'
                : 'Las citas y los controles se agendan desde la ficha de cada familiar, y las tomas se generan al registrar un medicamento.'
            }
            accion={
              familiarId
                ? { tipo: 'boton', etiqueta: 'Ver a toda la familia', onClick: () => setFamiliarId('') }
                : { tipo: 'enlace', etiqueta: 'Ir a familiares', href: '/members' }
            }
          />
        ) : (
          diasConAlgo.map((dia) => (
            <article key={dia} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                {tituloDeDia(dia)}
              </h3>

              <ul className="flex flex-col gap-2.5">
                {porDia[dia].map((e: EventoCalendario) => {
                  const Icono = ICONO[e.tipo];
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/members/${e.familiarId}`}
                        className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 p-2 rounded-xl border ${COLOR_ESTADO[e.estado]}`}
                        >
                          <Icono className="h-4 w-4" />
                        </span>

                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-800 truncate">
                              {e.titulo}
                            </span>
                            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
                              {ETIQUETA_TIPO[e.tipo]}
                            </span>
                            <span
                              className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${COLOR_ESTADO[e.estado]}`}
                            >
                              {ETIQUETA_ESTADO[e.estado]}
                            </span>
                          </span>

                          <span className="text-[10px] font-bold text-slate-600 truncate">
                            {e.hora ? `${e.hora} · ` : ''}
                            {e.familiarNombre}
                            {e.detalle ? ` · ${e.detalle}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
