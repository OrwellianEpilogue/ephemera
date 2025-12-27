// Self-unregistering service worker
// Replaces the old PWA service worker to clear cached content
// Once this installs, it immediately unregisters and forces a fresh page load

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
    })
  );
});
