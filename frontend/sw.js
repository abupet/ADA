const ADA_SW_VERSION = '8.26.1';
const CACHE_NAME = 'ada-cache-' + ADA_SW_VERSION;
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
    './app-ai-petdesc.js',
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

    // Static JS/CSS/HTML: Stale-While-Revalidate
    // Serve from cache immediately, but fetch fresh version in background
    var isStaticAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html');

    if (isStaticAsset && url.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_NAME).then(function(cache) {
                return cache.match(event.request).then(function(cached) {
                    var fetchPromise = fetch(event.request).then(function(response) {
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    }).catch(function() { return cached; });
                    return cached || fetchPromise;
                });
            })
        );
        return;
    }

    // Other assets (images, CDN): Cache First with network fallback
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

// Handle messages from clients
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.source.postMessage({ type: 'SW_VERSION', version: ADA_SW_VERSION });
    }
    // Chiudi notifica chiamata se la chiamata è stata gestita dall'app
    if (event.data && event.data.type === 'DISMISS_CALL_NOTIFICATION' && event.data.callId) {
        self.registration.getNotifications({ tag: 'incoming-call-' + event.data.callId }).then(function(notifications) {
            notifications.forEach(function(n) { n.close(); });
        });
    }
});

// === Web Push notification handlers ===
self.addEventListener('push', function(event) {
    if (!event.data) return;
    var payload;
    try { payload = event.data.json(); } catch (e) { payload = { title: 'ADA', body: event.data.text() }; }

    var isCall = payload.data && payload.data.type === 'incoming_call';
    event.waitUntil(
        self.registration.showNotification(payload.title || 'ADA', {
            body: payload.body || '',
            icon: payload.icon || './logo-abupet.png',
            badge: payload.badge || './logo-abupet.png',
            tag: payload.tag || 'ada-default',
            renotify: true,
            requireInteraction: isCall,
            data: payload.data || {},
            actions: isCall
                ? [{ action: 'answer', title: 'Rispondi' }, { action: 'dismiss', title: 'Rifiuta' }]
                : [{ action: 'open', title: 'Apri' }, { action: 'dismiss', title: 'Ignora' }],
            vibrate: isCall ? [300, 200, 300, 200, 300, 200, 300] : [200, 100, 200]
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    var data = event.notification.data || {};
    var isCall = data.type === 'incoming_call';

    // Rifiuta chiamata
    if (event.action === 'dismiss') {
        if (isCall && data.callId && data.conversationId) {
            // Notifica il server del rifiuto tramite fetch
            event.waitUntil(
                fetch('./api/communication/conversations/' + data.conversationId + '/calls/' + data.callId + '/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }).catch(function() { /* offline, il timeout del server gestirà */ })
            );
        }
        return;
    }

    // Accetta chiamata o click generico: apri/focalizza l'app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // Se l'app è già aperta, fai focus e invia il messaggio
            for (var i = 0; i < windowClients.length; i++) {
                if ('focus' in windowClients[i]) {
                    windowClients[i].focus();
                    if (isCall) {
                        windowClients[i].postMessage({
                            type: 'incoming_call',
                            conversationId: data.conversationId,
                            callId: data.callId,
                            callType: data.callType
                        });
                    } else {
                        windowClients[i].postMessage({
                            type: 'navigate_to_conversation',
                            conversationId: data.conversationId
                        });
                    }
                    return;
                }
            }
            // App chiusa: apri una nuova finestra
            var targetUrl = './#communication';
            if (isCall && data.conversationId) {
                targetUrl = './#call-' + data.conversationId + '-' + (data.callId || '');
            } else if (data.conversationId) {
                targetUrl = './#conversation-' + data.conversationId;
            }
            return clients.openWindow(targetUrl);
        })
    );
});
