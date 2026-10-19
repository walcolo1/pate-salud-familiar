# Bloque O · Mascotas: ficha completa, cinco módulos y administración compartida

## Almacenamiento: sujeto polimórfico, sin pestañas ni columnas nuevas

Una mascota es un paciente más (`PACIENTES.tipo = MASCOTA`). Todos sus registros van a las pestañas que ya existían, con `paciente_id = mascota`. No se tocó el esquema v6: las mismas 22 pestañas y las mismas columnas, así que no hace falta migrar la hoja.

| Dato | Pestaña · columna |
|---|---|
| Nombre, estado activo y foto/avatar | `PACIENTES` · `nombre`, `activo`, `foto_url` |
| Especie, raza, nacimiento, sexo, pesos y responsable | `PERFIL_MASCOTA` (como antes) |
| Ficha ampliada: esterilización y fecha, microchip, color, señas, tamaño, estado (Activo / En tratamiento / Adoptado / Fallecido), contacto, veterinario habitual, notas importantes, alimentación y rutina | `PACIENTES.notas`, en un sobre JSON versionado `{"pate":"ficha-mascota","v":1,…}` |
| Vacunas (tipo core/no-core, costo, certificado) | `VACUNAS` (`institucion` = clínica; el resto va en el sobre de `notas`) |
| Desparasitación, antipulgas, filaria, consultas, odontología, baño y estética, cirugías y gastos | `CONTROLES` (`tipo = VET_<categoría>`; producto, dosis, vía y costo van en `notas`) |
| Tratamientos | `MEDICAMENTOS` (tipo, vía y efectos secundarios van en `notas`) |
| Tomas marcadas (aplicada / omitida) | `DOSIS` (id determinista `<tratamiento>@<fecha-hora>`) |
| Recordatorios completados o pospuestos | `RECORDATORIOS` (`entidad_relacionada` = clave del recordatorio) |
| Exámenes y resultados (motor del Bloque N con especie `MASCOTA`) | `EXAMENES`, `EXAMENES_RESULTADOS` |
| Documentos (carnet, fórmulas, facturas, certificados, póliza) | `DOCUMENTOS` (Drive) |

La compatibilidad hacia atrás se mantiene en las dos direcciones:

- Las notas antiguas, en texto plano, se leen como notas sin ficha.
- Las claves que traiga un sobre de una versión más nueva se conservan al reescribirlo (`notasExtra`).
- El prefijo `VET_` impide que un control veterinario se lea como uno humano.

Pruebas que lo verifican:

- `repositorioBackend.test.ts` hace la ida y vuelta completa, de escribir a `loadAll`.
- `descriptores.test.ts` exige que cada campo esté mapeado o descartado con un motivo.

Lo que se puede calcular no se guarda: la próxima toma, el cumplimiento, los recordatorios, los gastos, la edad y la etapa, y la alerta de peso.

## Los cinco módulos (`/mascotas/[petId]`)

Se llega con «Centro de control» en cada tarjeta de mascota. Las pestañas siguen el patrón WAI-ARIA: se navegan con las flechas, Inicio y Fin. También se puede abrir un módulo directamente con un enlace del tipo `#vacunas`.

1. **Perfil, peso y rutina.**
   - Resumen con la edad y la etapa de vida (umbrales AAHA/AAFP según especie y tamaño), la edad aproximada si no hay fecha, el chip, la esterilización, el responsable y su contacto, el veterinario, la alimentación, la rutina y las notas importantes.
   - Curva de peso frente al peso ideal, con alerta si la desviación supera el ±10 %.
   - Tarjeta **Quién puede administrarla**.
2. **Vacunas.**
   - Catálogo por especie (WSAVA): perro con DHPPi y rabia como esenciales, y Lepto, Bordetella, corona e influenza como opcionales; gato con FVRCP y rabia esenciales, FeLV y clamidia opcionales; conejo y ave.
   - La próxima dosis se calcula y se puede editar. Cada vacuna registra lote, veterinario, clínica y costo, y se vincula al certificado subido en Documentos.
