/**
 * E6-live — las cinco promesas del backend, contra un despliegue de verdad.
 *
 *   node scripts/e6-en-vivo.mjs --url https://script.google.com/macros/s/…/exec
 *
 * QUÉ HACE Y QUÉ NO
 * ─────────────────
 * Aquí está lo que necesita red, navegador y una persona delante. El **plan**
 * —qué se pide, con qué token y qué se espera— vive en `src/lib/sondaE6.ts`,
 * que tiene 38 pruebas. Si esto clasificara mal una respuesta, la validación
 * manual daría un verde que no existe, y eso es peor que no haberla hecho.
 *
 * NO SE ESCRIBE NADA EN EL DISCO
 * ──────────────────────────────
 * Ni la URL del despliegue —que es una credencial: quien la tenga puede llamar
 * al endpoint— ni los `id_token`, que son sesiones vivas durante una hora. Todo
 * se queda en memoria y se pierde al terminar. Lo que se imprime va redactado.
 *
 * POR QUÉ HAY UN SERVIDOR LOCAL
 * ─────────────────────────────
 * Un `id_token` real solo lo emite Google a una página servida desde un origen
 * autorizado en el cliente OAuth. `file://` no vale y la terminal tampoco. Así
 * que se levanta la página mínima que pinta el botón de Google, se recoge la
 * credencial y el servidor se apaga.
 */

import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarModuloTs } from './cargar-ts.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const sonda = await cargarModuloTs(join(RAIZ, 'src', 'lib', 'sondaE6.ts'));
const auth = await cargarModuloTs(join(RAIZ, 'src', 'lib', 'autenticacion.ts'));

// ─────────────────────────────────────────────────────────────────────────────
// Configuración: por argumento o por entorno, nunca por un fichero versionado
// ─────────────────────────────────────────────────────────────────────────────

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const URL_WEBAPP = argumento('url') ?? process.env.PATE_WEBAPP_URL ?? '';
const PUERTO = Number(argumento('puerto') ?? 3000);

/** El Client ID no es un secreto —viaja en el paquete de la PWA— pero tampoco se versiona aquí. */
function clienteOAuth() {
  const dado = argumento('cliente') ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (dado) return dado;
  try {
    const env = readFileSync(join(RAIZ, '.env.local'), 'utf8');
    const linea = /^NEXT_PUBLIC_GOOGLE_CLIENT_ID=(.+)$/m.exec(env);
    return linea ? linea[1].trim() : '';
  } catch {
    return '';
  }
}

if (!URL_WEBAPP) {
  console.error('Falta la URL del despliegue.');
  console.error('  node scripts/e6-en-vivo.mjs --url https://script.google.com/macros/s/…/exec');
  process.exit(1);
}

if (!/\/exec$/.test(URL_WEBAPP)) {
  // `/dev` ejecuta siempre la última versión guardada y exige sesión iniciada:
  // sirve para depurar, no para validar lo que verá un familiar.
  console.error('La URL tiene que terminar en /exec, no en /dev.');
  process.exit(1);
}

