const CACHE_NAME = 'ai-chat-cache-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './worker.js',
    './manifest.json',
    'https://esm.run/@mlc-ai/web-llm' // WebLLMライブラリもキャッシュ
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // キャッシュがあればそれを返す
                if (response) {
                    return response;
                }
                // なければネットワークから取得
                return fetch(event.request);
            })
    );
});
