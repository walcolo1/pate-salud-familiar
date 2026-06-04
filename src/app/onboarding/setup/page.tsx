'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Cloud, 
  Database, 
  ShieldCheck, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export default function OnboardingSetupPage() {
  const router = useRouter();
  const { 
    user, 
    postLoginGoogleSetup, 
    databaseSpreadsheetId, 
    isLoading,
    syncInitStatus,
    syncInitMessage,
  } = useApp();

  const [setupStep, setSetupStep] = useState<'idle' | 'authorizing' | 'configuring' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Redirigir al login si no hay sesión, o al dashboard si ya tiene base configurada
  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.provider === 'mock') {
        // Los usuarios demo no necesitan onboarding de Google
        router.replace('/dashboard');
      } else if (databaseSpreadsheetId && setupStep === 'idle') {
        router.replace('/dashboard');
      }
    }
  }, [user, isLoading, databaseSpreadsheetId, router, setupStep]);

  const handleConfigure = async () => {
    setErrorMsg(null);
    setSetupStep('authorizing');
    try {
      await postLoginGoogleSetup();
      setSetupStep('success');
    } catch (err: any) {
      console.error(err);
      setSetupStep('error');
      setErrorMsg(err.message || 'Error al conectar con Google. Por favor reintenta.');
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans p-6">
      <div className="w-full max-w-lg bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl flex flex-col gap-8">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center gap-2 select-none">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Cloud className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">Configurar Almacenamiento Seguro</h1>
            <p className="text-xs text-teal-400 font-semibold tracking-wider uppercase mt-1">Paté Salud Familiar</p>
          </div>
        </div>

        {/* Dynamic Setup Status View */}
        {setupStep === 'idle' && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-800/60 flex flex-col gap-4 text-sm leading-relaxed">
              <p className="text-slate-300 font-medium text-center">
                ¡Hola, <strong className="text-white">{user.displayName.split(' ')[0]}</strong>! Para que tus expedientes estén respaldados de forma privada y sincronizados en todos tus dispositivos, vincularemos tu propia cuenta de Google Drive y Calendar.
              </p>
              
              <div className="grid grid-cols-1 gap-3 mt-1">
                <div className="flex items-start gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-900/50">
                  <Database className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-extrabold text-white">Google Drive y Sheets</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">Se crea una base de datos tabular 100% privada donde tus recetas, citas e historial clínico se resguardan de forma segura.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-900/50">
                  <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-extrabold text-white">Google Calendar</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tus citas médicas familiares se registran automáticamente en tu Google Calendar para recibir alarmas preventivas.</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleConfigure}
              className="h-14 w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 active:from-teal-700 active:to-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-teal-500/10 active:translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>Autorizar y sincronizar mi cuenta</span>
              <ArrowRight className="h-4.5 w-4.5" />
            </button>
          </div>
        )}

        {(setupStep === 'authorizing' || setupStep === 'configuring') && (
          <div className="flex flex-col items-center text-center gap-6 py-6 select-none">
            <div className="relative flex items-center justify-center">
              <Loader2 className="h-16 w-16 text-teal-500 animate-spin" />
              <Sparkles className="h-6 w-6 text-emerald-400 absolute animate-pulse" />
            </div>
            
            <div className="flex flex-col gap-2">
              <h3 className="font-extrabold text-white text-base">
                {syncInitStatus === 'checking' ? 'Buscando base de datos...' : 'Configurando servicios...'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed px-4">
                {syncInitMessage || 'Por favor concede los permisos solicitados en la ventana emergente de Google...'}
              </p>
            </div>
          </div>
        )}

        {setupStep === 'success' && (
          <div className="flex flex-col items-center text-center gap-6 select-none">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 animate-bounce" />
            
            <div className="flex flex-col gap-1.5">
              <h3 className="font-extrabold text-white text-base">¡Configuración Exitosa! 🎉</h3>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Tu expediente clínico se ha sincronizado correctamente. Todo está listo para que empieces.
              </p>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="h-12 px-8 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-extrabold text-xs rounded-xl shadow-md border border-slate-700/50 transition-colors"
            >
              Ir al Panel Principal
            </button>
          </div>
        )}

        {setupStep === 'error' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center text-center gap-4 py-2 select-none">
              <AlertCircle className="h-16 w-16 text-rose-500" />
              <div className="flex flex-col gap-1">
                <h3 className="font-extrabold text-white text-base">Fallo en la Sincronización</h3>
                <p className="text-xs text-rose-400/90 font-medium max-w-xs px-2 leading-relaxed">
                  {errorMsg || 'No se pudieron conceder los permisos o falló la creación de la base.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSetupStep('idle')}
                className="flex-1 h-12 border border-slate-800 hover:bg-slate-800 font-extrabold text-xs text-slate-400 rounded-xl transition-colors"
              >
                Volver
              </button>
              <button
                onClick={handleConfigure}
                className="flex-1 h-12 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
