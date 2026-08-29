// Suba esse número (ou use um hash/data do build) toda vez que style.css,
// app.js ou index.html mudarem. Isso é o que faz o navegador enxergar um
// Service Worker "novo", instalar um cache novo e descartar o antigo.
const CACHE_NAME = 'saldosimples-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      // Não espera todas as abas fecharem: ativa o novo SW assim que instalado.
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Apaga qualquer cache de uma versão anterior (ex: saldosimples-v1).
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Assume o controle das abas já abertas sem precisar de reload manual.
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Estratégia "stale-while-revalidate": responde rápido com o que já está
  // em cache, mas em paralelo busca a versão nova na rede e atualiza o
  // cache para a PRÓXIMA visita. Assim, um deploy novo aparece no máximo
  // um reload depois, em vez de nunca (como no cache-first puro).
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      });
    })
  );
});