/**
 * El contrato del repositorio — ninguna escritura puede ser muda (Bloque G, G1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `DataRepository` tiene 37 métodos y varias implementaciones. La aplicación
 * escoge una por bandera y les habla por igual, que es justo lo que hace
 * posible cambiar de backend sin tocar `AppContext`.
 *
 * Y es también lo que lo hace peligroso. Hoy, `SheetsRepository` implementa los
 * 31 métodos de escritura con el cuerpo **vacío**:
 *
 *     async saveMember(_ctx: RepositoryContext, _m: FamilyMember): Promise<void> {}
 *
 * Eso compila, satisface el contrato y pasa el tipado. La promesa se resuelve,
 * la interfaz no se queja, y el dato clínico que alguien acaba de escribir **no
 * existe en ninguna parte**. No hay excepción, no hay aviso y no hay rastro: el
 * único síntoma aparece cuando alguien vuelve a buscar lo que guardó.
 *
 * Y no es un camino hipotético. `getDataRepository()` devuelve `SheetsRepository`
 * siempre que la bandera no diga `firebase`, **incluido cuando la variable de
 * entorno falta**. El comentario de `dataBackend.ts` llama a eso «safety
 * guarantee»; es exactamente al revés.
 *
 * QUÉ HACE ESTE MÓDULO
 * ────────────────────
 * Mira el cuerpo de cada método de escritura y dice cuáles no hacen nada. Es
 * una comprobación estructural, no de comportamiento: no ejecuta el
 * repositorio —para eso haría falta un backend— sino que lee su código.
 *
 * Basta para lo que tiene que atrapar. Un método que no llama a nada, no
 * espera a nada, no asigna nada y no lanza nada, no puede haber guardado nada.
 */

// ─────────────────────────────────────────────────────────────────────────────
// El catálogo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los métodos que **cambian datos**. Si uno de estos no hace nada, se pierde
 * información.
 */
export const METODOS_ESCRITURA: readonly string[] = [
  'saveMember',
  'darDeBajaMember',
  'saveHealthProfile',
  'saveAppointment',
  'darDeBajaAppointment',
  'saveCheckup',
  'darDeBajaCheckup',
  'saveVaccine',
  'darDeBajaVaccine',
  'saveExam',
  'darDeBajaExam',
  'saveExamResults',
  'saveDocument',
  'darDeBajaDocument',
  'saveHistoryEvent',
  'saveReminder',
  'saveTask',
  'saveMedicalOrder',
  'darDeBajaMedicalOrder',
  'saveMedication',
  'darDeBajaMedication',
  'saveDoseReminder',
  'darDeBajaDoseReminder',
  'saveGmailSource',
  'darDeBajaGmailSource',
  'saveAppointmentCandidate',
  'saveSettings',
  'createFamily',
  'createInvitation',
  'acceptInvitation',
  'revokeInvitation',
];

/**
 * Los que solo leen u observan.
 *
 * Para estos, no hacer nada **puede ser correcto**: un backend sin eventos en
 * tiempo real devuelve un `watchAll` que no observa nada, y eso es una
 * respuesta legítima, no una pérdida.
 */
export const METODOS_SOLO_LECTURA: readonly string[] = [
  'loadAll',
  'initFamily',
  'watchAll',
  'getInvitationsForEmail',
  'watchInvitations',
  'watchUserFamilyAccess',
];

/**
 * Los nombres declarados en el contrato, leídos de su fichero.
 *
 * Una interfaz de TypeScript no existe en tiempo de ejecución, así que la
 * lista de arriba no se puede derivar sola. Esto permite comprobar que no se
 * ha quedado atrás: un método nuevo sin clasificar no tiene que colarse como
 * si no escribiera.
 */
export function nombresDelContrato(codigoFuente: string): string[] {
  const texto = String(codigoFuente ?? '');
  const inicio = texto.indexOf('export interface DataRepository');
  if (inicio === -1) return [];

  const cuerpo = texto.slice(inicio, texto.indexOf('\n}', inicio));
  return [...cuerpo.matchAll(/^ {2}([a-zA-Z][A-Za-z0-9]*)\(/gm)].map((m) => m[1]);
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿Hace algo este método?
// ─────────────────────────────────────────────────────────────────────────────

/** Fuera comentarios y cadenas, que pueden contener cualquier cosa. */
function desnudar(fuente: string): string {
  return String(fuente ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** El cuerpo de una función, sin la firma. */
function cuerpoDe(fuente: string): string {
  const texto = String(fuente ?? '');
  const abre = texto.indexOf('{');
  const cierra = texto.lastIndexOf('}');
  if (abre === -1 || cierra <= abre) return '';
  return texto.slice(abre + 1, cierra);
}

/**
 * ¿Este cuerpo no hace absolutamente nada?
 *
 * Mudo es el que no llama, no espera, no asigna y no lanza. Cualquiera de esas
 * cuatro cosas basta para que el método **pueda** tener un efecto; que lo tenga
 * de verdad ya no lo decide una comprobación estructural, y por eso esto es un
 * suelo y no un techo.
 *
 * Se prefiere pecar de permisivo: señalar de más convertiría el trinquete en
 * ruido, y un trinquete ruidoso se desactiva. Lo que no puede es dejar pasar
 * un `{}`, que es el caso real que existe hoy.
 */
export function esCuerpoMudo(fuente: string): boolean {
  const cuerpo = desnudar(cuerpoDe(fuente)).trim();
  if (cuerpo.length === 0) return true;

  if (/\bthrow\b/.test(cuerpo)) return false;
  if (/\bawait\b/.test(cuerpo)) return false;
  if (/\(/.test(cuerpo)) return false;
  // Una asignación, pero no un `==`, `===`, `=>` ni un `!=`.
  if (/[^=!<>]=[^=>]/.test(cuerpo)) return false;

  return true;
}

export interface Implementacion {
  /** Cómo se llama en el informe. */
  nombre: string;
  /** Una instancia, o su prototipo. */
  objeto: object;
}

/**
 * Qué métodos de escritura de esta implementación no hacen nada.
 *
 * Un método **ausente** también cuenta: no implementarlo y no guardar tienen
 * el mismo efecto para quien escribió el dato.
 */
export function escriturasMudas(
  implementacion: object,
  metodos: readonly string[] = METODOS_ESCRITURA,
): string[] {
  const mudos: string[] = [];

  for (const nombre of metodos) {
    const valor = (implementacion as Record<string, unknown>)[nombre];
    if (typeof valor !== 'function') {
      mudos.push(nombre);
      continue;
    }
    if (esCuerpoMudo(Function.prototype.toString.call(valor))) mudos.push(nombre);
  }

  return mudos;
}

/** El informe, para el mensaje de la prueba. */
export function informeDeMudas(nombre: string, mudas: readonly string[]): string {
  if (mudas.length === 0) return `${nombre}: ninguna escritura muda`;
  return (
    `${nombre}: ${mudas.length} de ${METODOS_ESCRITURA.length} escrituras no hacen nada.\n` +
    `  Un dato guardado por cualquiera de estas se pierde sin error ni aviso:\n` +
    mudas.map((m) => `    · ${m}`).join('\n')
  );
}
