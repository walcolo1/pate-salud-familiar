'use client';

/**
 * AvisosDeRecordatorios — conecta los recordatorios con las notificaciones (C3.2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * No pinta nada. Vive montado en el armazón de la aplicación y hace una sola
 * cosa: cada vez que cambian los recordatorios o las tomas pendientes, vuelve
 * a sincronizar los avisos programados. Como `sincronizar` es idempotente,
 * marcar algo como hecho **cancela su aviso sin que nadie lleve la cuenta**:
 * simplemente deja de estar en la lista.
 *
 * No pide permiso por su cuenta. Si nadie lo ha concedido, esto no hace nada
 * en absoluto; el permiso se pide desde la pantalla de recordatorios, donde
 * hay sitio para explicar por qué.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import {
  ProgramadorAvisos,
  construirAvisos,
  type AvisoProgramable,
  type RecordatorioProgramable,
  type RelojLike,
} from '@/lib/avisosLocales';

const RELOJ_NAVEGADOR: RelojLike = {
  ahora: () => Date.now(),
  programar: (fn, ms) => window.setTimeout(fn, ms),
  cancelar: (id) => window.clearTimeout(id as number),
};

/**
 * Muestra el aviso a través del Service Worker.
 *
 * `registration.showNotification` y no `new Notification(...)`: la segunda no
 * existe en Android y, cuando existe, la notificación muere con la pestaña.
 */
async function mostrarAviso(aviso: AvisoProgramable) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const registro = await navigator.serviceWorker?.ready;
    if (!registro) return;
    await registro.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: aviso.id, // Reprogramar no apila dos avisos del mismo recordatorio.
      data: { url: aviso.url },
    });
  } catch (err) {
    // Un aviso que no se puede mostrar no puede tumbar la aplicación.
    console.warn('[avisos] no se pudo mostrar:', (err as Error)?.name);
  }
}

export default function AvisosDeRecordatorios() {
  const { reminders, medicationDoseReminders } = useApp();
  const programador = useRef<ProgramadorAvisos | null>(null);

  const programables = useMemo<RecordatorioProgramable[]>(() => {
    // `Reminder` no tiene marca de borrado: se borran de la lista.
    const deRecordatorios = (reminders ?? [])
      .map((r) => ({
        id: `rec:${r.id}`,
        cuando: r.dueDate,
        tipo:
          r.reminderType === 'MEDICATION'
            ? ('medicacion' as const)
            : r.reminderType === 'APPOINTMENT'
              ? ('cita' as const)
              : r.reminderType === 'CHECKUP'
                ? ('control' as const)
                : ('otro' as const),
        resuelto: r.status === 'DONE',
      }));

    const deTomas = (medicationDoseReminders ?? [])
      .filter((d) => !d.deletedAt)
      .map((d) => ({
        id: `dosis:${d.id}`,
        cuando: d.scheduledAt,
        tipo: 'medicacion' as const,
        resuelto: d.status !== 'PENDING',
      }));

    return [...deRecordatorios, ...deTomas];
  }, [reminders, medicationDoseReminders]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    programador.current ??= new ProgramadorAvisos(RELOJ_NAVEGADOR, (a) => void mostrarAviso(a));
    programador.current.sincronizar(construirAvisos(programables, Date.now()));
  }, [programables]);

  // Al desmontar no queda ningún temporizador suelto apuntando a un árbol
  // que ya no existe.
  useEffect(() => {
    const p = programador;
    return () => p.current?.cancelarTodo();
  }, []);

  return null;
}
