# Cierre Técnico de Versión Estable — Paté Salud Familiar MVP v1.0.0-mvp

Este documento formaliza el cierre técnico del Producto Mínimo Viable (MVP) en su versión estable `v1.0.0-mvp`, listo para el inicio de pruebas de campo con usuarios reales.

---

## 📅 Información de Cierre
* **Fecha de Cierre:** 4 de junio de 2026
* **URL Oficial de Producción:** [https://pate-salud-familiar.vercel.app](https://pate-salud-familiar-gmyyb25yx-walcolo1s-projects.vercel.app)
* **Estado de Compilación:** Exitoso (Next.js & TypeScript, 0 errores, 22 rutas estáticas y dinámicas)
* **Arquitectura:** Serverless Google-native (almacenamiento en el Drive y Sheets del usuario)

---

## 📦 Módulos Incluidos en la v1.0.0-mvp

1. **Gestión de Miembros Familiares:** Creación de perfiles, parentescos, datos biológicos y campos protegidos de identificación de identidad (`documentType` y `documentNumber`).
2. **Citas Médicas:** Registro manual de citas y vinculación opcional con órdenes médicas autorizadas.
3. **Integración con Google Calendar:** Creación, edición y eliminación de eventos en el calendario principal del usuario vinculados a citas médicas de la app.
4. **Repositorio de Documentos Clínicos:** Carga y descarga de imágenes y PDFs digitalizados almacenados en una carpeta privada del Drive del usuario.
5. **Importador de Citas desde Gmail:** Escaneo pasivo de remitentes configurados, parseo de información relevante y bandeja de candidatos pendientes de revisión para aprobación/descarte en la app.
6. **Órdenes Médicas y Autorizaciones:** Ciclo completo de órdenes (pendientes de autorización, autorizadas, citas agendadas), control de números de aprobación y subida de soporte.
7. **Medicamentos y recordatorios:** Registro de tratamientos y generación automática de cronogramas de tomas. Timeline diario para marcar tomas (Tomada, Omitida, Omitida pasada).
8. **Seguridad y Bloqueo de Sesión:** Temporizador de inactividad configurable y bloqueo lógico nocturno para control de descanso del núcleo familiar.
9. **Diagnóstico de Datos e Integridad:** Resumen de contadores de registros en memoria, logs de sincronización y validación cruzada con `validateDataIntegrity()`.
10. **Respaldo JSON Manual:** Descarga y restauración de archivos de respaldo JSON con ventana de confirmación y resumen cuantitativo de datos.

---

## 🔐 Permisos y Scopes de Google Utilizados
* **`https://www.googleapis.com/auth/drive.file`**: Lectura y escritura de la hoja operacional y subida de PDFs/imágenes clínicos.
* **`https://www.googleapis.com/auth/spreadsheets`**: Modificación de las tablas de datos (`Miembros`, `Citas`, `Documentos`, `OrdenesMedicas`, `Medicamentos`, `TomasMedicamentos`).
* **`https://www.googleapis.com/auth/calendar`**: Creación de eventos de citas médicas y alarmas de tomas farmacológicas en Google Calendar.
* **`https://www.googleapis.com/auth/gmail.readonly`**: Lectura de correos de remitentes autorizados para la detección y autoprocesamiento de citas médicas.

---

## ⚠️ Limitaciones Conocidas

1. **Dependencia de Conexión a Internet:** Aunque la app permite el registro local de datos cuando está offline, se requiere conectividad para sincronizar con la nube de Google.
2. **Formato de Citas en Gmail:** El parser de correos está optimizado para formatos específicos de remitentes de salud. Correos con redacción atípica requerirán ajuste manual de campos en la app.
3. **Límite de Eventos de Medicamentos:** Se restringe la creación automática de recordatorios de medicamentos en Calendar a un máximo de 20 eventos por tratamiento para prevenir spam.
4. **Tamaño de Archivos:** Cargas de documentos digitalizados mayores a 15MB pueden experimentar fallas o retrasos en redes móviles inestables.

---

## 🧪 Instrucciones para Usuarios de Prueba

1. **Acceso Inicial:** Abre el enlace de producción en Chrome o Safari (móvil o escritorio) e instálalo como PWA (Agregar a pantalla de inicio).
2. **Autenticación:** Inicia sesión con tu cuenta de Google. Concede los 4 permisos solicitados para habilitar la persistencia nativa.
3. **Configuración de Gmail:** En *Configuración > Correos para programación*, añade la dirección del remitente del cual recibes notificaciones de citas de salud (ej: `citas@clinicasalud.com`).
4. **Primer Familiar:** Crea un perfil de miembro familiar. Registra su número y tipo de documento.
5. **Flujo Cita / Calendario:** Registra una cita médica y comprueba que se agregue en tu aplicación de Google Calendar.
6. **Medicamentos:** Añade una prescripción a 5 días (cada 8 horas) y marca las tomas de hoy en el Dashboard.
7. **Verificación de Seguridad:** Configura el bloqueo por inactividad a 1 minuto en Configuración y deja la app inactiva para validar el bloqueo de pantalla.

---

## ✅ Checklist de Validación Rápida (Sanity Test)
- [ ] Login con Google exitoso.
- [ ] Creación de hoja `SaludFamiliar_OperationalDB` automática en Drive.
- [ ] Datos de miembros (`documentNumber`) persisten tras pull/push y recarga de página.
- [ ] Citas manuales se registran en Sheets y Calendar de forma inmediata.
- [ ] Alertas de Dashboard muestran tomas pendientes y cambios pendientes de sincronizar.
- [ ] Validación de Integridad de Datos devuelve estado "Correcto" en condiciones saludables.
- [ ] Backup JSON se exporta e importa con ventana de resumen confirmable.
- [ ] Overlay de bloqueo de sesión solicita contraseña/acción y no destruye datos locales.

---

## 🛠️ Plan de Soporte para Errores

* **Reporte de Fallas:** Los usuarios de prueba pueden notificar cualquier error a través del correo de soporte o abriendo un Issue en el repositorio de código.
* **Diagnósticos Rápidos:** En caso de fallas de visualización, solicita al usuario que vaya a **Configuración > Diagnóstico de datos**, ejecute la **Validación de Integridad**, y envíe una captura de pantalla del listado de errores/advertencias.
* **Recuperación Ante Desastres:** Si la base operacional en Sheets se corrompe por edición manual, el usuario puede presionar **"Reparar base Google-native"** y **"Reparar documentos de miembros"** en Configuración para restaurar la consistencia estructural.
