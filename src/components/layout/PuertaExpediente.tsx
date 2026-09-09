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
import { useApp } from '@/context/AppContext';
import EstadoError from '@/components/ui/EstadoError';

export default function PuertaExpediente({ children }: { children: React.ReactNode }) {
  const { errorCarga, reintentarCarga } = useApp();

  if (errorCarga) {
    return (
      <EstadoError
        titulo="No se pudo abrir tu expediente"
        mensaje={
          <>
            {errorCarga}{' '}
            Si el problema no se resuelve, puedes restaurar una copia de seguridad desde
            Configuración.
          </>
        }
        onReintentar={reintentarCarga}
        etiquetaReintentar="Volver a intentarlo"
        accionSecundaria={{ etiqueta: 'Ir a Configuración', href: '/settings' }}
      />
    );
  }

  return <>{children}</>;
}
