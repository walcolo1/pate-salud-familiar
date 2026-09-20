'use client';

/**
 * La pantalla que ve un familiar invitado (Bloque E, E9).
 *
 * Es la **única ruta pública que recibe una URL de un desconocido y luego le
 * habla**. Todo lo demás en esta aplicación se conecta a sitios que decidimos
 * nosotros; aquí el destino viene en la barra de direcciones.
 *
 * Por eso la primera cosa que pasa —antes de pintar nada, antes de cargar
 * Google— es validar los dos parámetros. Las decisiones viven en
 * `src/lib/invitacionEntrante.ts`, con sus pruebas; aquí solo está el estado de
 * la pantalla y la llamada.
 *
 * LO QUE NO SE GUARDA
 * ───────────────────
 * Ni el `id_token`, ni el correo, ni el token de la invitación. Lo único que
 * sobrevive a esta pantalla es la dirección del backend de esa familia, sin la
 * cual la aplicación no sabría a qué hoja hablar la próxima vez.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  cuerpoAceptacion,
  guardarBackend,
  interpretarRespuesta,
  leerParametros,
  mensajeDe,
  type Mensaje,
} from '@/lib/invitacionEntrante';
import { clientIdConfigurado, MENSAJE_SIN_CLIENT_ID } from '@/lib/importacionManual';

type Fase = 'IDENTIFICANDO' | 'ENVIANDO' | 'ACEPTADA' | 'RECHAZADA';

/**
 * El Client ID se incrusta en el paquete durante la compilación, así que es el
 * mismo literal en el servidor y en el navegador. Leerlo en un efecto —como
 * hace `/login`— no aporta nada y obliga a un render de más.
 */
const CLIENT_ID = clientIdConfigurado(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
  ? String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID).trim()
  : null;

/** Cuánto se espera a que el script de Google aparezca antes de rendirse. */
const ESPERA_GIS_MS = 10000;

