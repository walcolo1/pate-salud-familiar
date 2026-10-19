'use client';

/**
 * Módulo 5 · Recordatorios, exámenes, documentos y gastos (Bloque O).
 *
 * Los exámenes usan el motor del Bloque N con especie MASCOTA: los rangos de
 * un informe veterinario nunca se comparan con los de una persona.
 */

import React, { useState } from 'react';
import { Bell, CalendarClock, Check, FileText, Plus, Upload } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import RegistroExamen, { type DatosExamen } from '@/components/examenes/RegistroExamen';
import ComparativoHistorico from '@/components/examenes/ComparativoHistorico';
import type { Pet } from '@/domain/mascotas';
import type { ClinicalDocument, ExamResult, MedicalExam } from '@/domain/models';
import {
  CUIDADOS,
  NOMBRE_TIPO_RECORDATORIO,
  type RecordatorioMascota,
} from '@/domain/cuidadoMascota';
import { construirComparativo, type ResultadoParaGuardar } from '@/lib/resultadosLaboratorio';
import { BOTON, BOTON_SECUNDARIO, CAMPO, Campo, Chip, Tarjeta, fechaCorta, pesos } from './ui';

interface Props {
  mascota: Pet;
  hoy: string;
  recordatorios: RecordatorioMascota[];
  gastos: { filas: Array<{ mes: string; categoria: string; total: number; registros: number }>; totalPorMes: Record<string, number>; total: number };
  examenes: MedicalExam[];
  resultados: Record<string, ExamResult[]>;
  documentos: ClinicalDocument[];
  puedeEditar: boolean;
  puedeSubirArchivos: boolean;
  onCompletar: (r: RecordatorioMascota) => void;
  onPosponer: (r: RecordatorioMascota, dias: number) => void;
  onGuardarExamen: (datos: DatosExamen, resultados: ResultadoParaGuardar[]) => void;
  onSubirDocumento: (archivo: File, categoria: string, descripcion: string) => Promise<void>;
}

const TONO = { VENCIDO: 'rojo', HOY: 'ambar', PROXIMO: 'azul' } as const;
const NOMBRE_URGENCIA = { VENCIDO: 'Vencido', HOY: 'Hoy', PROXIMO: 'Próximo' } as const;

/** Categorías de documento de una mascota → tipo de documento de la app. */
const CATEGORIAS_DOC = [
  { valor: 'CERTIFICATE', etiqueta: 'Carnet de vacunas o certificado' },
  { valor: 'PRESCRIPTION', etiqueta: 'Fórmula veterinaria' },
  { valor: 'LAB_RESULT', etiqueta: 'Resultado de examen' },
  { valor: 'OTHER', etiqueta: 'Factura' },
  { valor: 'PDF', etiqueta: 'Póliza o seguro' },
  { valor: 'IMAGE', etiqueta: 'Foto (microchip, esterilización…)' },
] as const;

const nombreCategoriaGasto = (c: string) =>
  c === 'VACUNA' ? 'Vacunas' : (CUIDADOS as Record<string, { nombre: string }>)[c]?.nombre ?? c;

