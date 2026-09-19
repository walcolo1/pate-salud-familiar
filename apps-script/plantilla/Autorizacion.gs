/**
 * Resolución de rol y alcance — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/acceso.ts
 * Genera:  node scripts/generar-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

/**
 * Acceso — quién es este correo dentro de ESTA familia (Bloque E, E4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * E3 responde «quién llama». Aquí se responde la otra mitad: **qué es dentro de
 * este expediente**. Son dos preguntas distintas y se resuelven con dos cosas
 * distintas: la primera con un token que Google firmó, la segunda con una fila
 * de la pestaña `ACCESO` de esta hoja y de ninguna otra.
 *
 * DE QUÉ TITULAR SON LOS DATOS: NO SE PREGUNTA
 * ────────────────────────────────────────────
 * Lo decide **a qué URL se hizo el POST**. Cada familia tiene su propio
 * despliegue, su propia hoja y su propio Drive. No hay `familia_id` que filtrar
 * mal ni consulta que se pueda escribir al revés: el aislamiento es de la
 * infraestructura de cuentas de Google, no de 475 líneas de reglas.
 *
 * DENEGACIÓN POR DEFECTO
 * ──────────────────────
 * Si el correo no figura, o su estado no es `ACTIVO`, se deniega. No hay
 * accesos implícitos, ni «si no está prohibido, se permite». Es lo contrario de
 * la regla de Firestore que la auditoría del Bloque A encontró concediendo
 * `true` cuando faltaba el documento.
 *
 * REVOCAR TIENE QUE SURTIR EFECTO YA
 * ──────────────────────────────────
 * Cachear `ACCESO` cinco minutos haría que un familiar revocado siguiera
 * entrando cinco minutos. Para un expediente clínico, con alguien a quien se
 * acaba de quitar el acceso a propósito, eso es demasiado.
 *
 * La solución no es invalidar entradas —habría que saber cuáles— sino **meter
 * un contador de versión en la propia clave**. `mutarAcceso` lo incrementa, y
 * en ese mismo instante toda entrada anterior deja de encontrarse. No se borra
 * nada: sencillamente ya nadie pregunta por ella, y caduca sola.
 */
/** Roles, de más a menos alcance. */
var ROLES = ['TITULAR', 'CUIDADOR', 'MIEMBRO', 'LECTOR'];
/** Estados de una fila de `ACCESO`. Solo uno deja pasar. */
var ESTADOS = ['ACTIVO', 'INVITADO', 'REVOCADO', 'INACTIVO'];
/** El alcance total. Una fila con esto ve a todos los pacientes. */
var ALCANCE_TOTAL = '*';
/** Hacia fuera, un único error. El motivo se queda dentro. */
var ERROR_ACCESO = 'ACCESO_DENEGADO';
var esRol = (v) => ROLES.indexOf(v) !== -1;
var esEstado = (v) => ESTADOS.indexOf(v) !== -1;
// ─────────────────────────────────────────────────────────────────────────────
// Leer una fila sin depender de en qué columna está cada cosa
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Posición de cada columna de `ACCESO`, sacada del esquema.
 *
 * Nunca índices a mano. Si mañana se añade una columna en medio, un `fila[4]`
 * escrito hoy empezaría a leer el estado de otra celda **sin que nada falle**:
 * simplemente dejaría entrar a quien no debe.
 */
function columnasAcceso() {
    var _a;
    const encabezados = (_a = encabezadosDe('ACCESO')) !== null && _a !== void 0 ? _a : [];
    const posiciones = {};
    for (let i = 0; i < encabezados.length; i++)
        posiciones[encabezados[i]] = i;
    return posiciones;
}
var texto = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
/** Lista separada por comas → identificadores, sin vacíos ni repetidos. */
function separarPacientes(valor) {
    const crudo = texto(valor);
    if (crudo.length === 0 || crudo === ALCANCE_TOTAL)
        return [];
    const vistos = [];
    const partes = crudo.split(',');
    for (let i = 0; i < partes.length; i++) {
        const id = partes[i].trim();
        if (id.length === 0)
            continue;
        if (vistos.indexOf(id) === -1)
            vistos.push(id);
    }
    return vistos;
}
// ─────────────────────────────────────────────────────────────────────────────
// Resolver
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Qué es este correo en esta hoja.
 *
 * @param emailNormalizado  El que devolvió `validarClaims`. Ya normalizado: si
 *     llegara sin normalizar, `juan.perez@gmail.com` no encontraría la fila de
 *     `juanperez@gmail.com` y el familiar invitado no entraría.
 * @param filasAcceso  Las filas de `ACCESO` **sin** la de encabezados.
 * @param emailTitular  El de `CONFIG`, capturado durante la instalación.
 * @param version  El contador de `ACCESO_VERSION`.
 */
