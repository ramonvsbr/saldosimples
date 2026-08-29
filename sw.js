// Suba esse número (ou use um hash/data do build) toda vez que style.css,
// app.js ou index.html mudarem. Isso é o que faz o navegador enxergar um
// Service Worker "novo", instalar um cache novo e descartar o antigo.
//
// Subimos pra v3 aqui porque a lógica de fetch mudou: sem isso, celulares
// que já tenham o SW v2 ativo continuariam rodando a versão com bug até
// o navegador decidir checar por uma atualização por conta própria.
const CACHE_NAME = 'saldosimples-v4';

// Só usamos '/' (nunca '/index.html') porque a Cloudflare, por padrão,
// redireciona /index.html -> / (html_handling: "auto-trailing-slash" no
// wrangler.toml). Cachear a URL '/index.html' guardava uma entrada que,
// numa navegação real, o navegador nunca ia bater — daí o cachedResponse
// vinha undefined bem na hora em que o cache.put() do redirect falhava.
//
// As páginas secundárias entram aqui também para que, mesmo no primeiro
// acesso a elas offline (ou com rede instável no celular), já exista uma
// resposta em cache em vez de depender só da rede.
const ASSETS_TO_CACHE = [
  '/',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/manifest.json',
  '/sobre.html',
  '/contato.html',
  '/privacidade.html',
  '/termos.html'
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
  // A Cache API só aceita gravar respostas de requisições GET (POST lança
  // erro na hora). Como este app manda POST para /api/login, /api/register
  // e /api/sync, deixamos qualquer coisa que não seja GET passar direto
  // para a rede, sem passar pelo cache — essas chamadas nunca deveriam
  // ter sido interceptadas por uma estratégia de cache de página estática.
  if (event.request.method !== 'GET') {
    return;
  }

  // Estratégia "stale-while-revalidate": responde rápido com o que já está
  // em cache, mas em paralelo busca a versão nova na rede e atualiza o
  // cache para a PRÓXIMA visita. Assim, um deploy novo aparece no máximo
  // um reload depois, em vez de nunca (como no cache-first puro).
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          // Guardamos a resposta ANTES de tentar gravar no cache, para que
          // uma falha em cache.put() (ex.: resposta redirecionada numa
          // navegação — não é permitido cachear isso) nunca derrube a
          // resposta de verdade que a rede já entregou.
          if (networkResponse && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone()).catch((err) => {
              console.warn('SW: não foi possível cachear', event.request.url, err);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      });
    })
  );
});