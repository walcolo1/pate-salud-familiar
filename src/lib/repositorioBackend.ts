/**
 * El repositorio contra el router del titular (Bloque G, G0)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Los 37 métodos de `DataRepository`, hablando con el backend de E: `aplicar`
 * para escribir, `exportar` / `listarPacientes` / `consultar` para leer.
 *
 * Se apoya en dos piezas que ya estaban probadas por separado:
 * `transporteBackend.ts` pone la conversación y `descriptores.ts` el mapeo.
 * Aquí solo está lo que ninguna de las dos puede saber sola: qué colección
 * toca cada método y qué se hace cuando no hay dónde escribir.
 *
 * TRES COSAS QUE HAY QUE TENER PRESENTES ANTES DE LEER EL CÓDIGO
 * ──────────────────────────────────────────────────────────────
 *
 * **1 · La hoja solo anexa.** `aplicar()` añade filas; no modifica ninguna.
 * Guardar dos veces el mismo paciente deja dos filas, y borrarlo deja una
 * tercera con `borrado_en`. La lectura las colapsa (`colapsar`, en
 * `mapeoFilas.ts`), y ahí está explicada la regla y lo que cuesta.
 *
 * **2 · Una mutación sin paciente se deniega, incluso al titular.** `puede()`
 * comprueba el alcance **antes** de mirar el rol, así que un `pacienteId`
 * olvidado no es un permiso de menos: es el lote entero rechazado. Por eso
 * cada mutación lo lleva, y por eso `deleteX` tiene que sacarlo de su propio
 * identificador.
 *
 * **3 · Lo que no se puede guardar, se dice.** Cinco colecciones no tienen
 * pestaña y tres operaciones no existen en este backend. Todas lanzan con su
 * motivo. Es la diferencia que sostiene el Bloque G entero: un método que
 * lanza avisa; el que calla pierde el dato sin dejar rastro.
 */

import {
  ErrorBackend,
  aplicar,
  obtenerRevision,
  pedir,
  type ContextoTransporte,
  type Mutacion,
} from './transporteBackend';
import { DESCRIPTORES, MODELO_DE_COLECCION, SIN_PESTANA } from './descriptores';
import { aFila, colapsar, filaDeBaja, filaDesdeCeldas, type Descriptor } from './mapeoFilas';
import { encabezadosDe } from './planInstalacion';
import { normalizarEmail } from './autenticacion';
// `identidad.ts` solo importa de aquí un **tipo**, que se borra al compilar:
// no hay ciclo en ejecución.
import { sesionBackend } from './identidad';
import { EMPTY_FAMILY_DATA, type AllFamilyData, type DataRepository, type DataUpdate, type RepositoryContext } from './dataRepository';
import type { FamilyAccess, FamilyInvitation } from './firestoreService';
import type {
  ClinicalDocument,
  ExamResult,
  FamilyMember,
  FollowUpTask,
  HealthProfile,
  ImportedEmailAppointmentCandidate,
  MedicalAppointment,
  MedicalExam,
  MedicalHistoryEvent,
  MedicalOrder,
  MedicationDoseReminder,
  MedicationPrescription,
  PeriodicCheckup,
  Reminder,
  VaccineRecord,
  AppointmentEmailSource,
} from '../domain/models';

// ─────────────────────────────────────────────────────────────────────────────
// Códigos propios
// ─────────────────────────────────────────────────────────────────────────────

/** No hay URL de familia registrada en este navegador. */
export const SIN_BACKEND = 'SIN_BACKEND';
/** No hay `id_token` con el que firmar la petición. */
export const SIN_IDENTIDAD = 'SIN_IDENTIDAD';
/** Esta colección no tiene pestaña, o esta operación no existe aquí. */
export const NO_HAY_DONDE = 'NO_HAY_DONDE_ESCRIBIRLO';
/** La mutación no sabe a qué paciente pertenece, y el router la rechazaría. */
export const SIN_PACIENTE = 'SIN_PACIENTE';
/** Un lote sin una sola mutación. No sale a la red, y no puede callarse. */
export const NADA_QUE_GUARDAR = 'NADA_QUE_GUARDAR';