function resolverAcceso(emailNormalizado, filasAcceso, emailTitular, version = 1) {
    const email = texto(emailNormalizado).toLowerCase();
    if (email.length === 0)
        return { permitido: false, motivo: 'SIN_CORREO' };
    // El titular es TITULAR pase lo que pase en la hoja.
    //
    // No es una excepción cómoda: es la única forma de que no se quede fuera de
    // su propio expediente. Una fila mal editada —o borrada por accidente— le
    // dejaría sin acceso por la aplicación, y la única salida sería arreglar la
    // hoja a mano. Además puede editarla de todos modos: es suya.
    if (email === texto(emailTitular).toLowerCase() && email.length > 0) {
        return {
            permitido: true,
            acceso: {
                email,
                rol: 'TITULAR',
                estado: 'ACTIVO',
                alcanceTotal: true,
                pacientesPermitidos: [],
                pacientePropio: buscarPacientePropio(email, filasAcceso),
                version,
            },
        };
    }
    const col = columnasAcceso();
    const fila = buscarFila(email, filasAcceso, col);
    if (!fila)
        return { permitido: false, motivo: 'NO_FIGURA' };
    const estado = texto(fila[col.estado]).toUpperCase();
    if (estado !== 'ACTIVO')
        return { permitido: false, motivo: 'ESTADO_NO_ACTIVO' };
    const rol = texto(fila[col.rol]).toUpperCase();
    if (!esRol(rol))
        return { permitido: false, motivo: 'ROL_DESCONOCIDO' };
    const asignados = texto(fila[col.pacientes_asignados]);
    const alcanceTotal = asignados === ALCANCE_TOTAL;
    const propio = texto(fila[col.paciente_propio]);
    return {
        permitido: true,
        acceso: {
            email,
            rol,
            estado: 'ACTIVO',
            alcanceTotal,
            pacientesPermitidos: alcanceTotal ? [] : separarPacientes(asignados),
            pacientePropio: propio.length > 0 ? propio : null,
            version,
        },
    };
}
function buscarFila(email, filas, col) {
    for (let i = 0; i < (filas !== null && filas !== void 0 ? filas : []).length; i++) {
        const fila = filas[i];
        if (!fila)
            continue;
        if (texto(fila[col.email]).toLowerCase() === email)
            return fila;
    }
    return null;
}
/** El paciente propio del titular, si además figura como fila. */
function buscarPacientePropio(email, filas) {
    const col = columnasAcceso();
    const fila = buscarFila(email, filas !== null && filas !== void 0 ? filas : [], col);
    if (!fila)
        return null;
    const propio = texto(fila[col.paciente_propio]);
    return propio.length > 0 ? propio : null;
}
/**
 * ¿Alcanza este acceso a este paciente?
 *
 * Un permiso tiene verbo y alcance, y «puede editar citas» no significa nada
 * sin «¿de quién?». El verbo es cosa de `Permisos.gs` (E5); el alcance, de
 * aquí.
 */
