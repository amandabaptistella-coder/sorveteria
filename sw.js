// ============================================================
//  SORVETERIA — Service Worker
//  Faz o painel abrir instantaneamente (e funcionar offline).
//  Antes, sem conexão, o usuário não via nem a interface: o
//  index.html só chegava depois da rede responder.
// ============================================================

// Mude esta versão a cada publicação do painel para forçar a troca do shell.
const VERSAO = 'sorveteria-v2';
const SHELL = ['./', './index.html', './manifest.json', './icone.svg'];

// ── Instalação: guarda o shell ────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(VERSAO)
      .then(function(c) { return c.addAll(SHELL); })
      // Um item que falhe (ex.: ícone ausente) não pode impedir a instalação
      .catch(function() { return caches.open(VERSAO).then(function(c){ return c.add('./index.html'); }); })
      .then(function() { return self.skipWaiting(); })
  );
});

// ── Ativação: descarta caches de versões antigas ──────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(nomes) {
        return Promise.all(nomes.filter(function(n) { return n !== VERSAO; })
                               .map(function(n) { return caches.delete(n); }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

// ── Busca ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Chamadas ao Apps Script NÃO passam por aqui: quem cuida dos dados é o
  // IndexedDB do app, que sabe quando o dado está velho e precisa revalidar.
  if (url.hostname.indexOf('script.google.com') >= 0 ||
      url.hostname.indexOf('googleusercontent.com') >= 0) return;

  // Navegação e shell: responde do cache na hora e revalida em segundo plano
  // (stale-while-revalidate). É o que faz o painel abrir instantâneo.
  if (req.mode === 'navigate' || SHELL.some(function(p) { return url.pathname.endsWith(p.replace('./', '/')); })) {
    e.respondWith(
      caches.open(VERSAO).then(function(cache) {
        return cache.match(req, {ignoreSearch: true}).then(function(cacheado) {
          const rede = fetch(req).then(function(resp) {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(function() { return null; });

          // Tem cache? entrega já. Senão, espera a rede.
          return cacheado || rede.then(function(r) {
            return r || new Response(
              '<meta charset="utf-8"><h1>Sem conexão</h1>' +
              '<p>O painel ainda não foi carregado neste dispositivo. ' +
              'Conecte-se uma vez para que ele fique disponível offline.</p>',
              {headers: {'Content-Type': 'text/html; charset=utf-8'}, status: 200}
            );
          });
        });
      })
    );
    return;
  }

  // Demais recursos (fontes, etc.): cache primeiro, rede como reserva
  e.respondWith(
    caches.match(req).then(function(c) {
      return c || fetch(req).then(function(resp) {
        if (resp && resp.ok && url.origin === self.location.origin) {
          caches.open(VERSAO).then(function(cache) { cache.put(req, resp.clone()); });
        }
        return resp;
      }).catch(function() { return c; });
    })
  );
});

// Permite que a página peça a ativação imediata de uma versão nova
self.addEventListener('message', function(e) {
  if (e.data === 'ativar-agora') self.skipWaiting();
});
