/**
 * Esquema de la hoja del titular — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/esquemaHoja.ts
 * Genera:  node scripts/generar-esquema-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

var VERSION_ESQUEMA = 1;

/** Columnas de cierre, iguales en toda tabla de datos. */
var COLUMNAS_SINCRONIZACION = ['creado_en', 'actualizado_en', 'borrado_en'];

/** Las pestañas, en el orden en que se crean. */
var PESTANAS = [
  {
    nombre: 'CONFIG',
    // Una sola fila: identidad de la familia y versión del esquema.
    encabezados: [
      'familia_id',
      'nombre_familia',
      'email_titular',
      'creada_en',
      'version_esquema',
      'sucesor_email',
    ],
  },
  {
    nombre: 'ACCESO',
    // Única fuente de verdad de autorización. Se relee en cada petición.
    encabezados: [
      'email',
      'rol',
      'pacientes_asignados',
      'paciente_propio',
      'estado',
      'token_hash',
      'token_expira',
      'invitado_por',
      'fecha_alta',
      'ultimo_acceso',
    ],
  },
  {
    nombre: 'PACIENTES',
    // Núcleo común de humanos y mascotas. `tipo` los distingue.
    encabezados: [
      'id',
      'tipo',
      'nombre',
      'relacion',
      'activo',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'PERFIL_HUMANO',
    // Lo propio de una persona. 1:1 con PACIENTES.
    encabezados: [
      'id',
      'paciente_id',
      'documento_tipo',
      'documento_numero',
      'fecha_nacimiento',
      'sexo',
      'tipo_sangre',
      'eps',
      'alergias',
      'condiciones',
      'telefono_emergencia',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'PERFIL_MASCOTA',
    // Lo propio de un animal. 1:1 con PACIENTES.
    encabezados: [
      'id',
      'paciente_id',
      'especie',
      'raza',
      'fecha_nacimiento',
      'sexo',
      'peso_actual_kg',
      'peso_ideal_kg',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'CITAS',
    // Citas médicas y veterinarias, con su enlace al evento de Calendar.
    encabezados: [
      'id',
      'paciente_id',
      'titulo',
      'especialidad',
      'profesional',
      'institucion',
      'fecha',
      'hora',
      'estado',
      'orden_id',
      'evento_calendario_id',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'VACUNAS',
    // Dosis aplicadas, de persona o de animal. El estado NO se guarda: se calcula.
    encabezados: [
      'id',
      'paciente_id',
      'vacuna',
      'dosis_numero',
      'fecha',
      'proxima_dosis',
      'institucion',
      'laboratorio',
      'lote',
      'profesional',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'EXAMENES',
    // Exámenes clínicos solicitados o realizados.
    encabezados: [
      'id',
      'paciente_id',
      'nombre',
      'tipo',
      'fecha',
      'institucion',
      'estado',
      'orden_id',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'EXAMENES_RESULTADOS',
    // Valores de un examen. `verificado_por` es obligatorio antes de leerlos como dato.
    encabezados: [
      'id',
      'examen_id',
      'parametro',
      'valor',
      'unidad',
      'rango_referencia',
      'fuera_de_rango',
      'confianza_extraccion',
      'verificado_por',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'DOCUMENTOS',
    // Referencias a archivos en Drive. Nunca el archivo, siempre su identificador.
    encabezados: [
      'id',
      'paciente_id',
      'titulo',
      'tipo',
      'archivo_drive_id',
      'mime',
      'fecha',
      'origen',
      'entidad_relacionada',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'MEDICAMENTOS',
    // Pautas de medicación. Las tomas concretas viven en DOSIS.
    encabezados: [
      'id',
      'paciente_id',
      'nombre',
      'dosis_valor',
      'dosis_unidad',
      'frecuencia_tipo',
      'frecuencia_valor',
      'momentos',
      'fecha_inicio',
      'fecha_fin',
      'estado',
      'prescrito_por',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'DOSIS',
    // Una fila por toma programada. El identificador es determinista.
    encabezados: [
      'id',
      'medicamento_id',
      'paciente_id',
      'programada_en',
      'estado',
      'tomada_en',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'CONTROLES',
    // Controles de salud periódicos, con su cadencia en meses.
    encabezados: [
      'id',
      'paciente_id',
      'tipo',
      'fecha_programada',
      'fecha_realizada',
      'estado',
      'periodicidad_meses',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'PESOS',
    // Serie de pesajes. Hoy solo de mascotas (D2), pero la tabla no lo impone.
    encabezados: [
      'id',
      'paciente_id',
      'fecha',
      'peso_kg',
      'nota',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'ORDENES',
    // Órdenes médicas y su máquina de estados de autorización.
    encabezados: [
      'id',
      'paciente_id',
      'titulo',
      'tipo',
      'profesional',
      'especialidad',
      'emitida_en',
      'vence_en',
      'requiere_autorizacion',
      'estado',
      'resuelta_en',
      'motivo',
      'notas',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'RECORDATORIOS',
    // Lo que la agenda tiene que recordar. Un solo catálogo de estados.
    encabezados: [
      'id',
      'paciente_id',
      'tipo',
      'titulo',
      'fecha',
      'hora',
      'estado',
      'prioridad',
      'entidad_relacionada',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'SEGUIMIENTOS',
    // Tareas programadas que consume un solo disparador diario, no uno por orden.
    encabezados: [
      'id',
      'orden_id',
      'paciente_id',
      'fecha_programada',
      'plantilla',
      'destinatario',
      'estado',
      'enviado_en',
      'respuesta_detectada_en',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'HISTORIAL',
    // Qué le pasó a un paciente. Distinto de AUDITORIA, que registra quién hizo qué.
    encabezados: [
      'id',
      'paciente_id',
      'tipo_evento',
      'titulo',
      'descripcion',
      'fecha_evento',
      'entidad_relacionada',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'DOMINIOS_AUTORIZADOS',
    // Remitentes de confianza para la automatización de correo. Por familia.
    encabezados: [
      'id',
      'dominio',
      'etiqueta',
      'activo',
      'creado_en',
      'actualizado_en',
      'borrado_en',
    ],
  },
  {
    nombre: 'CATALOGO_VACUNAS',
    // Catálogo de referencia por especie. Se siembra en la instalación (E2).
    encabezados: [
      'id',
      'especie',
      'vacuna',
      'edad_minima_meses',
      'refuerzo_meses',
      'obligatoria',
      'notas',
    ],
  },
  {
    nombre: 'AUDITORIA',
    // Quién hizo qué, cuándo y con qué resultado. Solo se añade; no se edita.
    encabezados: [
      'id',
      'momento',
      'email',
      'accion',
      'entidad',
      'entidad_id',
      'resultado',
      'detalle',
    ],
  },
];

/** Los nombres, en el mismo orden. */
function nombresDePestanas() {
  return PESTANAS.map(function (p) { return p.nombre; });
}

/** La definición de una pestaña, o null si no existe. */
function pestanaPorNombre(nombre) {
  for (var i = 0; i < PESTANAS.length; i++) {
    if (PESTANAS[i].nombre === nombre) return PESTANAS[i];
  }
  return null;
}
