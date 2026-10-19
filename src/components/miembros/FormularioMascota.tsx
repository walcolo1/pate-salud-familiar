'use client';

/**
 * FormularioMascota — alta y edición (Bloque D, ampliado en el Bloque O)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Accesible desde el primer commit: cada control con su `id` y su
 * `<label htmlFor>`, el diálogo sobre `<dialog>` nativo y los errores
 * anunciados con `role="alert"`.
 *
 * Bloque O · la ficha completa, en grupos con su `<fieldset>`: identificación
 * y físico, responsable y contacto, veterinario habitual, cuidados especiales,
 * alimentación y rutina. Lo nuevo viaja en `ficha` (sobre de `notas`, ver
 * `domain/fichaMascota`) y la foto en `fotoUrl`.
 *
 * La validación NO vive aquí: vive en el dominio y se ejecuta en el contexto.
 */

import React, { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import {
  ESPECIES,
  NOMBRE_ESPECIE,
  NOMBRE_SEXO,
  SEXOS,
  hoyLocal,
  type BorradorMascota,
  type Especie,
  type Pet,
  type ProblemaValidacion,
  type SexoMascota,
  type Validacion,
} from '@/domain/mascotas';
import {
  ESTADOS_MASCOTA,
  NOMBRE_ESTADO_MASCOTA,
  NOMBRE_PRESENTACION,
  NOMBRE_TAMANO,
  PRESENTACIONES_ALIMENTO,
  TAMANOS,
  nacimientoDesdeEdad,
  type EstadoMascota,
  type FichaMascota,
  type PresentacionAlimento,
  type Tamano,
} from '@/domain/fichaMascota';
import { Save } from 'lucide-react';

export interface FormularioMascotaProps {
  abierto: boolean;
  /** Si viene, se edita; si no, se crea. */
  mascota?: Pet | null;
  memberId: string;
  /**
   * Si viene, al dar de alta se elige el familiar responsable. Con correo,
   * propone el contacto del responsable.
   */
  responsables?: ReadonlyArray<{ id: string; nombre: string; correo?: string | null }>;
  onCerrar: () => void;
  /** Devuelve la validación: si falla, el diálogo se queda abierto. */
  onGuardar: (borrador: BorradorMascota) => Validacion;
}

/** Campo numérico opcional: `''` significa «sin dato», no cero. */
const aNumero = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** Sugerencias de raza: ayudan a escribir, no obligan. */
const RAZAS: Partial<Record<Especie, string[]>> = {
  PERRO: ['Criollo', 'Labrador', 'Golden Retriever', 'Pastor Alemán', 'French Poodle', 'Schnauzer', 'Pug', 'Beagle', 'Bulldog Francés', 'Shih Tzu', 'Yorkshire', 'Pitbull', 'Husky'],
  GATO: ['Criollo', 'Siamés', 'Persa', 'Angora', 'Maine Coon', 'Bengalí', 'Británico de pelo corto'],
  CONEJO: ['Cabeza de león', 'Belier', 'Holland Lop', 'Rex'],
  AVE: ['Canario', 'Periquito', 'Cacatúa', 'Loro'],
};

/** Reduce una imagen a ≤256 px en JPEG, para que quepa en la celda. */
async function fotoReducida(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('imagen'));
      i.src = url;
    });
    const lado = 256;
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext('2d')?.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CLASES =
  'h-11 px-4 bg-white border border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition-colors w-full';
const ETIQUETA = 'text-[10px] font-extrabold text-slate-700 uppercase';
const GRUPO = 'flex flex-col gap-3 rounded-2xl border border-slate-200 p-3';
const LEYENDA = 'px-1 text-[10px] font-black uppercase text-slate-800';

function Campo({ id, etiqueta, children, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className={ETIQUETA}>{etiqueta}</label>
      {children}
      {ayuda && <p id={`${id}-ayuda`} className="text-[10px] text-slate-600 font-semibold">{ayuda}</p>}
    </div>
  );
}

