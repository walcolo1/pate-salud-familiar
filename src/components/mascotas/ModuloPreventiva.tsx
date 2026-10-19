'use client';

/** Módulo 3 · Desparasitación, antipulgas, filaria y demás atenciones (Bloque O). */

import React, { useState } from 'react';
import { Plus, Save } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { hoyLocal, type Pet, type Validacion } from '@/domain/mascotas';
import {
  CATEGORIAS_CUIDADO,
  CUIDADOS,
  FRECUENCIAS_PREVENTIVAS,
  NOMBRE_VIA,
  VIAS,
  proximaAplicacion,
  ultimosPorCategoria,
  type CategoriaCuidado,
  type CuidadoMascota,
  type Via,
} from '@/domain/cuidadoMascota';
import { BOTON, CAMPO, Campo, Chip, Errores, Tarjeta, fechaCorta, numeroOpcional, pesos } from './ui';

interface Props {
  mascota: Pet;
  cuidados: CuidadoMascota[];
  hoy: string;
  puedeEditar: boolean;
  onGuardar: (c: Omit<CuidadoMascota, 'id' | 'memberId'>) => Validacion;
}

const PREVENTIVOS: CategoriaCuidado[] = ['DESPARASITACION_INTERNA', 'ANTIPULGAS', 'FILARIA'];

