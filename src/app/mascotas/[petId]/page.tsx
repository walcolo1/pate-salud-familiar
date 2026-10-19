'use client';

/**
 * Centro de control de una mascota (Bloque O).
 *
 * Cinco módulos en pestañas accesibles (patrón WAI-ARIA «tabs»: flechas,
 * Inicio y Fin), cada uno persistido en una pestaña real de la hoja con
 * `paciente_id = mascota`. Lo administra cualquier familiar autorizado; un
 * lector solo lo ve.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, PawPrint } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import EstadoCarga from '@/components/ui/EstadoCarga';
import EstadoError from '@/components/ui/EstadoError';
import FormularioMascota from '@/components/miembros/FormularioMascota';
import FormularioPeso from '@/components/miembros/FormularioPeso';
import ModuloPerfil from '@/components/mascotas/ModuloPerfil';
import ModuloVacunas from '@/components/mascotas/ModuloVacunas';
import ModuloPreventiva from '@/components/mascotas/ModuloPreventiva';
import ModuloMedicamentos from '@/components/mascotas/ModuloMedicamentos';
import ModuloSeguimiento from '@/components/mascotas/ModuloSeguimiento';
import { Chip } from '@/components/mascotas/ui';
import { NOMBRE_ESPECIE, hoyLocal } from '@/domain/mascotas';
import { NOMBRE_ESTADO_MASCOTA, describirEdadMascota, mesesEntre } from '@/domain/fichaMascota';
import { recordatoriosMascota, resumenGastos, sumarDias } from '@/domain/cuidadoMascota';
import { administradoresDeMascota } from '@/lib/administradoresMascota';

const PESTANAS = [
  { id: 'perfil', etiqueta: 'Perfil, peso y rutina' },
  { id: 'vacunas', etiqueta: 'Vacunas' },
  { id: 'preventiva', etiqueta: 'Salud preventiva' },
  { id: 'medicamentos', etiqueta: 'Medicamentos' },
  { id: 'seguimiento', etiqueta: 'Exámenes, documentos y recordatorios' },
] as const;
type Pestana = (typeof PESTANAS)[number]['id'];

function ahoraLocal(d = new Date()): string {
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${hoyLocal(d)}T${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

export default function CentroMascotaPage() {
  const router = useRouter();
  const params = useParams<{ petId: string }>();
  const petId = params?.petId ?? '';
  const app = useApp();
  const { user, isLoading, pets, members, petWeights, petVaccines, petModules, exams, examResults, documents, invitations, currentUserRole, origenDatos } = app;

  // Enlace directo a un módulo: /mascotas/<id>#vacunas
  const [pestana, setPestana] = useState<Pestana>(() => {
    const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
    return PESTANAS.some((p) => p.id === h) ? (h as Pestana) : 'perfil';
  });
  const [editando, setEditando] = useState(false);
  const [pesando, setPesando] = useState(false);
  const botones = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const mascota = pets.find((p) => p.id === petId) ?? null;
  const hoy = hoyLocal();
  const ahora = ahoraLocal();

  const datos = useMemo(() => {
    if (!mascota) return null;
    const vacunas = petVaccines.filter((v) => v.petId === mascota.id && !v.deletedAt);
    const serie = petWeights.filter((w) => w.petId === mascota.id && !w.deletedAt).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const cuidados = petModules.cuidados.filter((c) => c.petId === mascota.id && !c.deletedAt);
    const tratamientos = petModules.tratamientos.filter((t) => t.petId === mascota.id);
    const tomas = petModules.tomas.filter((t) => t.petId === mascota.id);
    const recordatorios = recordatoriosMascota({
      petId: mascota.id,
      nombre: mascota.nombre,
      fechaNacimiento: mascota.fechaNacimiento,
      nacimientoAproximado: mascota.ficha?.nacimientoAproximado,
      activo: mascota.activo,
      banoCadaDias: mascota.ficha?.rutina?.banoCadaDias,
      vacunas,
      cuidados,
      tratamientos,
      tomas,
      pesos: serie,
      estados: petModules.recordatorios,
    }, hoy, ahora);
    const gastos = resumenGastos([
      ...cuidados.map((c) => ({ fecha: c.fecha, costo: c.costo, categoria: c.categoria })),
      ...vacunas.map((v) => ({ fecha: v.fecha, costo: v.costo, categoria: 'VACUNA' })),
    ]);
    const examenes = exams.filter((e) => e.memberId === mascota.id);
    const docs = documents.filter((d) => d.memberId === mascota.id && !d.deletedAt);
    return { vacunas, serie, cuidados, tratamientos, tomas, recordatorios, gastos, examenes, docs };
  }, [mascota, petVaccines, petWeights, petModules, exams, documents, hoy, ahora]);

  if (isLoading || !user) return <EstadoCarga mensaje="Cargando tu expediente…" />;
  if (!mascota || !datos) {
    return (
      <EstadoError
        variante="bloque"
        titulo="Mascota no encontrada"
        mensaje="No hay ninguna mascota con ese identificador en este expediente."
        accionSecundaria={{ etiqueta: 'Volver a Mascotas', href: '/mascotas' }}
      />
    );
  }

  const responsable = members.find((m) => m.id === mascota.memberId);
  const puedeEditar = currentUserRole !== 'VIEWER';
  const esTitular = currentUserRole === 'FAMILY_ADMIN';
  const meses = mascota.fechaNacimiento ? mesesEntre(mascota.fechaNacimiento, hoy) : null;
  const estado = mascota.ficha?.estado ?? (mascota.activo ? 'ACTIVO' : 'ADOPTADO');

  const mover = (indice: number) => {
    const i = (indice + PESTANAS.length) % PESTANAS.length;
    setPestana(PESTANAS[i].id);
    botones.current[i]?.focus();
  };
  const teclado = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); mover(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); mover(0); }
    else if (e.key === 'End') { e.preventDefault(); mover(PESTANAS.length - 1); }
  };

  return (
    <div className="flex flex-col gap-4 pb-12">
      <Link href="/mascotas" className="flex items-center gap-1.5 self-start text-xs font-bold text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="h-4 w-4" />Todas las mascotas
      </Link>

      <header className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        {mascota.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mascota.fotoUrl} alt={`Foto de ${mascota.nombre}`} className="h-14 w-14 rounded-2xl object-cover border border-slate-200" />
        ) : (
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl border border-teal-100 bg-teal-50 text-teal-700"><PawPrint className="h-6 w-6" /></span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-black text-slate-900">{mascota.nombre}</h2>
          <p className="text-xs font-semibold text-slate-700">
            {[NOMBRE_ESPECIE[mascota.especie], mascota.raza, meses !== null ? describirEdadMascota(meses, !!mascota.ficha?.nacimientoAproximado) : null, responsable ? `a cargo de ${responsable.fullName}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Chip tono={estado === 'ACTIVO' ? 'verde' : estado === 'EN_TRATAMIENTO' ? 'ambar' : 'gris'}>{NOMBRE_ESTADO_MASCOTA[estado]}</Chip>
      </header>

      {!puedeEditar && (
        <p role="note" className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
          Tienes acceso de lectura: puedes consultar a {mascota.nombre}, pero no cambiar nada.
        </p>
      )}

      <div role="tablist" aria-label={`Módulos de ${mascota.nombre}`} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PESTANAS.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => { botones.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`panel-${p.id}`}
            tabIndex={pestana === p.id ? 0 : -1}
            onClick={() => setPestana(p.id)}
            onKeyDown={(e) => teclado(e, i)}
            className={`h-9 shrink-0 whitespace-nowrap rounded-xl px-3 text-[11px] font-extrabold ${
              pestana === p.id ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {p.etiqueta}
            {p.id === 'seguimiento' && datos.recordatorios.length > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 text-rose-800">{datos.recordatorios.length}</span>
            )}
          </button>
        ))}
      </div>

      {PESTANAS.map((p) => (
        <div key={p.id} role="tabpanel" id={`panel-${p.id}`} aria-labelledby={`tab-${p.id}`} hidden={pestana !== p.id} tabIndex={0}>
          {pestana === p.id && p.id === 'perfil' && (
            <ModuloPerfil
              mascota={mascota}
              responsable={responsable?.fullName ?? 'Sin responsable'}
              serie={datos.serie}
              hoy={hoy}
              administradores={esTitular ? administradoresDeMascota(mascota, invitations) : null}
              puedeEditar={puedeEditar}
              onEditar={() => setEditando(true)}
              onPesar={() => setPesando(true)}
            />
          )}
          {pestana === p.id && p.id === 'vacunas' && (
            <ModuloVacunas
              mascota={mascota}
              vacunas={datos.vacunas}
              documentos={datos.docs}
              puedeEditar={puedeEditar}
              onGuardar={(e) => app.addPetVaccine({ petId: mascota.id, ...e })}
            />
          )}
          {pestana === p.id && p.id === 'preventiva' && (
            <ModuloPreventiva mascota={mascota} cuidados={datos.cuidados} hoy={hoy} puedeEditar={puedeEditar} onGuardar={app.addPetCare} />
          )}
          {pestana === p.id && p.id === 'medicamentos' && (
            <ModuloMedicamentos
              mascota={mascota}
              tratamientos={datos.tratamientos}
              tomas={datos.tomas}
              ahora={ahora}
              puedeEditar={puedeEditar}
              onGuardar={app.savePetTreatment}
              onMarcar={app.markPetDose}
            />
          )}
          {pestana === p.id && p.id === 'seguimiento' && (
            <ModuloSeguimiento
              mascota={mascota}
              hoy={hoy}
              recordatorios={datos.recordatorios}
              gastos={datos.gastos}
              examenes={datos.examenes}
              resultados={examResults}
              documentos={datos.docs}
              puedeEditar={puedeEditar}
              puedeSubirArchivos={origenDatos !== 'DEMO'}
              onCompletar={(r) => app.setPetReminderState(mascota.id, r, 'COMPLETADO', hoy)}
              onPosponer={(r, dias) => app.setPetReminderState(mascota.id, r, 'POSPUESTO', sumarDias(r.fecha < hoy ? hoy : r.fecha, dias))}
              onGuardarExamen={(d, resultados) => {
                const fuera = resultados.filter((r) => r.isAbnormal).length;
                app.addExam(
                  {
                    memberId: mascota.id,
                    examName: d.examName,
                    orderedBy: d.orderedBy,
                    orderedDate: d.orderedDate,
                    performedDate: d.orderedDate,
                    laboratory: d.laboratory,
                    status: 'COMPLETED',
                    resultSummary: resultados.length
                      ? `${resultados.length} valores verificados; ${fuera} fuera del rango impreso por el laboratorio.`
                      : null,
                  },
                  resultados,
                  { sinHistorial: true },
                );
              }}
              onSubirDocumento={async (archivo, categoria, descripcion) => {
                await app.uploadDocument(mascota.id, { fileName: archivo.name, fileType: categoria, description: descripcion || undefined }, archivo);
              }}
            />
          )}
        </div>
      ))}

      <FormularioMascota
        abierto={editando}
        mascota={mascota}
        memberId={mascota.memberId}
        onCerrar={() => setEditando(false)}
        onGuardar={(b) => app.updatePet(mascota.id, b)}
      />
      <FormularioPeso
        abierto={pesando}
        nombreMascota={mascota.nombre}
        onCerrar={() => setPesando(false)}
        onGuardar={(e) => app.addPetWeight({ petId: mascota.id, ...e })}
      />
    </div>
  );
}
