'use client';

/**
 * Bloque M · quien entra con una cuenta que no está en ACCESO de la hoja.
 *
 * Antes veía «No se pudo descargar el expediente», que es falso —no hay nada
 * roto— y no dice qué hacer. Ahora ve los dos caminos reales: abrir la
 * invitación que le mandaron, o crear el expediente de su propia familia.
 */

import React from 'react';
import Link from 'next/link';
import { Mail, FileSpreadsheet, Link2 } from 'lucide-react';

export default function BienvenidaSinAcceso({ email }: { email?: string | null }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-black text-slate-900">Esta cuenta todavía no tiene un expediente aquí</h1>
        <p className="text-sm font-semibold text-slate-700">
          {email ? (
            <>
              Entraste como <strong>{email}</strong>, y la hoja con la que habla esta aplicación no la tiene entre sus
              accesos.{' '}
            </>
          ) : null}
          Paté guarda cada expediente en la hoja de cálculo de su familia, en su propio Google Drive.
        </p>
      </header>

      <section aria-labelledby="sa-invitado" className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 id="sa-invitado" className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <Mail className="h-5 w-5 text-teal-700" aria-hidden="true" />
          Me invitaron
        </h2>
        <p className="text-sm font-semibold text-slate-700">
          Abre el enlace del correo «Te han dado acceso a un expediente familiar» y entra con{' '}
          <strong>la misma cuenta</strong> en la que lo recibiste. Si no lo encuentras, pídele al titular que te
          reenvíe la invitación.
        </p>
      </section>

      <section aria-labelledby="sa-crear" className="flex flex-col gap-3 rounded-3xl border border-teal-200 bg-teal-50 p-5">
        <h2 id="sa-crear" className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <FileSpreadsheet className="h-5 w-5 text-teal-700" aria-hidden="true" />
          Quiero el expediente de mi familia
        </h2>
        <p className="text-sm font-semibold text-slate-700">
          Tres pasos, unos cinco minutos y una sola vez. Tus datos se quedan en tu Drive.
        </p>
        <Link
          href="/crear-expediente"
          className="inline-flex h-11 w-fit items-center justify-center rounded-2xl bg-teal-700 px-5 text-sm font-extrabold text-white hover:bg-teal-800"
        >
          Crear el expediente de mi familia
        </Link>
      </section>

      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
        <Link2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
        ¿Ya tienes tu hoja instalada?
        <Link href="/settings#hoja-familiar" className="font-extrabold text-teal-800 underline">
          Conéctala en Ajustes
        </Link>
        o usa el enlace de «Paté ▸ Conectar con la aplicación».
      </p>
    </main>
  );
}
