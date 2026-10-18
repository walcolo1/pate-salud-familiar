'use client';

/**
 * Registro de un examen con bandeja de verificación (Bloque N).
 *
 * Tres maneras de traer los valores —PDF, texto pegado o a mano— y una sola
 * de guardarlos: pasando por la tabla editable y marcando que se revisó. El
 * PDF se lee en este navegador (`extraerTextoPdf`) y el texto lo interpreta
 * `parsearInforme`, sin red: el informe no sale del dispositivo.
 */

import React, { useId, useMemo, useState } from 'react';
import { FileUp, ClipboardPaste, PenLine, Plus, Trash2, AlertTriangle, Save } from 'lucide-react';
import { ChipEstado } from './ComparativoHistorico';
import {
  ETIQUETA_CONFIANZA,
  especieIncompatible,
  filaAResultado,
  filaDesdeExtraida,
  filaVacia,
  parsearInforme,
  validarFila,
  type Especie,
  type FilaVerificacion,
  type ResultadoParaGuardar,
} from '@/lib/resultadosLaboratorio';
import { excedeTamanoPdf, extraerTextoPdf, type ResultadoPdf } from '@/lib/extraerTextoPdf';

export interface DatosExamen {
  examName: string;
  orderedDate: string;
  orderedBy: string | null;
  laboratory: string | null;
}

export interface RegistroExamenProps {
  especie: Especie;
  hoy: string;
  onGuardar: (examen: DatosExamen, resultados: ResultadoParaGuardar[]) => void;
  onCancelar: () => void;
}

type Modo = 'pdf' | 'texto' | 'manual';

const MENSAJES_PDF: Record<Exclude<ResultadoPdf['estado'], 'ok'>, string> = {
  sin_texto: 'El PDF no tiene texto que se pueda leer (parece escaneado). Pega el texto o agrega los valores a mano.',
  ilegible: 'No se pudo leer el PDF: puede estar dañado o protegido con contraseña. Pega el texto o agrega los valores a mano.',
  demasiado_grande: 'El archivo supera los 8 MB.',
};

const CAMPO =
  'h-11 px-4 bg-white border border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition-colors';
const CELDA =
  'h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20';

let contador = 0;
const nuevaClave = () => `fila-${Date.now()}-${contador++}`;

