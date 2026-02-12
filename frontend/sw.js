const CACHE_NAME = 'ada-cache-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './config.js',
    './app-debug-logger.js',
    './app-loading.js',
    './app-openai-optimizations.js',
    './app-core.js',
    './app-recording.js',
    './app-soap.js',
    './app-tts.js',
    './app-data.js',
    './app-pets.js',
    './app-tips.js',
    './app-documents.js',
    './app-promo.js',
    './app-nutrition.js',
    './app-insurance.js',
    './app-communication.js',
    './app-webrtc.js',
    './app-admin.js',
    './app-observability.js',
    './app-testdata.js',
    './app-seed.js',
    './spa-redirect.js',
    './runtime-config.js',
    './logo-abupet.png',
    './logo-anicura.png',
    './manifest.json'
];

var CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            var localPromises = STATIC_ASSETS.map(function(url) {
                return cache.add(url).catch(function() {});
            });
            var cdnPromises = CDN_ASSETS.map(function(url) {
                return cache.add(url).catch(function() {});
            });
            return Promise.all(localPromises.concat(cdnPromises));
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;

    // API calls: Network First
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        event.respondWith(
            fetch(event.request).then(function(response) {
                return response;
            }).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Static assets & CDN: Cache First
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return fetch(event.request).then(function(response) {
                if (response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        }).catch(function() {
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});

// === Web Push notification handlers ===
self.addEventListener('push', function(event) {
    if (!event.data) return;
    var payload;
    try { payload = event.data.json(); } catch (e) { payload = { title: 'ADA', body: event.data.text() }; }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'ADA', {
            body: payload.body || '',
            icon: payload.icon || './logo-abupet.png',
            badge: payload.badge || './logo-abupet.png',
            tag: payload.tag || 'ada-default',
            renotify: true,
            data: payload.data || {},
            actions: [
                { action: 'open', title: 'Apri' },
                { action: 'dismiss', title: 'Ignora' }
            ],
            vibrate: [200, 100, 200]
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    if (event.action === 'dismiss') return;

    var data = event.notification.data || {};
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (var i = 0; i < windowClients.length; i++) {
                if ('focus' in windowClients[i]) {
                    windowClients[i].focus();
                    windowClients[i].postMessage({
                        type: 'navigate_to_conversation',
                        conversationId: data.conversationId
                    });
                    return;
                }
            }
            return clients.openWindow('./#conversation-' + (data.conversationId || ''));
        })
    );
});
