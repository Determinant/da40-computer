// Runs in <head> so a saved dark preference is applied before first paint.
(() => {
    const storageKey = 'flight-computer-theme';
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    let preference: string | null = null;
    try {
        preference = localStorage.getItem(storageKey);
    } catch {
        // Theme switching also works when browser storage is unavailable.
    }
    const apply = (dark: boolean) => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.querySelector('meta[name="theme-color"]')?.setAttribute(
            'content', dark ? '#101722' : '#172033',
        );
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.textContent = dark ? 'Light mode' : 'Dark mode';
            button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        }
    };
    const refresh = () => apply(preference === 'dark' ||
        (preference !== 'light' && system.matches));
    refresh();
    system.addEventListener('change', refresh);
    window.addEventListener('storage', event => {
        if (event.key === storageKey || event.key === null) {
            preference = event.newValue;
            refresh();
        }
    });
    document.addEventListener('DOMContentLoaded', () => {
        refresh();
        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            refresh();
            try {
                localStorage.setItem(storageKey, preference);
            } catch {
                // Keep the selected theme for this page even without storage.
            }
        });
    });
})();
