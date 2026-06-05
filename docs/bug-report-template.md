# Plantilla de Reporte de Errores (Bug Report) — Paté Salud Familiar

Usa esta plantilla para documentar fallos técnicos identificados durante las pruebas del MVP. Por favor, sé lo más descriptivo posible para facilitar la reproducción del problema.

---

## 👤 Información del Informante
* **Usuario Afectado (Nombre):** 
* **Correo Electrónico (Google Account):** 
* **Fecha y Hora del Suceso:** YYYY-MM-DD HH:MM (Zona Horaria)

## 💻 Entorno Técnico
* **Dispositivo:** (ej: iPhone 15 Pro, Samsung Galaxy S23, Laptop Dell)
* **Sistema Operativo:** (ej: iOS 17.4, Android 14, Windows 11, macOS Sonoma)
* **Navegador y Versión:** (ej: Safari Móvil, Chrome v124, Firefox, PWA Standalone)
* **Ruta/Pantalla donde ocurrió:** (ej: `/dashboard`, `/members/[id]/edit`, `/appointments/import`)

## 📝 Detalles del Defecto

### Descripción del Error
[Describe detalladamente qué sucedió y el comportamiento anómalo de la app]

### Pasos para Reproducir
1. [Paso 1: ej. Iniciar sesión con Google]
2. [Paso 2: ej. Ir a Ajustes y presionar Sincronizar]
3. [Paso 3: ej. Crear un miembro familiar nuevo...]

### Resultado Esperado
[Describe cuál debería ser el comportamiento correcto de la aplicación]

### Resultado Obtenido
[Describe qué ocurrió en su lugar (ej. la pantalla se quedó en blanco, no guardó el tipo de documento, etc.)]

---

## 📊 Diagnóstico y Severidad

### Reporte de Integridad (Opcional, recomendado)
[Copia y pega el diagnóstico de error generado en **Configuración > Diagnóstico de Datos** o indica si la app está bloqueada]

### Severidad
Marca con una `[x]` el nivel correspondiente:
- [ ] **Crítica:** Pérdida de datos, bloqueo total de la app sin posibilidad de usarla, crash al iniciar.
- [ ] **Alta:** Falla de sincronización remota con Sheets, los datos no se guardan o fallan los permisos Google OAuth.
- [ ] **Media:** Fallas estéticas o de visualización menores, alertas que no cargan de inmediato, problemas menores de experiencia de usuario.
- [ ] **Baja:** Errores ortográficos, colores inconsistentes, animaciones lentas.

---

## 📸 Capturas de Pantalla / Evidencia
[Adjunta aquí capturas de pantalla, grabaciones de pantalla, o el log de la consola del navegador si dispones de él]