export default function RegistroExamen({ especie, hoy, onGuardar, onCancelar }: RegistroExamenProps) {
  const ids = useId();
  const [examName, setExamName] = useState('');
  const [orderedDate, setOrderedDate] = useState(hoy);
  const [fechaTocada, setFechaTocada] = useState(false);
  const [orderedBy, setOrderedBy] = useState('');
  const [laboratory, setLaboratory] = useState('');

  const [modo, setModo] = useState<Modo>('pdf');
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [errorFuente, setErrorFuente] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [bloqueoEspecie, setBloqueoEspecie] = useState(false);
  const [filas, setFilas] = useState<FilaVerificacion[]>([]);
  const [revisado, setRevisado] = useState(false);
  const [lectura, setLectura] = useState<string | null>(null);

  const validaciones = useMemo(() => filas.map(validarFila), [filas]);
  const hayErrores = validaciones.some((v) => v.errores.length > 0);
  const puedeGuardar =
    examName.trim().length > 0 &&
    orderedDate.length === 10 &&
    !bloqueoEspecie &&
    !hayErrores &&
    (filas.length === 0 || revisado);

  const analizar = (contenido: string, origen: string) => {
    const informe = parsearInforme(contenido, especie);
    const bloqueado = especieIncompatible(informe, especie);
    setBloqueoEspecie(bloqueado);
    setAvisos(informe.avisos);
    setRevisado(false);
    if (bloqueado) {
      setFilas([]);
      setLectura(null);
      return;
    }
    setFilas(informe.filas.map((f) => filaDesdeExtraida(f, nuevaClave())));
    if (informe.fecha && !fechaTocada) setOrderedDate(informe.fecha);
    if (informe.laboratorio && !laboratory.trim()) setLaboratory(informe.laboratorio);
    setLectura(
      `${origen}: ${informe.filas.length} ${informe.filas.length === 1 ? 'valor reconocido' : 'valores reconocidos'}` +
        `${informe.fecha ? `, fecha de muestra ${informe.fecha}` : ''}. Revísalos uno por uno antes de guardar.`,
    );
  };

  const alElegirPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    setErrorFuente(null);
    if (!archivo) return;
    if (excedeTamanoPdf(archivo.size)) {
      setErrorFuente(MENSAJES_PDF.demasiado_grande);
      return;
    }
    setLeyendo(true);
    try {
      const r = await extraerTextoPdf(new Uint8Array(await archivo.arrayBuffer()), undefined, { conLineas: true });
      if (r.estado === 'ok') {
        setTexto(r.texto);
        analizar(r.texto, `«${archivo.name}»`);
      } else {
        setErrorFuente(MENSAJES_PDF[r.estado]);
      }
    } catch {
      setErrorFuente(MENSAJES_PDF.ilegible);
    } finally {
      setLeyendo(false);
    }
  };

  const cambiarFila = (clave: string, campo: keyof Omit<FilaVerificacion, 'clave' | 'origen' | 'editada'>, valor: string) => {
    setRevisado(false);
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, [campo]: valor, editada: true } : f)));
  };

  const agregarFila = () => {
    setRevisado(false);
    setFilas((prev) => [...prev, filaVacia(nuevaClave())]);
  };

  const quitarFila = (clave: string) => {
    setRevisado(false);
    setFilas((prev) => prev.filter((f) => f.clave !== clave));
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    onGuardar(
      {
        examName: examName.trim(),
        orderedDate,
        orderedBy: orderedBy.trim() || null,
        laboratory: laboratory.trim() || null,
      },
      filas.map((f) => filaAResultado(f, hoy)),
    );
  };

  const MODOS: { id: Modo; etiqueta: string; Icono: typeof FileUp }[] = [
    { id: 'pdf', etiqueta: 'Subir PDF', Icono: FileUp },
    { id: 'texto', etiqueta: 'Pegar texto', Icono: ClipboardPaste },
    { id: 'manual', etiqueta: 'A mano', Icono: PenLine },
  ];

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4" aria-describedby={`${ids}-privacidad`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${ids}-nombre`} className="text-[10px] font-extrabold uppercase text-slate-700">Nombre del examen</label>
          <input id={`${ids}-nombre`} type="text" required value={examName} onChange={(e) => setExamName(e.target.value)}
            placeholder="Ej. Perfil lipídico, Hemograma completo" className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-fecha`} className="text-[10px] font-extrabold uppercase text-slate-700">Fecha de la muestra</label>
          <input id={`${ids}-fecha`} type="date" required value={orderedDate}
            onChange={(e) => { setOrderedDate(e.target.value); setFechaTocada(true); }} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-lab`} className="text-[10px] font-extrabold uppercase text-slate-700">Laboratorio (opcional)</label>
          <input id={`${ids}-lab`} type="text" value={laboratory} onChange={(e) => setLaboratory(e.target.value)}
            placeholder="Ej. Laboratorio Clínico Niza" className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${ids}-medico`} className="text-[10px] font-extrabold uppercase text-slate-700">Médico que ordena (opcional)</label>
          <input id={`${ids}-medico`} type="text" value={orderedBy} onChange={(e) => setOrderedBy(e.target.value)}
            placeholder="Ej. Dr. Ramírez" className={CAMPO} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3">
        <legend className="px-1 text-[10px] font-black uppercase text-slate-800">Valores del informe</legend>
        <p id={`${ids}-privacidad`} className="text-[11px] font-semibold text-slate-600">
          El PDF se lee en este dispositivo: no se sube ni se envía a ningún servicio.
        </p>

        <div role="group" aria-label="Cómo traer los valores" className="grid grid-cols-3 gap-2">
          {MODOS.map(({ id, etiqueta, Icono }) => (
            <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border text-[11px] font-extrabold transition-colors ${
                modo === id ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}>
              <Icono aria-hidden className="h-4 w-4" />
              {etiqueta}
            </button>
          ))}
        </div>

        {modo === 'pdf' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-pdf`} className="text-[10px] font-extrabold uppercase text-slate-700">Informe en PDF (hasta 8 MB)</label>
            <input id={`${ids}-pdf`} type="file" accept="application/pdf,.pdf" onChange={alElegirPdf} disabled={leyendo}
              className="text-xs font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-teal-800" />
            {leyendo && <p role="status" className="text-xs font-semibold text-slate-600">Leyendo el PDF…</p>}
          </div>
        )}

        {modo === 'texto' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-texto`} className="text-[10px] font-extrabold uppercase text-slate-700">Texto del informe</label>
            <textarea id={`${ids}-texto`} rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder={'GLUCOSA 95 mg/dL 70 - 100\nCOLESTEROL TOTAL 193 mg/dL 80 - 200'}
              className="rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
            <button type="button" onClick={() => { setErrorFuente(null); analizar(texto, 'Texto pegado'); }} disabled={!texto.trim()}
              className="h-10 self-start rounded-xl bg-slate-800 px-4 text-xs font-extrabold text-white hover:bg-slate-900 disabled:opacity-50">
              Leer valores del texto
            </button>
          </div>
        )}

        {modo === 'manual' && filas.length === 0 && (
          <p className="text-xs font-semibold text-slate-600">Agrega una fila por cada valor del informe.</p>
        )}

        {errorFuente && <p role="alert" className="text-xs font-bold text-rose-800">{errorFuente}</p>}
        {lectura && <p role="status" className="text-xs font-semibold text-teal-800">{lectura}</p>}
        {avisos.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 p-2.5" aria-label="Avisos de la lectura">
            {avisos.map((a) => (
              <li key={a} className="flex items-start gap-1.5 text-[11px] font-bold text-amber-900">
                <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <section aria-labelledby={`${ids}-bandeja`} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h4 id={`${ids}-bandeja`} className="text-[10px] font-black uppercase text-slate-800">
            Verificación ({filas.length} {filas.length === 1 ? 'valor' : 'valores'})
          </h4>
          <button type="button" onClick={agregarFila} disabled={bloqueoEspecie}
            className="flex h-9 items-center gap-1 rounded-xl border border-slate-300 px-3 text-[11px] font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            <Plus aria-hidden className="h-4 w-4" /> Agregar fila
          </button>
        </div>

        {filas.length > 0 && (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de verificación; se desplaza en horizontal">
            <table className="w-full min-w-[44rem] border-separate border-spacing-y-1 text-left text-xs">
              <caption className="sr-only">Valores leídos del informe. Corrige lo que no coincida con el papel.</caption>
              <thead>
                <tr className="text-[10px] font-extrabold uppercase text-slate-600">
                  <th scope="col" className="w-[30%] px-1">Analito</th>
                  <th scope="col" className="px-1">Valor</th>
                  <th scope="col" className="px-1">Unidad</th>
                  <th scope="col" className="px-1">Mín. / texto ref.</th>
                  <th scope="col" className="px-1">Máx.</th>
                  <th scope="col" className="px-1">Estado</th>
                  <th scope="col" className="px-1"><span className="sr-only">Quitar</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const v = validaciones[i];
                  const n = i + 1;
                  const idError = `${ids}-err-${f.clave}`;
                  const conError = v.errores.length > 0;
                  const desc = conError ? idError : undefined;
                  return (
                    <React.Fragment key={f.clave}>
                      <tr data-fila-verificacion={n}>
                        <td className="px-1">
                          <input aria-label={`Analito, fila ${n}`} value={f.analito} aria-invalid={!f.analito.trim() || undefined} aria-describedby={desc}
                            onChange={(e) => cambiarFila(f.clave, 'analito', e.target.value)} className={CELDA} />
                          <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{ETIQUETA_CONFIANZA[f.editada && f.origen !== 'MANUAL' ? 'CORREGIDO' : f.origen]}</span>
                        </td>
                        <td className="px-1">
                          <input aria-label={`Valor, fila ${n}`} value={f.valor} inputMode="decimal" aria-invalid={!f.valor.trim() || undefined} aria-describedby={desc}
                            onChange={(e) => cambiarFila(f.clave, 'valor', e.target.value)} className={CELDA} />
                        </td>
                        <td className="px-1">
                          <input aria-label={`Unidad, fila ${n}`} value={f.unidad} aria-describedby={desc}
                            onChange={(e) => cambiarFila(f.clave, 'unidad', e.target.value)} className={CELDA} />
                        </td>
                        <td className="px-1">
                          <input aria-label={`Mínimo de referencia, fila ${n}`} value={f.min} aria-describedby={desc}
                            onChange={(e) => cambiarFila(f.clave, 'min', e.target.value)} className={CELDA} />
                        </td>
                        <td className="px-1">
                          <input aria-label={`Máximo de referencia, fila ${n}`} value={f.max} inputMode="decimal" aria-describedby={desc}
                            onChange={(e) => cambiarFila(f.clave, 'max', e.target.value)} className={CELDA} />
                        </td>
                        <td className="px-1"><ChipEstado estado={v.estado} /></td>
                        <td className="px-1">
                          <button type="button" onClick={() => quitarFila(f.clave)} aria-label={`Quitar fila ${n}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-800">
                            <Trash2 aria-hidden className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {conError && (
                        <tr>
                          <td colSpan={7} id={idError} className="px-1 text-[11px] font-bold text-rose-800">
                            Fila {n}: {v.errores.join(' ')}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filas.length > 0 && (
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-800">
            <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-teal-700" />
            Revisé cada valor contra el informe original y coinciden.
          </label>
        )}
      </section>

      {bloqueoEspecie && (
        <p role="alert" className="text-xs font-bold text-rose-800">
          Este informe no se puede guardar en esta ficha. Si es de otra persona o de una mascota, regístralo en su ficha.
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="h-11 flex-1 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-800 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={!puedeGuardar}
          className="flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-teal-700 text-xs font-extrabold text-white hover:bg-teal-800 disabled:opacity-50">
          <Save aria-hidden className="h-4 w-4" />
          Guardar examen{filas.length ? ` y ${filas.length} ${filas.length === 1 ? 'valor' : 'valores'}` : ''}
        </button>
      </div>
    </form>
  );
}
