'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Home, 
  Users, 
  Bell, 
  Settings, 
  Activity, 
  CloudCheck, 
  LogOut,
  Lock,
  ShieldCheck,
  AlertTriangle,
  X
} from 'lucide-react';
import ConfirmDialog, { type OpcionDialogo } from '@/components/ui/ConfirmDialog';
import { dialogoVisible, estaOcupado } from '@/lib/cierreSesion';

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user, driveSyncEnabled, databaseSpreadsheetId, isLoading,
    sessionLocked, unlockSession, isFirebaseBackend,
    // A6-F2
    estadoCierre, solicitarCierreDeSesion, despacharCierre, reintentarSincronizacion,
    avisoPurgaDiferida, descartarAvisoPurgaDiferida,
    // A6-F3
    estadoBloqueo, errorRestauracion,
  } = useApp();

  const cierreAbierto = dialogoVisible(estadoCierre);
  const cierreOcupado = estaOcupado(estadoCierre);

  // ── A6-F2 · Contenido del dialogo segun la fase ──────────────────────────
  const plural = (n: number) => (n === 1 ? 'cambio' : 'cambios');

  let tituloCierre = '';
  let descripcionCierre: React.ReactNode = null;
  let opcionesCierre: OpcionDialogo[] = [];

  if (estadoCierre.fase === 'sincronizando') {
    tituloCierre = 'Guardando cambios';
    descripcionCierre = 'Estamos guardando cambios en tu expediente. Espera a que el proceso termine antes de cerrar sesion para evitar inconsistencias.';
    opcionesCierre = [
      { id: 'esperar', etiqueta: 'Esperar a que termine', tono: 'primario', focoInicial: true, onSelect: () => {} },
      { id: 'cancelar', etiqueta: 'Cancelar cierre de sesion', tono: 'neutro', onSelect: () => despacharCierre({ tipo: 'cancelar' }) },
    ];
  } else if (estadoCierre.fase === 'pendientes') {
    const n = estadoCierre.pendientes;
    tituloCierre = 'Tienes cambios sin sincronizar';
    descripcionCierre = (
      <>
        <p>
          Hay <strong>{n} {plural(n)}</strong> guardado{n === 1 ? '' : 's'} solo en este dispositivo que
          todavia no se han enviado a tu cuenta de Google. Si sales ahora sin sincronizarlos, se perderan.
        </p>
        {estadoCierre.error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-700">{estadoCierre.error}</p>
        )}
      </>
    );
    opcionesCierre = [
      { id: 'reintentar', etiqueta: 'Reintentar sincronizacion', tono: 'primario', focoInicial: true, onSelect: () => reintentarSincronizacion() },
      { id: 'descartar', etiqueta: 'Salir y descartar cambios', tono: 'peligro', onSelect: () => despacharCierre({ tipo: 'pedir_descarte' }) },
      { id: 'cancelar', etiqueta: 'Cancelar', tono: 'neutro', onSelect: () => despacharCierre({ tipo: 'cancelar' }) },
    ];
  } else if (estadoCierre.fase === 'confirmar_descarte') {
    const n = estadoCierre.pendientes;
    tituloCierre = `Se perderan ${n} ${plural(n)}`;
    descripcionCierre = `Esta accion no se puede deshacer. Los ${n} ${plural(n)} que no se sincronizaron se borraran de este dispositivo junto con el resto de tus datos.`;
    opcionesCierre = [
      { id: 'volver', etiqueta: 'Volver', tono: 'primario', focoInicial: true, onSelect: () => despacharCierre({ tipo: 'cancelar' }) },
      { id: 'salir', etiqueta: 'Salir y borrar', tono: 'peligro', onSelect: () => despacharCierre({ tipo: 'confirmar_descarte' }) },
    ];
  } else if (estadoCierre.fase === 'purgando') {
    tituloCierre = 'Cerrando sesion';
    descripcionCierre = 'Estamos borrando los datos de este dispositivo.';
    opcionesCierre = [];
  }

  React.useEffect(() => {
    if (!isLoading && user && user.provider === 'google' && !databaseSpreadsheetId && !isFirebaseBackend) {
      router.replace('/onboarding/setup');
    }
  }, [user, isLoading, databaseSpreadsheetId, router, isFirebaseBackend]);

  // ── A6-F2 · Aviso de limpieza pendiente ──────────────────────────────────
  // Se muestra tambien en rutas publicas: el usuario acaba de cerrar sesion y
  // aterriza en /login. NO afirma que los datos se borraron.
  const avisoLimpieza = avisoPurgaDiferida ? (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-xs font-semibold leading-relaxed">
        Se cerró tu sesión, pero quedan datos en caché en este navegador. Se borrarán por completo
        la próxima vez que abras la app. Para completarlo ahora, cierra las demás pestañas de Paté Salud.
      </p>
      <button
        type="button"
        onClick={descartarAvisoPurgaDiferida}
        aria-label="Descartar aviso de limpieza pendiente"
        className="shrink-0 rounded-lg p-1 hover:bg-amber-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  ) : null;

  const dialogoCierre = (
    <ConfirmDialog
      abierto={cierreAbierto}
      titulo={tituloCierre}
      descripcion={descripcionCierre}
      opciones={opcionesCierre}
      ocupado={cierreOcupado}
      mensajeOcupado={cierreOcupado ? 'Borrando los datos de este dispositivo…' : undefined}
      onCerrar={() => despacharCierre({ tipo: 'cancelar' })}
    />
  );

  // If user is not authenticated, we do not render the navigation chrome
  if (!user || pathname === '/login' || pathname === '/onboarding' || pathname === '/' || pathname.startsWith('/onboarding/setup')) {
    return (
      <>
        {avisoLimpieza}
        {children}
        {dialogoCierre}
      </>
    );
  }

  const navItems = [
    { label: 'Inicio', href: '/dashboard', icon: Home },
    { label: 'Familia', href: '/members', icon: Users },
    { label: 'Alertas', href: '/reminders', icon: Bell },
    { label: 'Ajustes', href: '/settings', icon: Settings },
  ];

  return (
    <>
      {avisoLimpieza}
      {dialogoCierre}
      <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* ── Desktop Sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 p-6 shrink-0 justify-between select-none">
        <div className="flex flex-col gap-8">
          {/* Logo Branding */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-600 text-white rounded-xl shadow-md shadow-teal-600/20">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-extrabold text-lg text-slate-900 tracking-tight leading-none">Paté</h1>
              <span className="text-xs text-slate-500 font-medium">Salud Familiar</span>
            </div>
          </div>

          {/* Sync status */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <span className="text-xs text-slate-500 font-semibold">Copia en Drive</span>
            <div className="flex items-center gap-1.5 text-xs text-teal-600 font-bold">
              <span className={`h-2 w-2 rounded-full ${driveSyncEnabled ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'}`} />
              {driveSyncEnabled ? 'Activo' : 'Pausado'}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    active 
                      ? 'bg-teal-50 text-teal-700 font-bold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info & logout */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 p-2">
            <div className="h-9 w-9 rounded-full bg-teal-600/10 text-teal-700 font-bold flex items-center justify-center text-sm border border-teal-600/20">
              {user.displayName.substring(0, 2).toUpperCase()}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-slate-900 truncate leading-none mb-1">{user.displayName}</p>
              <p className="text-[10px] text-slate-400 truncate leading-none">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={() => solicitarCierreDeSesion()}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl text-xs font-bold transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 overflow-y-auto">
        {/* Mobile top navigation header */}
        <header className="md:hidden flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 select-none">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-teal-600 text-white rounded-lg">
              <Activity className="h-4 w-4" />
            </div>
            <span className="font-extrabold text-sm text-slate-900 leading-none">Paté Salud</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${driveSyncEnabled ? 'bg-teal-500' : 'bg-slate-400'}`} />
            <span className="text-[10px] text-slate-400 font-bold">{driveSyncEnabled ? 'Drive Synced' : 'Offline'}</span>
          </div>
        </header>

        {/* Content inject */}
        <div className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation Bar ───────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-100 flex items-center justify-around px-2 z-50 shadow-lg select-none">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all duration-200 ${
                active ? 'text-teal-600 font-bold' : 'text-slate-400'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-teal-600 scale-105' : 'text-slate-400'}`} />
              <span className="text-[10px] tracking-wide font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>

    {/* ─── Session Lock Overlay ───────────────────────────────────────────── */}
    {sessionLocked && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sesión bloqueada"
        className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-6 p-6"
      >
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full flex flex-col items-center gap-5 shadow-2xl text-center">
          <div className="h-16 w-16 rounded-full bg-teal-50 flex items-center justify-center border-2 border-teal-100">
            <Lock className="h-8 w-8 text-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 mb-1">Sesión bloqueada</h2>
            <p className="text-sm text-slate-500 font-semibold">
              Ocultamos la información en pantalla por inactividad. Vuelve a entrar para seguir
              consultando el expediente.
            </p>
          </div>

          {/*
            A6-F3 · El texto dice lo que el bloqueo hace de verdad: oculta la
            pantalla y vacía la memoria. El expediente sigue en el disco hasta
            que la fase 4 retire el autoguardado, así que la interfaz no debe
            prometer que los datos están protegidos.
          */}
          <div className="flex items-center gap-1.5 bg-teal-50 text-teal-700 text-xs font-bold px-3 py-1.5 rounded-full border border-teal-100">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>La información se ocultó de la pantalla</span>
          </div>

          {estadoBloqueo === 'restaurando' && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-teal-700">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              Restaurando tu expediente…
            </p>
          )}

          {estadoBloqueo === 'error_restauracion' && (
            <p role="alert" className="w-full rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {errorRestauracion ?? 'No se pudo restaurar la sesión. Vuelve a iniciar sesión.'}
            </p>
          )}

          {estadoBloqueo === 'error_restauracion' ? (
            <button
              id="btn-session-relogin"
              onClick={() => { window.location.replace('/login'); }}
              className="w-full h-12 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold rounded-2xl transition-all shadow-md shadow-teal-600/20"
            >
              Iniciar sesión de nuevo
            </button>
          ) : (
            <button
              id="btn-session-unlock"
              onClick={() => { void unlockSession(); }}
              disabled={estadoBloqueo === 'restaurando'}
              className="w-full h-12 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold rounded-2xl transition-all shadow-md shadow-teal-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Volver al expediente
            </button>
          )}
          <button
            id="btn-session-signout"
            onClick={() => solicitarCierreDeSesion()}
            className="text-xs text-slate-400 hover:text-slate-600 font-semibold underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )}
  </>
  );
}

