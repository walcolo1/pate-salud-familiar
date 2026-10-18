'use client';

/**
 * PuertaExpediente — un único sitio donde se anuncia que la carga falló (C2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada una de las 18 rutas comprobaba `isLoading` por su cuenta, pero ninguna
 * comprobaba si la carga había ido mal, porque hasta C2 no había forma de
 * saberlo. Poner esa comprobación en las 18 habría multiplicado por 18 la
 * ocasión de olvidarla en la ruta 19.
 *
 * Va aquí, envolviendo a toda la aplicación: si el expediente guardado no se
 * pudo abrir, no se pinta ninguna pantalla que pueda dar a entender que no hay
 * datos. Se dice lo que pasó y se ofrece reintentar.
 */

import React from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import EstadoError from '@/components/ui/EstadoError';
import BienvenidaSinAcceso from '@/components/layout/BienvenidaSinAcceso';
import { rutaPermitidaSinAcceso } from '@/lib/altaFamilia';

export default function PuertaExpediente({ children }: { children: React.ReactNode }) {
  const { errorCarga, reintentarCarga, sinAcceso, user } = useApp();
  const ruta = usePathname();

  // Bloque M · una cuenta sin acceso a la hoja no ve un expediente vacío ni un
  // error técnico: ve qué puede hacer.
  if (sinAcceso && !rutaPermitidaSinAcceso(ruta)) {
    return <BienvenidaSinAcceso email={user?.email} />;
  }

  if (errorCarga) {
    return (
      <EstadoError
        titulo="No se pudo abrir tu expediente"
        mensaje={
          <>
            {errorCarga}{' '}
            Si el problema no se resuelve, puedes restaurar una copia de seguridad desde
            Ajustes ▸ Herramientas avanzadas.
          </>
        }
        onReintentar={reintentarCarga}
        etiquetaReintentar="Volver a intentarlo"
        accionSecundaria={{ etiqueta: 'Ir a Ajustes', href: '/settings' }}
      />
    );
  }

  return <>{children}</>;
}
