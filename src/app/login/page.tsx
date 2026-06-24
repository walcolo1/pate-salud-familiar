'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { decodeGoogleToken } from '@/lib/googleAuth';
import { Activity, ShieldAlert, Heart, Info } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, isLoading } = useApp();
  const [localLoading, setLocalLoading] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  // Cargar la variable de entorno del cliente de Google de forma segura en el cliente
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '74018068811-phpbiqs6th899onjdquvln1t5tum98ea.apps.googleusercontent.com';
    setClientId(id);
  }, []);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // Efecto para inicializar Google Identity Services y renderizar el botón nativo
  useEffect(() => {
    if (!clientId) return;

    // Sondeo de 100ms para esperar que la librería global window.google se cargue asíncronamente
    const checkGSI = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
        clearInterval(checkGSI);
        
        try {
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response: any) => {
              setLocalLoading(true);
              const decoded = decodeGoogleToken(response.credential);
              if (decoded) {
                await signIn({
                  googleId: decoded.sub,
                  displayName: decoded.name,
                  email: decoded.email,
                  photoUrl: decoded.picture || null
                }, response.credential);
              } else {
                console.error('No se pudo decodificar la credencial de Google.');
                setLocalLoading(false);
              }
            }
          });

          (window as any).google.accounts.id.renderButton(
            document.getElementById('googleBtnParent'),
            { 
              theme: 'filled_blue', 
              size: 'large', 
              width: 320, 
              shape: 'pill',
              logo_alignment: 'left'
            }
          );
        } catch (err) {
          console.error('Error al inicializar el SDK de Google Identity Services:', err);
        }
      }
    }, 100);

    return () => clearInterval(checkGSI);
  }, [clientId, signIn]);

  const handleSignIn = async () => {
    setLocalLoading(true);
    await signIn();
    setLocalLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-8 bg-gradient-to-tr from-teal-800 via-teal-700 to-slate-900 text-white font-sans">
      
      {/* ── Top Branding Section ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 mt-12 max-w-md mx-auto select-none">
        <div className="h-20 w-20 rounded-3xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xl shadow-teal-900/30 scale-100 hover:scale-105 active:scale-95 transition-all duration-300">
          <Activity className="h-10 w-10 text-white animate-pulse" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Paté</h1>
          <p className="text-lg font-light text-teal-100/90 tracking-wide">Salud Familiar</p>
        </div>
        <p className="text-sm text-teal-100/70 max-w-xs leading-relaxed">
          Toda la salud de tu núcleo familiar, expedientes y vacunas organizados en un solo lugar con respaldo seguro.
        </p>
      </div>

      {/* ── Bottom Action Section ───────────────────────────────────────── */}
      <div className="max-w-md w-full mx-auto flex flex-col gap-6 select-none mt-8" id="loginContainer">
        
        {/* Renderizado Condicional del Botón según la configuración de variables de entorno */}
        {clientId ? (
          <div className="flex flex-col gap-3 items-center w-full select-none">
            <div 
              id="googleBtnParent" 
              className="w-full min-h-12 flex justify-center scale-100 hover:scale-102 active:scale-98 transition-all duration-200" 
            />
            {localLoading && (
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-200/80 animate-pulse">
                <div className="h-4.5 w-4.5 border-2 border-teal-300 border-t-transparent rounded-full animate-spin" />
                <span>Iniciando sesión con Google...</span>
              </div>
            )}
            <p className="text-[9px] text-teal-200/50 leading-relaxed font-bold tracking-wide mt-1 text-center">
              Autenticación de sesión operada y provista directamente por Google OAuth.
            </p>
            <button
              onClick={handleSignIn}
              disabled={isLoading || localLoading}
              className="mt-3 text-xs font-bold text-teal-200/60 hover:text-teal-100 transition-colors duration-200 underline decoration-dashed decoration-teal-200/30 underline-offset-4"
            >
              ¿Quieres probar la app sin tu cuenta de Google? Iniciar en Modo Demostración
            </button>
          </div>
        ) : (
          /* Fallback Mock de Desarrollo para pruebas sin variables de entorno */
          <div className="flex flex-col gap-3 p-4 bg-amber-600/10 border border-amber-500/20 rounded-2xl text-center select-none text-amber-100">
            <div className="flex items-center justify-center gap-1.5 font-black text-xs text-amber-300">
              <Info className="h-4 w-4 shrink-0" />
              <span>Modo Demostración Activo</span>
            </div>
            <p className="text-[10px] text-amber-200/80 leading-relaxed font-bold">
              Para habilitar Google Sign-In real, crea un Client ID OAuth y configúralo en <code className="bg-slate-900/60 p-0.5 px-1 rounded font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> en tu archivo <code className="bg-slate-900/60 p-0.5 px-1 rounded font-mono">.env.local</code>.
            </p>
            <button
              onClick={handleSignIn}
              disabled={isLoading || localLoading}
              className="w-full h-12 mt-1 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-amber-950/20 active:translate-y-0.5 transition-colors flex items-center justify-center gap-2"
            >
              {localLoading ? (
                <div className="h-4.5 w-4.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Heart className="h-4 w-4 fill-red-500 text-red-500 animate-pulse" />
                  <span>Continuar con Sesión Demo</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* View onboarding */}
        <button
          onClick={() => router.push('/onboarding')}
          className="py-3 text-sm font-semibold text-teal-100/80 hover:text-white transition-colors duration-200"
        >
          Ver cómo funciona la aplicación
        </button>

        <hr className="border-white/10 my-1 mx-8" />

        {/* Security disclaimer footer */}
        <div className="flex gap-3 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
          <ShieldAlert className="h-5 w-5 text-teal-300 shrink-0 mt-0.5" />
          <p className="text-[10px] text-teal-100/60 leading-relaxed font-semibold">
            🔒 <strong>Almacenamiento Local:</strong> Los datos se almacenan localmente en el navegador del dispositivo. No se sincronizan en la nube todavía y pueden eliminarse si el usuario borra datos del sitio. Esta app es autogestionada y no reemplaza el diagnóstico médico.
          </p>
        </div>
      </div>
    </div>
  );
}