const nombreMes = (m: string) => {
  const [a, mm] = m.split('-').map(Number);
  return new Date(a, mm - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
};

export default function ModuloSeguimiento(p: Props) {
  const { mascota, hoy } = p;
  const [registrando, setRegistrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState<string>('CERTIFICATE');
  const [descripcion, setDescripcion] = useState('');
  const [estadoSubida, setEstadoSubida] = useState<string | null>(null);

  const comparativo = construirComparativo(p.examenes, p.resultados, mascota.id, { especie: 'MASCOTA' });
  const meses = Object.keys(p.gastos.totalPorMes).sort().reverse();

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="Recordatorios veterinarios">
        {p.recordatorios.length === 0 ? (
          <p className="text-xs font-semibold text-slate-600">Nada pendiente en los próximos 30 días.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Recordatorios de la mascota">
            {p.recordatorios.map((r) => (
              <li key={r.clave} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3" data-recordatorio={r.tipo}>
                <Bell aria-hidden className="h-4 w-4 text-teal-700" />
                <span className="text-xs font-extrabold text-slate-900">{r.titulo}</span>
                <Chip tono={TONO[r.urgencia]}>{NOMBRE_URGENCIA[r.urgencia]}</Chip>
                <span className="text-[11px] font-semibold text-slate-700">
                  {NOMBRE_TIPO_RECORDATORIO[r.tipo]} · {fechaCorta(r.fecha)}{r.pospuesto ? ` (pospuesto desde ${fechaCorta(r.fechaOriginal)})` : ''}
                </span>
                {p.puedeEditar && (
                  <span className="ml-auto flex gap-2">
                    <button type="button" className={BOTON_SECUNDARIO} onClick={() => p.onCompletar(r)} aria-label={`Completar: ${r.titulo}`}>
                      <Check aria-hidden className="h-3.5 w-3.5" />Completar
                    </button>
                    <button type="button" className={BOTON_SECUNDARIO} onClick={() => p.onPosponer(r, 7)} aria-label={`Posponer una semana: ${r.titulo}`}>
                      <CalendarClock aria-hidden className="h-3.5 w-3.5" />Posponer 7 días
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Exámenes veterinarios"
        accion={p.puedeEditar && <button type="button" onClick={() => setRegistrando(true)} className={BOTON}><Plus aria-hidden className="h-4 w-4" />Registrar examen</button>}
      >
        {p.examenes.length === 0 && <p className="text-xs font-semibold text-slate-600">Sin exámenes registrados.</p>}
        {p.examenes.length > 0 && <ComparativoHistorico comparativo={comparativo} />}
      </Tarjeta>

      <Tarjeta
        titulo="Documentos"
        accion={p.puedeEditar && <button type="button" onClick={() => { setArchivo(null); setDescripcion(''); setEstadoSubida(null); setSubiendo(true); }} className={BOTON}><Upload aria-hidden className="h-4 w-4" />Subir documento</button>}
      >
        {p.documentos.length === 0 ? (
          <p className="text-xs font-semibold text-slate-600">Sin documentos. Sube el carnet de vacunas, fórmulas, facturas, el certificado de esterilización o microchip y la póliza.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Documentos de la mascota">
            {p.documentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
                <FileText aria-hidden className="h-4 w-4 text-teal-700" />
                {d.driveUrl ? <a href={d.driveUrl} target="_blank" rel="noreferrer" className="underline text-teal-800">{d.fileName}</a> : d.fileName}
                <span className="text-[11px] font-semibold text-slate-600">{d.clinicalCategory ?? ''} · {fechaCorta(d.uploadedAt)}{d.description ? ` · ${d.description}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Gastos">
        {p.gastos.total === 0 ? (
          <p className="text-xs font-semibold text-slate-600">Sin gastos registrados. Se suman los costos de vacunas, preventivos, consultas y «otro gasto».</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Gastos por mes y categoría; se desplaza en horizontal">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <caption className="sr-only">Gastos de {mascota.nombre} por mes y categoría</caption>
              <thead>
                <tr className="text-[10px] font-extrabold uppercase text-slate-600">
                  <th scope="col" className="py-1.5 pr-2">Mes</th>
                  <th scope="col" className="py-1.5 pr-2">Categoría</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Registros</th>
                  <th scope="col" className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((mes) => (
                  <React.Fragment key={mes}>
                    {p.gastos.filas.filter((f) => f.mes === mes).map((f) => (
                      <tr key={`${f.mes}${f.categoria}`} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 font-semibold text-slate-700">{nombreMes(f.mes)}</td>
                        <td className="py-1.5 pr-2 font-semibold text-slate-800">{nombreCategoriaGasto(f.categoria)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-slate-700">{f.registros}</td>
                        <td className="py-1.5 text-right font-bold text-slate-900">{pesos(f.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <th scope="row" colSpan={3} className="py-1.5 pr-2 font-extrabold text-slate-800">Total {nombreMes(mes)}</th>
                      <td className="py-1.5 text-right font-black text-slate-900">{pesos(p.gastos.totalPorMes[mes])}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <th scope="row" colSpan={3} className="py-1.5 pr-2 font-black text-slate-900">Total registrado</th>
                  <td className="py-1.5 text-right font-black text-slate-900">{pesos(p.gastos.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Tarjeta>

      <Dialog abierto={registrando} titulo={`Registrar examen de ${mascota.nombre}`} descripcion="Informe veterinario: sus rangos nunca se mezclan con los humanos." ancho="lg" onCerrar={() => setRegistrando(false)}>
        {registrando && (
          <RegistroExamen
            especie="MASCOTA"
            hoy={hoy}
            onGuardar={(d, r) => { p.onGuardarExamen(d, r); setRegistrando(false); }}
            onCancelar={() => setRegistrando(false)}
          />
        )}
      </Dialog>

      <Dialog abierto={subiendo} titulo={`Subir documento de ${mascota.nombre}`} onCerrar={() => setSubiendo(false)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!archivo) { setEstadoSubida('Elige un archivo.'); return; }
            setEstadoSubida('Subiendo…');
            await p.onSubirDocumento(archivo, categoria, descripcion);
            setSubiendo(false);
          }}
        >
          {!p.puedeSubirArchivos && (
            <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-900">
              En modo demostración no se suben archivos a Google Drive.
            </p>
          )}
          <Campo id="docpet-archivo" etiqueta="Archivo">
            <input id="docpet-archivo" type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-xs font-semibold text-slate-700" />
          </Campo>
          <Campo id="docpet-categoria" etiqueta="Tipo de documento">
            <select id="docpet-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CAMPO}>
              {CATEGORIAS_DOC.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
          </Campo>
          <Campo id="docpet-descripcion" etiqueta="Descripción">
            <input id="docpet-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CAMPO} />
          </Campo>
          {estadoSubida && <p role="status" className="text-xs font-semibold text-slate-700">{estadoSubida}</p>}
          <button type="submit" disabled={!p.puedeSubirArchivos} className={BOTON}><Upload aria-hidden className="h-4 w-4" />Subir</button>
        </form>
      </Dialog>
    </div>
  );
}

