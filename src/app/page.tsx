'use client';

import { useEffect } from 'react';
import EstadoCarga from '@/components/ui/EstadoCarga';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading, router]);

  return (
    <EstadoCarga mensaje="Cargando Paté Salud…" />
  );
}
