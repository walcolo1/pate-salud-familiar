/**
 * La carga del expediente al entrar.
 *
 * Antes la disparaba un temporizador de 500 ms después de montar o de entrar.
 * Tras un F5 llegaba antes que la credencial de GIS, fallaba sin identidad y
 * callaba el error; cuando la credencial llegaba, AppContext la tomaba por una
 * renovación y no volvía a intentarlo. Resultado en vivo: «Mi familia: 0» hasta
 * pasar por Ajustes.
 *
 * Aquí no importa el orden. Se llama a `intentar()` cada vez que cambia algo
 * —entra el usuario, llega una credencial, se registra la hoja— y la carga
 * ocurre **una vez por sesión** en cuanto están la hoja y la identidad. Si
 * falla, el siguiente disparo lo vuelve a intentar.
 */

export type ResultadoCarga = 'cargada' | 'ya_cargada' | 'sin_hoja' | 'sin_identidad' | 'fallo';

export interface DependenciasCarga {
  /** ¿Sabe este navegador dónde está la hoja de la familia? */
  hayHoja(): boolean;
  /** ¿Hay un `id_token` con el que firmar? */
  hayIdentidad(): boolean;
  /** Lee el expediente entero y lo aplica. Puede lanzar. */
  cargar(): Promise<void>;
  /** Para el indicador de carga. */
  alCambiarCargando?(cargando: boolean): void;
}

export class CargaAlEntrar {
  private cargada = false;
  private enCurso: Promise<ResultadoCarga> | null = null;

  constructor(private readonly deps: DependenciasCarga) {}

  /** Nunca lanza: la llaman efectos y oyentes, que no sabrían qué hacer. */
  intentar(): Promise<ResultadoCarga> {
    if (this.cargada) return Promise.resolve('ya_cargada');
    if (this.enCurso) return this.enCurso;
    if (!this.deps.hayHoja()) return Promise.resolve('sin_hoja');
    if (!this.deps.hayIdentidad()) return Promise.resolve('sin_identidad');

    this.deps.alCambiarCargando?.(true);
    this.enCurso = this.deps
      .cargar()
      .then((): ResultadoCarga => {
        this.cargada = true;
        return 'cargada';
      })
      .catch((): ResultadoCarga => 'fallo')
      .finally(() => {
        this.enCurso = null;
        this.deps.alCambiarCargando?.(false);
      });
    return this.enCurso;
  }

  /** Al cerrar sesión: la siguiente entrada vuelve a cargar. */
  reiniciar(): void {
    this.cargada = false;
  }
}
