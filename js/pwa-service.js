if ('serviceWorker' in navigator) {
  console.info('service worker supported');
  if (location.protocol === 'file:') {
    console.warn('Service Worker registration skipped on file: protocol.');
  } else {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    window.addEventListener('load', async () => {
      console.info('registering service-worker.js');
      try {
        await navigator.serviceWorker.register('service-worker.js');
        console.info('service worker registered');
      } catch (error) {
        console.error('service worker registration failed', error);
      }
    });
  }
} else {
  console.info('service worker not supported');
}
