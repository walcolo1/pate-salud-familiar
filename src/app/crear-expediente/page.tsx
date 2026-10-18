'use client';

/**
 * Bloque M · crear el expediente de una familia nueva.
 *
 * Una guía de tres pasos sobre la plantilla maestra (`/copy`): copiar,
 * instalar y conectar. El tercero lo resuelve el menú «Paté ▸ Conectar con la
 * aplicación», que abre la PWA ya conectada: nadie copia ni pega una URL.
 *
 * Antes de copiar se pide la autorización de tratamiento de datos sensibles
 * (Ley 1581 de 2012): lo que se va a guardar es información de salud.
 */

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { urlPlantilla } from '@/lib/altaFamilia';

const PASOS: { titulo: string; cuerpo: React.ReactNode }[] = [
  {
    titulo: 'Haz tu copia de la plantilla',
    cuerpo: (
      <>
        Google te preguntará «¿Quieres hacer una copia?». Pulsa <strong>Hacer una copia</strong>. Ponle el nombre que
        quieras (por ejemplo, «Paté · Familia Pérez»): la copia es tuya y vive en tu Drive.
      </>
    ),
  },
  {
    titulo: 'En tu copia: Paté ▸ Instalar o actualizar',
    cuerpo: (
      <>
        El menú <strong>Paté</strong> aparece junto a «Ayuda» (puede tardar unos segundos). Google te pedirá permiso:
        verás <strong>«Google no ha verificado esta app»</strong>. Es normal: la app es tu propia copia y la autorizas
        tú. Pulsa <strong>Configuración avanzada ▸ Ir a … (no seguro) ▸ Permitir</strong>. La instalación crea las
        pestañas y tarda menos de un minuto.
      </>
    ),
  },
  {
    titulo: 'Paté ▸ Conectar con la aplicación',
    cuerpo: (
      <>
        Si es la primera vez, te indica cómo publicar tu expediente (Extensiones ▸ Apps Script ▸ Implementar ▸ Nueva
        implementación ▸ Aplicación web; ejecutar como <strong>Yo</strong>, acceso <strong>Cualquier usuario</strong>).
        Vuelve al menú y pulsa <strong>Abrir Paté ya conectado</strong>. Para el celular, usa{' '}
        <strong>Enviarme el enlace por correo</strong>.
      </>
    ),
  },
];

export default function CrearExpedientePage() {
  const [acepta, setAcepta] = useState(false);
  const idAviso = useId();
  const plantilla = urlPlantilla();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-black text-slate-900">Crea el expediente de tu familia</h1>
        <p className="text-sm font-semibold text-slate-700">
          Paté guarda todo en una hoja de cálculo en <strong>tu propio Google Drive</strong>. No hay un servidor nuestro
          en medio: nadie más ve tus datos salvo las personas que tú invites. Se configura una sola vez, en unos cinco
          minutos, con una cuenta de Google normal.
        </p>
      </header>

      <section
        aria-labelledby={`${idAviso}-t`}
        className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5"
      >
        <h2 id={`${idAviso}-t`} className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <ShieldCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
          Antes de empezar: tus datos de salud
        </h2>
        <p className="text-sm font-semibold text-slate-700">
          Vas a registrar información de salud, que la Ley 1581 de 2012 trata como dato sensible. Se guarda solo en tu
          cuenta de Google; tú decides quién entra y puedes borrar la hoja cuando quieras.
        </p>
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
          />
          <span>
            Autorizo el tratamiento de los datos de salud de mi familia en mi propia hoja, y me comprometo a contar con
            la autorización de cada familiar (o de su representante, si es menor de edad) y a invitar solo a quien deba
            verlos.
          </span>
        </label>
      </section>

      <ol className="flex flex-col gap-3">
        {PASOS.map((paso, i) => (
          <li key={paso.titulo} className="flex gap-4 rounded-3xl border border-slate-200 bg-white p-5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-black text-white"
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-extrabold text-slate-900">{paso.titulo}</h2>
              <p className="text-sm font-semibold text-slate-700">{paso.cuerpo}</p>
              {i === 0 &&
                (acepta ? (
                  <a
                    href={plantilla}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 text-sm font-extrabold text-white hover:bg-teal-800"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Hacer mi copia de la plantilla
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                ) : (
                  <p className="text-xs font-bold text-slate-700">
                    Marca la autorización de arriba para ver el enlace de la plantilla.
                  </p>
                ))}
            </div>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Después: invita a tu familia</h2>
        <p className="text-sm font-semibold text-slate-700">
          Ya dentro, en <strong>Ajustes ▸ Invitaciones</strong>. Cada familiar recibe un correo con un enlace y entra con
          su cuenta de Google; no tiene que instalar nada.
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Si algo no sale</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm font-semibold text-slate-700">
          <li>
            <strong>No aparece el menú Paté:</strong> recarga la hoja. Si sigue sin salir, la copia no se llevó el
            programa: vuelve a copiarla desde el enlace.
          </li>
          <li>
            <strong>«Esta cuenta todavía no tiene un expediente aquí»:</strong> abriste la aplicación sin el enlace de
            tu hoja. Usa «Abrir Paté ya conectado» desde el menú de tu hoja.
          </li>
          <li>
            <strong>¿Te invitaron?</strong> No hagas nada de esto: abre el enlace de tu correo.
          </li>
        </ul>
      </section>

      <Link href="/login" className="w-fit text-sm font-extrabold text-teal-800 underline">
        Volver a la entrada
      </Link>
    </main>
  );
}
