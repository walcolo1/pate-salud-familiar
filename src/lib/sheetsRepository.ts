/**
 * SheetsRepository — el nombre con el que la bandera pide el backend del titular
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Hasta G0 esto era una clase con **los 31 métodos de escritura vacíos**:
 *
 *     async saveMember(_ctx: RepositoryContext, _m: FamilyMember): Promise<void> {}
 *
 * Compilaba, satisfacía el contrato, resolvía la promesa y el dato clínico
 * desaparecía sin excepción ni aviso. Era la deuda que medía
 * `scripts/escrituras-mudas.json`, y es lo que G0 vino a pagar.
 *
 * Ahora el nombre es solo eso: un nombre. La implementación de verdad está en
 * `repositorioBackend.ts`, escribe por mutación contra el router de E y no
 * tiene un solo cuerpo mudo.
 *
 * POR QUÉ SIGUE LLAMÁNDOSE ASÍ
 * ────────────────────────────
 * Porque `getDataRepository()` elige por bandera y la bandera dice `sheets`.
 * Renombrar ahora obligaría a tocar la fábrica, el trinquete y `AppContext` en
 * el mismo paso que estrena la implementación, y entonces un fallo no diría
 * cuál de las dos cosas lo causó. **El renombre es de G4**, junto con la
 * retirada de la bandera.
 */

export { RepositorioBackend as SheetsRepository } from './repositorioBackend';
