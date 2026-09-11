/**
 * Esquema de la hoja del titular — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/esquemaHoja.ts
 * Genera:  node scripts/generar-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

/**
 * Esquema de la hoja del titular — Paté · Salud Familiar (Bloque E, E1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * UNA SOLA DEFINICIÓN, DOS CONSUMIDORES
 * ─────────────────────────────────────
 * El grupo familiar **es** la hoja de cálculo del titular. Su estructura la
 * necesitan dos programas que no comparten ejecución: el instalador de Apps
 * Script, que crea las pestañas, y la PWA, que las lee y las escribe.
 *
 * Definirla dos veces garantiza que diverjan. Aquí está la única definición;
 * `apps-script/plantilla/Esquema.gs` se **genera** desde este fichero con
 * `scripts/generar-esquema-gs.mjs`, y una prueba falla si el generado se
 * queda atrás. Nadie edita el `.gs` a mano.
 *
 * POR QUÉ 21 PESTAÑAS Y NO 18
 * ───────────────────────────
 * La especificación dice «18 pestañas» en su §7 y enumera **19** en su §2.1.
 * Además, dos cosas que la aplicación ya guarda hoy no tenían dónde aterrizar:
 *
 *   · **PESOS** — la serie de pesajes de una mascota (D2). No es un control de
 *     salud periódico: es una serie temporal con su propia cadencia.
 *   · **HISTORIAL** — los eventos clínicos (`MedicalHistoryEvent` en humanos,
 *     el historial veterinario en mascotas). `AUDITORIA` no sirve: esa registra
 *     quién hizo qué en el sistema, no qué le pasó a un paciente.
 *
 * Sin estas dos, la migración del E10 tendría datos sin destino, que es la
 * forma más silenciosa de perderlos.
 *
 * UNA MASCOTA ES UNA FILA MÁS
 * ───────────────────────────
 * `PACIENTES` es el núcleo común y `tipo` distingue `HUMANO` de `MASCOTA`. Las
 * vacunas, los documentos, el historial y los recordatorios **no** se duplican
 * por especie: llevan `paciente_id` y ya está. Lo único propio de cada especie
 * vive en `PERFIL_HUMANO` y `PERFIL_MASCOTA`, 1:1 con el paciente.
 */
/**
 * Columnas de cierre, iguales en toda tabla de datos.
 *
 * `borrado_en` es lo que hace posible que **nada se borre**: una fila con
 * fecha aquí está de baja, pero sigue ahí. Es la misma decisión que tomó el
 * Bloque D con las mascotas y C2 con un expediente ilegible.
 */