const CLIENTE = clienteOAuth();
if (!CLIENTE) {
  console.error('No se encontró NEXT_PUBLIC_GOOGLE_CLIENT_ID (ni --cliente, ni entorno, ni .env.local).');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// La página que trae los id_token
// ─────────────────────────────────────────────────────────────────────────────

const paginaFirma = (etiqueta) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Sonda E6 · ${etiqueta}</title>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style>
 body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#111;color:#eee}
 main{max-width:34rem;padding:2rem;text-align:center}
 h1{font-size:1.25rem;margin:0 0 .5rem}
 p{color:#aaa}
 #boton{display:flex;justify-content:center;margin:2rem 0}
 #listo{display:none;color:#7ee787;font-weight:600}
</style></head>
<body><main>
 <h1>Sonda E6 · ${etiqueta}</h1>
 <p>Inicia sesión con la cuenta indicada en la terminal. El token no se guarda en ninguna parte.</p>
 <div id="boton"></div>
 <p id="listo">Token recibido. Vuelve a la terminal.</p>
 <script>
  function recibir(respuesta) {
    fetch('/token', { method: 'POST', body: respuesta.credential }).then(function () {
      document.getElementById('boton').style.display = 'none';
      document.getElementById('listo').style.display = 'block';
    });
  }
  window.onload = function () {
    google.accounts.id.initialize({ client_id: ${JSON.stringify(CLIENTE)}, callback: recibir, auto_select: false });
    // Sin esto, Google reutilizaría la sesión anterior y la segunda cuenta
    // nunca llegaría a elegirse.
    google.accounts.id.disableAutoSelect();
    google.accounts.id.renderButton(document.getElementById('boton'), { theme: 'filled_black', size: 'large', text: 'signin_with' });
  };
 </script>
</main></body></html>`;

/** Levanta la página, espera una credencial y se apaga. */
function pedirToken(etiqueta) {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer((peticion, respuesta) => {
      if (peticion.method === 'POST' && peticion.url === '/token') {
        let cuerpo = '';
        peticion.on('data', (t) => (cuerpo += t));
        peticion.on('end', () => {
          respuesta.writeHead(204).end();
          servidor.close();
          resolver(cuerpo.trim());
        });
        return;
      }
      respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      respuesta.end(paginaFirma(etiqueta));
    });

    servidor.on('error', rechazar);
    servidor.listen(PUERTO, () => {
      console.log(`\n  Abre  http://localhost:${PUERTO}  y entra con: ${etiqueta}`);
      console.log('  (si el dev server de Next está usando este puerto, páralo antes)');
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La llamada
// ─────────────────────────────────────────────────────────────────────────────

async function llamar(cuerpo) {
  const inicio = Date.now();
  try {
    const respuesta = await fetch(URL_WEBAPP, {
      method: 'POST',
      // `text/plain` por costumbre prudente: E0-bis midió que
      // `application/json` también cruza, pero esto funciona con seguridad.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: cuerpo,
      redirect: 'follow',
    });
    return { estado: respuesta.status, crudo: await respuesta.text(), ms: Date.now() - inicio };
  } catch (error) {
    return { estado: 0, crudo: String(error), ms: Date.now() - inicio };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// El recorrido
// ─────────────────────────────────────────────────────────────────────────────

const consola = createInterface({ input: process.stdin, output: process.stdout });
const esperar = (mensaje) => consola.question(`\n  ${mensaje}\n  Pulsa Intro cuando esté hecho… `);

const tokens = { titular: '', segunda: '' };
const contexto = { emailSegunda: '' };
const resultados = [];

const marca = (v) => (v === 'PASA' ? '  OK  ' : ' FALLA');

async function ejecutar(prueba) {
  const cuerpo = sonda.cuerpoDe(prueba, tokens, contexto);
  const { estado, crudo, ms } = await llamar(cuerpo);
  const resultado = { ...sonda.clasificar(prueba, estado, crudo), ms };
  resultados.push(resultado);
  console.log(`  [${marca(resultado.veredicto)}] ${resultado.id}  ${prueba.titulo}`);
  console.log(`            ${resultado.detalle}  ·  ${ms} ms`);
  return resultado;
}

const porId = (id) => sonda.PLAN_E6.find((p) => p.id === id);

console.log('\n════ E6-live · validación del backend contra el despliegue ════');
console.log('Ninguna de estas peticiones lleva datos clínicos reales.\n');

console.log('— Sin token: el endpoint público y los tres rechazos de E3 —');
for (const id of ['E6L-1', 'E6L-2', 'E6L-3', 'E6L-4']) await ejecutar(porId(id));

// ── La cuenta del titular ────────────────────────────────────────────────────
tokens.titular = await pedirToken('LA CUENTA DEL TITULAR (la dueña de la hoja)');
console.log('\n— Con el id_token real del titular —');
await ejecutar(porId('E6L-5'));

// ── La segunda cuenta ────────────────────────────────────────────────────────
console.log('\nAhora hace falta una SEGUNDA cuenta de Google, distinta de la del titular.');
tokens.segunda = await pedirToken('LA SEGUNDA CUENTA (no la del titular)');

const cargaB = auth.decodificarPayloadJwt(tokens.segunda);
contexto.emailSegunda = auth.normalizarEmail(cargaB && cargaB.email);
if (!contexto.emailSegunda) {
  console.error('\nNo se pudo leer el correo del segundo token. Se detiene aquí.');
  process.exit(1);
}
if (contexto.emailSegunda === auth.normalizarEmail((auth.decodificarPayloadJwt(tokens.titular) || {}).email)) {
  console.error('\nLas dos cuentas son la misma. Los criterios 4 y 5 necesitan dos distintas.');
  process.exit(1);
}

console.log('\n— Denegación por defecto: cuenta real sin fila en ACCESO —');
await ejecutar(porId('E6L-6'));

// El correo normalizado es lo que hay que escribir en la hoja: si se escribe
// con puntos, `ACCESO` no lo encontrará nunca.
console.log('\n  Correo a escribir en ACCESO (tal cual, normalizado):');
console.log(`      ${contexto.emailSegunda}`);
console.log('  NO lo pegues en la evidencia: el informe va sin correos.');

await esperar(
  'En la hoja, pestaña ACCESO, añade una fila: ese email · rol LECTOR · pacientes_asignados «*» · estado ACTIVO.',
);

console.log('\n— Revocación en caliente —');
const entra = await ejecutar(porId('E6L-7'));
if (entra.veredicto !== 'PASA') {
  console.error('\n  La segunda cuenta no llegó a entrar, así que revocarla no probaría nada.');
  console.error('  Revisa la fila de ACCESO antes de seguir.');
}

const revocacion = await ejecutar(porId('E6L-8'));
const instante = Date.now();
const reintento = await ejecutar(porId('E6L-9'));

const separacion = Date.now() - instante;
if (revocacion.veredicto === 'PASA' && reintento.veredicto === 'PASA') {
  console.log(
    `\n  La revocada quedó fuera ${separacion} ms después de revocarla, con su entrada de caché caliente.`,
  );
  console.log('  El TTL de la caché de ACCESO es de cinco minutos: no ha tenido nada que ver.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Cierre
// ─────────────────────────────────────────────────────────────────────────────

const total = sonda.resumen(resultados);
console.log('\n════ Resumen ════');
console.log(`  ${total.pasan} pasan · ${total.fallan} fallan`);
console.log(
  total.criteriosAbiertos.length === 0
    ? '  Las cinco promesas quedan cerradas.'
    : `  Promesas SIN cerrar: ${total.criteriosAbiertos.join(', ')}`,
);

console.log('\n  Tabla para docs/EVIDENCIA_E6.md:\n');
console.log('| Prueba | Promesa | Qué comprueba | Resultado | ms |');
console.log('|---|---|---|---|---|');
for (const r of resultados) {
  console.log(
    `| \`${r.id}\` | ${r.criterio} | ${r.titulo} | ${r.veredicto === 'PASA' ? '✅ ' : '❌ '}${sonda.redactar(r.detalle)} | ${r.ms} |`,
  );
}

console.log('\n  Recuerda dejar la fila de la segunda cuenta como REVOCADO o borrarla.');
consola.close();
process.exit(total.fallan === 0 ? 0 : 1);
