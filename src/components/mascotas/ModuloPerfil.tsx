'use client';

/** Módulo 1 · Perfil, peso y rutina (Bloque O). */

import React from 'react';
import { AlertTriangle, Pencil, Scale, ShieldCheck } from 'lucide-react';
import GraficaPeso from '@/components/miembros/GraficaPeso';
import { NOMBRE_ESPECIE, NOMBRE_SEXO, type Pet, type WeightEntry } from '@/domain/mascotas';
import {
  NOMBRE_ESTADO_MASCOTA,
  NOMBRE_ETAPA,
  NOMBRE_PRESENTACION,
  NOMBRE_TAMANO,
  UMBRAL_ALERTA_PESO,
  describirEdadMascota,
  etapaDeVida,
  evaluarPeso,
  mesesEntre,
} from '@/domain/fichaMascota';
import { NOMBRE_MOTIVO, NOMBRE_ROL, type Administrador } from '@/lib/administradoresMascota';
import { BOTON, BOTON_SECUNDARIO, Chip, Tarjeta, fechaCorta } from './ui';

interface Props {
  mascota: Pet;
  responsable: string;
  serie: WeightEntry[];
  hoy: string;
  administradores: Administrador[] | null;
  puedeEditar: boolean;
  onEditar: () => void;
  onPesar: () => void;
}

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <dt className="text-[10px] font-extrabold uppercase text-slate-600">{termino}</dt>
      <dd className="text-xs font-bold text-slate-900">{children}</dd>
    </div>
  );
}

const unir = (...xs: Array<string | number | null | undefined>) => xs.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' · ') || 'Sin registrar';

