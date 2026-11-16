import { useSyncExternalStore } from 'react';

/**
 * "Install app" support. Chrome, Edge and Android browsers announce that the app can be installed
 * with a `beforeinstallprompt` event, which fires once, early. We keep it here so any component
 * can offer an Install button later. Safari and Firefox don't send it (Safari users install with
 * Share, then Add to Home Screen), so there the button simply never appears.
 */
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** Call once at start-up, before the app renders. */
export function watchInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => deferred !== null;

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const install = async () => {
    if (!deferred) return 'unavailable';
    const prompt = deferred;
    deferred = null; // a prompt can only be used once
    emit();
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome; // 'accepted' | 'dismissed'
  };
  return { canInstall, install };
}
