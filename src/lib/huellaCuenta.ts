/**
 * La huella de una cuenta (Bloque I)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La cola de cambios sin enviar necesita saber qué cuenta hizo cada lote, para
 * no enviarlo nunca con la credencial de otra. La regla del proyecto prohíbe
 * guardar en el navegador correos, UID o identificadores, así que no se guarda
 * la cuenta: se guarda su huella.
 *
 *   huella = SHA-256(sal || ':' || sub)
 *
 * `sub` es el identificador estable de la cuenta de Google en el `id_token`.
 * La sal es aleatoria, se genera una vez y vive dentro de la propia cola: se va
 * con ella. Con otra sal la misma cuenta da otra huella, así que una huella no
 * sirve fuera de este navegador ni para cruzarla con nada.
 *
 * Lo que NO es: un secreto. Con la sal y una lista de candidatos se puede
 * probar quién es; por eso sirve para comparar, que es lo único que se pide, y
 * por eso la cola sigue purgándose con el resto del expediente.
 */

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function cripto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle || !c.getRandomValues) throw new Error('sin WebCrypto');
  return c;
}

/** 128 bits aleatorios, en hexadecimal. */
export function nuevaSal(): string {
  return hex(cripto().getRandomValues(new Uint8Array(16)));
}

export async function huellaCuenta(sal: string, sub: string): Promise<string> {
  if (!sub) throw new Error('sin sujeto no hay huella');
  const datos = new TextEncoder().encode(`${sal}:${sub}`);
  const resumen = await cripto().subtle.digest('SHA-256', datos);
  return hex(new Uint8Array(resumen));
}
