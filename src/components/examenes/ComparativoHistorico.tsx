'use client';

/**
 * Comparativo histórico de exámenes (Bloque N).
 *
 * Todo lo que enseña sale de `construirComparativo`: aquí no se calcula nada,
 * solo se pinta. El estado nunca va solo en color —cada celda lleva icono y
 * palabra— y la gráfica tiene su descripción textual, porque los mismos
 * números ya están en la tabla.
 */

import React from 'react';
import { ArrowDown, ArrowUp, Check, Minus, TrendingDown, TrendingUp, Scale } from 'lucide-react';
import {
  AVISO_LEGAL_COMPARATIVO,
  ETIQUETA_ESTADO,
  ETIQUETA_TENDENCIA,
  describirDelta,
  formatearRango,
  type Comparativo,
  type EstadoRango,
  type SerieAnalito,
  type Tendencia,
} from '@/lib/resultadosLaboratorio';

const ESTILO_ESTADO: Record<EstadoRango, string> = {
  NORMAL: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  ALTO: 'bg-rose-50 text-rose-800 border-rose-200',
  BAJO: 'bg-amber-50 text-amber-900 border-amber-200',
  FUERA: 'bg-rose-50 text-rose-800 border-rose-200',
  SIN_RANGO: 'bg-slate-100 text-slate-700 border-slate-200',
};

const ICONO_ESTADO: Record<EstadoRango, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  NORMAL: Check,
  ALTO: ArrowUp,
  BAJO: ArrowDown,
  FUERA: ArrowUp,
  SIN_RANGO: Minus,
};

