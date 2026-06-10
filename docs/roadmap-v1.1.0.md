# Plan de Ruta (Roadmap) — Paté Salud Familiar v1.1.0

Este documento proyecta las fases de estabilización inmediata (parches v1.0.x) y la planeación de la próxima versión mayor de funcionalidades (`v1.1.0`) basadas en las necesidades del núcleo familiar.

---

## 🛠️ Correcciones y Estabilización Inmediata (Parches v1.0.x)

Orientado exclusivamente a la solución de fallos técnicos sin agregar nuevas prestaciones:

### 1. Bugs Críticos
- [ ] Corrección de desbordamientos de memoria al procesar listas extensas de tomas diarias de medicamentos.
- [ ] Solución de fallos de re-autenticación cuando caduca el token OAuth sin intervención de la UI.

### 2. Errores de Sincronización
- [ ] Optimización de la lógica Last-Write-Wins (LWW) en conexiones móviles con alta latencia.
- [ ] Manejo explícito de conflictos cuando el usuario modifica celdas directamente en Google Sheets fuera de la app.

### 3. Errores de Permisos de Google
- [ ] Ajuste y refinación del flujo de solicitud incremental de scopes en navegadores iOS (Safari).
- [ ] Detección mejorada de carpetas eliminadas en Google Drive y auto-regeneración silenciosa de la carpeta de adjuntos clínicos.

### 4. Errores Visuales y UI/UX
- [ ] Corrección de scroll en pantallas de bloqueo por inactividad en dispositivos móviles pequeños.
- [ ] Optimización de layouts CSS para el timeline diario de tomas farmacológicas en modo oscuro.

### 5. Problemas de Datos
- [ ] Validación estricta contra inyección de caracteres especiales o saltos de línea en inputs de texto libre de diagnósticos clínicos.

---

## 🚀 Mejoras Candidatas para la Versión v1.1.0

Desarrollo planificado de nuevas capacidades funcionales prioritarias:

### 1. Notificaciones Push PWA Reales
- Implementar notificaciones Web Push nativas para recordar tomas de medicamentos e importaciones de citas de Gmail directamente al dispositivo móvil, eliminando la dependencia exclusiva de Google Calendar.

### 2. Filtros Avanzados de Citas
- Agregar filtros interactivos por Miembro Familiar, Rango de Fechas, Tipo de Especialidad Médica y Estado de la Cita (Pasada, Próxima, Pendiente).

### 3. UX Optimizada para Medicamentos
- Rediseño de la pantalla de creación de tratamientos:
  * Selección gráfica de dosis (gotas, pastillas, ml).
  * Recordatorios preconfigurados (desayuno, almuerzo, cena, dormir).

### 4. Vista de Calendario Interna
- Incorporar una vista mensual/semanal tipo grid directamente en la aplicación (sustituyendo o complementando el Dashboard lineal) para visualizar de forma integral los eventos de salud de todo el grupo familiar.

### 5. Exportación de Expediente en PDF
- Generación de un reporte PDF compilado del historial de citas, vacunas, diagnósticos clínicos y medicamentos activos de cualquier miembro, apto para enviar por WhatsApp o correo a un médico.

### 6. Reportes y Estadísticas por Miembro
- Gráficas de adherencia a tratamientos farmacéuticos (tomas cumplidas vs omitidas) y frecuencias de consultas médicas.

### 7. Mejoras de Inteligencia en Importador de Gmail
- Extensión del parseador para identificar formatos de correos de más prestadoras de salud de la región.
- Detección inteligente de cancelaciones de citas desde correos Gmail para removerlas automáticamente.

### 8. Compartición de Cuenta y Multiusuario Avanzado
- Permitir que múltiples cuentas de Google (ej: ambos padres) sincronicen de forma segura con la misma hoja de cálculo operacional compartida de Drive (`SaludFamiliar_OperationalDB`), estableciendo un canal colaborativo en tiempo real.
