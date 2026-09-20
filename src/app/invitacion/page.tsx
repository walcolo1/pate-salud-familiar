/**
 * `/invitacion` — la puerta de entrada de un familiar (Bloque E, E9).
 *
 * La pantalla lee la cadena de consulta, y `useSearchParams` obliga a que el
 * árbol que la usa se pinte en el cliente. El `Suspense` es lo que permite que
 * el resto de la ruta se prerrenderice igualmente en vez de arrastrar la página
 * entera al cliente.
 */

import { Suspense } from 'react';
import PantallaInvitacion from './PantallaInvitacion';

export const metadata = {
  title: 'Invitación · Paté',
  description: 'Acepta una invitación para acceder a un expediente familiar.',
};

export default function PaginaInvitacion() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-teal-800 via-teal-700 to-slate-900 p-6 text-white">
          <p>Comprobando el enlace…</p>
        </main>
      }
    >
      <PantallaInvitacion />
    </Suspense>
  );
}
