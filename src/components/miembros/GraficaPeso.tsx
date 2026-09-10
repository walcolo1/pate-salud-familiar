'use client';

/**
 * GraficaPeso — la evolución del peso, legible también sin verla (D2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * SVG escrito a mano, sin biblioteca. El motivo está en `lib/pesoMascota`, y
 * el resumen es este: un `<canvas>` no lo lee nadie que no vea, y la
 * alternativa que sí dibuja SVG traía treinta paquetes y un tooltip de ratón.
 *
 * CÓMO SE LEE SIN VER
 * ───────────────────
 * Tres capas, y las tres dicen lo mismo:
 *
 *   1. El dibujo, marcado `aria-hidden`: es decoración de lo que viene debajo.
 *   2. Cada punto, **enfocable con el teclado**, con un nombre que dice fecha,
 *      peso y nota. Se recorre la serie con Tab, sin ratón.
 *   3. Una **tabla** con la serie completa, visible, no escondida. Una tabla
 *      de cinco pesajes se lee mejor que cualquier gráfica, y quien vea la
 *      gráfica no pierde nada por tenerla al lado.
 *
 * La línea de peso ideal se dibuja discontinua **y** se nombra en la leyenda:
 * un trazo distinto no se distingue si no se ve.
 */

import React from 'react';
import {
  construirGrafica,
  descripcionPunto,
  fechaCorta,
  trazo,
  LIENZO,
} from '@/lib/pesoMascota';
import type { WeightEntry } from '@/domain/mascotas';

export interface GraficaPesoProps {
  serie: WeightEntry[];
  pesoIdeal?: number | null;
  /** Nombre de la mascota, para el resumen de la gráfica. */
  nombreMascota: string;
}

export default function GraficaPeso({ serie, pesoIdeal, nombreMascota }: GraficaPesoProps) {
  const grafica = construirGrafica(serie, pesoIdeal);
  if (grafica.puntos.length === 0) return null;

  const { ancho, alto, margen } = LIENZO;
  const resumen =
    `Evolución del peso de ${nombreMascota}: ${grafica.puntos.length} ` +
    `${grafica.puntos.length === 1 ? 'registro' : 'registros'}, ` +
    `de ${grafica.puntos[0].pesoKg} kg a ${grafica.puntos[grafica.puntos.length - 1].pesoKg} kg.`;

  return (
    <div className="flex flex-col gap-4">
      <figure className="flex flex-col gap-2 m-0">
        <figcaption className="text-[10px] font-bold text-slate-600">{resumen}</figcaption>

        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          role="img"
          aria-label={resumen}
          className="w-full h-auto rounded-2xl border border-slate-100 bg-slate-50"
        >
          {/* Rejilla y etiquetas del eje vertical. */}
          <g aria-hidden="true">
            {grafica.marcasY.map((m) => (
              <g key={m.valor}>
                <line
                  x1={margen.izquierda}
                  y1={m.y}
                  x2={ancho - margen.derecha}
                  y2={m.y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={margen.izquierda - 4}
                  y={m.y + 3}
                  textAnchor="end"
                  fontSize="7"
                  fill="#62748e"
                  fontWeight="700"
                >
                  {m.valor}
                </text>
              </g>
            ))}

            {/* Peso ideal: discontinuo, y nombrado en la leyenda de abajo. */}
            {grafica.yIdeal !== null && (
              <line
                x1={margen.izquierda}
                y1={grafica.yIdeal}
                x2={ancho - margen.derecha}
                y2={grafica.yIdeal}
                stroke="#00786f"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            )}

            {/* La línea de la serie. */}
            <path d={trazo(grafica.puntos)} fill="none" stroke="#00786f" strokeWidth="2" />

            {/* Fechas del eje horizontal: solo la primera y la última, o no cabe. */}
            {[grafica.puntos[0], grafica.puntos[grafica.puntos.length - 1]]
              .filter((p, i, a) => a.indexOf(p) === i)
              .map((p, i, a) => (
                <text
                  key={p.id}
                  x={p.x}
                  y={alto - 6}
                  textAnchor={a.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
                  fontSize="7"
                  fill="#62748e"
                  fontWeight="700"
                >
                  {fechaCorta(p.fecha)}
                </text>
              ))}
          </g>

          {/*
            Los puntos SÍ son accesibles: cada uno se enfoca con Tab y se
            anuncia con su fecha y su peso. Es la forma de recorrer la serie
            sin ratón y sin ver el dibujo.
          */}
          {grafica.puntos.map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#ffffff"
              stroke="#00786f"
              strokeWidth="2"
              tabIndex={0}
              role="img"
              aria-label={descripcionPunto(p)}
              className="focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <title>{descripcionPunto(p)}</title>
            </circle>
          ))}
        </svg>

        {grafica.yIdeal !== null && (
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
            <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-teal-700" />
            <span>Línea discontinua: peso ideal ({pesoIdeal} kg)</span>
          </p>
        )}
      </figure>

      {/*
        La misma serie como tabla. No está escondida a propósito: cinco pesajes
        se leen mejor así que en cualquier gráfica.
      */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <caption className="text-left text-[10px] font-extrabold text-slate-700 uppercase pb-2">
            Registros de peso de {nombreMascota}
          </caption>
          <thead>
            <tr className="border-b border-slate-200">
              <th scope="col" className="py-2 pr-3 text-[10px] font-extrabold text-slate-700 uppercase">
                Fecha
              </th>
              <th scope="col" className="py-2 pr-3 text-[10px] font-extrabold text-slate-700 uppercase">
                Peso
              </th>
              <th scope="col" className="py-2 text-[10px] font-extrabold text-slate-700 uppercase">
                Nota
              </th>
            </tr>
          </thead>
          <tbody>
            {[...grafica.puntos].reverse().map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="py-2 pr-3 text-[11px] font-bold text-slate-800 whitespace-nowrap">
                  {fechaCorta(p.fecha)}
                </th>
                <td className="py-2 pr-3 text-[11px] font-bold text-slate-800 tabular-nums whitespace-nowrap">
                  {p.pesoKg} kg
                </td>
                <td className="py-2 text-[11px] text-slate-600">{p.nota ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
