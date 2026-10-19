'use client';

/** Módulo 2 · Vacunas veterinarias, esenciales y opcionales (Bloque O). */

import React, { useState } from 'react';
import { Plus, Save, Syringe } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { hoyLocal, type Pet, type Validacion, type VaccineEntry } from '@/domain/mascotas';
import {
  NOMBRE_TIPO_VACUNA,
  buscarVacunaCatalogo,
  proximaDosisPropuesta,
  vacunasDeEspecie,
  type TipoVacuna,
} from '@/domain/cuidadoMascota';
import { estadoDeVacuna } from '@/lib/vacunasMascota';
import type { ClinicalDocument } from '@/domain/models';
import { BOTON, CAMPO, Campo, Chip, Errores, Tarjeta, fechaCorta, numeroOpcional, pesos } from './ui';

export interface EntradaVacunaVet {
  vacuna: string;
  fecha: string;
  proximaDosis: string | null;
  lote: string | null;
  laboratorio: string | null;
  veterinario: string | null;
  clinica: string | null;
  tipo: TipoVacuna | null;
  certificadoDocId: string | null;
  costo: number | null;
}

interface Props {
  mascota: Pet;
  vacunas: VaccineEntry[];
  documentos: ClinicalDocument[];
  puedeEditar: boolean;
  onGuardar: (e: EntradaVacunaVet) => Validacion;
}

const TONO_ESTADO = { vencida: 'rojo', proxima: 'ambar', 'al-dia': 'verde', 'sin-refuerzo': 'gris' } as const;
const NOMBRE_ESTADO = { vencida: 'Vencida', proxima: 'Próxima', 'al-dia': 'Al día', 'sin-refuerzo': 'Sin refuerzo' } as const;

