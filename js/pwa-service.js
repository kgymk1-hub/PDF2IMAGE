const DEBUG = new URLSearchParams(location.search).has("debug");

function debugLog(...args) {
  if (DEBUG) console.info(...args);
}

function debugWarn(...args) {
  if (DEBUG) console.warn(...args);
}

if ("serviceWorker" in navigator) {
  debugLog("service worker supported");
  if (location.protocol === "file:") {
    debugWarn("Service Worker registration skipped on file: protocol.");
  } else {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    window.addEventListener("load", async () => {
      debugLog("registering service-worker.js");
      try {
        await navigator.serviceWorker.register("service-worker.js");
        debugLog("service worker registered");
      } catch (error) {
        console.error("service worker registration failed", error);
      }
    });
  }
} else {
  debugLog("service worker not supported");
}
