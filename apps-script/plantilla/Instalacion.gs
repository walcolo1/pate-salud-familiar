/**
 * Decisiones de la instalación — GENERADO, NO EDITAR A MANO.
 *
 * Origen:  src/lib/planInstalacion.ts
 * Genera:  node scripts/generar-gs.mjs
 *
 * Una prueba comprueba que este fichero no se queda atrás. Editarlo aquí
 * hace que la próxima ejecución del generador lo pise sin avisar.
 */

/**
 * Plan de instalación — Paté · Salud Familiar (Bloque E, E2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * QUÉ ES ESTO Y QUÉ NO
 * ────────────────────
 * Aquí viven las **decisiones** de la instalación: qué pestañas faltan, qué
 * carpetas hay que crear, qué disparadores borrar antes de crear cuáles, y qué
 * filas siembran los catálogos. Todo puro, todo probable sin abrir un navegador.
 *
 * Lo que NO vive aquí son las llamadas a Google. Esas están en
 * `apps-script/plantilla/Instalador.gs` y solo las puede comprobar una
 * ejecución real; de ahí que E2 tenga también una validación manual.
 *
 * Este fichero se **genera** a `Instalacion.gs` igual que el esquema, así que
 * el instalador ejecuta exactamente las funciones que estas pruebas verifican,
 * no una segunda versión escrita a mano que se parezca.
 *
 * LA IDEMPOTENCIA NO ES UN ADORNO
 * ───────────────────────────────
 * `instalar()` se va a ejecutar más de una vez: para completar una instalación
 * a medias, para migrar de versión de esquema, o sencillamente porque alguien
 * pulsa dos veces. Un instalador que añade un disparador por invocación agota
 * los 20 de cuota sin decir nada, y el síntoma aparece semanas después cuando
 * algo deja de programarse.
 *
 * Por eso el plan de disparadores es «borrar los míos y crearlos todos», nunca
 * «crear los que falten»: comparar disparadores existentes con los deseados es
 * más frágil que rehacerlos, y rehacerlos cuesta milisegundos.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Pestañas
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Las pestañas que hay que crear, dadas las que ya existen.
 *
 * Devuelve nombres en el orden del esquema, no en el de la hoja: una
 * instalación a medias se completa dejando las pestañas en su sitio, no al
 * final.
 */
