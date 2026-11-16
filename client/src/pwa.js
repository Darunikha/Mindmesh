import { watchInstallPrompt } from './hooks/useInstallPrompt.js';

/**
 * Turns on the installable-app features. The service worker is only registered in the production
 * build: in development it would serve stale files and get in the way of hot reloading.
 */
export function startPwa() {
  watchInstallPrompt();
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* e.g. a private window that blocks service workers: the app works the same without it */
    });
  });
}
