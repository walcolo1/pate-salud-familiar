'use client';

/**
 * PermisoAvisos — pedir el permiso de notificaciones con la verdad delante (C3.2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El permiso se pide **bajo demanda**, nunca al abrir la aplicación. Un cuadro
 * del navegador que aparece solo, sin contexto, se deniega por reflejo — y en
 * la mayoría de navegadores esa denegación es difícil de deshacer. Así que
 * primero se explica, y solo se pide cuando alguien pulsa.
 *
 * Y se explica lo que de verdad hace, incluido lo que NO hace: hoy los avisos
 * solo suenan con la aplicación abierta. Prometer lo contrario sería peor que
 * no ofrecerlos, porque alguien podría dejar de poner su propia alarma.
 */

import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Check } from 'lucide-react';

type Estado = 'no-soportado' | 'default' | 'granted' | 'denied';

export default function PermisoAvisos() {
  // `null` hasta que el navegador contesta: en el servidor no hay `Notification`
  // y pintar un estado adivinado provocaría un desajuste de hidratación.
  const [estado, setEstado] = useState<Estado | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // El estado del permiso solo existe en el navegador. Leerlo en el
    // inicializador de useState daría 'default' al hidratar y `null` en el
    // servidor: desajuste de hidratación garantizado. Por eso se lee aquí, una
    // sola vez, y por eso se silencia la regla: es exactamente el caso para el
    // que existe un efecto.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      setEstado('no-soportado');
      return;
    }
    setEstado(Notification.permission as Estado);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const pedir = async () => {
    setPidiendo(true);
    try {
      const respuesta = await Notification.requestPermission();
      setEstado(respuesta as Estado);
    } catch {
      setEstado('denied');
    } finally {
      setPidiendo(false);
    }
  };

  if (estado === null) return null;

  const marco =
    'bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3';

  if (estado === 'no-soportado') {
    return (
      <section className={marco} aria-labelledby="avisos-titulo">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="p-2 bg-slate-100 text-slate-600 rounded-xl">
            <BellOff className="h-4.5 w-4.5" />
          </span>
          <h3 id="avisos-titulo" className="text-xs font-extrabold text-slate-800">
            Este navegador no admite avisos
          </h3>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Los recordatorios siguen visibles aquí dentro. Para que suenen, abre la aplicación en un
          navegador con soporte de notificaciones.
        </p>
      </section>
    );
  }

  if (estado === 'granted') {
    return (
      <section className={marco} aria-labelledby="avisos-titulo">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <Check className="h-4.5 w-4.5" />
          </span>
          <h3 id="avisos-titulo" className="text-xs font-extrabold text-slate-800">
            Avisos activados
          </h3>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Sonarán <strong>mientras la aplicación esté abierta</strong>. El aviso dice que hay algo
          pendiente, nunca de quién ni de qué: el detalle se queda aquí dentro.
        </p>
      </section>
    );
  }

  if (estado === 'denied') {
    return (
      <section className={marco} aria-labelledby="avisos-titulo">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="p-2 bg-amber-50 text-amber-700 rounded-xl">
            <BellOff className="h-4.5 w-4.5" />
          </span>
          <h3 id="avisos-titulo" className="text-xs font-extrabold text-slate-800">
            Avisos bloqueados
          </h3>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Este navegador tiene bloqueadas las notificaciones de la aplicación. La aplicación no
          puede volver a preguntarlo: hay que permitirlo desde los ajustes del navegador, en la
          sección de permisos de este sitio.
        </p>
      </section>
    );
  }

  return (
    <section className={marco} aria-labelledby="avisos-titulo">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="p-2 bg-teal-50 text-teal-700 rounded-xl">
          <BellRing className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 id="avisos-titulo" className="text-xs font-extrabold text-slate-800 leading-tight">
            Avisar cuando toque
          </h3>
          <p className="text-[10px] text-slate-500 font-semibold leading-none mt-1">
            Tomas de medicamento, citas y controles
          </p>
        </div>
      </div>

      <ul className="text-[11px] text-slate-600 leading-relaxed flex flex-col gap-1.5 list-disc pl-4">
        <li>
          El aviso dice que hay algo pendiente, <strong>nunca de quién ni de qué</strong>. Nada
          clínico se escribe en una notificación que se lee sobre la pantalla bloqueada.
        </li>
        <li>
          Todo ocurre en este dispositivo: <strong>no hay servidor</strong> al que se le cuente tu
          agenda.
        </li>
        <li>
          Hoy suenan <strong>solo con la aplicación abierta</strong>. Los navegadores todavía no
          permiten programar un aviso local para que suene con la aplicación cerrada, así que
          conviene no dejar de lado la alarma del teléfono para lo importante.
        </li>
      </ul>

      <button
        type="button"
        onClick={() => void pedir()}
        disabled={pidiendo}
        className="self-start inline-flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 disabled:opacity-50 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl shadow-md shadow-teal-900/10 transition-colors"
      >
        <BellRing aria-hidden="true" className="h-4 w-4" />
        <span>{pidiendo ? 'Esperando respuesta…' : 'Activar avisos'}</span>
      </button>
    </section>
  );
}
