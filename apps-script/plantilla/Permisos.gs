/**
 * Matriz de permisos por rol — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/permisos.ts
 * Genera:  node scripts/generar-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

/**
 * Permisos — qué puede hacer cada rol (Bloque E, E5)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * LA TERCERA PREGUNTA
 * ───────────────────
 * E3 responde **quién** llama: un correo que Google firmó. E4 responde **qué
 * es** en esta familia: un rol y un alcance. Aquí se responde la última, que es
 * la que de verdad autoriza: **¿puede ESE rol hacer ESTA acción sobre ESTE
 * paciente?**
 *
 * Las tres hacen falta. Un correo verificado no es un rol, y un rol no es un
 * permiso.
 *
 * DENEGACIÓN ESTRICTA
 * ───────────────────
 * Todo lo que no esté escrito en la matriz devuelve `false`. No hay comodines,
 * ni herencia entre roles, ni un «si no está prohibido, se permite». Una acción
 * nueva nace **denegada para todos**, incluido el titular, hasta que alguien la
 * añada a propósito y con su fila en la tabla.
 *
 * Es lo contrario de la regla de Firestore que la auditoría del Bloque A
 * encontró concediendo `true` cuando faltaba el documento.
 *
 * VERBO Y ALCANCE SE CRUZAN, NO SE SUMAN
 * ──────────────────────────────────────
 * «Puede editar citas» no significa nada sin «¿de quién?». Un CUIDADOR con el
 * verbo `ESCRIBIR_CITA` y alcance sobre `p_ana` **no** puede escribir una cita
 * de `p_juan`: tiene el verbo y le falta el alcance, y para autorizar hacen
 * falta los dos. El verbo lo decide esta matriz; el alcance lo decidió
 * `alcanza()` en E4.
 */
/**
 * El catálogo. Un verbo que no esté aquí no existe, y `puede()` lo deniega.
 *
 * Los nombres son acciones, no recursos: `LEER_HISTORIA`, no `HISTORIA`. Un
 * catálogo de recursos obliga a inventarse después qué significa «tener» uno.
 */
