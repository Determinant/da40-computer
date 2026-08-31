const pwaStatus = document.getElementById('pwa-status');
let pwaStatusTimer: number | undefined;

const showPwaStatus = (message: string, persistent = false) => {
    if (!pwaStatus) {
        return;
    }

    window.clearTimeout(pwaStatusTimer);
    pwaStatus.textContent = message;
    pwaStatus.hidden = false;
    if (!persistent) {
        pwaStatusTimer = window.setTimeout(() => {
            pwaStatus.hidden = true;
        }, 5000);
    }
};

const isInstalledPwa = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const requestPersistentStorage = async () => {
    if (!isInstalledPwa() || !navigator.storage?.persisted || !navigator.storage.persist) {
        return;
    }

    if (!await navigator.storage.persisted()) {
        await navigator.storage.persist();
    }
};

const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const hadController = navigator.serviceWorker.controller !== null;
    try {
        await navigator.serviceWorker.register('./sw.js', {
            scope: './',
            updateViaCache: 'none',
        });
        if (hadController) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                showPwaStatus('Offline app updated; reopen it to use the new version.');
            }, { once: true });
        }
        await navigator.serviceWorker.ready;
        await requestPersistentStorage().catch(() => undefined);
        showPwaStatus(navigator.onLine ? 'Ready for offline use' : 'Working offline', !navigator.onLine);
    } catch (error) {
        console.error('Could not prepare the app for offline use.', error);
        showPwaStatus('Offline setup unavailable. Reconnect and reopen the app.', true);
    }
};

window.addEventListener('offline', () => showPwaStatus('Working offline', true));
window.addEventListener('online', () => showPwaStatus('Back online'));
window.addEventListener('load', () => void registerServiceWorker(), { once: true });