export default function ModuloVacunas({ mascota, vacunas, documentos, puedeEditar, onGuardar }: Props) {
  const catalogo = vacunasDeEspecie(mascota.especie);
  const [abierto, setAbierto] = useState(false);
  const [vacuna, setVacuna] = useState('');
  const [tipo, setTipo] = useState<TipoVacuna | ''>('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [proxima, setProxima] = useState('');
  const [proximaTocada, setProximaTocada] = useState(false);
  const [lote, setLote] = useState('');
  const [laboratorio, setLaboratorio] = useState('');
  const [veterinario, setVeterinario] = useState('');
  const [clinica, setClinica] = useState('');
  const [certificado, setCertificado] = useState('');
  const [costo, setCosto] = useState('');
  const [problemas, setProblemas] = useState<Array<{ campo: string; mensaje: string }>>([]);

  const abrir = () => {
    setVacuna(''); setTipo(''); setFecha(hoyLocal()); setProxima(''); setProximaTocada(false);
    setLote(''); setLaboratorio(''); setVeterinario(mascota.ficha?.veterinario?.nombre ?? ''); setClinica(mascota.ficha?.veterinario?.clinica ?? '');
    setCertificado(''); setCosto(''); setProblemas([]); setAbierto(true);
  };

  /** Al elegir del catálogo, se proponen el tipo y la próxima dosis. */
  const recalcular = (nombre: string, f: string) => {
    const c = buscarVacunaCatalogo(mascota.especie, nombre);
    if (c) setTipo(c.tipo);
    if (!proximaTocada) setProxima(proximaDosisPropuesta(mascota.especie, nombre, f) ?? '');
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = onGuardar({
      vacuna, fecha, proximaDosis: proxima || null, lote: lote || null, laboratorio: laboratorio || null,
      veterinario: veterinario || null, clinica: clinica || null, tipo: tipo || null,
      certificadoDocId: certificado || null, costo: numeroOpcional(costo),
    });
    if (r.valido) setAbierto(false); else setProblemas(r.problemas);
  };

  const ordenadas = [...vacunas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const docs = documentos.filter((d) => !d.deletedAt);

  return (
    <Tarjeta
      titulo="Vacunas"
      accion={puedeEditar && <button type="button" onClick={abrir} className={BOTON}><Plus aria-hidden className="h-4 w-4" />Registrar vacuna</button>}
    >
      {catalogo.length > 0 && (
        <p className="text-[11px] font-semibold text-slate-600">
          Esenciales para {mascota.nombre}: {catalogo.filter((c) => c.tipo === 'CORE').map((c) => c.nombre).join(', ')}.
          Opcionales según riesgo: {catalogo.filter((c) => c.tipo === 'NO_CORE').map((c) => c.nombre).join(', ') || 'ninguna'}.
        </p>
      )}
      {ordenadas.length === 0 ? (
        <p className="text-xs font-semibold text-slate-600">Sin vacunas registradas.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Vacunas aplicadas">
          {ordenadas.map((v) => {
            const est = estadoDeVacuna(v);
            const tipoV = v.tipo ?? buscarVacunaCatalogo(mascota.especie, v.vacuna)?.tipo ?? null;
            const doc = v.certificadoDocId ? docs.find((d) => d.id === v.certificadoDocId) : null;
            return (
              <li key={v.id} className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Syringe aria-hidden className="h-4 w-4 text-teal-700" />
                  <span className="text-xs font-extrabold text-slate-900">{v.vacuna}</span>
                  {tipoV && <Chip tono={tipoV === 'CORE' ? 'azul' : 'gris'}>{NOMBRE_TIPO_VACUNA[tipoV]}</Chip>}
                  <Chip tono={TONO_ESTADO[est.estado]}>{NOMBRE_ESTADO[est.estado]}</Chip>
                </div>
                <p className="text-[11px] font-semibold text-slate-700">
                  Aplicada el {fechaCorta(v.fecha)}
                  {v.lote ? ` · lote ${v.lote}` : ''}
                  {v.veterinario ? ` · ${v.veterinario}` : ''}
                  {v.clinica ? ` · ${v.clinica}` : ''}
                  {v.costo ? ` · ${pesos(v.costo)}` : ''}
                </p>
                <p className="text-[11px] font-semibold text-slate-700">{est.mensaje}</p>
                {doc && (
                  doc.driveUrl ? (
                    <a href={doc.driveUrl} target="_blank" rel="noreferrer" className="text-[11px] font-extrabold text-teal-800 underline">Ver certificado: {doc.fileName}</a>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-700">Certificado: {doc.fileName}</span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog abierto={abierto} titulo={`Registrar vacuna de ${mascota.nombre}`} onCerrar={() => setAbierto(false)} ancho="lg">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <Errores problemas={problemas} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="vacvet-nombre" etiqueta="Vacuna" ayuda="Elige del catálogo de la especie o escribe otra.">
              <input id="vacvet-nombre" list="vacvet-catalogo" value={vacuna} aria-describedby="vacvet-nombre-ayuda"
                onChange={(e) => { setVacuna(e.target.value); recalcular(e.target.value, fecha); }} className={CAMPO} />
              <datalist id="vacvet-catalogo">
                {catalogo.map((c) => <option key={c.nombre} value={c.nombre} />)}
              </datalist>
            </Campo>
            <Campo id="vacvet-tipo" etiqueta="Tipo de vacuna">
              <select id="vacvet-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoVacuna | '')} className={CAMPO}>
                <option value="">Sin indicar</option>
                <option value="CORE">{NOMBRE_TIPO_VACUNA.CORE}</option>
                <option value="NO_CORE">{NOMBRE_TIPO_VACUNA.NO_CORE}</option>
              </select>
            </Campo>
            <Campo id="vacvet-fecha" etiqueta="Fecha aplicada">
              <input id="vacvet-fecha" type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); recalcular(vacuna, e.target.value); }} className={CAMPO} />
            </Campo>
            <Campo id="vacvet-proxima" etiqueta="Próxima dosis" ayuda="Se calcula con el refuerzo habitual; cámbiala si el veterinario indicó otra.">
              <input id="vacvet-proxima" type="date" value={proxima} aria-describedby="vacvet-proxima-ayuda" onChange={(e) => { setProxima(e.target.value); setProximaTocada(true); }} className={CAMPO} />
            </Campo>
            <Campo id="vacvet-lote" etiqueta="Lote"><input id="vacvet-lote" value={lote} onChange={(e) => setLote(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="vacvet-laboratorio" etiqueta="Laboratorio fabricante"><input id="vacvet-laboratorio" value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="vacvet-veterinario" etiqueta="Veterinario que aplicó"><input id="vacvet-veterinario" value={veterinario} onChange={(e) => setVeterinario(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="vacvet-clinica" etiqueta="Clínica"><input id="vacvet-clinica" value={clinica} onChange={(e) => setClinica(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="vacvet-costo" etiqueta="Costo (COP)"><input id="vacvet-costo" type="number" min="0" step="100" value={costo} onChange={(e) => setCosto(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="vacvet-certificado" etiqueta="Foto o certificado">
              <select id="vacvet-certificado" value={certificado} onChange={(e) => setCertificado(e.target.value)} className={CAMPO}>
                <option value="">{docs.length ? 'Sin vincular' : 'Sube primero el documento en «Seguimiento»'}</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.fileName}</option>)}
              </select>
            </Campo>
          </div>
          <button type="submit" className={BOTON}><Save aria-hidden className="h-4 w-4" />Guardar vacuna</button>
        </form>
      </Dialog>
    </Tarjeta>
  );
}
