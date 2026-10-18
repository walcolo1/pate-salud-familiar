# Paté · Salud Familiar — notas de versión v1.1.0

Detalle técnico en [`K-SESION-MASCOTAS-AJUSTES.md`](K-SESION-MASCOTAS-AJUSTES.md).

## Lo nuevo

- **La sesión se mantiene.** Ya no aparece «Tu sesión de Google no está
  activa» al recargar, al reabrir la aplicación o a la hora de uso. La sesión
  dura 30 días y se renueva sola mientras se use; se termina al cerrar sesión o
  al retirar el acceso en la hoja.
- **Mascotas en primer nivel.** Nueva sección Mascotas en la navegación, bloque
  «Mis mascotas» en el panel principal y alta directa eligiendo quién está a
  cargo; en un clic, su peso, vacunas e historial.
- **Las mascotas se guardan en la hoja de la familia**, con sus pesos, vacunas
  e historial veterinario. Las que solo estaban en un navegador se suben solas
  la primera vez.
- **Ajustes más sencillo.** Estado real de la sesión, la dirección de la hoja
  plegada, herramientas técnicas agrupadas y sin restos de versiones
  anteriores. La barra lateral dice «Hoja familiar · Conectada».
- Accesibilidad: el título de un examen al pasar el puntero cumple el
  contraste AA.

## Esquema de la hoja: v6

`PERFIL_MASCOTA.responsable_id` y `HISTORIAL.profesional`, al final de su
pestaña. `instalar()` las añade sin tocar nada más.

## Actualizar

Ver «Actualizar la hoja oficial a v6» en `K-SESION-MASCOTAS-AJUSTES.md`:
pegar `Pate.gs`, ejecutar `instalar`, publicar una versión nueva de la misma
implementación (la URL `/exec` no cambia) y desplegar la web.