export default function FormularioMascota({
  abierto,
  mascota,
  memberId,
  responsables,
  onCerrar,
  onGuardar,
}: FormularioMascotaProps) {
  const [responsable, setResponsable] = useState(memberId);
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState<Especie>('PERRO');
  const [raza, setRaza] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [edadAprox, setEdadAprox] = useState('');
  const [sexo, setSexo] = useState<SexoMascota>('DESCONOCIDO');
  const [pesoActual, setPesoActual] = useState('');
  const [pesoIdeal, setPesoIdeal] = useState('');
  const [notas, setNotas] = useState('');
  const [f, setF] = useState<FichaMascota>({});
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<ProblemaValidacion[]>([]);
  const [cargado, setCargado] = useState<string | null>(null);

  // Se rellena una sola vez por apertura.
  const clave = abierto ? (mascota?.id ?? 'nueva') : null;
  if (clave !== cargado) {
    setCargado(clave);
    setProblemas([]);
    setResponsable(mascota?.memberId ?? memberId);
    setNombre(mascota?.nombre ?? '');
    setEspecie(mascota?.especie ?? 'PERRO');
    setRaza(mascota?.raza ?? '');
    setFechaNacimiento(mascota?.fechaNacimiento ?? '');
    setEdadAprox('');
    setSexo(mascota?.sexo ?? 'DESCONOCIDO');
    setPesoActual(mascota?.pesoActualKg != null ? String(mascota.pesoActualKg) : '');
    setPesoIdeal(mascota?.pesoIdealKg != null ? String(mascota.pesoIdealKg) : '');
    setNotas(mascota?.notas ?? '');
    setF(mascota?.ficha ?? { estado: mascota ? (mascota.activo ? 'ACTIVO' : 'ADOPTADO') : 'ACTIVO' });
    setFotoUrl(mascota?.fotoUrl ?? null);
    setErrorFoto(null);
  }

  if (!abierto) return null;

  /** Cambia una rama de la ficha sin perder las demás. */
  const cambiar = <K extends keyof FichaMascota>(rama: K, valor: FichaMascota[K]) => setF((x) => ({ ...x, [rama]: valor }));
  const sub = <K extends 'contacto' | 'veterinario' | 'cuidadosEspeciales' | 'alimentacion' | 'rutina'>(rama: K, campo: string, valor: unknown) =>
    setF((x) => ({ ...x, [rama]: { ...((x[rama] as Record<string, unknown>) ?? {}), [campo]: valor } }));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const elegirResponsable = !mascota && (responsables?.length ?? 0) > 0;
    // Edad aproximada: solo si no hay fecha exacta.
    let nacimiento = fechaNacimiento || null;
    let aproximado = f.nacimientoAproximado ?? false;
    if (!nacimiento && edadAprox.trim()) {
      nacimiento = nacimientoDesdeEdad(Number(edadAprox.replace(',', '.')), hoyLocal());
      aproximado = nacimiento !== null;
    } else if (fechaNacimiento && fechaNacimiento !== mascota?.fechaNacimiento) {
      aproximado = false;
    }
    const resultado = onGuardar({
      memberId: elegirResponsable ? responsable : memberId,
      nombre,
      especie,
      raza: raza || null,
      fechaNacimiento: nacimiento,
      sexo,
      pesoActualKg: aNumero(pesoActual),
      pesoIdealKg: aNumero(pesoIdeal),
      notas: notas || null,
      ficha: { ...f, nacimientoAproximado: aproximado || null },
      fotoUrl,
    });

    if (resultado.valido) {
      setProblemas([]);
      onCerrar();
    } else {
      setProblemas(resultado.problemas);
    }
  };

  const campo = (nombreCampo: string) => problemas.find((p) => p.campo === nombreCampo);
  const inv = (c: string) => (campo(c) ? true : undefined);
  const responsablesConCorreo = responsables ?? [];
  const correoResponsable = responsablesConCorreo.find((r) => r.id === (mascota?.memberId ?? responsable))?.correo ?? '';

  return (
    <Dialog abierto titulo={mascota ? 'Editar mascota' : 'Registrar mascota'} onCerrar={onCerrar} ancho="lg">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        {problemas.length > 0 && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-800 leading-relaxed">
            <ul className="flex flex-col gap-1">
              {problemas.map((p) => (
                <li key={`${p.campo}-${p.mensaje}`}>{p.mensaje}</li>
              ))}
            </ul>
          </div>
        )}

        <fieldset className={GRUPO}>
          <legend className={LEYENDA}>Identificación y físico</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="mascota-nombre" etiqueta="Nombre">
              <input id="mascota-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={inv('nombre')} placeholder="Ej. Nube" className={CLASES} />
            </Campo>
            {!mascota && responsables && responsables.length > 0 && (
              <Campo id="mascota-responsable" etiqueta="A cargo de">
                <select id="mascota-responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CLASES}>
                  {responsables.map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo id="mascota-especie" etiqueta="Especie">
              <select id="mascota-especie" value={especie} onChange={(e) => setEspecie(e.target.value as Especie)} className={CLASES}>
                {ESPECIES.map((x) => (
                  <option key={x} value={x}>{NOMBRE_ESPECIE[x]}</option>
                ))}
              </select>
            </Campo>
            <Campo id="mascota-sexo" etiqueta="Sexo">
              <select id="mascota-sexo" value={sexo} onChange={(e) => setSexo(e.target.value as SexoMascota)} className={CLASES}>
                {SEXOS.map((x) => (
                  <option key={x} value={x}>{NOMBRE_SEXO[x]}</option>
                ))}
              </select>
            </Campo>
            <Campo id="mascota-raza" etiqueta="Raza (opcional)">
              <input id="mascota-raza" type="text" list="mascota-razas" value={raza} onChange={(e) => setRaza(e.target.value)} placeholder="Ej. Criollo, Siamés…" className={CLASES} />
              <datalist id="mascota-razas">
                {(RAZAS[especie] ?? []).map((r) => <option key={r} value={r} />)}
              </datalist>
            </Campo>
            <Campo id="mascota-tamano" etiqueta="Tamaño">
              <select id="mascota-tamano" value={f.tamano ?? ''} onChange={(e) => cambiar('tamano', (e.target.value || null) as Tamano | null)} className={CLASES}>
                <option value="">Sin indicar</option>
                {TAMANOS.map((t) => <option key={t} value={t}>{NOMBRE_TAMANO[t]}</option>)}
              </select>
            </Campo>
            <Campo id="mascota-nacimiento" etiqueta="Fecha de nacimiento (opcional)" ayuda="Déjalo en blanco si es adoptada y no se sabe; puedes poner la edad aproximada.">
              <input id="mascota-nacimiento" type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} aria-invalid={inv('fechaNacimiento')} aria-describedby="mascota-nacimiento-ayuda" className={CLASES} />
            </Campo>
            <Campo id="mascota-edad-aprox" etiqueta="Edad aproximada en años">
              <input id="mascota-edad-aprox" type="number" step="0.5" min="0" max="40" value={edadAprox} disabled={!!fechaNacimiento} onChange={(e) => setEdadAprox(e.target.value)} placeholder={f.nacimientoAproximado ? 'Ya estimada' : 'Ej. 3'} className={CLASES} />
            </Campo>
            <Campo id="mascota-peso-actual" etiqueta="Peso actual (kg)">
              <input id="mascota-peso-actual" type="number" step="0.01" min="0" value={pesoActual} onChange={(e) => setPesoActual(e.target.value)} aria-invalid={inv('pesoActualKg')} placeholder="Ej. 4.3" className={CLASES} />
            </Campo>
            <Campo id="mascota-peso-ideal" etiqueta="Peso ideal (kg)">
              <input id="mascota-peso-ideal" type="number" step="0.01" min="0" value={pesoIdeal} onChange={(e) => setPesoIdeal(e.target.value)} aria-invalid={inv('pesoIdealKg')} placeholder="Ej. 4.0" className={CLASES} />
            </Campo>
            <Campo id="mascota-microchip" etiqueta="Microchip">
              <input id="mascota-microchip" type="text" inputMode="numeric" value={f.microchip ?? ''} onChange={(e) => cambiar('microchip', e.target.value)} aria-invalid={inv('microchip')} placeholder="15 dígitos" className={CLASES} />
            </Campo>
            <Campo id="mascota-estado" etiqueta="Estado">
              <select id="mascota-estado" value={f.estado ?? 'ACTIVO'} onChange={(e) => cambiar('estado', e.target.value as EstadoMascota)} className={CLASES}>
                {ESTADOS_MASCOTA.map((x) => <option key={x} value={x}>{NOMBRE_ESTADO_MASCOTA[x]}</option>)}
              </select>
            </Campo>
            <Campo id="mascota-esterilizado" etiqueta="Esterilizado/a">
              <select id="mascota-esterilizado" value={f.esterilizado == null ? '' : f.esterilizado ? 'SI' : 'NO'} aria-invalid={inv('esterilizado')} onChange={(e) => cambiar('esterilizado', e.target.value === '' ? null : e.target.value === 'SI')} className={CLASES}>
                <option value="">Sin indicar</option>
                <option value="SI">Sí</option>
                <option value="NO">No</option>
              </select>
            </Campo>
            <Campo id="mascota-fecha-esterilizacion" etiqueta="Fecha de la cirugía de esterilización">
              <input id="mascota-fecha-esterilizacion" type="date" value={f.fechaEsterilizacion ?? ''} disabled={f.esterilizado === false} aria-invalid={inv('fechaEsterilizacion')} onChange={(e) => cambiar('fechaEsterilizacion', e.target.value || null)} className={CLASES} />
            </Campo>
            <Campo id="mascota-color" etiqueta="Color">
              <input id="mascota-color" type="text" value={f.color ?? ''} onChange={(e) => cambiar('color', e.target.value)} placeholder="Ej. Atigrado" className={CLASES} />
            </Campo>
            <Campo id="mascota-senas" etiqueta="Señas particulares">
              <input id="mascota-senas" type="text" value={f.senas ?? ''} onChange={(e) => cambiar('senas', e.target.value)} placeholder="Ej. Mancha blanca en el pecho" className={CLASES} />
            </Campo>
            <Campo id="mascota-foto" etiqueta="Foto o avatar">
              <input
                id="mascota-foto"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = '';
                  if (!archivo) return;
                  try {
                    setFotoUrl(await fotoReducida(archivo));
                    setErrorFoto(null);
                  } catch {
                    setErrorFoto('No se pudo leer la imagen.');
                  }
                }}
                className="text-xs font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-teal-800"
              />
              {errorFoto && <p role="alert" className="text-[11px] font-bold text-rose-800">{errorFoto}</p>}
              {fotoUrl && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl} alt="Vista previa de la foto" className="h-14 w-14 rounded-xl object-cover border border-slate-200" />
                  <button type="button" onClick={() => setFotoUrl(null)} className="text-[11px] font-extrabold text-slate-700 underline">Quitar foto</button>
                </div>
              )}
            </Campo>
          </div>
        </fieldset>

        <fieldset className={GRUPO}>
          <legend className={LEYENDA}>Responsable y contacto</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="mascota-contacto-telefono" etiqueta="Teléfono del responsable">
              <input id="mascota-contacto-telefono" type="tel" value={f.contacto?.telefono ?? ''} onChange={(e) => sub('contacto', 'telefono', e.target.value)} placeholder="Ej. 300 000 0000" className={CLASES} />
            </Campo>
            <Campo id="mascota-contacto-correo" etiqueta="Correo del responsable">
              <input id="mascota-contacto-correo" type="email" value={f.contacto?.correo ?? ''} aria-invalid={inv('correo')} onChange={(e) => sub('contacto', 'correo', e.target.value)} placeholder={correoResponsable || 'correo@ejemplo.com'} className={CLASES} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className={GRUPO}>
          <legend className={LEYENDA}>Veterinario habitual</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="mascota-vet-nombre" etiqueta="Veterinario habitual">
              <input id="mascota-vet-nombre" type="text" value={f.veterinario?.nombre ?? ''} onChange={(e) => sub('veterinario', 'nombre', e.target.value)} placeholder="Ej. Dra. Ruiz" className={CLASES} />
            </Campo>
            <Campo id="mascota-vet-clinica" etiqueta="Clínica veterinaria">
              <input id="mascota-vet-clinica" type="text" value={f.veterinario?.clinica ?? ''} onChange={(e) => sub('veterinario', 'clinica', e.target.value)} className={CLASES} />
            </Campo>
            <Campo id="mascota-vet-telefono" etiqueta="Teléfono de la clínica">
              <input id="mascota-vet-telefono" type="tel" value={f.veterinario?.telefono ?? ''} onChange={(e) => sub('veterinario', 'telefono', e.target.value)} className={CLASES} />
            </Campo>
            <Campo id="mascota-vet-direccion" etiqueta="Dirección de la clínica">
              <input id="mascota-vet-direccion" type="text" value={f.veterinario?.direccion ?? ''} onChange={(e) => sub('veterinario', 'direccion', e.target.value)} className={CLASES} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className={GRUPO}>
          <legend className={LEYENDA}>Notas importantes</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="mascota-alergias" etiqueta="Alergias alimentarias o ambientales">
              <input id="mascota-alergias" type="text" value={f.cuidadosEspeciales?.alergias ?? ''} onChange={(e) => sub('cuidadosEspeciales', 'alergias', e.target.value)} className={CLASES} />
            </Campo>
            <Campo id="mascota-miedos" etiqueta="Miedos (ruidos, pólvora…)">
              <input id="mascota-miedos" type="text" value={f.cuidadosEspeciales?.miedos ?? ''} onChange={(e) => sub('cuidadosEspeciales', 'miedos', e.target.value)} className={CLASES} />
            </Campo>
            <Campo id="mascota-comportamiento" etiqueta="Comportamiento">
              <input id="mascota-comportamiento" type="text" value={f.cuidadosEspeciales?.comportamiento ?? ''} onChange={(e) => sub('cuidadosEspeciales', 'comportamiento', e.target.value)} className={CLASES} />
            </Campo>
            <Campo id="mascota-restricciones-manejo" etiqueta="Restricciones de manejo">
              <input id="mascota-restricciones-manejo" type="text" value={f.cuidadosEspeciales?.restricciones ?? ''} onChange={(e) => sub('cuidadosEspeciales', 'restricciones', e.target.value)} placeholder="Ej. Usar bozal en consulta" className={CLASES} />
            </Campo>
          </div>
          <Campo id="mascota-notas" etiqueta="Notas (opcional)">
            <textarea id="mascota-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Carácter, indicaciones del veterinario…" className="h-20 p-3 bg-white border border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-500 outline-none resize-none" />
          </Campo>
        </fieldset>

        <fieldset className={GRUPO}>
          <legend className={LEYENDA}>Alimentación y rutina</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="mascota-alimento-marca" etiqueta="Marca del alimento">
              <input id="mascota-alimento-marca" type="text" value={f.alimentacion?.marca ?? ''} onChange={(e) => sub('alimentacion', 'marca', e.target.value)} className={CLASES} />
            </Campo>
            <Campo id="mascota-alimento-tipo" etiqueta="Tipo de alimento">
              <input id="mascota-alimento-tipo" type="text" value={f.alimentacion?.tipo ?? ''} onChange={(e) => sub('alimentacion', 'tipo', e.target.value)} placeholder="Ej. Adulto razas pequeñas" className={CLASES} />
            </Campo>
            <Campo id="mascota-alimento-presentacion" etiqueta="Presentación">
              <select id="mascota-alimento-presentacion" value={f.alimentacion?.presentacion ?? ''} onChange={(e) => sub('alimentacion', 'presentacion', (e.target.value || null) as PresentacionAlimento | null)} className={CLASES}>
                <option value="">Sin indicar</option>
                {PRESENTACIONES_ALIMENTO.map((x) => <option key={x} value={x}>{NOMBRE_PRESENTACION[x]}</option>)}
              </select>
            </Campo>
            <Campo id="mascota-alimento-porcion" etiqueta="Porción por comida">
              <input id="mascota-alimento-porcion" type="text" value={f.alimentacion?.porcion ?? ''} onChange={(e) => sub('alimentacion', 'porcion', e.target.value)} placeholder="Ej. 80 g" className={CLASES} />
            </Campo>
            <Campo id="mascota-alimento-veces" etiqueta="Comidas al día">
              <input id="mascota-alimento-veces" type="number" min="1" max="12" step="1" value={f.alimentacion?.vecesAlDia ?? ''} aria-invalid={inv('vecesAlDia')} onChange={(e) => sub('alimentacion', 'vecesAlDia', aNumero(e.target.value))} className={CLASES} />
            </Campo>
            <Campo id="mascota-alimento-restricciones" etiqueta="Restricciones de la dieta">
              <input id="mascota-alimento-restricciones" type="text" value={f.alimentacion?.restricciones ?? ''} onChange={(e) => sub('alimentacion', 'restricciones', e.target.value)} placeholder="Ej. Sin pollo" className={CLASES} />
            </Campo>
            <Campo id="mascota-rutina-paseo" etiqueta="Rutina de paseo">
              <input id="mascota-rutina-paseo" type="text" value={f.rutina?.paseo ?? ''} onChange={(e) => sub('rutina', 'paseo', e.target.value)} placeholder="Ej. 2 paseos de 30 min" className={CLASES} />
            </Campo>
            <Campo id="mascota-rutina-bano" etiqueta="Baño cada (días)">
              <input id="mascota-rutina-bano" type="number" min="1" max="365" step="1" value={f.rutina?.banoCadaDias ?? ''} aria-invalid={inv('banoCadaDias')} onChange={(e) => sub('rutina', 'banoCadaDias', aNumero(e.target.value))} className={CLASES} />
            </Campo>
            <Campo id="mascota-rutina-unas" etiqueta="Corte de uñas cada (días)">
              <input id="mascota-rutina-unas" type="number" min="1" max="365" step="1" value={f.rutina?.unasCadaDias ?? ''} aria-invalid={inv('unasCadaDias')} onChange={(e) => sub('rutina', 'unasCadaDias', aNumero(e.target.value))} className={CLASES} />
            </Campo>
            <Campo id="mascota-rutina-dental" etiqueta="Limpieza dental cada (días)">
              <input id="mascota-rutina-dental" type="number" min="1" max="365" step="1" value={f.rutina?.dentalCadaDias ?? ''} aria-invalid={inv('dentalCadaDias')} onChange={(e) => sub('rutina', 'dentalCadaDias', aNumero(e.target.value))} className={CLASES} />
            </Campo>
          </div>
        </fieldset>

        <div className="flex gap-2.5 mt-1">
          <button type="button" onClick={onCerrar} className="flex-1 h-11 border border-slate-300 hover:bg-slate-50 font-extrabold text-xs text-slate-700 rounded-xl transition-colors">
            Cancelar
          </button>
          <button type="submit" className="flex-1 h-11 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-extrabold text-xs rounded-xl shadow-md shadow-teal-900/10 transition-colors flex items-center justify-center gap-1.5">
            <Save aria-hidden="true" className="h-4 w-4" />
            <span>{mascota ? 'Guardar cambios' : 'Registrar mascota'}</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
}