var VERBOS = {
    // ── Familia ───────────────────────────────────────────────────────────────
    LISTAR_PACIENTES: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Ver la lista de pacientes que le alcanzan. No es ver sus datos.',
    },
    VER_CATALOGOS: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Leer los catálogos de referencia: vacunas, dominios autorizados.',
    },
    EDITAR_CATALOGOS: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Cambiar los catálogos de la familia.',
    },
    ADMINISTRAR_ACCESOS: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Invitar, cambiar de rol y revocar. Solo el titular.',
    },
    VER_AUDITORIA: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Leer el registro de quién hizo qué. Solo el titular.',
    },
    EXPORTAR_EXPEDIENTE: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Sacar una copia completa del expediente. Solo el titular.',
    },
    CREAR_PACIENTE: {
        ambito: 'FAMILIA',
        especie: 'CUALQUIERA',
        descripcion: 'Dar de alta a una persona o a un animal.',
    },
    // ── Paciente ──────────────────────────────────────────────────────────────
    LEER_HISTORIA: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Ver el expediente: citas, vacunas, exámenes, historial.',
    },
    ESCRIBIR_CITA: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Crear, mover o cancelar una cita.',
    },
    ESCRIBIR_VACUNA: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Registrar una dosis aplicada y su refuerzo.',
    },
    ESCRIBIR_CONTROL: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Registrar un control de salud periódico o un pesaje.',
    },
    LEER_DOCUMENTO: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Abrir un documento clínico ya guardado.',
    },
    SUBIR_DOCUMENTO: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Adjuntar un documento al expediente.',
    },
    ESCRIBIR_MEDICACION: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Crear o cambiar una pauta de medicación.',
    },
    MARCAR_DOSIS: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Marcar una toma como hecha, saltada o perdida.',
    },
    ESCRIBIR_ORDEN: {
        ambito: 'PACIENTE',
        especie: 'HUMANO',
        descripcion: 'Registrar una orden médica y su autorización de EPS.',
    },
    /**
     * Apuntar algo que ya le pasó a un paciente, persona o animal.
     *
     * Se llamaba `ESCRIBIR_HISTORIAL_VET` y era **solo de mascotas**, porque en
     * el Bloque D el único historial era el veterinario. Cuando G0 mapeó el
     * historial de las personas a la misma pestaña —que nunca distinguió
     * especie: «qué le pasó a un paciente»—, el verbo se quedó estrecho. Como
     * `puede()` mira la especie antes que el rol, **se lo denegaba también al
     * titular**, y cada alta de un familiar se deshacía.
     *
     * Lo tienen los mismos roles que lo tenían. Ninguno gana nada que importe:
     * cuidador y miembro ya podían crear citas, controles y vacunas de personas,
     * que es más que apuntar lo que pasó.
     */
    ESCRIBIR_HISTORIAL: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Apuntar algo que ya le pasó a un paciente, persona o animal.',
    },
    EDITAR_PACIENTE: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Cambiar los datos de identidad de un paciente.',
    },
    DAR_DE_BAJA_PACIENTE: {
        ambito: 'PACIENTE',
        especie: 'CUALQUIERA',
        descripcion: 'Marcar a un paciente como inactivo. Nunca borrarlo.',
    },
};
var esVerbo = (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(VERBOS, v);
// ─────────────────────────────────────────────────────────────────────────────
// La matriz
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Qué verbos admite cada rol.
 *
 * Se escribe entera, rol por rol, **sin herencia**. Decir «CUIDADOR es MIEMBRO
 * más estas tres» ahorra ocho líneas y esconde lo que de verdad importa: qué
 * puede hacer cada uno. Aquí se lee de un vistazo, y un permiso nuevo hay que
 * ponerlo a mano en cada fila donde corresponda.
 *
 * El TITULAR no aparece: los tiene todos por construcción, y mantener su lista
 * al día sería una forma de olvidarse de actualizarla.
 */
var MATRIZ_PERMISOS = {
    /**
     * Cuida de otros. Todo lo clínico sobre los pacientes que tenga asignados,
     * pero nada que reparta accesos ni toque la configuración de la familia.
     */
    CUIDADOR: [
        'LISTAR_PACIENTES',
        'VER_CATALOGOS',
        'LEER_HISTORIA',
        'ESCRIBIR_CITA',
        'ESCRIBIR_VACUNA',
        'ESCRIBIR_CONTROL',
        'LEER_DOCUMENTO',
        'SUBIR_DOCUMENTO',
        'ESCRIBIR_MEDICACION',
        'MARCAR_DOSIS',
        'ESCRIBIR_ORDEN',
        'ESCRIBIR_HISTORIAL',
        'EDITAR_PACIENTE',
    ],
    /**
     * Gestiona lo suyo. Lo mismo que un cuidador salvo recetar y dar de baja:
     * cambiar una pauta de medicación es una decisión que conviene que pase por
     * alguien que cuida, no por el propio paciente a solas.
     */
    MIEMBRO: [
        'LISTAR_PACIENTES',
        'VER_CATALOGOS',
        'LEER_HISTORIA',
        'ESCRIBIR_CITA',
        'ESCRIBIR_VACUNA',
        'ESCRIBIR_CONTROL',
        'LEER_DOCUMENTO',
        'SUBIR_DOCUMENTO',
        'MARCAR_DOSIS',
        'ESCRIBIR_HISTORIAL',
    ],
    /**
     * Solo mira. Ni un verbo de escritura, ni siquiera sobre sí mismo.
     *
     * Es el rol para quien tiene que poder consultar —un familiar lejano, alguien
     * que acompaña a una cita— sin poder cambiar nada.
     */
    LECTOR: ['LISTAR_PACIENTES', 'VER_CATALOGOS', 'LEER_HISTORIA', 'LEER_DOCUMENTO'],
};
/** Verbos que solo el titular ejerce. Ninguna fila de la matriz los incluye. */
var VERBOS_SOLO_TITULAR = [
    'ADMINISTRAR_ACCESOS',
    'VER_AUDITORIA',
    'EXPORTAR_EXPEDIENTE',
    'EDITAR_CATALOGOS',
    'CREAR_PACIENTE',
    'DAR_DE_BAJA_PACIENTE',
];
/** Búsqueda en conjunto: la matriz se consulta una vez por petición. */
var CONJUNTOS = (function construir() {
    const mapa = {};
    const roles = Object.keys(MATRIZ_PERMISOS);
    for (let i = 0; i < roles.length; i++) {
        mapa[roles[i]] = new Set(MATRIZ_PERMISOS[roles[i]]);
    }
    return mapa;
})();
// ─────────────────────────────────────────────────────────────────────────────
// La decisión
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ¿Puede este acceso ejecutar este verbo sobre este paciente?
 *
 * @param acceso  El que devolvió `resolverAcceso`. Ya resuelto: aquí no se lee
 *     ninguna hoja ni se consulta nada.
 * @param verbo  Del catálogo `VERBOS`. Uno desconocido se deniega.
 * @param pacienteId  Obligatorio para los verbos de ámbito `PACIENTE`.
 * @param especiePaciente  Solo hace falta para los verbos que distinguen
 *     especie. Si el verbo la exige y no viene, se deniega: no se adivina.
 */
function puede(acceso, verbo, pacienteId, especiePaciente) {
    // Sin acceso, o con uno que no está activo, no hay nada que decidir. No
    // debería llegar aquí —`resolverAcceso` no devuelve otra cosa— pero esto no
    // depende de que quien llame se acuerde.
    if (!acceso || acceso.estado !== 'ACTIVO')
        return false;
    // Un verbo que no está en el catálogo se deniega **para todos**, incluido el
    // titular. Es lo que hace que una acción nueva nazca cerrada.
    if (!esVerbo(verbo))
        return false;
    const definicion = VERBOS[verbo];
    if (definicion.ambito === 'PACIENTE') {
        const id = typeof pacienteId === 'string' ? pacienteId.trim() : '';
        // Un verbo por paciente sin paciente es una llamada mal hecha, y ante una
        // llamada mal hecha se deniega en vez de adivinar a quién se refería.
        if (id.length === 0)
            return false;
        // La especie, si el verbo la distingue. No saberla no es permiso: un
        // historial veterinario sobre alguien de quien no se sabe si es un animal
        // se queda sin escribir.
        if (definicion.especie !== 'CUALQUIERA') {
            if (especiePaciente !== definicion.especie)
                return false;
        }
        // El cruce. Tener el verbo no basta si el paciente no está en el alcance.
        if (!alcanza(acceso, id))
            return false;
    }
    // El titular puede con todo lo que exista en el catálogo. No tiene fila en la
    // matriz a propósito: mantenerla al día sería una forma de olvidarse.
    if (acceso.rol === 'TITULAR')
        return true;
    const permitidos = CONJUNTOS[acceso.rol];
    if (!permitidos)
        return false;
    return permitidos.has(verbo);
}
/**
 * Los verbos de un rol, para pintar una interfaz que no ofrezca lo imposible.
 *
 * Es una comodidad, **no una autorización**: la decisión sigue siendo `puede()`
 * en cada petición. Una interfaz que esconde un botón no impide que alguien
 * llame igualmente a la acción.
 */
function verbosDe(rol) {
    if (rol === 'TITULAR')
        return Object.keys(VERBOS);
    const permitidos = CONJUNTOS[rol];
    return permitidos ? Array.from(permitidos) : [];
}
/** ¿Este verbo necesita que le digan sobre qué paciente actúa? */
function exigePaciente(verbo) {
    return esVerbo(verbo) && VERBOS[verbo].ambito === 'PACIENTE';
}
