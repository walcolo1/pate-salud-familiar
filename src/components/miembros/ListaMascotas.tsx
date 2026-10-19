'use client';

/**
 * Las tarjetas de mascotas, en un solo sitio.
 *
 * Las usan la ficha de un familiar (`/members/[id]/pets`) y la pantalla de
 * Mascotas de primer nivel (`/mascotas`). Antes vivían dentro de la primera, y
 * copiarlas habría dejado dos versiones que divergen a la primera corrección.
 *
 * Los enlaces de peso, vacunas e historial salen del `memberId` **de cada
 * mascota**, no de la pantalla: en `/mascotas` hay mascotas de varios
 * responsables a la vez.
 */

import React from 'react';
import Link from 'next/link';
import EstadoVacio from '@/components/ui/EstadoVacio';
import { NOMBRE_ESPECIE, NOMBRE_SEXO, type Pet, type VaccineEntry } from '@/domain/mascotas';
import { descripcionEdad } from '@/lib/edad';
import { vacunasPendientes } from '@/lib/vacunasMascota';
import { LayoutGrid, PawPrint, Pencil, Power, Scale, Stethoscope, Syringe } from 'lucide-react';

export interface ListaMascotasProps {
  mascotas: Pet[];
  vacunas: VaccineEntry[];
  /** Si viene, cada tarjeta dice a cargo de quién está. */
  responsableDe?: (memberId: string) => string | null;
  onNueva: () => void;
  onEditar: (mascota: Pet) => void;
  onCambiarEstado: (mascota: Pet) => void;
}

const CLASE_ACCION =
  'px-3.5 h-8.5 text-[10px] font-extrabold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 rounded-xl transition-colors flex items-center gap-1';
const CLASE_SECUNDARIA =
  'px-3.5 h-8.5 text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1';

export default function ListaMascotas({
  mascotas,
  vacunas,
  responsableDe,
  onNueva,
  onEditar,
  onCambiarEstado,
}: ListaMascotasProps) {
  return (
    <section className="flex flex-col gap-3" aria-label="Mascotas registradas">
      {mascotas.length === 0 ? (
        <EstadoVacio
          icono={PawPrint}
          titulo="Sin mascotas registradas"
          descripcion="Registra a la primera para llevar su peso, sus vacunas y su historial veterinario en el mismo sitio que el resto de la familia."
          accion={{ tipo: 'boton', etiqueta: 'Registrar mascota', onClick: onNueva }}
        />
      ) : (
        mascotas.map((mascota) => {
          const base = `/members/${mascota.memberId}/pets/${mascota.id}`;
          const edad = mascota.fechaNacimiento ? descripcionEdad(mascota.fechaNacimiento) : null;
          const responsable = responsableDe?.(mascota.memberId) ?? null;
          // Vacunas vencidas o a punto: la insignia lleva número Y el enlace
          // lo dice en su nombre accesible, porque un punto de color no se oye.
          const pendientes = vacunasPendientes(vacunas.filter((v) => v.petId === mascota.id)).length;
          return (
            <article
              key={mascota.id}
              className={`bg-white p-5 rounded-3xl border shadow-sm flex flex-col gap-3 ${
                mascota.activo ? 'border-slate-100' : 'border-slate-200 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center"
                >
                  <PawPrint className="h-4.5 w-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-extrabold text-slate-800 truncate">{mascota.nombre}</h3>
                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                      {NOMBRE_ESPECIE[mascota.especie]}
                    </span>
                    {!mascota.activo && (
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Inactiva
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] font-bold text-slate-600 mt-1 leading-relaxed">
                    {[
                      mascota.raza,
                      NOMBRE_SEXO[mascota.sexo],
                      edad,
                      mascota.pesoActualKg != null ? `${mascota.pesoActualKg} kg` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>

                  {responsable && (
                    <p className="text-[10px] font-semibold text-slate-500 mt-1">A cargo de {responsable}</p>
                  )}

                  {mascota.fotoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mascota.fotoUrl} alt={`Foto de ${mascota.nombre}`} className="mt-2 h-16 w-16 rounded-2xl object-cover border border-slate-200" />
                  )}
                  {mascota.notas && (
                    <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">{mascota.notas}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end flex-wrap">
                {/* Bloque O · el centro de control con los cinco módulos. */}
                <Link
                  href={`/mascotas/${mascota.id}`}
                  aria-label={`Abrir el centro de control de ${mascota.nombre}`}
                  className="px-3.5 h-8.5 text-[10px] font-extrabold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition-colors flex items-center gap-1"
                >
                  <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
                  Centro de control
                </Link>
                <Link href={`${base}/peso`} aria-label={`Ver el peso de ${mascota.nombre}`} className={CLASE_ACCION}>
                  <Scale aria-hidden="true" className="h-3.5 w-3.5" />
                  Peso
                </Link>
                <Link
                  href={`${base}/vacunas`}
                  aria-label={
                    pendientes > 0
                      ? `Ver las vacunas de ${mascota.nombre}: ${pendientes} por revisar`
                      : `Ver las vacunas de ${mascota.nombre}`
                  }
                  className={CLASE_ACCION}
                >
                  <Syringe aria-hidden="true" className="h-3.5 w-3.5" />
                  Vacunas
                  {pendientes > 0 && (
                    <span className="ml-0.5 px-1.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                      {pendientes}
                    </span>
                  )}
                </Link>
                <Link
                  href={`${base}/historial`}
                  aria-label={`Ver el historial de ${mascota.nombre}`}
                  className={CLASE_ACCION}
                >
                  <Stethoscope aria-hidden="true" className="h-3.5 w-3.5" />
                  Historial
                </Link>
                <button type="button" onClick={() => onEditar(mascota)} className={CLASE_SECUNDARIA}>
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button type="button" onClick={() => onCambiarEstado(mascota)} className={CLASE_SECUNDARIA}>
                  <Power aria-hidden="true" className="h-3.5 w-3.5" />
                  {mascota.activo ? 'Marcar inactiva' : 'Reactivar'}
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