function pestanasQueFaltan(existentes) {
    const hay = new Set(existentes !== null && existentes !== void 0 ? existentes : []);
    return PESTANAS.filter((p) => !hay.has(p.nombre)).map((p) => p.nombre);
}
/** Los encabezados de una pestaña, o `null` si no está en el esquema. */
function encabezadosDe(nombre) {
    const p = PESTANAS.filter((x) => x.nombre === nombre)[0];
    return p ? p.encabezados.slice() : null;
}
function repararEncabezados(nombre, actuales) {
    const esperados = encabezadosDe(nombre);
    if (!esperados)
        return { accion: 'NADA' };
    const hay = (actuales !== null && actuales !== void 0 ? actuales : []).map((c) => String(c !== null && c !== void 0 ? c : '').trim()).filter((c) => c.length > 0);
    for (let i = 0; i < hay.length; i++) {
        if (i >= esperados.length || hay[i] !== esperados[i]) {
            return {
                accion: 'DIVERGEN',
                posicion: i + 1,
                esperado: i < esperados.length ? esperados[i] : '(ninguna)',
                encontrado: hay[i],
            };
        }
    }
    if (hay.length === esperados.length)
        return { accion: 'NADA' };
    return {
        accion: 'REESCRIBIR',
        encabezados: esperados.slice(),
        columnasNuevas: esperados.slice(hay.length),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Árbol de Drive
// ─────────────────────────────────────────────────────────────────────────────
/** Carpeta raíz en el Drive del titular. */
var CARPETA_RAIZ = 'Paté · Salud Familiar';
/**
 * Las tres subcarpetas.
 *
 * `Temporal` es la única que acumula sin que nadie la mire, así que nace con
 * una regla escrita: lo que entre ahí lo borra el mantenimiento diario. Una
 * carpeta temporal sin política de vaciado en una aplicación clínica es un
 * sitio donde se quedan documentos de pacientes para siempre.
 */
var SUBCARPETAS = ['Documentos', 'Respaldos', 'Temporal'];
/** Días que sobrevive un fichero en `Temporal` antes de que el aseo lo retire. */
var DIAS_RETENCION_TEMPORAL = 7;
/** Las que hay que crear, dadas las que ya existen. Respeta el orden. */
function carpetasQueFaltan(existentes) {
    const hay = new Set(existentes !== null && existentes !== void 0 ? existentes : []);
    return SUBCARPETAS.filter((c) => !hay.has(c));
}
/**
 * Los tres disparadores del backend.
 *
 * Tres, no veinte: la cuota son 20 por script y un disparador por cada orden
 * médica los agotaría en una familia activa. Las tareas concretas viven en la
 * pestaña `SEGUIMIENTOS` y las consume el disparador diario.
 */
var DISPARADORES = [
    {
        funcion: 'registrarApertura',
        tipo: 'ALAPERTURA',
        motivo: 'Deja constancia en AUDITORIA de cada apertura de la hoja. Es además la ' +
            'forma rápida de comprobar que un disparador instalado de verdad se ejecuta.',
    },
    {
        funcion: 'tareaDiaria',
        tipo: 'DIARIO',
        hora: 6,
        motivo: 'Seguimientos vencidos, alertas de vacunas y aseo de la carpeta Temporal. ' +
            'A las 6 para que lo del día esté listo antes de que nadie abra la app.',
    },
    {
        funcion: 'tareaHoraria',
        tipo: 'HORARIO',
        motivo: 'Escaneo de correo entrante. Hasta E11 no hace nada: el manifiesto no ' +
            'declara ámbito de Gmail a propósito.',
    },
];
/**
 * El `onOpen` simple NO se instala.
 *
 * `Instalador.gs` ya define un `onOpen` que Apps Script ejecuta solo, sin
 * disparador y sin autorización. Añadir encima un disparador instalable sobre
 * la misma función haría que el menú se construyera dos veces en cada apertura.
 * Por eso el disparador de apertura apunta a `registrarApertura`, que hace otra
 * cosa.
 */
var FUNCION_MENU_SIMPLE = 'onOpen';
/**
 * Qué hacer con los disparadores, dado lo que ya hay.
 *
 * @param existentes Nombres de función de los disparadores del proyecto.
 */
function planDeDisparadores(existentes) {
    const nuestros = new Set(DISPARADORES.map((d) => d.funcion));
    const hay = existentes !== null && existentes !== void 0 ? existentes : [];
    return {
        // Se borran TODAS las apariciones, no una: si una instalación anterior
        // duplicó uno, esta pasada lo deja en uno.
        aBorrar: hay.filter((f) => nuestros.has(f)),
        aCrear: [...DISPARADORES],
        // Un disparador que no reconocemos lo puso alguien por su cuenta. Borrarlo
        // sería tomar una decisión sobre el proyecto de otra persona.
        ajenos: hay.filter((f) => !nuestros.has(f)),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Semillas
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Dominios de confianza para la automatización de correo.
 *
 * Son los más comunes en Colombia y el titular los ajusta desde la aplicación.
 * Sembrarlos no autoriza nada por sí solo: `DOMINIOS_AUTORIZADOS` decide de
 * quién se acepta un mensaje, y un mensaje aceptado sigue pasando por la
 * bandeja de candidatos antes de tocar el expediente.
 */
var SEMILLA_DOMINIOS = [
    ['sura.com.co', 'EPS Sura'],
    ['colsanitas.com', 'Colsanitas'],
    ['compensar.com', 'Compensar'],
    ['famisanar.com.co', 'Famisanar'],
    ['nuevaeps.com.co', 'Nueva EPS'],
    ['salud-total.com.co', 'Salud Total'],
    ['sanitas.es', 'Sanitas'],
    ['colmedica.com', 'Colmédica'],
    ['synlab.co', 'Laboratorio Synlab'],
    ['labcolsanitas.com', 'Laboratorio Colsanitas'],
];
/**
 * Catálogo de vacunas caninas y felinas.
 *
 * Es una referencia para no escribir el nombre a mano cada vez, **no una pauta
 * clínica**: los meses son los de uso corriente y el veterinario manda. Por eso
 * ninguna fila dice «obligatoria» sin más: la columna existe, pero el criterio
 * es del profesional, no del catálogo.
 */
var SEMILLA_CATALOGO_VACUNAS = [
    ['PERRO', 'Parvovirus', 2, 12, 'Refuerzo anual habitual'],
    ['PERRO', 'Moquillo', 2, 12, 'Suele ir en la polivalente'],
    ['PERRO', 'Hepatitis infecciosa', 2, 12, 'Suele ir en la polivalente'],
    ['PERRO', 'Leptospirosis', 3, 12, 'Refuerzo anual habitual'],
    ['PERRO', 'Rabia', 3, 12, 'Obligatoria en la mayoría de municipios'],
    ['PERRO', 'Tos de las perreras', 3, 12, 'Recomendada si convive con otros perros'],
    ['GATO', 'Panleucopenia', 2, 12, 'Suele ir en la trivalente'],
    ['GATO', 'Calicivirus', 2, 12, 'Suele ir en la trivalente'],
    ['GATO', 'Rinotraqueítis', 2, 12, 'Suele ir en la trivalente'],
    ['GATO', 'Leucemia felina', 3, 12, 'Recomendada si sale al exterior'],
    ['GATO', 'Rabia', 3, 12, 'Obligatoria en la mayoría de municipios'],
];
/** Una fila de `DOMINIOS_AUTORIZADOS` lista para escribir. */
function filasDominios(ahora) {
    return SEMILLA_DOMINIOS.map((d, i) => [
        `dom-semilla-${i + 1}`,
        d[0],
        d[1],
        'SI',
        ahora,
        ahora,
        '',
    ]);
}
/** Una fila de `CATALOGO_VACUNAS` lista para escribir. */
function filasCatalogoVacunas() {
    return SEMILLA_CATALOGO_VACUNAS.map((v, i) => [
        `vac-semilla-${i + 1}`,
        v[0],
        v[1],
        String(v[2]),
        String(v[3]),
        'NO',
        v[4],
    ]);
}
// ─────────────────────────────────────────────────────────────────────────────
// Propiedades del script
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Identificador de la hoja, guardado durante la instalación.
 *
 * En una ejecución de Web App no hay documento activo, así que
 * `getActiveSpreadsheet()` devuelve null y el router no sabría a qué hoja
 * hablar. La instalación es el único momento en que se puede capturar.
 */
var CLAVE_ID_HOJA = 'ID_HOJA';
/** Cliente OAuth contra el que se valida el `aud` de cada `id_token`. */
var CLAVE_CLIENTE_OAUTH = 'OAUTH_CLIENT_ID';
// `CLAVE_VERSION_ACCESO` la declara `acceso.ts` (E4), que es quien la usa y
// quien la incrementa. Aquí solo estorbaría: dos `var` con el mismo nombre en
// dos ficheros de Apps Script no dan error, gana el último cargado, y un
// cambio en el perdedor se ignora sin decir nada.
/** Límite de una ejecución de Apps Script, en milisegundos. */
var LIMITE_EJECUCION_MS = 6 * 60 * 1000;
/**
 * A partir de aquí, la instalación va demasiado apretada.
 *
 * No es el límite: es el punto en el que conviene partirla en fases antes de
 * que una familia con más datos se lo encuentre de golpe.
 */
var UMBRAL_ALERTA_MS = 180 * 1000;
/** Qué decir del tiempo que tardó una instalación. */
function veredictoDuracion(ms) {
    if (ms < 60000)
        return 'HOLGADO';
    if (ms < UMBRAL_ALERTA_MS)
        return 'ACEPTABLE';
    return 'PARTIR';
}
// ─────────────────────────────────────────────────────────────────────────────
// Bloque M · alta de una familia nueva sin pasos técnicos
// ─────────────────────────────────────────────────────────────────────────────
/**
 * La aplicación de la que esta plantilla es el backend.
 *
 * No es una credencial ni es distinta por familia: es la misma PWA para todos,
 * y es a donde llevan los enlaces de invitación y de conexión. De ella se lee
 * el Client ID (ver `esClienteOAuthValido`), que así no viaja en la plantilla.
 */
var URL_APP_PATE = 'https://pate-salud-familiar.vercel.app';
/** La ruta pública de la PWA que dice con qué Client ID se identifica. */
var RUTA_CONFIGURACION_PUBLICA = '/api/configuracion';
/** El formato de un Client ID de OAuth de Google, sin ningún valor concreto. */
function esClienteOAuthValido(valor) {
    return typeof valor === 'string' && /^\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(valor.trim());
}
/**
 * Lee la respuesta de `/api/configuracion` y devuelve el Client ID solo si es
 * de Paté y tiene la forma de uno. Cualquier otra cosa es `null`: un backend
 * sin audiencia falla cerrado, que es lo que tiene que pasar.
 */
function clienteDeConfiguracion(cuerpo) {
    let datos = cuerpo;
    if (typeof cuerpo === 'string') {
        try {
            datos = JSON.parse(cuerpo);
        }
        catch (e) {
            return null;
        }
    }
    const d = (datos || {});
    if (d.app !== 'pate' || !esClienteOAuthValido(d.clientId))
        return null;
    return String(d.clientId).trim();
}
/** El enlace que abre la PWA ya conectada a esta hoja (`?hoja=`, Bloque L). */
function enlaceDeConexion(urlApp, urlBackend) {
    return urlApp.replace(/\/+$/, '') + '/?hoja=' + encodeURIComponent(urlBackend);
}
/** Texto seguro para meterlo en HTML. */
function escaparHtml(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
var ESTILO_DIALOGO = 'body{font-family:Arial,sans-serif;color:#1e293b;font-size:14px;line-height:1.5;margin:0}' +
    'ol{padding-left:20px}li{margin:6px 0}code{background:#f1f5f9;padding:1px 4px;border-radius:4px}' +
    '.boton{display:inline-block;background:#0f766e;color:#fff;font-weight:bold;padding:10px 16px;' +
    'border-radius:10px;text-decoration:none;margin:8px 0;border:0;cursor:pointer;font-size:14px}' +
    '.secundario{background:#fff;color:#0f766e;border:1px solid #0f766e}.nota{color:#475569;font-size:12px}';
/** La /exec de una aplicación web de Apps Script, como literal de regex para el diálogo. */
var PATRON_EXEC_DIALOGO = '/^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/[A-Za-z0-9_-]{20,}\\/exec$/';
/**
 * ¿Lo que devolvió un GET a una /exec es Paté?
 *
 * Bloque M2 · el diálogo ya no se fía de `ScriptApp.getService().getUrl()`:
 * en una copia recién hecha devuelve una dirección aunque no haya ninguna
 * implementación publicada, y el botón «Abrir Paté ya conectado» llevaba a un
 * sitio que no contestaba. Solo vale una dirección que responde como `doGet`.
 */
function esRespuestaDePate(cuerpo) {
    let datos = cuerpo;
    if (typeof cuerpo === 'string') {
        try {
            datos = JSON.parse(cuerpo);
        }
        catch (e) {
            return false;
        }
    }
    const d = (datos || {});
    return d.ok === true && !!d.data && typeof d.data.version === 'string' && d.data.version.length > 0;
}
var PASOS_PUBLICAR = '<ol>' +
    '<li>Menú <strong>Extensiones ▸ Apps Script</strong>.</li>' +
    '<li>Arriba a la derecha: <strong>Implementar ▸ Nueva implementación</strong> (o, si ya existe, ' +
    '<strong>Gestionar implementaciones ▸ ✏️ ▸ Versión: nueva versión</strong>).</li>' +
    '<li>En el engranaje ⚙ elige <strong>Aplicación web</strong>. ' +
    '<em>Ejecutar como:</em> <strong>Yo</strong>. <em>Quién tiene acceso:</em> <strong>Cualquier usuario</strong>.</li>' +
    '<li>Pulsa <strong>Implementar</strong>, copia la <strong>URL de la aplicación web</strong> (termina en ' +
    '<code>/exec</code>) y pégala abajo.</li>' +
    '</ol>' +
    '<p class="nota">«Cualquier usuario» no abre tu expediente a nadie: la aplicación solo responde a las ' +
    'cuentas de Google que tú invites.</p>';
/**
 * El campo para pegar la /exec. La comprueba el servidor (`verificarDespliegueDesdeDialogo`)
 * con una petición real; solo si contesta como Paté aparece el botón.
 */
function formularioDireccion() {
    return ('<p><label for="exec"><strong>Dirección de la aplicación web</strong> (termina en <code>/exec</code>):</label></p>' +
        '<input id="exec" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #94a3b8;border-radius:8px" ' +
        'placeholder="Termina en /exec">' +
        '<button class="boton secundario" id="comprobar" onclick="comprobar()">Comprobar y conectar</button>' +
        '<p id="salida" class="nota" aria-live="polite"></p>' +
        '<script>function comprobar(){var v=document.getElementById("exec").value.trim();var s=document.getElementById("salida");' +
        'var b=document.getElementById("comprobar");' +
        'if(!' + PATRON_EXEC_DIALOGO + '.test(v)){s.textContent="Esa dirección no es la de una aplicación web: tiene que terminar en /exec.";return;}' +
        'b.disabled=true;s.textContent="Comprobando que responde…";' +
        'google.script.run.withSuccessHandler(function(r){b.disabled=false;if(!r||!r.ok){s.textContent=(r&&r.mensaje)||"No responde.";return;}' +
        'var a=document.createElement("a");a.className="boton";a.target="_blank";a.rel="noopener";a.href=r.enlace;' +
        'a.textContent="Abrir Paté ya conectado";s.textContent="Responde y quedó guardada. ";s.appendChild(a);})' +
        '.withFailureHandler(function(){b.disabled=false;s.textContent="No se pudo comprobar. Inténtalo otra vez.";})' +
        '.verificarDespliegueDesdeDialogo(v);}</script>');
}
/**
 * El diálogo de «Paté ▸ Conectar con la aplicación».
 *
 * `urlVerificada`: una /exec que **ya respondió** como Paté (o `null`).
 * `detectadaSinResponder`: la que dio Google pero no contestó, para decirlo.
 *
 * Siempre lleva los pasos para publicar y el campo para pegar o corregir la
 * dirección: si la implementación cambia, se arregla desde aquí.
 */
function htmlConexion(urlApp, urlVerificada, detectadaSinResponder) {
    const ayuda = PASOS_PUBLICAR + formularioDireccion();
    if (!urlVerificada) {
        return ('<style>' + ESTILO_DIALOGO + '</style>' +
            '<p><strong>Falta un paso: publicar tu expediente para la aplicación.</strong></p>' +
            (detectadaSinResponder
                ? '<p class="nota">Google indica una dirección para este proyecto, pero no responde como Paté: ' +
                    'todavía no está publicada como aplicación web, o su acceso no es «Cualquier usuario».</p>'
                : '') +
            ayuda);
    }
    const enlace = escaparHtml(enlaceDeConexion(urlApp, urlVerificada));
    return ('<style>' + ESTILO_DIALOGO + '</style>' +
        '<p><strong>Tu expediente está listo.</strong> Su dirección respondió. Ábrelo en la aplicación y entra con ' +
        'esta misma cuenta de Google.</p>' +
        '<a class="boton" href="' + enlace + '" target="_blank" rel="noopener">Abrir Paté ya conectado</a> ' +
        '<button class="boton secundario" id="correo" onclick="enviar()">Enviarme el enlace por correo</button>' +
        '<p class="nota" id="estado">Para el celular: pídelo por correo y ábrelo allí. Después invita a tu familia ' +
        'desde Ajustes ▸ Invitaciones.</p>' +
        '<details><summary><strong>¿No conecta? Ver pasos para publicar o pegar la dirección /exec</strong></summary>' +
        ayuda +
        '</details>' +
        '<script>function enviar(){var b=document.getElementById("correo");b.disabled=true;' +
        'google.script.run.withSuccessHandler(function(){document.getElementById("estado").textContent=' +
        '"Enviado a tu correo.";}).withFailureHandler(function(){b.disabled=false;' +
        'document.getElementById("estado").textContent="No se pudo enviar. Usa el botón de arriba.";})' +
        '.enviarmeEnlaceDeConexion();}</script>');
}
var ASUNTO_CONEXION = 'Tu enlace a Paté · Salud Familiar';
/** El correo con el enlace de conexión. Solo el enlace: nada clínico. */
function cuerpoConexion(urlApp, urlBackend) {
    return [
        'Abre este enlace en el dispositivo donde quieras usar Paté y entra con tu cuenta de Google:',
        '',
        enlaceDeConexion(urlApp, urlBackend),
        '',
        'Quien tenga este enlace solo ve la pantalla de entrada: el expediente solo se abre a las cuentas que tú invites.',
    ].join('\n');
}
