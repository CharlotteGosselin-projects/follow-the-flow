// Offline support. The service worker only serves this app's own files; it never contacts
// any other host and no user data passes through it.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || location.protocol === 'file:') return;

  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // An installed app can stay open for days: look for a new version whenever it comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});

  // When a new version takes over, reload once so the page runs the new code. Data is saved
  // on every change, so nothing is lost.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded) {
        reloaded = true;
        location.reload();
      }
    });
  }

  // Caches left by the previous, hand-written worker (ftf-v1 … ftf-v15).
  caches
    .keys()
    .then((keys) => Promise.all(keys.filter((k) => /^ftf-v\d+$/.test(k)).map((k) => caches.delete(k))))
    .catch(() => {});
}
