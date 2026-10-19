'use client';

/** Módulo 4 · Medicamentos, tratamientos y tomas (Bloque O). */

import React, { useState } from 'react';
import { Check, Pill, Plus, Save, X } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { hoyLocal, type Pet, type Validacion } from '@/domain/mascotas';
import {
  FRECUENCIAS_TRATAMIENTO,
  NOMBRE_ESTADO_TRATAMIENTO,
  NOMBRE_FRECUENCIA,
  NOMBRE_TIPO_TRATAMIENTO,
  NOMBRE_VIA,
  TIPOS_TRATAMIENTO,
  UNIDADES_DOSIS,
  VIAS,
  cumplimiento,
  tomasPorMarcar,
  type EstadoToma,
  type EstadoTratamiento,
  type FrecuenciaTratamiento,
  type TipoTratamiento,
  type TomaMascota,
  type TratamientoMascota,
  type UnidadDosis,
  type Via,
} from '@/domain/cuidadoMascota';
import { BOTON, BOTON_SECUNDARIO, CAMPO, Campo, Chip, Errores, Tarjeta, fechaCorta } from './ui';

type Entrada = Omit<TratamientoMascota, 'id' | 'memberId'> & { id?: string };

interface Props {
  mascota: Pet;
  tratamientos: TratamientoMascota[];
  tomas: TomaMascota[];
  ahora: string;
  puedeEditar: boolean;
  onGuardar: (t: Entrada) => Validacion;
  onMarcar: (tratamientoId: string, programadaEn: string, estado: EstadoToma) => void;
}

const momento = (iso: string) => `${fechaCorta(iso.slice(0, 10))}, ${iso.slice(11, 16)}`;