export default function ModuloPerfil({ mascota, responsable, serie, hoy, administradores, puedeEditar, onEditar, onPesar }: Props) {
  const f = mascota.ficha ?? {};
  const meses = mascota.fechaNacimiento ? mesesEntre(mascota.fechaNacimiento, hoy) : null;
  const etapa = meses !== null ? etapaDeVida(mascota.especie, meses, f.tamano) : null;
  const alerta = evaluarPeso(mascota.pesoActualKg, mascota.pesoIdealKg);

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta
        titulo="Resumen"
        accion={puedeEditar && <button type="button" onClick={onEditar} className={BOTON_SECUNDARIO}><Pencil aria-hidden className="h-3.5 w-3.5" />Editar ficha</button>}
      >
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Dato termino="Edad y etapa">
            {meses !== null ? `${describirEdadMascota(meses, !!f.nacimientoAproximado)}${etapa ? ` · ${NOMBRE_ETAPA[etapa]}` : ''}` : 'Sin fecha de nacimiento'}
          </Dato>
          <Dato termino="Estado">{NOMBRE_ESTADO_MASCOTA[f.estado ?? (mascota.activo ? 'ACTIVO' : 'ADOPTADO')]}</Dato>
          <Dato termino="Especie, raza y sexo">{unir(NOMBRE_ESPECIE[mascota.especie], mascota.raza, NOMBRE_SEXO[mascota.sexo])}</Dato>
          <Dato termino="Microchip">{f.microchip || 'Sin registrar'}</Dato>
          <Dato termino="Esterilización">
            {f.esterilizado == null ? 'Sin indicar' : f.esterilizado ? `Sí${f.fechaEsterilizacion ? ` · ${fechaCorta(f.fechaEsterilizacion)}` : ''}` : 'No'}
          </Dato>
          <Dato termino="Tamaño, color y señas">{unir(f.tamano ? NOMBRE_TAMANO[f.tamano] : null, f.color, f.senas)}</Dato>
          <Dato termino="Responsable">{unir(responsable, f.contacto?.telefono, f.contacto?.correo)}</Dato>
          <Dato termino="Veterinario habitual">{unir(f.veterinario?.nombre, f.veterinario?.clinica, f.veterinario?.telefono, f.veterinario?.direccion)}</Dato>
          <Dato termino="Alimentación">
            {unir(
              f.alimentacion?.marca,
              f.alimentacion?.tipo,
              f.alimentacion?.presentacion ? NOMBRE_PRESENTACION[f.alimentacion.presentacion] : null,
              f.alimentacion?.porcion,
              f.alimentacion?.vecesAlDia ? `${f.alimentacion.vecesAlDia} al día` : null,
              f.alimentacion?.restricciones ? `sin: ${f.alimentacion.restricciones}` : null,
            )}
          </Dato>
          <Dato termino="Rutina">
            {unir(
              f.rutina?.paseo,
              f.rutina?.banoCadaDias ? `baño cada ${f.rutina.banoCadaDias} d` : null,
              f.rutina?.unasCadaDias ? `uñas cada ${f.rutina.unasCadaDias} d` : null,
              f.rutina?.dentalCadaDias ? `dientes cada ${f.rutina.dentalCadaDias} d` : null,
            )}
          </Dato>
          <Dato termino="Notas importantes">
            {unir(
              f.cuidadosEspeciales?.alergias ? `Alergias: ${f.cuidadosEspeciales.alergias}` : null,
              f.cuidadosEspeciales?.miedos ? `Miedos: ${f.cuidadosEspeciales.miedos}` : null,
              f.cuidadosEspeciales?.comportamiento,
              f.cuidadosEspeciales?.restricciones,
              mascota.notas,
            )}
          </Dato>
        </dl>
      </Tarjeta>

      <Tarjeta
        titulo="Peso"
        accion={puedeEditar && <button type="button" onClick={onPesar} className={BOTON}><Scale aria-hidden className="h-4 w-4" />Registrar peso</button>}
      >
        {alerta && alerta.sentido !== 'EN_RANGO' && (
          <p role="status" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {`El peso actual está un ${Math.abs(Math.round(alerta.desviacion * 100))} % ${alerta.sentido === 'SOBRE' ? 'por encima' : 'por debajo'} del ideal (umbral ±${UMBRAL_ALERTA_PESO * 100} %). Coméntalo con el veterinario.`}
          </p>
        )}
        {alerta && alerta.sentido === 'EN_RANGO' && <Chip tono="verde">Dentro del ±10 % del peso ideal</Chip>}
        <GraficaPeso serie={serie} pesoIdeal={mascota.pesoIdealKg} nombreMascota={mascota.nombre} />
      </Tarjeta>

      <Tarjeta titulo="Quién puede administrarla">
        <p className="text-xs font-semibold text-slate-700">
          El titular, y cualquier familiar autorizado como cuidador o miembro con acceso a toda la familia, a esta mascota o a su responsable
          ({responsable}). Pueden editar su ficha y registrar peso, vacunas, preventivos, medicamentos, tomas, exámenes y recordatorios. Un lector
          solo la consulta. Dar de alta o de baja una mascota es del titular.
        </p>
        {administradores === null ? (
          <p className="text-[11px] font-semibold text-slate-600">La lista de accesos concretos solo la ve el titular.</p>
        ) : administradores.length === 0 ? (
          <p className="text-[11px] font-semibold text-slate-600">Por ahora solo el titular. Invita a otro familiar desde Ajustes ▸ Invitaciones.</p>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Familiares con acceso a esta mascota">
            {administradores.map((a) => (
              <li key={a.correo} className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
                <ShieldCheck aria-hidden className="h-4 w-4 text-teal-700" />
                {a.correo}
                <Chip tono={a.nivel === 'ADMINISTRA' ? 'verde' : 'gris'}>{a.nivel === 'ADMINISTRA' ? 'Administra' : 'Solo lectura'}</Chip>
                <span className="text-[11px] font-semibold text-slate-600">{NOMBRE_ROL[a.rol]} · por {NOMBRE_MOTIVO[a.motivo]}{a.pendiente ? ' · invitación pendiente' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
