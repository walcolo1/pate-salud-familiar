# Manual de Usuario — Paté Salud Familiar (MVP)

Bienvenido a **Paté Salud Familiar**, tu aplicación personal y privada para la gestión integrada de la salud familiar. Toda la información de tu salud se almacena de forma segura en tu propia cuenta de Google, sin servidores intermediarios.

---

## Índice
1. [Cómo Iniciar Sesión](#1-cómo-iniciar-sesión)
2. [Cómo Configurar la Conexión con Google](#2-cómo-configurar-la-conexión-con-google)
3. [Cómo Crear Miembros de la Familia](#3-cómo-crear-miembros-de-la-familia)
4. [Cómo Registrar Documentos de Identidad](#4-cómo-registrar-documentos-de-identidad)
5. [Cómo Inactivar Miembros](#5-cómo-inactivar-miembros)
6. [Cómo Crear y Gestionar Citas](#6-cómo-crear-y-gestionar-citas)
7. [Cómo Importar Citas desde Gmail](#7-cómo-importar-citas-desde-gmail)
8. [Cómo Registrar Órdenes Médicas y Autorizaciones](#8-cómo-registrar-órdenes-médicas-y-autorizaciones)
9. [Cómo Registrar Medicamentos Recetados](#9-cómo-registrar-medicamentos-recetados)
10. [Cómo Revisar Recordatorios Diarios](#10-cómo-revisar-recordatorios-diarios)
11. [Cómo Solucionar Problemas de Sincronización](#11-cómo-solucionar-problemas-de-sincronización)

---

## 1. Cómo Iniciar Sesión

1. Abre la aplicación en tu navegador o instálala como PWA en tu pantalla de inicio.
2. En la pantalla de bienvenida, haz clic en el botón **"Iniciar Sesión con Google"**.
3. Se abrirá la ventana oficial de Google OAuth. Selecciona tu cuenta de Google.
4. Concede los permisos necesarios para que la aplicación acceda a Google Drive, Google Sheets, Google Calendar y Gmail (solo lectura para citas).
5. Tras confirmar, serás redirigido al panel de control (Dashboard) de la aplicación.

---

## 2. Cómo Configurar la Conexión con Google

Paté Salud Familiar utiliza una hoja de cálculo en tu Google Drive llamada `SaludFamiliar_OperationalDB` para almacenar todos tus datos:

1. **Onboarding Automático**: Si es tu primera vez, la aplicación creará automáticamente la base de datos en tu Google Drive y una carpeta para tus archivos clínicos.
2. **Uso de Hoja Existente**: Si ya habías configurado la app con esa misma cuenta de Google, detectará automáticamente la hoja existente para que continúes usando tus datos previos sin perder nada.
3. Puedes ver el enlace a tu hoja operacional y su identificador único dentro de **Configuración > Estado de Sincronización**.

---

## 3. Cómo Crear Miembros de la Familia

Cada persona en tu hogar debe tener su propio perfil:

1. Dirígete a la sección **"Miembros"** en el menú de navegación.
2. Haz clic en **"Agregar Miembro"**.
3. Completa los datos requeridos:
   - Nombre completo.
   - Fecha de nacimiento.
   - Parentesco o relación (ej. Hijo, Cónyuge, Madre).
   - Tipo de documento de identidad y su respectivo número.
   - Grupo sanguíneo.
4. Haz clic en **"Guardar"**. Los datos se registrarán en tu memoria local y se programarán para subirse a Google Sheets.

---

## 4. Cómo Registrar Documentos de Identidad

Para asegurar la consistencia en los registros clínicos y trámites ante prestadores de salud, cada miembro debe tener su documento de identidad registrado:

1. Al crear o editar un perfil de miembro, localiza la sección **"Documento de Identidad"**.
2. Selecciona el **Tipo de Documento** (por ejemplo: CC - Cédula de Ciudadanía, TI - Tarjeta de Identidad, Registro Civil, PAS - Pasaporte, etc.).
3. Escribe el **Número de Documento**.
4. Guarda los cambios. Si necesitas actualizarlo más adelante, haz clic en **"Editar"** en la tarjeta del miembro.

---

## 5. Cómo Inactivar Miembros

Si algún familiar ya no requiere seguimiento activo, puedes inactivar su perfil para limpiar tus paneles de control sin borrar su historial médico:

1. Ve a **"Miembros"** y selecciona el familiar que deseas modificar.
2. Haz clic en **"Editar"** en su perfil.
3. Cambia el estado de **"Activo"** a **"Inactivo"**.
4. Haz clic en **"Guardar"**.
5. Los miembros inactivos no aparecerán en las listas desplegables rápidas (como al crear una nueva cita o recetar un medicamento), pero sus datos y citas históricas se conservarán en tu hoja de cálculo.

---

## 6. Cómo Crear y Gestionar Citas

1. Dirígete a la sección **"Citas"** del menú.
2. Haz clic en **"Nueva Cita"**.
3. Selecciona el miembro de la familia al que pertenece la cita.
4. Introduce la fecha, hora, especialidad, médico e institución de salud.
5. *(Opcional)* Si la cita requiere una orden médica aprobada, puedes asociarla en el campo correspondiente.
6. Haz clic en **"Agendar Cita"**.
7. La aplicación creará automáticamente un evento en tu **Google Calendar** para que recibas notificaciones estándar del calendario.

---

## 7. Cómo Importar Citas desde Gmail

La app puede escanear tu Gmail para encontrar confirmaciones de citas de tus prestadores de salud configurados:

1. Configura tus remitentes habituales en **Configuración > Filtros de Gmail**.
2. En el Dashboard, verás una sección llamada **"Citas Importadas de Gmail (Pendientes de Revisión)"**.
3. Si la app detecta un correo de cita, aparecerá como una tarjeta indicando los datos extraídos (fecha, hora, institución).
4. Haz clic en **"Revisar"** o **"Aprobar"**.
5. Asigna el miembro de la familia correcto, edita cualquier campo si es necesario y confirma.
6. Si el correo no correspondía a una cita real o no te interesa guardarlo, haz clic en **"Descartar"**.

---

## 8. Cómo Registrar Órdenes Médicas y Autorizaciones

Muchas citas o procedimientos requieren un trámite de autorización previo ante la aseguradora:

1. Ve a la sección **"Órdenes Médicas"** (u Órdenes en el menú).
2. Haz clic en **"Registrar Orden"**.
3. Completa los datos: miembro, médico emisor, descripción del procedimiento/examen y si requiere autorización.
4. Toma una foto o sube un PDF de la orden física. Este archivo se guardará en tu carpeta privada de **Google Drive**.
5. Define el estado inicial como **"Pendiente de Autorización"** (`PENDING_AUTHORIZATION`).
6. Una vez que tu aseguradora envíe la aprobación, edita la orden, cambia el estado a **"Autorizada"** (`AUTHORIZED`) y sube el soporte de autorización.
7. Ahora podrás agendar la cita vinculada a esta orden.

---

## 9. Cómo Registrar Medicamentos Recetados

Para llevar un control estricto del tratamiento farmacológico:

1. Ve a la sección **"Medicamentos"**.
2. Haz clic en **"Registrar Tratamiento"**.
3. Elige al familiar y completa los datos del medicamento: nombre comercial/genérico, dosis (ej. 1 tableta), frecuencia (ej. cada 8 horas) y fecha de inicio.
4. Indica la duración del tratamiento. Si configuras un tratamiento superior a 180 días, la aplicación te mostrará una advertencia para evitar sobrecargar tu calendario de eventos.
5. Al guardar, el sistema generará automáticamente las tomas programadas para cada día.
6. Si deseas sincronizarlas con Google Calendar, puedes presionar el botón de integración (se te advertirá si se generarán más de 20 eventos para evitar saturar tu agenda).

---

## 10. Cómo Revisar Recordatorios Diarios

La aplicación agrupa todo lo que debes hacer hoy en la sección **"Recordatorios"**:

1. Haz clic en **"Recordatorios"** en el menú principal o revisa la sección de tareas en el **Dashboard**.
2. Verás dos pestañas o listas principales:
   - **Citas Médicas**: Las citas programadas para el día de hoy.
   - **Tomas de Medicamentos**: El listado de medicamentos con la hora exacta a la que deben ser consumidos.
3. Para las tomas de medicamentos, puedes interactuar directamente usando los botones rápidos:
   - **Tomado**: Marca la dosis como completada en tu hoja operacional.
   - **Omitido**: Registra que por alguna razón no se consumió la dosis en la fecha establecida.
4. El Dashboard también te alertará si tienes tomas vencidas de horas anteriores que no fueron marcadas.

---

## 11. Cómo Solucionar Problemas de Sincronización

Dado que la aplicación almacena los datos de forma local y luego los envía a Google Sheets, ocasionalmente pueden ocurrir desalineaciones si usas múltiples dispositivos o pierdes la conexión a internet:

### Síntoma: Aparece un círculo rojo o indica "Cambios pendientes de sincronización"
- **Causa**: Tienes datos registrados localmente que no se han subido a Google.
- **Solución**: Asegúrate de tener conexión estable a internet y haz clic en el botón de **"Sincronizar Ahora"** en la barra superior o en la sección de configuración.

### Síntoma: Datos modificados en otro dispositivo no aparecen
- **Solución**: Ve a **Configuración**, localiza la sección de "Diagnóstico de datos" y presiona **"Forzar Sincronización Completa (Pull)"** para traer los datos más recientes desde Google Sheets.

### Síntoma: Columnas faltantes o errores de lectura en Google Sheets
- **Causa**: Alguien modificó manualmente los nombres de las columnas o eliminó una pestaña en la hoja de cálculo.
- **Solución**: Ve a **Configuración > Diagnóstico de datos**, y haz clic en **"Reparar Base de Datos Google-Native"** y luego en **"Reparar Encabezados de Sheets"**. Esto agregará las columnas faltantes respetando la información que ya tenías registrada.

### Síntoma: Los documentos de identidad aparecen vacíos tras un pull
- **Solución**: La aplicación cuenta con un merge seguro que protege tus campos locales de ser sobrescritos por valores vacíos del servidor. Ejecuta la acción **"Reparar documentos de miembros"** en Configuración para forzar una consolidación segura de todos los campos de identidad.
