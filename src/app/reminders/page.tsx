'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { 
  Bell, 
  CheckSquare, 
  Square, 
  Clock, 
  Users, 
  ShieldAlert, 
  AlertTriangle,
  ClipboardList
} from 'lucide-react';
import { Priority, ReminderStatus, TaskStatus } from '@/domain/models';

export default function RemindersPage() {
  const router = useRouter();
  const { 
    user, 
    reminders, 
    tasks, 
    members, 
    toggleReminder, 
    completeTask, 
    isLoading 
  } = useApp();

  const [activeTab, setActiveTab] = useState<0 | 1>(0); // 0 = alarms, 1 = tasks

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Get patient name helper
  const getPatientName = (memberId: string) => {
    return members.find(m => m.id === memberId)?.fullName.split(' ')[0] || 'Familiar';
  };

  const getPriorityColor = (p: Priority) => {
    switch (p) {
      case 'HIGH':
        return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'MEDIUM':
        return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'LOW':
        return 'text-slate-500 bg-slate-50 border-slate-200';
    }
  };

  const getPriorityLabel = (p: Priority) => {
    if (p === 'HIGH') return 'Alta';
    if (p === 'MEDIUM') return 'Media';
    return 'Baja';
  };

  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col gap-6 select-none pb-12">
      
      {/* Header Info */}
      <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800 leading-tight">Recordatorios y Alertas</h2>
        <p className="text-xs font-semibold text-slate-400">Control de alertas horarias médicas y checklist de cuidados del hogar.</p>
      </section>

      {/* Tabs */}
      <section className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab(0)}
          className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors duration-200 ${
            activeTab === 0 
              ? 'border-teal-600 text-teal-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Alarmas Médicas
        </button>
        <button
          onClick={() => setActiveTab(1)}
          className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors duration-200 ${
            activeTab === 1 
              ? 'border-teal-600 text-teal-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Tareas de Seguimiento
        </button>
      </section>

      {/* Alarms Content */}
      {activeTab === 0 && (
        <section className="flex flex-col gap-3.5">
          {reminders.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
              <Bell className="h-10 w-10 text-slate-300 animate-pulse" />
              <p className="text-sm font-bold text-slate-800">No hay alarmas activas</p>
              <p className="text-xs text-slate-400">Todo tu calendario familiar está libre por ahora.</p>
            </div>
          ) : (
            reminders.map((rem) => {
              const patient = getPatientName(rem.memberId);
              const isOverdue = rem.status === 'OVERDUE';
              const isCompleted = rem.status === 'DONE';

              return (
                <div 
                  key={rem.id}
                  onClick={() => toggleReminder(rem.id)}
                  className={`bg-white p-5 rounded-3xl border shadow-sm flex items-center gap-4 transition-all duration-200 cursor-pointer ${
                    isCompleted ? 'opacity-60 hover:opacity-80' : 'hover:shadow-md'
                  } ${isOverdue ? 'bg-rose-50/30 border-rose-100' : 'border-slate-100'}`}
                >
                  {/* Circle check box */}
                  <button className={`p-1.5 rounded-full shrink-0 border ${
                    isCompleted 
                      ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/10' 
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                  }`}>
                    {isCompleted ? <CheckSquare className="h-4.5 w-4.5" /> : <Square className="h-4.5 w-4.5" />}
                  </button>

                  {/* Info details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <h4 className={`text-xs font-extrabold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {rem.title}
                      </h4>
                      <span className="text-[9px] font-extrabold bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full uppercase border border-slate-200/50">
                        {patient}
                      </span>
                    </div>
                    <p className={`text-[10px] truncate mb-1.5 ${isCompleted ? 'text-slate-400' : 'text-slate-400 font-bold'}`}>{rem.description}</p>
                    
                    {/* Time limit badge */}
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                      <span className={`text-[10px] font-extrabold ${isOverdue ? 'text-rose-600' : 'text-teal-600'}`}>
                        {formatDateTime(rem.dueDate)} {isOverdue && '· ¡VENCIDO!'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* Follow-up Tasks Content */}
      {activeTab === 1 && (
        <section className="flex flex-col gap-3.5">
          {tasks.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center flex flex-col items-center justify-center gap-3">
              <ClipboardList className="h-10 w-10 text-slate-300 animate-pulse" />
              <p className="text-sm font-bold text-slate-800">No hay tareas pendientes</p>
              <p className="text-xs text-slate-400">Todo el checklist médico diario está limpio.</p>
            </div>
          ) : (
            tasks.map((task) => {
              const patient = getPatientName(task.memberId);
              const isCompleted = task.status === 'DONE';

              return (
                <div 
                  key={task.id}
                  onClick={() => !isCompleted && completeTask(task.id)}
                  className={`bg-white p-5 rounded-3xl border shadow-sm flex items-center gap-4 border-slate-100 transition-all duration-200 ${
                    isCompleted ? 'opacity-50 pointer-events-none' : 'hover:shadow-md cursor-pointer hover:border-slate-200'
                  }`}
                >
                  {/* Circle check box */}
                  <button className={`p-1.5 rounded-full shrink-0 border ${
                    isCompleted 
                      ? 'bg-teal-600 text-white border-teal-600' 
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                  }`}>
                    {isCompleted ? <CheckSquare className="h-4.5 w-4.5" /> : <Square className="h-4.5 w-4.5" />}
                  </button>

                  {/* Info details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <h4 className="text-xs font-extrabold text-slate-800 truncate leading-none mb-1">{task.title}</h4>
                      <span className="text-[9px] font-extrabold bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full uppercase border border-slate-200/50">
                        {patient}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-[10px] text-slate-400 font-bold truncate mb-1.5">{task.description}</p>
                    )}
                    
                    {/* Priority and due date */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${getPriorityColor(task.priority)}`}>
                        Prioridad {getPriorityLabel(task.priority)}
                      </span>
                      {task.dueDate && (
                        <span className="text-[10px] text-slate-400 font-extrabold">
                          Límite: {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

    </div>
  );
}
