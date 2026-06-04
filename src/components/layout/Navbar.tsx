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
  LogOut 
} from 'lucide-react';

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, driveSyncEnabled, signOut, databaseSpreadsheetId, isLoading } = useApp();

  React.useEffect(() => {
    if (!isLoading && user && user.provider === 'google' && !databaseSpreadsheetId) {
      router.replace('/onboarding/setup');
    }
  }, [user, isLoading, databaseSpreadsheetId, router]);

  // If user is not authenticated, we do not render the navigation chrome
  if (!user || pathname === '/login' || pathname === '/onboarding' || pathname === '/' || pathname.startsWith('/onboarding/setup')) {
    return <>{children}</>;
  }

  const navItems = [
    { label: 'Inicio', href: '/dashboard', icon: Home },
    { label: 'Familia', href: '/members', icon: Users },
    { label: 'Alertas', href: '/reminders', icon: Bell },
    { label: 'Ajustes', href: '/settings', icon: Settings },
  ];

  return (
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
            onClick={() => signOut()}
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
  );
}
