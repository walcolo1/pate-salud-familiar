'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Activity, 
  Cloud, 
  ArrowRight, 
  Check 
} from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Toda tu familia en un solo lugar',
      description: 'Crea expedientes médicos dedicados para tus hijos, cónyuge, padres o para ti mismo. Gestiona el parentesco y la información básica de forma unificada.',
      icon: Users,
      color: 'bg-teal-500 shadow-teal-500/20'
    },
    {
      title: 'Vacunas, citas y controles preventivos',
      description: 'Lleva una cartilla digital de vacunas, programa citas y almacena exámenes de laboratorio interactivos con alertas de resultados anormales.',
      icon: Activity,
      color: 'bg-rose-500 shadow-rose-500/20'
    },
    {
      title: 'Respaldo privado en Google Drive',
      description: 'Sincroniza tus recetas médicas, PDFs clínicos e historial en tu propia cuenta personal de Google Drive. También podrás exportar reportes directos a Google Sheets.',
      icon: Cloud,
      color: 'bg-blue-500 shadow-blue-500/20'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push('/login');
    }
  };

  const Icon = steps[currentStep].icon;

  return (
    <div className="min-h-screen flex flex-col justify-between p-8 bg-slate-50 font-sans select-none">
      
      {/* Skip Button */}
      <div className="flex justify-end">
        <button 
          onClick={() => router.push('/login')}
          className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          Saltar tutorial
        </button>
      </div>

      {/* Slide Content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto text-center gap-8 mt-4">
        {/* Animated Icon Container */}
        <div className={`h-24 w-24 rounded-3xl ${steps[currentStep].color} text-white flex items-center justify-center shadow-xl transition-all duration-500 scale-100`}>
          <Icon className="h-10 w-10 animate-pulse" />
        </div>

        {/* Text */}
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-black text-slate-800 leading-tight transition-all duration-300">
            {steps[currentStep].title}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            {steps[currentStep].description}
          </p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="max-w-sm w-full mx-auto flex flex-col gap-8">
        {/* Dot indicators */}
        <div className="flex justify-center gap-2.5">
          {steps.map((_, index) => (
            <span 
              key={index} 
              className={`h-2.5 rounded-full transition-all duration-300 ${
                index === currentStep ? 'w-8 bg-teal-600' : 'w-2.5 bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNext}
          className="flex items-center justify-center gap-2 w-full h-14 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold rounded-2xl shadow-lg shadow-teal-600/10 active:translate-y-0.5 transition-all duration-200"
        >
          <span>{currentStep === steps.length - 1 ? 'Empezar ahora' : 'Siguiente paso'}</span>
          {currentStep === steps.length - 1 ? (
            <Check className="h-5 w-5" />
          ) : (
            <ArrowRight className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