export default function ModuloMedicamentos({ mascota, tratamientos, tomas, ahora, puedeEditar, onGuardar, onMarcar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoTratamiento>('ANTIBIOTICO');
  const [dosisValor, setDosisValor] = useState('');
  const [dosisUnidad, setDosisUnidad] = useState<UnidadDosis>('mg');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaTratamiento>('CADA_12H');
  const [via, setVia] = useState<Via>('ORAL');
  const [fechaInicio, setFechaInicio] = useState(hoyLocal());
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [fechaFin, setFechaFin] = useState('');
  const [indicaciones, setIndicaciones] = useState('');
  const [efectos, setEfectos] = useState('');
  const [prescritoPor, setPrescritoPor] = useState('');
  const [problemas, setProblemas] = useState<Array<{ campo: string; mensaje: string }>>([]);

  const abrir = () => {
    setNombre(''); setTipo('ANTIBIOTICO'); setDosisValor(''); setDosisUnidad('mg'); setFrecuencia('CADA_12H'); setVia('ORAL');
    setFechaInicio(hoyLocal()); setHoraInicio('08:00'); setFechaFin(''); setIndicaciones(''); setEfectos('');
    setPrescritoPor(mascota.ficha?.veterinario?.nombre ?? ''); setProblemas([]); setAbierto(true);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = onGuardar({
      petId: mascota.id, nombre, tipo, dosisValor: Number(dosisValor.replace(',', '.')), dosisUnidad, frecuencia, via,
      fechaInicio, horaInicio, fechaFin: fechaFin || null, indicaciones: indicaciones || null,
      efectosSecundarios: efectos || null, prescritoPor: prescritoPor || null, estado: 'ACTIVO',
    });
    if (r.valido) setAbierto(false); else setProblemas(r.problemas);
  };

  const cambiarEstado = (t: TratamientoMascota, estado: EstadoTratamiento) => {
    const { id, petId, nombre: n, tipo: ti, dosisValor: dv, dosisUnidad: du, frecuencia: fr, via: vi, fechaInicio: fi, horaInicio: hi,
      fechaFin: ff, indicaciones: ind, efectosSecundarios: ef, prescritoPor: pp } = t;
    onGuardar({ id, petId, nombre: n, tipo: ti, dosisValor: dv, dosisUnidad: du, frecuencia: fr, via: vi, fechaInicio: fi, horaInicio: hi,
      fechaFin: estado === 'ACTIVO' ? ff : ff ?? ahora.slice(0, 10), indicaciones: ind, efectosSecundarios: ef, prescritoPor: pp, estado });
  };

  const lista = tratamientos.filter((t) => t.petId === mascota.id && !t.deletedAt)
    .sort((a, b) => (a.estado === b.estado ? b.fechaInicio.localeCompare(a.fechaInicio) : a.estado === 'ACTIVO' ? -1 : 1));

  return (
    <Tarjeta
      titulo="Medicamentos y tratamientos"
      accion={puedeEditar && <button type="button" onClick={abrir} className={BOTON}><Plus aria-hidden className="h-4 w-4" />Nuevo tratamiento</button>}
    >
      {lista.length === 0 ? (
        <p className="text-xs font-semibold text-slate-600">Sin tratamientos registrados.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Tratamientos">
          {lista.map((t) => {
            const c = cumplimiento(t, tomas, ahora);
            const porMarcar = puedeEditar ? tomasPorMarcar(t, tomas, ahora, 3) : [];
            return (
              <li key={t.id} className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3" data-tratamiento={t.nombre}>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill aria-hidden className="h-4 w-4 text-teal-700" />
                  <span className="text-xs font-extrabold text-slate-900">{t.nombre}</span>
                  <Chip tono="azul">{NOMBRE_TIPO_TRATAMIENTO[t.tipo]}</Chip>
                  <Chip tono={t.estado === 'ACTIVO' ? 'verde' : 'gris'}>{NOMBRE_ESTADO_TRATAMIENTO[t.estado]}</Chip>
                </div>
                <p className="text-[11px] font-semibold text-slate-700">
                  {t.dosisValor} {t.dosisUnidad} · {NOMBRE_FRECUENCIA[t.frecuencia]} · {NOMBRE_VIA[t.via]} · del {fechaCorta(t.fechaInicio)}
                  {t.fechaFin ? ` al ${fechaCorta(t.fechaFin)}` : ' (sin fecha de fin)'}
                  {t.prescritoPor ? ` · ${t.prescritoPor}` : ''}
                </p>
                {t.indicaciones && <p className="text-[11px] font-semibold text-slate-700">Indicaciones: {t.indicaciones}</p>}
                {t.efectosSecundarios && <p className="text-[11px] font-semibold text-slate-700">Vigilar: {t.efectosSecundarios}</p>}
                <p className="text-[11px] font-bold text-slate-800" data-cumplimiento>
                  Cumplimiento: {c.porcentaje === null ? 'aún sin tomas vencidas' : `${c.porcentaje} % (${c.aplicadas} de ${c.vencidas} tomas)`}
                  {c.omitidas ? ` · ${c.omitidas} omitida${c.omitidas === 1 ? '' : 's'}` : ''}
                  {c.proxima ? ` · próxima: ${momento(c.proxima)}` : ''}
                </p>
                {porMarcar.length > 0 && (
                  <ul className="flex flex-col gap-1.5" aria-label={`Tomas de ${t.nombre} por marcar`}>
                    {porMarcar.map((m) => (
                      <li key={m} className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-800">{momento(m)}</span>
                        <button type="button" onClick={() => onMarcar(t.id, m, 'APLICADA')} className={BOTON_SECUNDARIO} aria-label={`Marcar como aplicada la toma de ${t.nombre} del ${momento(m)}`}>
                          <Check aria-hidden className="h-3.5 w-3.5" />Aplicada
                        </button>
                        <button type="button" onClick={() => onMarcar(t.id, m, 'OMITIDA')} className={BOTON_SECUNDARIO} aria-label={`Marcar como omitida la toma de ${t.nombre} del ${momento(m)}`}>
                          <X aria-hidden className="h-3.5 w-3.5" />Omitida
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {puedeEditar && t.estado === 'ACTIVO' && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => cambiarEstado(t, 'COMPLETADO')} className={BOTON_SECUNDARIO}>Marcar completado</button>
                    <button type="button" onClick={() => cambiarEstado(t, 'SUSPENDIDO')} className={BOTON_SECUNDARIO}>Suspender</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog abierto={abierto} titulo={`Nuevo tratamiento de ${mascota.nombre}`} onCerrar={() => setAbierto(false)} ancho="lg">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <Errores problemas={problemas} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="trat-nombre" etiqueta="Medicamento"><input id="trat-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="trat-tipo" etiqueta="Tipo">
              <select id="trat-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTratamiento)} className={CAMPO}>
                {TIPOS_TRATAMIENTO.map((x) => <option key={x} value={x}>{NOMBRE_TIPO_TRATAMIENTO[x]}</option>)}
              </select>
            </Campo>
            <Campo id="trat-dosis" etiqueta="Dosis"><input id="trat-dosis" type="number" min="0" step="any" value={dosisValor} onChange={(e) => setDosisValor(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="trat-unidad" etiqueta="Unidad">
              <select id="trat-unidad" value={dosisUnidad} onChange={(e) => setDosisUnidad(e.target.value as UnidadDosis)} className={CAMPO}>
                {UNIDADES_DOSIS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Campo>
            <Campo id="trat-frecuencia" etiqueta="Frecuencia">
              <select id="trat-frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaTratamiento)} className={CAMPO}>
                {FRECUENCIAS_TRATAMIENTO.map((x) => <option key={x} value={x}>{NOMBRE_FRECUENCIA[x]}</option>)}
              </select>
            </Campo>
            <Campo id="trat-via" etiqueta="Vía de administración">
              <select id="trat-via" value={via} onChange={(e) => setVia(e.target.value as Via)} className={CAMPO}>
                {VIAS.map((x) => <option key={x} value={x}>{NOMBRE_VIA[x]}</option>)}
              </select>
            </Campo>
            <Campo id="trat-inicio" etiqueta="Fecha de inicio"><input id="trat-inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="trat-hora" etiqueta="Hora de la primera toma"><input id="trat-hora" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="trat-fin" etiqueta="Fecha de fin"><input id="trat-fin" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="trat-prescrito" etiqueta="Indicado por"><input id="trat-prescrito" value={prescritoPor} onChange={(e) => setPrescritoPor(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="trat-indicaciones" etiqueta="Indicaciones"><input id="trat-indicaciones" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} placeholder="Ej. Con comida" className={CAMPO} /></Campo>
            <Campo id="trat-efectos" etiqueta="Efectos secundarios a vigilar"><input id="trat-efectos" value={efectos} onChange={(e) => setEfectos(e.target.value)} className={CAMPO} /></Campo>
          </div>
          <button type="submit" className={BOTON}><Save aria-hidden className="h-4 w-4" />Guardar tratamiento</button>
        </form>
      </Dialog>
    </Tarjeta>
  );
}