export default function PantallaInvitacion() {
  const router = useRouter();
  const parametros = useSearchParams();

  // Se desmenuza en cadenas estables: `leerParametros` devuelve un objeto
  // nuevo en cada render, y usarlo como dependencia reiniciaría el sondeo del
  // botón de Google una y otra vez.
  const lectura = leerParametros(parametros);
  const token = lectura.ok ? lectura.token : '';
  const backend = lectura.ok ? lectura.backend : '';
  const motivoParametro = lectura.ok ? null : lectura.motivo;

  /*
   * Los parámetros se leen ANTES del primer pintado, no en un efecto.
   *
   * Si el enlace no sirve, la pantalla nace ya rechazada: no se carga Google,
   * no se toca la red y no hay un parpadeo de «identifícate» que desaparece.
   * Un efecto que llama a `setState` nada más montar es un render de más y un
   * fotograma equivocado.
   */
  const [fase, setFase] = useState<Fase>(motivoParametro ? 'RECHAZADA' : 'IDENTIFICANDO');
  const [mensaje, setMensaje] = useState<Mensaje | null>(
    motivoParametro ? mensajeDe(motivoParametro) : null,
  );
  const [intento, setIntento] = useState(0);
  const clientId = CLIENT_ID;

  const rechazar = useCallback((codigo: string) => {
    setMensaje(mensajeDe(codigo));
    setFase('RECHAZADA');
    // Los setters de `useState` son estables: listarlos no cambia nada en
    // ejecución, y es lo que el analizador del compilador de React espera ver.
  }, [setMensaje, setFase]);

  // 2 · Canjear la invitación con el token que acaba de emitir Google.
  const aceptar = useCallback(
    async (idToken: string) => {
      if (!token || !backend) return;
      setFase('ENVIANDO');

      try {
        const respuesta = await fetch(backend, {
          method: 'POST',
          // `text/plain` por costumbre prudente: E0-bis midió que
          // `application/json` también cruza.
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: cuerpoAceptacion(idToken, token),
        });

        const desenlace = interpretarRespuesta(await respuesta.json().catch(() => null));

        if (desenlace.estado === 'RECHAZADA') {
          setMensaje(desenlace.mensaje);
          setFase('RECHAZADA');
          return;
        }

        // Solo la dirección del backend. Si el navegador no deja guardar
        // —modo privado, cuota— el alta sigue siendo válida: lo que se pierde
        // es tener que volver a abrir el enlace la próxima vez.
        guardarBackend(backend, typeof window === 'undefined' ? null : window.localStorage);
        setFase('ACEPTADA');
      } catch {
        // Un `fetch` que lanza es red o CSP, nunca una respuesta del backend.
        setMensaje(mensajeDe('SIN_RED'));
        setFase('RECHAZADA');
      }
    },
    [token, backend, setMensaje, setFase],
  );

  // 3 · El botón de Google. Mismo patrón que `/login`: el script se carga de
  //     forma asíncrona desde el armazón y hay que esperarlo.
  useEffect(() => {
    if (fase !== 'IDENTIFICANDO' || !clientId) return;

    const desde = Date.now();
    const sondeo = setInterval(() => {
      const google = (window as unknown as { google?: GoogleIdentity }).google;

      if (!google?.accounts?.id) {
        if (Date.now() - desde > ESPERA_GIS_MS) {
          clearInterval(sondeo);
          rechazar('SIN_RED');
        }
        return;
      }

      clearInterval(sondeo);
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (respuesta) => void aceptar(respuesta.credential),
          auto_select: false,
        });
        // Sin esto, Google reutilizaría la sesión anterior. Aquí importa más
        // que en ningún otro sitio: la invitación es para una cuenta concreta
        // y entrar con la que hubiera abierta es el error más probable.
        google.accounts.id.disableAutoSelect();

        const destino = document.getElementById('boton-google-invitacion');
        if (destino) {
          google.accounts.id.renderButton(destino, {
            theme: 'filled_blue',
            size: 'large',
            width: 300,
            shape: 'pill',
            text: 'signin_with',
          });
        }
      } catch {
        rechazar('SIN_RED');
      }
    }, 100);

    return () => clearInterval(sondeo);
  }, [fase, clientId, aceptar, rechazar, intento]);

  // ───────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-teal-800 via-teal-700 to-slate-900 p-6 text-white">
      <div className="w-full max-w-md rounded-3xl bg-white/10 p-8 backdrop-blur-md border border-white/20 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 border border-white/20">
            <Activity className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium tracking-wide text-teal-100">Paté · Salud Familiar</p>
        </div>

        {/*
          Un solo `aria-live` para toda la pantalla. El estado cambia solo —de
          identificando a enviando a aceptada— y sin esto un lector de pantalla
          se quedaría anunciando la primera pantalla mientras la persona ya
          está dentro.
        */}
        <div aria-live="polite" aria-atomic="true">
          {fase === 'IDENTIFICANDO' && (
            <>
              <h1 className="text-2xl font-semibold">Te han dado acceso</h1>
              <p className="mt-3 text-teal-50/90">
                Identifícate con Google para entrar. Usa <strong>la cuenta en la que recibiste
                el correo</strong>: la invitación solo funciona desde esa.
              </p>

              {clientId ? (
                <div className="mt-8 flex justify-center" id="boton-google-invitacion" />
              ) : (
                <p className="mt-8 rounded-xl bg-amber-500/15 p-4 text-sm text-amber-100 border border-amber-300/30">
                  {MENSAJE_SIN_CLIENT_ID}
                </p>
              )}

              <p className="mt-8 text-xs text-teal-100/70">
                No tendrás que autorizar ningún permiso ni instalar nada.
              </p>
            </>
          )}

          {fase === 'ENVIANDO' && <Cargando texto="Entrando en el expediente…" />}

          {fase === 'ACEPTADA' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-300" aria-hidden="true" />
              <h1 className="mt-4 text-2xl font-semibold">Ya estás dentro</h1>
              <p className="mt-3 text-teal-50/90">
                Tu acceso quedó activo. Desde ahora entras como en cualquier otra aplicación, sin
                volver a usar este enlace.
              </p>
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className="mt-8 w-full rounded-full bg-white px-6 py-3 font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Ir al expediente
              </button>
            </>
          )}

          {fase === 'RECHAZADA' && mensaje && (
            <>
              <AlertTriangle className="h-10 w-10 text-amber-300" aria-hidden="true" />
              <h1 className="mt-4 text-2xl font-semibold">{mensaje.titulo}</h1>
              <p className="mt-3 text-teal-50/90">{mensaje.cuerpo}</p>

              {/*
                El botón solo aparece cuando reintentar puede servir de algo.
                Uno sobre una invitación caducada es una promesa falsa.
              */}
              {mensaje.reintentable && (
                <button
                  type="button"
                  onClick={() => {
                    setMensaje(null);
                    setIntento((n) => n + 1);
                    setFase('IDENTIFICANDO');
                  }}
                  className="mt-8 w-full rounded-full bg-white px-6 py-3 font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Probar con otra cuenta
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 py-6">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <p className="text-teal-50">{texto}</p>
    </div>
  );
}

/** Lo poco que usamos de Google Identity Services. */
interface GoogleIdentity {
  accounts?: {
    id?: {
      initialize(opciones: {
        client_id: string;
        callback: (respuesta: { credential: string }) => void;
        auto_select?: boolean;
      }): void;
      disableAutoSelect(): void;
      renderButton(destino: HTMLElement, opciones: Record<string, unknown>): void;
    };
  };
}
