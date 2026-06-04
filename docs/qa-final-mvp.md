# Plan y Checklist de QA Integral — MVP Paté Salud Familiar

Este documento contiene el plan de pruebas estructurado para validar de forma integral el correcto funcionamiento de Paté Salud Familiar antes de su liberación a usuarios de prueba.

---

## 1. Login con Google
- [ ] **Inicio de Sesión Exitoso**: Probar el botón de inicio de sesión con Google. Verificar que redirija al flujo de consentimiento OAuth.
- [ ] **Cancelación de Login**: Verificar que si el usuario cancela o cierra el modal de Google OAuth, la aplicación retorne al estado inicial con gracia y sin colapsar.
- [ ] **Manejo de Errores**: Simular fallas de conexión o credenciales inválidas y comprobar que se muestre un aviso amigable en pantalla.
- [ ] **Persistencia de Sesión**: Recargar la página (F5) tras iniciar sesión y verificar que el usuario continúe autenticado.

## 2. Onboarding Google-Native
- [ ] **Detección de Hoja Operacional Existente**: Iniciar sesión por primera vez con una cuenta que ya tiene la hoja `SaludFamiliar_OperationalDB` en Drive. Confirmar que la app la detecte y la vincule de forma automática sin sobrescribir datos.
- [ ] **Creación de Nueva Hoja**: Iniciar sesión con una cuenta nueva. Verificar que se cree de forma transparente la hoja de cálculo en Google Sheets con las pestañas requeridas (`Miembros`, `Citas`, `Documentos`, `OrdenesMedicas`, `Medicamentos`, `TomasMedicamentos`).
- [ ] **Carga Inicial de Datos**: Confirmar que tras crearse la hoja, el Dashboard inicie vacío pero completamente operativo.

## 3. Gestión de Miembros Familiares
- [ ] **Crear Miembro**: Registrar un nuevo familiar completando nombre, fecha de nacimiento, grupo sanguíneo, parentesco, tipo y número de documento.
- [ ] **Validación de Campos Obligatorios**: Intentar guardar un miembro sin nombre ni documento, y verificar que el formulario prevenga el envío y resalte los errores.
- [ ] **Editar Miembro**: Modificar datos de un miembro (por ejemplo, cambiar el parentesco) y corroborar que los cambios se reflejen tanto a nivel local como al sincronizarse en Google Sheets.

## 4. Documentos de Identidad de Miembros
- [ ] **Persistencia de Documentos**: Confirmar que los campos `documentType` y `documentNumber` se guarden correctamente al crear y editar un miembro.
- [ ] **Merge Seguro en Sincronización**:
  - Probar modificando el documento de identidad localmente y simulando un pull donde el remoto esté vacío: el valor local no debe perderse.
  - Probar agregando un documento de identidad directo en la hoja de Google Sheets (vacío localmente) y verificar que al hacer pull en la app aparezca el documento.

## 5. Miembros Activos e Inactivos
- [ ] **Inactivar Miembro**: Entrar al perfil de un miembro activo, cambiar su estado a "Inactivo" y guardar.
- [ ] **Ocultar/Filtrar Inactivos**: Comprobar que en las listas rápidas de selección de pacientes (ej. al agendar citas) el miembro inactivo no figure o aparezca con una marca especial de inactividad.
- [ ] **Reactivar Miembro**: Volver a cambiar el estado de un miembro inactivo a "Activo" y confirmar que vuelva a participar en todas las vistas de la app.

## 6. Gestión de Documentos Clínicos
- [ ] **Subir Documento (Drive)**: Cargar un archivo (foto o PDF) para un miembro. Verificar que se suba a la carpeta correspondiente en el Drive del usuario.
- [ ] **Metadatos en Sheets**: Confirmar que al subir el archivo, se agregue una fila en la pestaña `Documentos` de Sheets conteniendo el `documentId` de Drive, `memberId`, nombre del archivo, categoría y fecha.
- [ ] **Descargar/Ver Documento**: Hacer clic sobre un documento clínico listado en la app y verificar que se abra/descargue el archivo original desde Google Drive.

## 7. Citas Manuales
- [ ] **Agendar Cita**: Crear una cita manualmente seleccionando el miembro, fecha, hora, especialidad, médico, institución y notas.
- [ ] **Vincular Orden Médica**: Al crear la cita, verificar que se pueda asociar opcionalmente una orden médica previamente autorizada.
- [ ] **Edición/Cancelación de Citas**: Modificar los datos de la cita o cambiar su estado a "Cancelada". Comprobar la actualización en memoria y su posterior sincronización en Sheets.

## 8. Citas Importadas desde Gmail
- [ ] **Bandeja de Pendientes**: Simular la detección de un correo de cita médica en la bandeja de Gmail. Verificar que aparezca en la sección de "Citas Importadas Pendientes de Revisión" del Dashboard.
- [ ] **Aprobar Cita**: Seleccionar una cita candidata, asignarle el miembro de la familia correspondiente, verificar o corregir los datos autodetectados y confirmar. Comprobar que se convierta en una cita real de la app.
- [ ] **Descartar Cita**: Hacer clic en descartar sobre un correo candidato y confirmar que desaparezca de la lista de pendientes de revisión.

