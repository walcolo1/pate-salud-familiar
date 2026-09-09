const CACHE_NAME = 'pate-salud-shell-v1';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/onboarding',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.ico'
];

// Instalar el Service Worker y pre-cachear los assets estáticos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-cacheando App Shell...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activar el Service Worker y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Limpiando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar y responder con estrategia de cache Stale-While-Revalidate
// Evita cachear de forma explícita cualquier tipo de petición de datos clínicos.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Solo interceptar peticiones GET dentro de nuestro origen
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // No cachear de ninguna manera documentos médicos
  if (url.pathname.includes('/documents') || (url.pathname.includes('/members/') && url.pathname.includes('/documents'))) {
    return;
  }
  
  // Evitar interceptar recargas de desarrollo HMR (Hot Module Replacement)
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.includes('/__next_js_original_')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar recurso cacheado y actualizar caché en segundo plano
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch((err) => console.log('[Service Worker] Error en recarga de segundo plano:', err));
        
        return cachedResponse;
      }

      // Si no está en caché, traer de la red
      return fetch(event.request).then((networkResponse) => {
        // Guardar dinámicamente recursos estáticos (CSS, JS, imágenes de nuestro origen)
        if (
          networkResponse.status === 200 &&
          (url.pathname.startsWith('/_next/static/') ||
           url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.css') ||
           url.pathname.endsWith('.svg') ||
           url.pathname.endsWith('.woff2'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return networkResponse;
      }).catch(() => {
        // Soporte offline para navegación de páginas HTML principales
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// C3.2 · Avisos locales
//
// La notificacion la crea la pagina con registration.showNotification(); aqui
// solo se atiende el clic. Se hace en el Service Worker y no en la pagina
// porque el clic puede llegar cuando la pestaña ya no existe.
//
// El cuerpo del aviso NUNCA lleva datos clinicos: eso se decide y se prueba en
// src/lib/avisosLocales.ts. Aqui tampoco se lee nada del expediente.
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // El destino viaja en `data.url`. Si no viene, la lista de recordatorios.
  const destino = new URL(event.notification.data?.url || '/reminders', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      // Si la aplicacion ya esta abierta se reutiliza esa ventana: abrir una
      // segunda deja dos copias del expediente vivas a la vez.
      for (const cliente of clientes) {
        if (new URL(cliente.url).origin !== self.location.origin) continue;
        if ('focus' in cliente) {
          if ('navigate' in cliente && cliente.url !== destino) {
            return cliente.navigate(destino).then((c) => (c || cliente).focus());
          }
          return cliente.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(destino) : undefined;
    }),
  );
});
