namespace E6BUI {
    const fields: { key: E6B.WindKey; label: string; unit: string }[] = [
        { key: 'course', label: 'Course', unit: '°T' },
        { key: 'tas', label: 'TAS', unit: 'kt' },
        { key: 'heading', label: 'Heading', unit: '°T' },
        { key: 'gs', label: 'GS', unit: 'kt' },
        { key: 'windDirection', label: 'Wind from', unit: '°T' },
        { key: 'windSpeed', label: 'Wind speed', unit: 'kt' },
    ];
    const counterparts: Partial<Record<E6B.WindKey, E6B.WindKey>> = {
        tas: 'gs', gs: 'tas', course: 'heading', heading: 'course',
    };
    const number = (n: number, digits = 2) => String(Number(n.toFixed(digits)));

    export const initialize = (root: HTMLElement) => {
        const inputs = new Map(fields.map(field => [field.key,
            root.querySelector<HTMLInputElement>(`[data-field="${field.key}"]`)!]));
        // Recency breaks ties when an edited output has no entered counterpart.
        const entered = new Map<E6B.WindKey, string>();
        const variation = root.querySelector<HTMLInputElement>('.e6b-variation')!;
        const wca = root.querySelector<HTMLElement>('.e6b-wca')!;
        const magneticHeading = root.querySelector<HTMLElement>('.e6b-mh')!;
        const messageRow = root.querySelector<HTMLTableRowElement>('.e6b-message')!;
        const message = root.querySelector<HTMLElement>('[role="status"]')!;
        const showMessage = (text: string) => {
            message.textContent = text;
            messageRow.hidden = !text;
        };
        const refresh = () => {
            wca.textContent = '';
            magneticHeading.textContent = '';
            showMessage('');
            const known: Partial<E6B.WindValues> = {};
            for (const [key, input] of inputs) {
                input.classList.remove('calculated');
                input.removeAttribute('title');
                if (entered.has(key)) known[key] = Number(entered.get(key));
                else input.value = '';
            }
            if (known.windSpeed === 0 && !entered.has('windDirection') && entered.size === 3) {
                known.windDirection = 0;
            }
            const unknowns = fields.filter(field => known[field.key] === undefined).map(field => field.key);
            if (unknowns.length > 2) return;
            try {
                const correction = Number(variation.value.trim() || '0');
                if (!Number.isFinite(correction) || Math.abs(correction) > 180) {
                    throw new Error('Variation must be between −180° and +180°.');
                }
                const answers = E6B.solveWind(known, unknowns);
                if (answers.length > 1) {
                    showMessage('Two solutions: ' + answers.map(answer => unknowns.map(key => {
                        const field = fields.find(item => item.key === key)!;
                        return `${field.label} ${number(answer[key], 1)} ${field.unit}`;
                    }).join(', ')).join('; ') + '.');
                    return;
                }
                const answer = answers[0];
                for (const key of unknowns) {
                    const input = inputs.get(key)!;
                    input.value = number(answer[key]);
                    input.classList.add('calculated');
                    input.title = 'Calculated';
                }
                const correctionAngle = E6B.windCorrection(answer.heading, answer.course);
                wca.textContent = `${number(Math.abs(correctionAngle), 1)}°` +
                    (Math.abs(correctionAngle) < 0.05 ? '' : correctionAngle < 0 ? ' L' : ' R');
                magneticHeading.textContent = String(Math.round(
                    E6B.trueToMagnetic(answer.heading, correction),
                ) || 360).padStart(3, '0') + '°';
            } catch (error) {
                showMessage(error instanceof Error ? error.message : 'Check the entered values.');
            }
        };
        root.addEventListener('input', event => {
            if (!(event.target instanceof HTMLInputElement)) return;
            const key = fields.find(field => inputs.get(field.key) === event.target)?.key;
            if (key) {
                const value = event.target.value.trim();
                entered.delete(key);
                if (value) entered.set(key, value);
                // Calm wind supplies the fourth constraint without a direction entry.
                const limit = !entered.has('windDirection') && Number(entered.get('windSpeed')) === 0 ? 3 : 4;
                if (entered.size > limit) {
                    const counterpart = counterparts[key];
                    entered.delete(counterpart && entered.has(counterpart)
                        ? counterpart : entered.keys().next().value!);
                }
            }
            refresh();
        });
        root.querySelector('.e6b-clear')!.addEventListener('click', () => {
            entered.clear();
            variation.value = '';
            refresh();
        });
        refresh();
    };
}

const e6bRoot = document.getElementById('e6b');
if (e6bRoot) E6BUI.initialize(e6bRoot);
