// Keep rows in place so folding a section never changes its form values,
// calculation listeners, or independently hidden messages/configurations.
(() => {
    const storagePrefix = `flight-computer-section:${location.pathname}:`;
    for (const table of document.querySelectorAll<HTMLTableElement>('table.main')) {
        const rows = Array.from(table.rows);
        const sections = Array.from(table.querySelectorAll<HTMLButtonElement>('.section-toggle')).map(button => {
            const header = button.closest('tr')!;
            const start = rows.indexOf(header);
            const level = header.classList.contains('header0') ? 0 : 1;
            const storageKey = storagePrefix + button.id;
            let expanded = table.id !== 'tools';
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved === 'true' || saved === 'false') expanded = saved === 'true';
            } catch {
                // Use the defaults when browser storage is unavailable.
            }
            return { button, start, level, storageKey, expanded, rows: [] as HTMLTableRowElement[] };
        });

        const render = () => {
            for (const section of sections) {
                section.button.setAttribute('aria-expanded', String(section.expanded));
            }
            // Keep a child's own state when its parent is folded or reopened.
            for (const row of rows) {
                row.classList.toggle('section-collapsed', sections.some(section =>
                    !section.expanded && section.rows.includes(row)));
            }
        };

        for (const section of sections) {
            const next = sections.find(other => other.start > section.start && other.level <= section.level);
            section.rows = rows.slice(section.start + 1, next?.start);
            section.button.setAttribute('aria-controls', section.rows.map(row => {
                row.id ||= `${table.id}-row-${rows.indexOf(row)}`;
                return row.id;
            }).join(' '));
            section.button.addEventListener('click', () => {
                section.expanded = !section.expanded;
                render();
                try {
                    localStorage.setItem(section.storageKey, String(section.expanded));
                } catch {
                    // Folding still works for this visit without storage.
                }
            });
        }
        render();
    }
})();