export default function ModuloPreventiva({ mascota, cuidados, hoy, puedeEditar, onGuardar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaCuidado>('DESPARASITACION_INTERNA');
  const [fecha, setFecha] = useState(hoyLocal());
  const [periodicidad, setPeriodicidad] = useState('3');
  const [proxima, setProxima] = useState('');
  const [producto, setProducto] = useState('');
  const [dosis, setDosis] = useState('');
  const [via, setVia] = useState<Via | ''>('');
  const [profesional, setProfesional] = useState('');
  const [costo, setCosto] = useState('');
  const [notas, setNotas] = useState('');
  const [problemas, setProblemas] = useState<Array<{ campo: string; mensaje: string }>>([]);

  const def = CUIDADOS[categoria];
  const propuesta = proximaAplicacion(fecha, periodicidad ? Number(periodicidad) : null);

  const abrir = (cat: CategoriaCuidado = 'DESPARASITACION_INTERNA') => {
    setCategoria(cat); setFecha(hoyLocal());
    setPeriodicidad(CUIDADOS[cat].periodicidadMeses ? String(CUIDADOS[cat].periodicidadMeses) : '');
    setProxima(''); setProducto(''); setDosis(''); setVia(''); setProfesional(''); setCosto(''); setNotas(''); setProblemas([]);
    setAbierto(true);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = onGuardar({
      petId: mascota.id, categoria, fecha,
      periodicidadMeses: periodicidad ? Number(periodicidad) : null,
      proxima: proxima || null,
      producto: producto || null, dosis: dosis || null, via: via || null,
      profesional: profesional || null, costo: numeroOpcional(costo), notas: notas || null,
    });
    if (r.valido) setAbierto(false); else setProblemas(r.problemas);
  };

  const ultimos = ultimosPorCategoria(cuidados, mascota.id);
  const historial = cuidados.filter((c) => c.petId === mascota.id && !c.deletedAt).sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta
        titulo="Salud preventiva"
        accion={puedeEditar && <button type="button" onClick={() => abrir()} className={BOTON}><Plus aria-hidden className="h-4 w-4" />Registrar aplicación</button>}
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Estado de los preventivos">
          {PREVENTIVOS.map((cat) => {
            const u = ultimos.get(cat);
            const vencido = u?.proxima ? u.proxima < hoy : false;
            return (
              <li key={cat} className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-3" data-preventivo={cat}>
                <span className="text-xs font-extrabold text-slate-900">{CUIDADOS[cat].nombre}</span>
                {u ? (
                  <>
                    <span className="text-[11px] font-semibold text-slate-700">Última: {fechaCorta(u.fecha)}{u.producto ? ` · ${u.producto}` : ''}</span>
                    {u.proxima ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                        Próxima: {fechaCorta(u.proxima)} <Chip tono={vencido ? 'rojo' : 'verde'}>{vencido ? 'Vencida' : 'Al día'}</Chip>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-600">Sin registros.</span>
                )}
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Consultas, odontología, estética, cirugías y gastos">
        {historial.length === 0 ? (
          <p className="text-xs font-semibold text-slate-600">Sin atenciones registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Historial de cuidados">
            {historial.map((c) => (
              <li key={c.id} className="flex flex-col gap-0.5 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs font-extrabold text-slate-900">{CUIDADOS[c.categoria].nombre} · {fechaCorta(c.fecha)}</span>
                <span className="text-[11px] font-semibold text-slate-700">
                  {[c.producto, c.dosis, c.via ? NOMBRE_VIA[c.via] : null, c.profesional, c.costo ? pesos(c.costo) : null, c.proxima ? `próxima ${fechaCorta(c.proxima)}` : null, c.notas]
                    .filter(Boolean).join(' · ') || 'Sin detalle'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Dialog abierto={abierto} titulo={`Registrar cuidado de ${mascota.nombre}`} onCerrar={() => setAbierto(false)} ancho="lg">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <Errores problemas={problemas} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="cuid-categoria" etiqueta="Qué se hizo">
              <select id="cuid-categoria" value={categoria} onChange={(e) => {
                const cat = e.target.value as CategoriaCuidado;
                setCategoria(cat);
                setPeriodicidad(CUIDADOS[cat].periodicidadMeses ? String(CUIDADOS[cat].periodicidadMeses) : '');
              }} className={CAMPO}>
                {CATEGORIAS_CUIDADO.map((c) => <option key={c} value={c}>{CUIDADOS[c].nombre}</option>)}
              </select>
            </Campo>
            <Campo id="cuid-fecha" etiqueta="Fecha aplicada">
              <input id="cuid-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            </Campo>
            {def.conProducto && (
              <>
                <Campo id="cuid-producto" etiqueta="Producto"><input id="cuid-producto" value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej. Bravecto, Drontal" className={CAMPO} /></Campo>
                <Campo id="cuid-dosis" etiqueta="Dosis"><input id="cuid-dosis" value={dosis} onChange={(e) => setDosis(e.target.value)} placeholder="Ej. 1 comprimido 10-20 kg" className={CAMPO} /></Campo>
                <Campo id="cuid-via" etiqueta="Vía">
                  <select id="cuid-via" value={via} onChange={(e) => setVia(e.target.value as Via | '')} className={CAMPO}>
                    <option value="">Sin indicar</option>
                    {VIAS.map((v) => <option key={v} value={v}>{NOMBRE_VIA[v]}</option>)}
                  </select>
                </Campo>
              </>
            )}
            <Campo id="cuid-periodicidad" etiqueta="Se repite">
              <select id="cuid-periodicidad" value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} className={CAMPO}>
                <option value="">No se repite</option>
                {FRECUENCIAS_PREVENTIVAS.map((f) => <option key={f.meses} value={String(f.meses)}>{f.etiqueta}</option>)}
              </select>
            </Campo>
            <Campo id="cuid-proxima" etiqueta="Próxima aplicación" ayuda={propuesta ? `Si la dejas vacía: ${fechaCorta(propuesta)}.` : 'Opcional.'}>
              <input id="cuid-proxima" type="date" value={proxima} aria-describedby="cuid-proxima-ayuda" onChange={(e) => setProxima(e.target.value)} className={CAMPO} />
            </Campo>
            <Campo id="cuid-profesional" etiqueta="Veterinario o lugar"><input id="cuid-profesional" value={profesional} onChange={(e) => setProfesional(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="cuid-costo" etiqueta="Costo (COP)"><input id="cuid-costo" type="number" min="0" step="100" value={costo} onChange={(e) => setCosto(e.target.value)} className={CAMPO} /></Campo>
            <Campo id="cuid-notas" etiqueta="Observaciones"><input id="cuid-notas" value={notas} onChange={(e) => setNotas(e.target.value)} className={CAMPO} /></Campo>
          </div>
          <button type="submit" className={BOTON}><Save aria-hidden className="h-4 w-4" />Guardar</button>
        </form>
      </Dialog>
    </div>
  );
}