var COLUMNAS_SINCRONIZACION = [
    'creado_en',
    'actualizado_en',
    'borrado_en',
];
/** Añade las columnas de cierre a una lista de campos propios. */
var conSincronizacion = (...campos) => [
    ...campos,
    ...COLUMNAS_SINCRONIZACION,
];
var PESTANAS = [
    {
        nombre: 'CONFIG',
        descripcion: 'Una sola fila: identidad de la familia y versión del esquema.',
        // Sin columnas de sincronización: no es una tabla de datos, es la portada.
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
        descripcion: 'Única fuente de verdad de autorización. Se relee en cada petición.',
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
        descripcion: 'Núcleo común de humanos y mascotas. `tipo` los distingue.',
        encabezados: conSincronizacion('id', 'tipo', 'nombre', 'relacion', 'activo', 'notas'),
    },
    {
        nombre: 'PERFIL_HUMANO',
        descripcion: 'Lo propio de una persona. 1:1 con PACIENTES.',
        encabezados: conSincronizacion('id', 'paciente_id', 'documento_tipo', 'documento_numero', 'fecha_nacimiento', 'sexo', 'tipo_sangre', 'eps', 'alergias', 'condiciones', 'telefono_emergencia'),
    },
    {
        nombre: 'PERFIL_MASCOTA',
        descripcion: 'Lo propio de un animal. 1:1 con PACIENTES.',
        encabezados: conSincronizacion('id', 'paciente_id', 'especie', 'raza', 'fecha_nacimiento', 'sexo', 'peso_actual_kg', 'peso_ideal_kg'),
    },
    {
        nombre: 'CITAS',
        descripcion: 'Citas médicas y veterinarias, con su enlace al evento de Calendar.',
        encabezados: conSincronizacion('id', 'paciente_id', 'titulo', 'especialidad', 'profesional', 'institucion', 'fecha', 'hora', 'estado', 'orden_id', 'evento_calendario_id', 'notas'),
    },
    {
        nombre: 'VACUNAS',
        descripcion: 'Dosis aplicadas, de persona o de animal. El estado NO se guarda: se calcula.',
        encabezados: conSincronizacion('id', 'paciente_id', 'vacuna', 'dosis_numero', 'fecha', 'proxima_dosis', 'institucion', 'laboratorio', 'lote', 'profesional', 'notas'),
    },
    {
        nombre: 'EXAMENES',
        descripcion: 'Exámenes clínicos solicitados o realizados.',
        encabezados: conSincronizacion('id', 'paciente_id', 'nombre', 'tipo', 'fecha', 'institucion', 'estado', 'orden_id', 'notas'),
    },
    {
        nombre: 'EXAMENES_RESULTADOS',
        descripcion: 'Valores de un examen. `verificado_por` es obligatorio antes de leerlos como dato.',
        encabezados: conSincronizacion('id', 'examen_id', 'parametro', 'valor', 'unidad', 'rango_referencia', 'fuera_de_rango', 'confianza_extraccion', 'verificado_por'),
    },
    {
        nombre: 'DOCUMENTOS',
        descripcion: 'Referencias a archivos en Drive. Nunca el archivo, siempre su identificador.',
        encabezados: conSincronizacion('id', 'paciente_id', 'titulo', 'tipo', 'archivo_drive_id', 'mime', 'fecha', 'origen', 'entidad_relacionada', 'notas'),
    },
    {
        nombre: 'MEDICAMENTOS',
        descripcion: 'Pautas de medicación. Las tomas concretas viven en DOSIS.',
        encabezados: conSincronizacion('id', 'paciente_id', 'nombre', 'dosis_valor', 'dosis_unidad', 'frecuencia_tipo', 'frecuencia_valor', 'momentos', 'fecha_inicio', 'fecha_fin', 'estado', 'prescrito_por', 'notas'),
    },
    {
        nombre: 'DOSIS',
        descripcion: 'Una fila por toma programada. El identificador es determinista.',
        encabezados: conSincronizacion('id', 'medicamento_id', 'paciente_id', 'programada_en', 'estado', 'tomada_en', 'notas'),
    },
    {
        nombre: 'CONTROLES',
        descripcion: 'Controles de salud periódicos, con su cadencia en meses.',
        encabezados: conSincronizacion('id', 'paciente_id', 'tipo', 'fecha_programada', 'fecha_realizada', 'estado', 'periodicidad_meses', 'notas'),
    },
    {
        nombre: 'PESOS',
        descripcion: 'Serie de pesajes. Hoy solo de mascotas (D2), pero la tabla no lo impone.',
        encabezados: conSincronizacion('id', 'paciente_id', 'fecha', 'peso_kg', 'nota'),
    },
    {
        nombre: 'ORDENES',
        descripcion: 'Órdenes médicas y su máquina de estados de autorización.',
        encabezados: conSincronizacion('id', 'paciente_id', 'titulo', 'tipo', 'profesional', 'especialidad', 'emitida_en', 'vence_en', 'requiere_autorizacion', 'estado', 'resuelta_en', 'motivo', 'notas'),
    },
    {
        nombre: 'RECORDATORIOS',
        descripcion: 'Lo que la agenda tiene que recordar. Un solo catálogo de estados.',
        encabezados: conSincronizacion('id', 'paciente_id', 'tipo', 'titulo', 'fecha', 'hora', 'estado', 'prioridad', 'entidad_relacionada'),
    },
    {
        nombre: 'SEGUIMIENTOS',
        descripcion: 'Tareas programadas que consume un solo disparador diario, no uno por orden.',
        encabezados: conSincronizacion('id', 'orden_id', 'paciente_id', 'fecha_programada', 'plantilla', 'destinatario', 'estado', 'enviado_en', 'respuesta_detectada_en'),
    },
    {
        nombre: 'HISTORIAL',
        descripcion: 'Qué le pasó a un paciente. Distinto de AUDITORIA, que registra quién hizo qué.',
        encabezados: conSincronizacion('id', 'paciente_id', 'tipo_evento', 'titulo', 'descripcion', 'fecha_evento', 'entidad_relacionada'),
    },
    {
        nombre: 'DOMINIOS_AUTORIZADOS',
        descripcion: 'Remitentes de confianza para la automatización de correo. Por familia.',
        encabezados: conSincronizacion('id', 'dominio', 'etiqueta', 'activo'),
    },
    {
        nombre: 'CATALOGO_VACUNAS',
        descripcion: 'Catálogo de referencia por especie. Se siembra en la instalación (E2).',
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
        descripcion: 'Quién hizo qué, cuándo y con qué resultado. Solo se añade; no se edita.',
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
/** Los nombres, en el mismo orden en que se crean las pestañas. */
var NOMBRES_PESTANAS = PESTANAS.map((p) => p.nombre);
/** Versión del esquema. Cambiarla obliga a una migración en `instalar()`. */
var VERSION_ESQUEMA = 1;
function pestanaPorNombre(nombre) {
    var _a;
    return (_a = PESTANAS.find((p) => p.nombre === nombre)) !== null && _a !== void 0 ? _a : null;
}
