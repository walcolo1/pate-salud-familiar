# Plan de Monitoreo Post-Lanzamiento — Paté Salud Familiar v1.0.0-mvp

Este documento define la estrategia y el checklist diario de revisión operativa del Producto Mínimo Viable (MVP) tras su despliegue y cierre oficial.

---

## 📋 Datos del Lanzamiento
* **Versión Actual:** `v1.0.0-mvp`
* **Fecha de Cierre:** 4 de junio de 2026
* **URL de Producción:** [https://pate-salud-familiar.vercel.app](https://pate-salud-familiar-gmyyb25yx-walcolo1s-projects.vercel.app)

---

## 🔍 Checklist Diario de Revisión Operativa

El equipo técnico debe realizar las siguientes inspecciones periódicas para garantizar la estabilidad de las pruebas con usuarios:

### 1. En Vercel (Consola del Proyecto)
- [ ] **Métricas Web (Web Vitals):** Monitorear la velocidad de carga de la app (LCP, CLS, FID) en dispositivos móviles y de escritorio.
- [ ] **Logs en Tiempo Real (Runtime Logs):** Revisar fallos 5xx en serverless functions de la consola de Vercel.
- [ ] **Rendimiento e Inactividad:** Confirmar que no hay picos inusuales de uso de ancho de banda o de solicitudes fallidas.

### 2. En Google Cloud Console (Consola de Desarrolladores de Google)
- [ ] **Métricas de APIs:** Verificar las tasas de llamadas e índices de errores de:
  * Google Drive API
  * Google Sheets API
  * Google Calendar API
  * Gmail API
- [ ] **Pantalla de Consentimiento OAuth (OAuth Consent Screen):** Controlar que el límite de usuarios de prueba no haya sido alcanzado (el límite predeterminado para apps no verificadas/en desarrollo es de 100 usuarios independientes).
- [ ] **Cuotas y Límites (Quotas):** Comprobar que no hay bloqueos por haber excedido las cuotas diarias gratuitas de lectura/escritura de APIs de Google.

### 3. En Google Sheets (Hoja del Usuario)
- [ ] **Consistencia de la Base de Datos:** Validar que la hoja `SaludFamiliar_OperationalDB` en el Drive de los usuarios mantenga las pestañas estructurales:
  * `Miembros` (con columnas de identificación: `documentType` y `documentNumber`).
  * `Citas`
  * `Documentos`
  * `OrdenesMedicas`
  * `Medicamentos`
  * `TomasMedicamentos`
- [ ] **Prevención de Bloqueos:** Comprobar que no existan celdas corruptas o ediciones manuales de usuarios que quiebren los tipos de datos requeridos por la app.

### 4. En Google Calendar y Gmail
- [ ] **Integración de Calendario:** Confirmar de forma aleatoria que los eventos creados desde la app persistan en el calendario principal del usuario y que las modificaciones locales se reflejen en la nube.
- [ ] **Lectura Gmail Read-Only:** Validar que el escaneo automatizado no produzca falsos positivos ni bloqueos de sesión por cuotas de búsqueda agotadas en la API.

---

## 🛠️ Cómo Reportar Errores

Cuando ocurra una anomalía en producción, el usuario o monitor del sistema debe:
1. Ir a **Configuración > Diagnóstico de Datos** en la aplicación.
2. Ejecutar la **Validación de Integridad**.
3. Tomar una captura de pantalla del listado de errores y advertencias detectadas.
4. Llenar la plantilla oficial de reporte de errores (`docs/bug-report-template.md`).
5. Adjuntar los archivos o bitácora de restauración JSON en caso de problemas severos de persistencia.