function alcanza(acceso, pacienteId) {
    if (!acceso)
        return false;
    const id = texto(pacienteId);
    if (id.length === 0)
        return false;
    if (acceso.alcanceTotal)
        return true;
    if (acceso.pacientePropio === id)
        return true;
    return acceso.pacientesPermitidos.indexOf(id) !== -1;
}
// ─────────────────────────────────────────────────────────────────────────────
// Caché versionada
// ─────────────────────────────────────────────────────────────────────────────
var PREFIJO_CACHE_ACCESO = 'acceso:';
/** Cuánto vive una resolución en caché, mientras no cambie la versión. */
var CACHE_ACCESO_SEGUNDOS = 300;
/** Propiedad donde vive el contador. La incrementa `mutarAcceso`. */
var CLAVE_VERSION_ACCESO = 'ACCESO_VERSION';
/**
 * La clave de caché de un correo, para una versión concreta.
 *
 * Meter la versión **en la clave** es lo que hace que revocar surta efecto al
 * instante: no hay que buscar ni borrar entradas —habría que saber cuáles—,
 * simplemente nadie vuelve a preguntar por las viejas y caducan solas.
 */
function claveAcceso(emailNormalizado, version) {
    return PREFIJO_CACHE_ACCESO + texto(emailNormalizado).toLowerCase() + ':v' + String(version);
}
/** Lee el contador. Ausente o ilegible ⇒ 1, nunca 0 ni NaN. */
function versionDesde(crudo) {
    const n = typeof crudo === 'number' ? crudo : Number(texto(crudo));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
/**
 * La siguiente versión.
 *
 * Siempre hacia arriba. Reutilizar un número haría que una entrada de caché
 * vieja volviera a encontrarse, y con ella el acceso que se acababa de revocar.
 */
function siguienteVersion(crudo) {
    return versionDesde(crudo) + 1;
}
function serializarAcceso(acceso) {
    return JSON.stringify(acceso);
}
/**
 * Lee una entrada de caché.
 *
 * Exige que la versión guardada coincida con la vigente. La clave ya lo
 * garantiza, pero una entrada con versión distinta solo puede venir de un
 * error, y ante la duda se vuelve a leer la hoja.
 *
 * `null` significa «vuelve a resolver», nunca «denegado».
 */
function leerCacheAcceso(crudo, versionVigente) {
    if (typeof crudo !== 'string' || crudo.length === 0)
        return null;
    try {
        const acceso = JSON.parse(crudo);
        if (!acceso || typeof acceso !== 'object')
            return null;
        if (acceso.version !== versionVigente)
            return null;
        if (!esRol(acceso.rol) || acceso.estado !== 'ACTIVO')
            return null;
        if (typeof acceso.email !== 'string' || acceso.email.length === 0)
            return null;
        if (!Array.isArray(acceso.pacientesPermitidos))
            return null;
        return acceso;
    }
    catch {
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────────────────
var OPERACIONES = ['INVITAR', 'ACEPTAR', 'CAMBIAR_ROL', 'REVOCAR'];
var esOperacion = (v) => OPERACIONES.indexOf(v) !== -1;
/**
 * ¿Puede este acceso mutar el de otro?
 *
 * Solo el titular. Un cuidador que pudiera invitar acabaría invitándose a sí
 * mismo con más alcance, y repartir accesos a un expediente clínico es una
 * decisión que pertenece a quien lo posee.
 */
function puedeMutarAcceso(acceso) {
    return !!acceso && acceso.rol === 'TITULAR' && acceso.estado === 'ACTIVO';
}
/**
 * Comprueba que una mutación es coherente antes de tocar la hoja.
 *
 * @returns El motivo del rechazo, o `null` si puede seguir.
 */
function validarMutacion(operacion, emailObjetivo, emailTitular, rolNuevo) {
    if (!esOperacion(operacion))
        return 'OPERACION_DESCONOCIDA';
    const objetivo = texto(emailObjetivo).toLowerCase();
    if (objetivo.length === 0)
        return 'SIN_DESTINATARIO';
    // El titular no se puede degradar ni revocar a sí mismo. Sería la única
    // acción de la aplicación sin vuelta atrás desde la propia aplicación.
    if (objetivo === texto(emailTitular).toLowerCase())
        return 'TITULAR_INTOCABLE';
    if (operacion === 'CAMBIAR_ROL') {
        if (!esRol(rolNuevo))
            return 'ROL_DESCONOCIDO';
        // Nadie reparte el rol de titular: hay uno, y es quien posee la hoja.
        if (rolNuevo === 'TITULAR')
            return 'ROL_NO_ASIGNABLE';
    }
    return null;
}