// ─────────────────────────────────────────────────────────────────────────────
// La sesión
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De dónde salen la dirección de la familia y la identidad de quien llama.
 *
 * Entra por parámetro para poder probar el repositorio entero sin red y sin
 * despliegue. El `id_token` **no se guarda en ninguna parte**: se pide para
 * cada petición y se olvida.
 */
export interface SesionBackend {
  /** La `/exec` de esta familia, o `null` si no hay ninguna registrada. */
  url(): string | null;
  /** El `id_token` de quien llama, o `null` si no hay sesión. */
  idToken(): Promise<string | null>;
  /**
   * Fuerza una credencial nueva. Devuelve `null` si no se pudo.
   *
   * Existe porque un token puede dejar de valer **antes** de su `exp` —el
   * titular revocó el acceso, el reloj del dispositivo va adelantado— y el
   * `exp` no se entera. Cuando el router contesta `TOKEN_INVALIDO`, esto es lo
   * que permite reintentar una vez en lugar de echar a alguien de su sesión.
   */
  renovar?(): Promise<string | null>;
  /** Inyectable para poder probar sin red. */
  fetch?: typeof globalThis.fetch;
}

/**
 * La sesión real del navegador.
 *
 * Vive en `identidad.ts`, que es donde se instancia la sesión de la aplicación
 * y se dejan los dos enchufes de G3: cómo pedirle a Google una credencial nueva
 * y qué hacer cuando ya no hay. Se importa **tarde**, dentro de la función,
 * para no atar este módulo a un singleton en cuanto alguien lo mire.
 */
