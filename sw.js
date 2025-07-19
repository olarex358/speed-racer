const CACHE_NAME = 'speed-racer-v1';
const urlsToCache = [
  // Core files
  '.',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',

  // Image files
  'images/race-car.png',
  'images/car_blue.png',
  'images/car_green.png',
  'images/obstacle.png',
  'images/obstacle_car.png',
  'images/oil-slick.png',
  'images/coin.png',
  'images/shield.png',
  'images/nitro.png',
  'images/icon-192.png',
  'images/icon-512.png',

  // Sound files
  'sounds/music.mp3',
  'sounds/coin.mp3',
  'sounds/crash.mp3',
  'sounds/powerup.mp3',
  'sounds/countdown_tick.mp3',

];

// Install the service worker and cache all the app's assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Serve cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});