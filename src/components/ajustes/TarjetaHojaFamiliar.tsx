'use client';

/**
 * La hoja de la familia, registrada desde la aplicación (G4b)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El titular pega aquí la URL de su despliegue de Apps Script. Se comprueba con
 * `ping` —que no pide identidad— y solo se guarda si contesta como Paté y con
 * el código de hoy.
 *
 * Faltaba entero, y por eso la validación en vivo de G4b no dejó ni una fila en
 * la hoja: el navegador del titular no sabía adónde escribir.
 */

import React, { useId, useState } from 'react';
import { CheckCircle2, Link2, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MENSAJES_REGISTRO } from '@/lib/registroBackend';

export default function TarjetaHojaFamiliar() {
  const { hojaRegistrada, registrarHojaFamiliar, pendingSyncCount } = useApp();
  const idCampo = useId();
  const idAyuda = useId();

  const [url, setUrl] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const comprobar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    setHecho(false);
    try {
      const resultado = await registrarHojaFamiliar(url);
      if (resultado.ok) {
        setHecho(true);
        setUrl('');
      } else {
        setError(MENSAJES_REGISTRO[resultado.motivo]);
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section
      id="hoja-familiar"
      aria-labelledby={`${idCampo}-titulo`}
      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4 scroll-mt-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-100">
          <Link2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h3 id={`${idCampo}-titulo`} className="text-base font-extrabold text-slate-800">
            Hoja de la familia
          </h3>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            {hojaRegistrada
              ? 'Este navegador escribe en la hoja de tu familia.'
              : 'Este navegador todavía no sabe dónde está la hoja de tu familia.'}
          </p>
        </div>
        {hojaRegistrada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Registrada
          </span>
        )}
      </div>

      <form onSubmit={comprobar} className="flex flex-col gap-2">
        <label htmlFor={idCampo} className="text-xs font-extrabold text-slate-700">
          {hojaRegistrada ? 'Cambiar la dirección del despliegue' : 'Dirección del despliegue'}
        </label>
        <input
          id={idCampo}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          aria-describedby={idAyuda}
          aria-invalid={error ? true : undefined}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        <p id={idAyuda} className="text-[11px] text-slate-500 font-semibold leading-relaxed">
          En Apps Script: <strong>Implementar ▸ Administrar implementaciones</strong>, y copia la URL de la
          aplicación web. Se comprueba antes de guardarla.
        </p>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}
        {hecho && (
          <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            Hoja registrada.{' '}
            {pendingSyncCount > 0
              ? `Quedan ${pendingSyncCount} cambio(s) por reenviar: se intentarán de nuevo solos.`
              : 'Los cambios que estaban esperando ya se enviaron.'}
          </p>
        )}

        <button
          type="submit"
          disabled={ocupado || url.trim().length === 0}
          className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-sm font-extrabold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {ocupado ? 'Comprobando…' : 'Comprobar y guardar'}
        </button>
      </form>
    </section>
  );
}
