const CACHE_NAME = 'speed-racer-v1'; // Increment this version number for new updates to force cache refresh
const urlsToCache = [
  // Core files
  '/', // Caches the root of your application
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',

  // Image files (Ensure these paths and filenames match your actual files and are case-sensitive)
  'images/race-car.png',
  'images/car_blue.png',
  'images/car_green.png',
  'images/obstacle.png',
  'images/obstacle_car.png', // Added: Was a 404 error
  'images/oil-slick.png',
  'images/coin.png',
  'images/shield.png',
  'images/nitro.png',
  'images/icon-192.png',
  'images/icon-512.png',
  'favicon.ico', // Added: Was a 404 error, create this file if it doesn't exist at your root

  // Sound files (Ensure these paths and filenames match your actual files and are case-sensitive)
  'sounds/music.mp3',
  'sounds/coin.mp3',
  'sounds/crash.mp3',
  'sounds/powerup.mp3',
  'sounds/countdown_tick.mp3',
  'sounds/click.mp3', // Added: Was a 404 error
  'sounds/race_go.mp3', // Added: Was a 404 error
];

// Install the service worker and cache all the app's assets
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching App Shell');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Service Worker: Cache.addAll failed', err);
      })
  );
  self.skipWaiting(); // Forces the waiting service worker to become the active service worker
});

// Activate event: Clean up old caches to prevent stale content
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) { // Delete any caches that are not the current version
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tell the active service worker to take control of the page immediately.
  return self.clients.claim();
});

// Fetch event: Serve cached content when offline, fall back to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // No cache hit, try fetching from network
        return fetch(event.request).catch(error => {
          // This catch block will execute if the network request also fails (e.g., offline)
          console.error('Service Worker: Fetch failed for:', event.request.url, error);
          // Optional: You could return a specific offline page here
          // For example, if you had an 'offline.html' page:
          // return caches.match('/offline.html');
        });
      })
  );
});