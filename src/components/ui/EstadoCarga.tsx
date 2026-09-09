'use client';

/**
 * EstadoCarga — la única forma de decir «espera un momento» (C2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El mismo círculo girando estaba copiado y pegado en 18 pantallas, siempre
 * idéntico y siempre con el mismo defecto: un `<div>` que da vueltas y nada
 * más. Sin `role`, sin texto, sin nada que anunciar. Con lector de pantalla, la
 * aplicación entera se quedaba en silencio mientras cargaba, y quien esperaba
 * no tenía forma de saber si estaba pasando algo o si se había roto.
 *
 * Aquí el giro es decoración —`aria-hidden`— y quien informa es el texto,
 * dentro de una región `role="status"` que el lector anuncia sin robar el foco.
 *
 * `aria-live="polite"` y no `assertive`: cargar no es una urgencia que deba
 * cortar a media frase lo que se esté leyendo.
 */

import React from 'react';

export interface EstadoCargaProps {
  /** Qué se está esperando. Se lee en voz alta; que diga algo útil. */
  mensaje?: string;
  /**
   * `pantalla` ocupa el alto completo (arranque de una ruta); `bloque` se
   * queda dentro de la tarjeta o sección que está cargando.
   */
  variante?: 'pantalla' | 'bloque';
}

export default function EstadoCarga({
  mensaje = 'Cargando…',
  variante = 'pantalla',
}: EstadoCargaProps) {
  const contenedor =
    variante === 'pantalla'
      ? 'min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50'
      : 'flex flex-col items-center justify-center gap-3 py-10';

  return (
    <div role="status" aria-live="polite" className={contenedor}>
      <span
        aria-hidden="true"
        className={`${
          variante === 'pantalla' ? 'h-10 w-10 border-4' : 'h-7 w-7 border-[3px]'
        } rounded-full border-teal-700 border-t-transparent animate-spin motion-reduce:animate-none`}
      />
      <p className="text-xs font-bold text-slate-600">{mensaje}</p>
    </div>
  );
}