export function sesionDelNavegador(): SesionBackend {
  return sesionBackend();
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El rol del contrato, traducido al del router.
 *
 * `OWNER` devuelve `null` a propósito: el titular es quien posee la hoja, no un
 * rol que se reparta. `validarInvitacion` lo rechaza igualmente, pero fallar
 * aquí ahorra una petición y dice mejor por qué.
 */
export function rolDeContrato(rol: string): string | null {
  const mapa: Record<string, string> = {
    CAREGIVER: 'CUIDADOR',
    MEMBER: 'MIEMBRO',
    VIEWER: 'LECTOR',
  };
  return mapa[String(rol ?? '').toUpperCase()] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura: qué pestaña alimenta cada colección
// ─────────────────────────────────────────────────────────────────────────────

/** Las colecciones de `AllFamilyData` que son una lista plana. */
const LISTAS: readonly (keyof AllFamilyData)[] = [
  'members',
  'appointments',
  'checkups',
  'vaccines',
  'exams',
  'documents',
  'history',
  'reminders',
  'medicalOrders',
  'medications',
  'doseReminders',
];

/** Las pestañas que hay que consultar paciente a paciente cuando no hay exportar. */
const PESTANAS_POR_PACIENTE: readonly string[] = [
  'PERFIL_HUMANO',
  'CITAS',
  'CONTROLES',
  'VACUNAS',
  'EXAMENES',
  'DOCUMENTOS',
  'HISTORIAL',
  'RECORDATORIOS',
  'ORDENES',
  'MEDICAMENTOS',
  'DOSIS',
  // v4 · Antes no se podía: sin `paciente_id`, `consultar` no tenía por dónde
  // filtrar y los valores de un examen no había forma de volver a leerlos.
  'EXAMENES_RESULTADOS',
];

// ─────────────────────────────────────────────────────────────────────────────
// El repositorio
// ─────────────────────────────────────────────────────────────────────────────

export class RepositorioBackend implements DataRepository {
  private readonly sesion: SesionBackend;

  constructor(sesion: SesionBackend = sesionDelNavegador()) {
    this.sesion = sesion;
  }

  // ── Plomería ──────────────────────────────────────────────────────────────

  private async contexto(): Promise<ContextoTransporte> {
    const url = this.sesion.url();
    if (!url) {
      throw new ErrorBackend(SIN_BACKEND, 'este navegador no tiene registrada la hoja de la familia');
    }

    const idToken = await this.sesion.idToken();
    if (!idToken) throw new ErrorBackend(SIN_IDENTIDAD, 'no hay sesión con la que firmar');

    return { url, idToken, fetch: this.sesion.fetch };
  }

  /**
   * Una petición, con **un** reintento si la identidad ya no vale.
   *
   * OJO CON EL 401: NO EXISTE
   * ─────────────────────────
   * El router contesta siempre **HTTP 200** y mete el fallo en el cuerpo:
   * `{ ok: false, error: 'TOKEN_INVALIDO' }`. Esperar un código de estado
   * sería esperar algo que nunca llega, y el reintento no se dispararía jamás.
   *
   * Un reintento y no más: si la credencial recién renovada tampoco vale, el
   * problema no es la caducidad y repetir solo gasta cuota.
   */
  private async conSesion<T>(accion: (ctx: ContextoTransporte) => Promise<T>): Promise<T> {
    const contexto = await this.contexto();

    try {
      return await accion(contexto);
    } catch (error) {
      if ((error as ErrorBackend)?.codigo !== 'TOKEN_INVALIDO' || !this.sesion.renovar) throw error;

      const renovado = await this.sesion.renovar();
      // Sin credencial nueva, el error que sube es el original: decir
      // «falló la renovación» taparía lo que de verdad contestó el router.
      if (!renovado) throw error;

      return accion({ ...contexto, idToken: renovado });
    }
  }

  /** Los descriptores de una colección, o el motivo de que no los haya. */
  private descriptoresDe(coleccion: string): readonly Descriptor[] {
    const lista = DESCRIPTORES[coleccion];
    if (lista && lista.length > 0) return lista;

    const motivo = SIN_PESTANA[coleccion] ?? 'esta colección no está mapeada';
    throw new ErrorBackend(NO_HAY_DONDE, `${coleccion}: ${motivo}`);
  }

  /**
   * ¿Esta fila dice algo más allá de su clave y sus constantes?
   *
   * Una mitad sin datos no merece una fila: la hoja solo anexa, y una fila
   * vacía por guardado es una pestaña que crece sin contener nada.
   */
  private static aporta(descriptor: Descriptor, fila: Record<string, unknown>): boolean {
    const clave = descriptor.clave ?? 'id';
    const constantes = new Set(Object.keys(descriptor.constantes ?? {}));

    for (const [columna, valor] of Object.entries(fila)) {
      if (columna === clave || columna === 'id' || constantes.has(columna)) continue;
      if (String(valor ?? '').trim().length > 0) return true;
    }
    return false;
  }

  /** Guarda un modelo entero: una mutación por pestaña, todas en un lote. */
  private async guardar(coleccion: string, modelo: Record<string, unknown>): Promise<void> {
    const mutaciones: Mutacion[] = [];

    for (const descriptor of this.descriptoresDe(coleccion)) {
      const fila = aFila(descriptor, modelo);
      // La primera pestaña de una colección se escribe siempre —es el registro
      // en sí—; las demás solo si traen algo.
      if (mutaciones.length > 0 && !RepositorioBackend.aporta(descriptor, fila)) continue;

      mutaciones.push(this.mutacion(descriptor, fila, this.pacienteDe(descriptor, modelo)));
    }

    await this.aplicarLote(mutaciones, coleccion);
  }

  /** Da de baja una fila. Nada se borra: se marca la fecha y se queda. */
  private async darDeBaja(coleccion: string, id: string): Promise<void> {
    const identificador = String(id ?? '').trim();
    if (identificador.length === 0) {
      throw new ErrorBackend(NADA_QUE_GUARDAR, `${coleccion}: una baja sin identificador`);
    }

    const [principal] = this.descriptoresDe(coleccion);
    const fila = filaDeBaja(identificador, new Date().toISOString());

    // De quién es la fila que se da de baja: `deleteX` solo recibe un
    // identificador y el router exige el paciente. Para `members` coinciden.
    // Para el resto **no hay forma de saberlo sin leer la hoja primero**, así
    // que se manda el propio identificador y el router comprueba el alcance
    // con él.
    //
    // Es una limitación conocida y acotada: al titular —alcance `*`— no le
    // afecta, y a un rol con alcance parcial le saldrá un
    // `PERMISO_INSUFICIENTE` en vez de un borrado a medias. Se resuelve cuando
    // G2 tenga la copia local de la que sacar el paciente.
    await this.aplicarLote([this.mutacion(principal, fila, identificador)], coleccion);
  }

  private mutacion(descriptor: Descriptor, fila: Record<string, unknown>, pacienteId: string): Mutacion {
    return { tabla: descriptor.pestana, fila, pacienteId, especie: 'HUMANO' };
  }

  private pacienteDe(descriptor: Descriptor, modelo: Record<string, unknown>): string {
    const campo = descriptor.pacienteDesde;
    const id = campo ? String(modelo[campo] ?? '').trim() : '';
    if (id.length === 0) {
      throw new ErrorBackend(SIN_PACIENTE, `${descriptor.pestana}: la fila no dice de quién es`);
    }
    return id;
  }

  private async aplicarLote(mutaciones: readonly Mutacion[], coleccion: string): Promise<void> {
    if (mutaciones.length === 0) {
      // `aplicar()` no manda un lote vacío, y eso está bien; lo que no puede
      // pasar es que quien llamó crea que guardó algo.
      throw new ErrorBackend(NADA_QUE_GUARDAR, `${coleccion}: no había nada que escribir`);
    }
    await this.conSesion((contexto) => aplicar(contexto, mutaciones));
  }

  private noExisteAqui(que: string, porque: string): never {
    throw new ErrorBackend(NO_HAY_DONDE, `${que}: ${porque}`);
  }

  // ── Inicialización ────────────────────────────────────────────────────────

  /** La familia **es** la hoja, y la decide la URL del despliegue. */
  async initFamily(_ctx: Omit<RepositoryContext, 'familyId'>): Promise<null> {
    return null;
  }

  /**
   * El expediente entero.
   *
   * Se pide por `exportar` —una petición— y, si el rol no llega, se cae al
   * camino por paciente. La diferencia no es pequeña: once pestañas por
   * persona son once peticiones por persona, y con el sondeo de G2 por delante
   * eso es cuota que se nota.
   */
  async loadAll(_ctx: RepositoryContext): Promise<AllFamilyData> {
    return this.conSesion((contexto) => this.leerTodo(contexto));
  }

  private async leerTodo(contexto: ContextoTransporte): Promise<AllFamilyData> {
    try {
      const data = await pedir<{ tablas?: Record<string, unknown[][]> }>(contexto, 'exportar');
      return this.desdeTablas(data?.tablas ?? {});
    } catch (err) {
      // Solo el rechazo por permiso justifica el camino largo. Un fallo de red
      // o del script tiene que subir: devolver un expediente vacío sería
      // enseñar una historia clínica en blanco y dejar sacar conclusiones.
      if ((err as ErrorBackend)?.codigo !== 'PERMISO_INSUFICIENTE') throw err;
    }

    return this.porPaciente(contexto);
  }

  /** Sheets no tiene eventos en tiempo real. G2 pone el sondeo. */
  watchAll(_ctx: RepositoryContext, _callback: (update: DataUpdate) => void): () => void {
    return () => {};
  }

  /** La revisión del documento, para que G2 sepa si esta copia se quedó vieja. */
  async revision(): Promise<number> {
    return this.conSesion((contexto) => obtenerRevision(contexto));
  }

  // ── Lectura: de tablas a modelos ──────────────────────────────────────────

  private desdeTablas(tablas: Record<string, unknown[][]>): AllFamilyData {
    const filasDe = (pestana: string): Record<string, unknown>[] => {
      const encabezados = encabezadosDe(pestana) ?? [];
      return (tablas[pestana] ?? []).map((celdas) => filaDesdeCeldas(encabezados, celdas));
    };

    const datos: AllFamilyData = { ...EMPTY_FAMILY_DATA };

    for (const coleccion of LISTAS) {
      const descriptores = DESCRIPTORES[coleccion] ?? [];
      const principal = descriptores[0];
      if (!principal) continue;

      const registros = colapsar(principal, filasDe(principal.pestana));

      // `members` se escribe en dos pestañas y se lee igual: la identidad sale
      // de `PACIENTES` y el resto de su mitad en `PERFIL_HUMANO`.
      if (coleccion === 'members' && descriptores[1]) {
        const mitades = new Map(
          colapsar(descriptores[1], filasDe(descriptores[1].pestana)).map((m) => [String(m.id), m]),
        );
        for (const registro of registros) {
          Object.assign(registro, mitades.get(String(registro.id)) ?? {}, { id: registro.id });
        }
      }

      (datos as unknown as Record<string, unknown>)[coleccion] = registros;
    }

    datos.healthProfiles = {};
    const perfiles = DESCRIPTORES.healthProfiles?.[0];
    if (perfiles) {
      for (const perfil of colapsar(perfiles, filasDe(perfiles.pestana))) {
        const memberId = String(perfil.memberId ?? '');
        if (memberId) datos.healthProfiles[memberId] = perfil as unknown as HealthProfile;
      }
    }

    // Los valores de un examen van agrupados por examen, que es como los pide
    // `AllFamilyData` y como se leen: nadie mira un parámetro suelto.
    datos.examResults = {};
    const resultados = DESCRIPTORES.examResults?.[0];
    if (resultados) {
      for (const resultado of colapsar(resultados, filasDe(resultados.pestana))) {
        const examId = String(resultado.examId ?? '');
        if (!examId) continue;
        (datos.examResults[examId] ??= []).push(resultado as unknown as ExamResult);
      }
    }

    return datos;
  }

  /** El camino largo: listar pacientes y preguntar pestaña a pestaña. */
  private async porPaciente(contexto: ContextoTransporte): Promise<AllFamilyData> {
    const lista = await pedir<{ filas?: unknown[][] }>(contexto, 'listarPacientes');
    const tablas: Record<string, unknown[][]> = { PACIENTES: lista?.filas ?? [] };

    const encabezados = encabezadosDe('PACIENTES') ?? [];
    const pacientes = (lista?.filas ?? [])
      .map((celdas) => String(filaDesdeCeldas(encabezados, celdas).id ?? '').trim())
      .filter((id) => id.length > 0);

    for (const pacienteId of Array.from(new Set(pacientes))) {
      for (const tabla of PESTANAS_POR_PACIENTE) {
        const data = await pedir<{ filas?: unknown[][] }>(contexto, 'consultar', {
          tabla,
          pacienteId,
        });
        tablas[tabla] = [...(tablas[tabla] ?? []), ...(data?.filas ?? [])];
      }
    }

    return this.desdeTablas(tablas);
  }

  // ── Pacientes ─────────────────────────────────────────────────────────────

  async saveMember(_ctx: RepositoryContext, member: FamilyMember): Promise<void> {
    await this.guardar('members', member as unknown as Record<string, unknown>);
  }

  async deleteMember(_ctx: RepositoryContext, memberId: string): Promise<void> {
    await this.darDeBaja('members', memberId);
  }

  async saveHealthProfile(
    _ctx: RepositoryContext,
    memberId: string,
    profile: HealthProfile,
  ): Promise<void> {
    await this.guardar('healthProfiles', {
      ...(profile as unknown as Record<string, unknown>),
      memberId,
    });
  }

  // ── Citas ─────────────────────────────────────────────────────────────────

  async saveAppointment(_ctx: RepositoryContext, appt: MedicalAppointment): Promise<void> {
    await this.guardar('appointments', appt as unknown as Record<string, unknown>);
  }

  async deleteAppointment(_ctx: RepositoryContext, apptId: string): Promise<void> {
    await this.darDeBaja('appointments', apptId);
  }

  // ── Controles ─────────────────────────────────────────────────────────────

  async saveCheckup(_ctx: RepositoryContext, checkup: PeriodicCheckup): Promise<void> {
    await this.guardar('checkups', checkup as unknown as Record<string, unknown>);
  }

  async deleteCheckup(_ctx: RepositoryContext, checkupId: string): Promise<void> {
    await this.darDeBaja('checkups', checkupId);
  }

  // ── Vacunas ───────────────────────────────────────────────────────────────

  async saveVaccine(_ctx: RepositoryContext, vaccine: VaccineRecord): Promise<void> {
    await this.guardar('vaccines', vaccine as unknown as Record<string, unknown>);
  }

  async deleteVaccine(_ctx: RepositoryContext, vaccineId: string): Promise<void> {
    await this.darDeBaja('vaccines', vaccineId);
  }

  // ── Exámenes ──────────────────────────────────────────────────────────────

  async saveExam(_ctx: RepositoryContext, exam: MedicalExam): Promise<void> {
    await this.guardar('exams', exam as unknown as Record<string, unknown>);
  }

  async deleteExam(_ctx: RepositoryContext, examId: string): Promise<void> {
    await this.darDeBaja('exams', examId);
  }

  /**
   * Los valores de un examen.
   *
   * `memberId` es opcional en el contrato por compatibilidad con Firestore,
   * pero aquí **hace falta**: es lo que va a la columna `paciente_id` que el
   * esquema v4 añadió, y sin la cual el router deniega la mutación —también al
   * titular— y `consultar` no puede volver a encontrarla. Sin él no se
   * escribe, y se dice.
   */
  async saveExamResults(
    _ctx: RepositoryContext,
    examId: string,
    results: ExamResult[],
    memberId?: string,
  ): Promise<void> {
    const pacienteId = String(memberId ?? '').trim();
    if (pacienteId.length === 0) {
      throw new ErrorBackend(SIN_PACIENTE, 'hay que decir de quién es el examen');
    }

    const [descriptor] = this.descriptoresDe('examResults');
    const mutaciones = (results ?? []).map((resultado) =>
      this.mutacion(
        descriptor,
        aFila(descriptor, {
          ...(resultado as unknown as Record<string, unknown>),
          examId,
          memberId: pacienteId,
        }),
        pacienteId,
      ),
    );

    await this.aplicarLote(mutaciones, 'examResults');
  }

  // ── Documentos ────────────────────────────────────────────────────────────

  async saveDocument(_ctx: RepositoryContext, doc: ClinicalDocument): Promise<void> {
    await this.guardar('documents', doc as unknown as Record<string, unknown>);
  }

  async deleteDocument(_ctx: RepositoryContext, docId: string): Promise<void> {
    await this.darDeBaja('documents', docId);
  }

  // ── Historial ─────────────────────────────────────────────────────────────

  async saveHistoryEvent(_ctx: RepositoryContext, event: MedicalHistoryEvent): Promise<void> {
    await this.guardar('history', event as unknown as Record<string, unknown>);
  }

  // ── Recordatorios ─────────────────────────────────────────────────────────

  async saveReminder(_ctx: RepositoryContext, reminder: Reminder): Promise<void> {
    await this.guardar('reminders', reminder as unknown as Record<string, unknown>);
  }

  // ── Tareas ────────────────────────────────────────────────────────────────

  /** No hay pestaña para tareas genéricas. El motivo está en `SIN_PESTANA`. */
  async saveTask(_ctx: RepositoryContext, _task: FollowUpTask): Promise<void> {
    this.descriptoresDe('tasks');
  }

  // ── Órdenes ───────────────────────────────────────────────────────────────

  async saveMedicalOrder(_ctx: RepositoryContext, order: MedicalOrder): Promise<void> {
    await this.guardar('medicalOrders', order as unknown as Record<string, unknown>);
  }

  async deleteMedicalOrder(_ctx: RepositoryContext, orderId: string): Promise<void> {
    await this.darDeBaja('medicalOrders', orderId);
  }

  // ── Medicación ────────────────────────────────────────────────────────────

  async saveMedication(_ctx: RepositoryContext, prescription: MedicationPrescription): Promise<void> {
    await this.guardar('medications', prescription as unknown as Record<string, unknown>);
  }

  async deleteMedication(_ctx: RepositoryContext, prescriptionId: string): Promise<void> {
    await this.darDeBaja('medications', prescriptionId);
  }

  async saveDoseReminder(_ctx: RepositoryContext, reminder: MedicationDoseReminder): Promise<void> {
    await this.guardar('doseReminders', reminder as unknown as Record<string, unknown>);
  }

  async deleteDoseReminder(_ctx: RepositoryContext, reminderId: string): Promise<void> {
    await this.darDeBaja('doseReminders', reminderId);
  }

  // ── Gmail y ajustes: E11, que no está construido ──────────────────────────

  async saveGmailSource(_ctx: RepositoryContext, _source: AppointmentEmailSource): Promise<void> {
    this.descriptoresDe('gmailSources');
  }

  async deleteGmailSource(_ctx: RepositoryContext, _sourceId: string): Promise<void> {
    this.descriptoresDe('gmailSources');
  }

  async saveAppointmentCandidate(
    _ctx: RepositoryContext,
    _candidate: ImportedEmailAppointmentCandidate,
  ): Promise<void> {
    this.descriptoresDe('appointmentCandidates');
  }

  async saveSettings(
    _ctx: RepositoryContext,
    _settings: Parameters<DataRepository['saveSettings']>[1],
  ): Promise<void> {
    this.descriptoresDe('settings');
  }

  // ── Familia y accesos ─────────────────────────────────────────────────────

  /**
   * No se crea una familia: **la familia es la hoja**, y la crea el titular
   * copiando la plantilla. Devolver un identificador inventado aquí haría creer
   * a la aplicación que existe algo que no existe.
   */
  async createFamily(_ctx: Omit<RepositoryContext, 'familyId'>, _name: string): Promise<string> {
    return this.noExisteAqui(
      'createFamily',
      'la familia es la hoja de cálculo del titular, y se crea copiando la plantilla',
    );
  }

  /**
   * Invitar: el router genera el token, escribe la fila y manda el correo.
   *
   * Devuelve el **correo normalizado** como identificador, porque `ACCESO` se
   * lleva por correo y no hay identificador de invitación. Ni el token ni el
   * enlace vuelven en la respuesta: viajan por el correo y por ningún otro
   * sitio.
   */
  async createInvitation(
    _ctx: RepositoryContext,
    invitedEmail: string,
    invitedMemberId: string,
    role: 'OWNER' | 'MEMBER' | 'CAREGIVER' | 'VIEWER',
  ): Promise<string> {
    const rol = rolDeContrato(role);
    if (!rol) {
      throw new ErrorBackend(
        'ERROR_PAYLOAD',
        'el titular es quien posee la hoja; no es un rol que se reparta',
      );
    }

    const email = normalizarEmail(invitedEmail);
    await this.conSesion((contexto) =>
      pedir(contexto, 'invitar', {
        email,
        rol,
        pacientes: String(invitedMemberId ?? '').trim(),
      }),
    );

    return email;
  }

  /**
   * Aceptar no pasa por aquí.
   *
   * El canje necesita el token que viajó en el correo, y esta ruta no lo
   * tiene: la acepta `/invitacion`, que es la pantalla a la que lleva el
   * enlace. Resolver en silencio haría creer que alguien entró.
   */
  async acceptInvitation(
    _ctx: RepositoryContext,
    _familyId: string,
    _invitationId: string,
  ): Promise<void> {
    this.noExisteAqui(
      'acceptInvitation',
      'una invitación se canjea con su token desde la ruta /invitacion, no por identificador',
    );
  }

  /** Revocar. `ACCESO` se lleva por correo, así que el identificador es uno. */
  async revokeInvitation(_ctx: RepositoryContext, invitationId: string): Promise<void> {
    const email = normalizarEmail(invitationId);
    if (email.length === 0 || email.indexOf('@') <= 0) {
      throw new ErrorBackend(
        'ERROR_PAYLOAD',
        'revocar necesita el correo: en ACCESO no hay identificador de invitación',
      );
    }

    await this.conSesion((contexto) => pedir(contexto, 'revocar', { email }));
  }

  /**
   * Las invitaciones pendientes de un correo.
   *
   * No hay acción que las devuelva, y no la habrá: preguntar «¿hay algo para
   * mí?» sin token obligaría a una acción sin acceso, que es exactamente lo
   * que E4 cerró. Quien tiene una invitación tiene su enlace.
   */
  async getInvitationsForEmail(_email: string): Promise<FamilyInvitation[]> {
    return [];
  }

  watchInvitations(
    _ctx: RepositoryContext,
    _callback: (invitations: FamilyInvitation[]) => void,
  ): () => void {
    return () => {};
  }

  watchUserFamilyAccess(
    _uid: string,
    _callback: (accessList: FamilyAccess[]) => void,
  ): () => void {
    return () => {};
  }
}

/** Para el informe de G1 y para quien lea el mapeo desde fuera. */
export const COLECCIONES_CON_PESTANA = Object.keys(MODELO_DE_COLECCION).filter(
  (c) => (DESCRIPTORES[c] ?? []).length > 0,
);