## 9. Sincronización con Google Calendar
- [ ] **Creación Automática de Eventos**: Crear una cita médica en la aplicación y validar que se genere de forma automática el evento correspondiente en el Google Calendar principal del usuario.
- [ ] **Enlace Bidireccional**: Comprobar que el evento de Calendar incluya en su descripción el ID único de la cita en Paté Salud Familiar.
- [ ] **Actualización y Eliminación**: Cambiar el horario o eliminar una cita en la app, y verificar que el evento de Google Calendar se actualice o elimine según corresponda.

## 10. Persistencia en Google Sheets (Hoja Operacional)
- [ ] **Consistencia de Datos**: Validar que cada acción realizada en la app (crear miembro, registrar cita, guardar documento, etc.) actualice adecuadamente las pestañas de la hoja de cálculo.
- [ ] **Reparación de Columnas/Headers**: Borrar manualmente alguna columna secundaria en Google Sheets (ej. `documentNumber`) y ejecutar la herramienta de "Reparación de Encabezados" desde la sección de configuración. Confirmar que la columna sea recreada sin dañar el resto de datos.

## 11. Órdenes Médicas y Autorizaciones
- [ ] **Flujo de Creación**: Registrar una orden médica para un familiar. Subir su documento digitalizado de soporte.
- [ ] **Estados de Autorización**: Validar la transición de estados de la orden médica:
  - Cambiar de `PENDING_AUTHORIZATION` a `AUTHORIZED` o `DENIED`.
  - Confirmar que tras ser `AUTHORIZED`, pase a `APPOINTMENT_PENDING` y finalmente a `APPOINTMENT_SCHEDULED` al asociarle una cita.
- [ ] **Visibilidad de Estados**: Validar que el Dashboard resalte aquellas órdenes que requieren autorización urgente y lleven varios días en pendiente.

## 12. Gestión de Medicamentos Recetados
- [ ] **Registrar Tratamiento**: Crear una prescripción con nombre del medicamento, dosis, frecuencia (cada X horas) y duración del tratamiento.
- [ ] **Advertencia de Duración Prolongada**: Introducir una duración mayor a 180 días y verificar que el sistema muestre un mensaje de advertencia consultando si está seguro de programar recordatorios por tanto tiempo.
- [ ] **Detalle de Tomas**: Verificar que al guardar el medicamento se autogeneren las tomas en la sección correspondiente con sus respectivos horarios.

## 13. Recordatorios y Tomas de Medicamentos
- [ ] **Sección Global `/reminders`**: Validar que los recordatorios de tomas de medicamentos de hoy aparezcan en la vista de recordatorios generales junto a las citas.
- [ ] **Acciones Rápidas de Toma**: Probar marcando una toma como "Tomada" (`TAKEN`) o "Omitida" (`SKIPPED`). Verificar que el estado cambie visualmente de inmediato y se actualice en la hoja operacional.
- [ ] **Google Calendar para Medicamentos**:
  - Al programar recordatorios de medicamentos en Calendar, verificar que si el número de tomas supera las 20, se muestre una advertencia modal de confirmación antes de saturar el calendario.

## 14. Bloqueo por Inactividad
- [ ] **Temporizador de Inactividad**: Activar el auto-bloqueo y configurarlo a 1 minuto para pruebas. Dejar la aplicación sin interacción. Verificar que al cabo del minuto se muestre el overlay de bloqueo de sesión.
- [ ] **Reinicio del Temporizador**: Realizar interacciones frecuentes (clicks, movimientos de mouse, presiones de teclas) y confirmar que la aplicación no se bloquee.
- [ ] **Desbloqueo Seguro**: Probar introduciendo el PIN o contraseña de desbloqueo (o pulsando "Continuar" si es desbloqueo lógico simple) y validar que se recupere la vista exacta donde estaba.

## 15. Bloqueo Lógico Nocturno
- [ ] **Configuración de Rango Horario**: Configurar la franja horaria nocturna (ej. de 23:00 a 06:00).
- [ ] **Activación Automática**: Simular u observar la app dentro de la ventana de bloqueo nocturno. Confirmar que aparezca la pantalla de bloqueo indicando que está activo el modo descanso familiar.
- [ ] **Fuerza del Bloqueo**: Intentar navegar por url a `/dashboard` o `/members` estando en la ventana de bloqueo nocturno y comprobar que la app fuerce la redirección/bloqueo de vuelta.

## 16. Sincronización Multi-dispositivo
- [ ] **Sincronización en Dispositivo A**: Modificar el nombre de un familiar en el teléfono celular y forzar push.
- [ ] **Actualización en Dispositivo B**: Abrir la aplicación en la computadora personal. Realizar un pull y verificar que aparezca el nombre actualizado al instante.
- [ ] **Evitar Sobrescrituras Vacías**: Asegurar que si un dispositivo inicia sesión y tiene almacenamiento local limpio (o datos desactualizados), no empuje datos vacíos sobre la hoja operacional remota poblada.

## 17. Desempeño y Respuestas Offline
- [ ] **Modo Offline**: Desconectar el internet del dispositivo. Intentar registrar una cita. Validar que la app guarde los cambios localmente indicando "Cambios pendientes de sincronización".
- [ ] **Reconexión Automática**: Volver a conectar el internet. Presionar sincronizar y comprobar que el cambio pendiente se suba a Google Sheets exitosamente.