export function ChipEstado({ estado }: { estado: EstadoRango }) {
  const Icono = ICONO_ESTADO[estado];
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${ESTILO_ESTADO[estado]}`}
    >
      <Icono aria-hidden className="h-3 w-3" />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

const ICONO_TENDENCIA: Record<Tendencia, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  SUBIENDO: TrendingUp,
  BAJANDO: TrendingDown,
  ESTABLE: Minus,
  INSUFICIENTE: Minus,
};

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function valorLegible(v: number | null, texto: string): string {
  return v === null ? texto : v.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

/**
 * Línea de evolución con la banda de referencia del ÚLTIMO informe.
 * Decorativa para la tecnología asistiva salvo por su descripción: los
 * valores ya están en la fila de la tabla.
 */
function LineaEvolucion({ serie }: { serie: SerieAnalito }) {
  const puntos = serie.puntos.filter((p) => p.valorNum !== null);
  if (puntos.length < 2) return <span className="text-[10px] font-semibold text-slate-500">—</span>;
  const W = 112;
  const H = 36;
  const P = 4;
  const ultimo = puntos[puntos.length - 1];
  const valores = puntos.map((p) => p.valorNum!);
  const extremos = [...valores, ...(ultimo.min !== null ? [ultimo.min] : []), ...(ultimo.max !== null ? [ultimo.max] : [])];
  let lo = Math.min(...extremos);
  let hi = Math.max(...extremos);
  if (lo === hi) { lo -= 1; hi += 1; }
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const x = (i: number) => P + (i / (puntos.length - 1)) * (W - 2 * P);
  const banda = ultimo.min !== null || ultimo.max !== null
    ? { y1: y(ultimo.max ?? hi), y2: y(ultimo.min ?? lo) }
    : null;
  const descripcion =
    `Evolución de ${serie.nombre} en ${serie.unidad || 'sin unidad'}: ` +
    puntos.map((p) => `${fechaCorta(p.fecha)} ${valorLegible(p.valorNum, p.valorTexto)}`).join(', ') +
    (banda ? `. Rango del último informe: ${formatearRango(ultimo.min, ultimo.max)}.` : '.');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={descripcion} className="block">
      {banda && (
        <rect x={0} y={banda.y1} width={W} height={Math.max(1, banda.y2 - banda.y1)} className="fill-emerald-100" />
      )}
      <polyline
        points={puntos.map((p, i) => `${x(i)},${y(p.valorNum!)}`).join(' ')}
        className="fill-none stroke-slate-700"
        strokeWidth={1.75}
      />
      {puntos.map((p, i) => (
        <circle
          key={p.examId}
          cx={x(i)}
          cy={y(p.valorNum!)}
          r={2.75}
          className={p.estado === 'NORMAL' ? 'fill-emerald-700' : p.estado === 'SIN_RANGO' ? 'fill-slate-500' : 'fill-rose-700'}
        />
      ))}
    </svg>
  );
}

export function AvisoLegalComparativo() {
  return (
    <p role="note" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-relaxed text-amber-900">
      <Scale aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{AVISO_LEGAL_COMPARATIVO}</span>
    </p>
  );
}

export default function ComparativoHistorico({ comparativo }: { comparativo: Comparativo }) {
  const { columnas, series } = comparativo;
  return (
    <section aria-labelledby="titulo-comparativo" className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div>
        <h3 id="titulo-comparativo" className="text-base font-extrabold leading-tight text-slate-800">
          Comparativo histórico
        </h3>
        <p className="text-xs font-semibold text-slate-500">
          Cada analito frente al rango que imprimió su laboratorio, en sus últimos {columnas.length || 'exámenes'}{' '}
          {columnas.length === 1 ? 'examen' : columnas.length ? 'exámenes' : ''}. Solo se comparan valores en la misma unidad.
        </p>
      </div>

      <AvisoLegalComparativo />

      {series.length === 0 ? (
        <p className="py-3 text-center text-xs font-semibold text-slate-500">
          Cuando registres los valores de un examen aparecerán aquí, ordenados por fecha.
        </p>
      ) : (
        <div
          className="-mx-1 overflow-x-auto px-1"
          tabIndex={0}
          role="region"
          aria-label="Tabla del comparativo histórico; se desplaza en horizontal"
        >
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-xs">
            <caption className="sr-only">
              Valores por analito y fecha, con estado frente al rango del laboratorio, variación entre los dos últimos y tendencia.
            </caption>
            <thead>
              <tr className="text-[10px] font-extrabold uppercase text-slate-600">
                <th scope="col" className="sticky left-0 border-b border-slate-200 bg-white py-2 pr-3">Analito</th>
                {columnas.map((c) => (
                  <th key={c.examId} scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2">
                    <span className="block">{fechaCorta(c.fecha)}</span>
                    <span className="block max-w-[8rem] truncate font-semibold normal-case text-slate-500">{c.examen}</span>
                  </th>
                ))}
                <th scope="col" className="whitespace-nowrap border-b border-slate-200 px-2 py-2">Δ último</th>
                <th scope="col" className="border-b border-slate-200 px-2 py-2">Tendencia</th>
                <th scope="col" className="border-b border-slate-200 px-2 py-2">Evolución</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const porExamen = new Map(s.puntos.map((p) => [p.examId, p]));
                const ultimo = s.puntos[s.puntos.length - 1];
                const IconoT = ICONO_TENDENCIA[s.tendencia];
                return (
                  <tr key={s.clave} className="align-top" data-serie={s.clave}>
                    <th scope="row" className="sticky left-0 border-b border-slate-100 bg-white py-2.5 pr-3 font-bold text-slate-800">
                      <span className="block">{s.nombre}</span>
                      <span className="block text-[10px] font-semibold text-slate-500">
                        {s.unidad || 'sin unidad'}
                        {ultimo && (ultimo.min !== null || ultimo.max !== null) && ` · ref. ${formatearRango(ultimo.min, ultimo.max)}`}
                      </span>
                      {s.otrasUnidades.length > 0 && (
                        <span className="block text-[10px] font-semibold text-slate-500">
                          También en {s.otrasUnidades.join(', ')}: no se compara
                        </span>
                      )}
                    </th>
                    {columnas.map((c) => {
                      const p = porExamen.get(c.examId);
                      return (
                        <td key={c.examId} className="whitespace-nowrap border-b border-slate-100 px-2 py-2.5">
                          {p ? (
                            <span className="flex flex-col items-start gap-1">
                              <span className="font-black text-slate-800">{valorLegible(p.valorNum, p.valorTexto)}</span>
                              <ChipEstado estado={p.estado} />
                              {!p.verificado && (
                                <span className="text-[10px] font-semibold text-slate-500">sin verificar</span>
                              )}
                            </span>
                          ) : (
                            <>
                              <span className="text-slate-500" aria-hidden="true">—</span>
                              <span className="sr-only">sin dato</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap border-b border-slate-100 px-2 py-2.5 font-bold text-slate-800">
                      {describirDelta(s.delta, s.deltaPct)}
                      {s.cruce && (
                        <span className="mt-1 block text-[10px] font-extrabold text-slate-700">
                          Cruzó: {ETIQUETA_ESTADO[s.cruce.de]} → {ETIQUETA_ESTADO[s.cruce.a]}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-slate-100 px-2 py-2.5 font-bold text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <IconoT aria-hidden className="h-3.5 w-3.5" />
                        {ETIQUETA_TENDENCIA[s.tendencia]}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2.5">
                      <LineaEvolucion serie={s} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