3. **Salud preventiva.**
   - Desparasitación interna (trimestral), antipulgas/garrapatas y filaria (mensuales), consultas, odontología, baño y estética, cirugías/hospitalización y otros gastos.
   - Cada registro lleva producto, dosis y vía, periodicidad (mensual, trimestral, semestral o anual), próxima aplicación calculada y costo.
4. **Medicamentos.**
   - Tipo, dosis, unidad (mg, ml, gotas, comprimido, pipeta, UI), frecuencia (cada 8, 12 o 24 h, semanal o mensual), vía, inicio y hora de la primera toma, fin, indicaciones y efectos secundarios.
   - Estados Activo, Completado y Suspendido.
   - La pauta de tomas se calcula. Se marca cada toma como «Aplicada» u «Omitida» y se muestra el porcentaje de cumplimiento.
5. **Exámenes, documentos y recordatorios.**
   - Recordatorios de los próximos 30 días: refuerzo de vacuna, preventivos, la siguiente toma, el próximo baño (según la rutina), el control de peso mensual y el cumpleaños (solo si la fecha de nacimiento es exacta). Cada uno se puede completar o posponer 7 días, y la clave incluye la fecha, así que completar un ciclo no tapa el siguiente.
   - Exámenes con el comparativo del Bloque N en especie `MASCOTA`: un informe humano se bloquea, y el SDMA, por ejemplo, solo se reconoce en mascotas.
   - Documentos en Drive.
   - Gastos por mes y categoría, sumando vacunas y cuidados.

## Administración por todos los familiares autorizados

Cambios en el backend (`Permisos.gs`, `Autorizacion.gs`, `Despacho.gs` y `Router.gs`, consolidados en `Pate.gs`):

- **El alcance incluye las mascotas a cargo** (`ampliarConMascotasACargo`). Quien alcanza al responsable de una mascota también alcanza a la mascota. Hasta ahora solo la alcanzaban el titular, quien tenía alcance `*` o quien la tenía asignada por su id. `Router.gs` lo aplica en cada petición leyendo `PERFIL_MASCOTA`.
- **Un MIEMBRO cuida de su mascota** (`VERBOS_MIEMBRO_SOBRE_MASCOTA`). Sobre una mascota a su alcance puede, además, editar la ficha (`EDITAR_PACIENTE`) y los tratamientos (`ESCRIBIR_MEDICACION`). Sobre una persona sigue sin poder hacerlo.
- **La especie la fija la hoja, no el cliente** (`fijarEspecies`). Antes de validar un lote, el router reemplaza la especie de cada mutación por el `tipo` que figura en `PACIENTES`. Sin esto, decir «MASCOTA» sobre una persona habría dado permisos de mascota.
- **Lo que sigue igual:** dar de alta o de baja una mascota es del titular, y un LECTOR solo consulta.

En la interfaz:

- El perfil explica la regla.
- El titular ve la lista concreta de accesos que alcanzan a la mascota, con su rol, el motivo y si administra o solo lee.
- En modo lectura se ocultan todas las acciones de escritura.

## Publicación

- **Hoja oficial:** versión 18 del despliegue activo, con la misma URL `/exec`. El código se verificó carácter a carácter con un hash antes y después del parche, y la app en vivo cargó Ajustes y las invitaciones sobre la v18.
- **Plantilla maestra:** el mismo `Pate.gs`, guardado.
- **Web:** `main` → Vercel.

## Pruebas

| Tipo | Qué cubren |
|---|---|
| Unitarias (vitest) | `cuidadoMascota.test.ts` (sobre de la ficha, edad y etapa, alerta de peso, catálogo y próximas fechas, pauta y cumplimiento, gastos, motor de recordatorios); `mascotasAcceso.test.ts` (alcance a cargo, permisos de miembro y lector, falsificación de especie y que `Router.gs` lo use de verdad); `administradoresMascota.test.ts`; la ida y vuelta en `repositorioBackend.test.ts`. |
| E2E | `mascota-centro.e2e.ts`, de O1 a O6: ficha completa, teclado y vacuna esencial, preventivo con gasto, tratamiento y tomas, recordatorios y examen veterinario, y modo lectura. |
| Accesibilidad (axe) | `mascota-centro-*`: los cinco módulos con y sin diálogo, con 0 violaciones. |
