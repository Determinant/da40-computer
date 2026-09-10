namespace FlightTools {
    export type WindTriangle = {
        windCorrectionAngle: number;
        trueHeading: number;
        groundSpeed: number;
    };

    const nauticalMileFeet = 6076.12;
    const degreesToRadians = (degrees: number) => degrees / 180 * Math.PI;
    const radiansToDegrees = (radians: number) => radians / Math.PI * 180;

    export const calculateWindTriangle = (
        trueCourse: number,
        trueAirspeed: number,
        windDirection: number,
        windSpeed: number,
    ): WindTriangle | null => {
        if (![trueCourse, trueAirspeed, windDirection, windSpeed].every(Number.isFinite) ||
            trueAirspeed <= 0 || windSpeed < 0) {
            return null;
        }
        const windAngle = degreesToRadians(windDirection - trueCourse);
        const crosswind = Math.sin(windAngle) * windSpeed;
        const correctionRatio = crosswind / trueAirspeed;
        if (Math.abs(correctionRatio) > 1) {
            return null;
        }
        const correction = Math.asin(correctionRatio);
        const groundSpeed = trueAirspeed * Math.cos(correction) -
            Math.cos(windAngle) * windSpeed;
        if (!(groundSpeed > 0)) {
            return null;
        }
        const windCorrectionAngle = radiansToDegrees(correction);
        return {
            windCorrectionAngle,
            trueHeading: trueCourse + windCorrectionAngle,
            groundSpeed,
        };
    };

    export const descentDistance = (altitudeFeet: number, slopeDegrees: number) =>
        altitudeFeet / (nauticalMileFeet * Math.tan(degreesToRadians(slopeDegrees)));

    export const standardRateBank = (trueAirspeedKnots: number) =>
        radiansToDegrees(Math.atan(trueAirspeedKnots / 364));

    const hasStringValue = (element: Element): element is Element & { value: string } =>
        typeof (element as Element & { value?: unknown }).value === 'string';

    const getText = (element: Element | null) => {
        if (!element) {
            return '';
        }
        return hasStringValue(element) ? element.value : element.textContent ?? '';
    };

    const parseValue = (element: Element | null, defaultValue = NaN) => {
        const text = getText(element).trim();
        if (text === '') {
            return defaultValue;
        }
        const value = Number(text);
        return Number.isFinite(value) ? value : NaN;
    };

    const parsePositive = (element: Element | null, defaultValue = NaN) => {
        const value = parseValue(element, defaultValue);
        return value >= 0 ? value : NaN;
    };

    const parseDirection = (element: Element | null, defaultValue = NaN) => {
        const value = parseValue(element, defaultValue);
        return 0 <= value && value <= 360 ? value : NaN;
    };

    const setText = (element: Element | null, value: string) => {
        if (!element) {
            return;
        }
        if (hasStringValue(element)) {
            element.value = value;
        } else {
            element.textContent = value;
        }
    };

    const formatNumber = (value: number, digits = 0) =>
        Number.isFinite(value) ? value.toFixed(digits) : '';

    export const formatDirection = (value: number) => {
        if (!Number.isFinite(value)) {
            return '';
        }
        const rounded = Math.round(value);
        const wrapped = ((rounded - 1) % 360 + 360) % 360 + 1;
        return String(wrapped).padStart(3, '0');
    };

    const withinDirectionRange = (direction: number, from: number, to: number) => {
        const normalize = (value: number) => (value % 360 + 360) % 360;
        const normalizedDirection = normalize(direction);
        const normalizedFrom = normalize(from);
        const normalizedTo = normalize(to);
        return normalizedFrom <= normalizedTo
            ? normalizedFrom <= normalizedDirection && normalizedDirection <= normalizedTo
            : normalizedDirection >= normalizedFrom || normalizedDirection <= normalizedTo;
    };

    const registerPair = (root: HTMLElement, firstSelector: string, secondSelector: string) => {
        const first = root.querySelector<HTMLInputElement>(firstSelector);
        const second = root.querySelector<HTMLInputElement>(secondSelector);
        if (!first || !second) {
            return;
        }
        const register = (input: HTMLInputElement, counterpart: HTMLInputElement) => {
            input.addEventListener('focus', () => {
                input.classList.add('active');
                if (counterpart.classList.contains('active')) {
                    setText(counterpart, '');
                    counterpart.classList.remove('active');
                }
            });
            input.addEventListener('blur', () => input.classList.remove('active'));
        };
        register(first, second);
        register(second, first);
    };

    export const initialize = (root: HTMLElement, afterRefresh?: () => void) => {
        let fpmSource: 'rate' | 'gradient' | undefined;
        const query = <T extends Element>(selector: string) => root.querySelector<T>(selector);

        const refresh = () => {
            const windDirection = parseDirection(query('.wc-dir'));
            const windSpeed = parsePositive(query('.wc-vel'));
            const runway = parseValue(query('.wc-rwy'));
            const runwayDirection = Number.isInteger(runway) && 1 <= runway && runway <= 36
                ? runway * 10
                : NaN;
            const relativeWind = degreesToRadians(runwayDirection - windDirection);
            const crosswind = Math.round(Math.sin(relativeWind) * windSpeed);
            setText(query('.wc-cross'), Number.isNaN(crosswind)
                ? ''
                : crosswind === 0
                    ? '0'
                    : crosswind > 0
                        ? `${formatNumber(crosswind)} →`
                        : `← ${formatNumber(-crosswind)}`);
            setText(query('.wc-head'), formatNumber(Math.round(Math.cos(relativeWind) * windSpeed)));

            const inbound = query<HTMLInputElement>('.h-in');
            const outbound = query<HTMLInputElement>('.h-out');
            if (inbound?.classList.contains('active')) {
                setText(outbound, formatDirection((parseDirection(inbound) + 180) % 360));
            } else if (outbound?.classList.contains('active')) {
                setText(inbound, formatDirection((parseDirection(outbound) + 180) % 360));
            }
            const heading = parseDirection(query('.h-hdg'));
            const outboundCourse = parseDirection(outbound);
            let holdingType = '';
            if (Number.isFinite(outboundCourse) && Number.isFinite(heading)) {
                const leftTurns = query<HTMLInputElement>('.h-left')?.checked ?? false;
                if (leftTurns) {
                    holdingType = withinDirectionRange(outboundCourse, heading + 110, heading - 70)
                        ? 'D'
                        : withinDirectionRange(outboundCourse, heading + 1, heading + 110)
                            ? 'P'
                            : 'T';
                } else {
                    holdingType = withinDirectionRange(outboundCourse, heading + 70, heading - 110)
                        ? 'D'
                        : withinDirectionRange(outboundCourse, heading, heading + 70)
                            ? 'T'
                            : 'P';
                }
            }
            setText(query('.h-type'), holdingType);

            const variation = parseValue(query('.vr'), 0);
            const trueCourse = parseDirection(query('.tc'));
            const e6bWindSpeed = parsePositive(query('.winvel'));
            const e6bWindDirection = e6bWindSpeed === 0
                ? parseDirection(query('.windir'), 0)
                : parseDirection(query('.windir'));
            const trueAirspeed = parsePositive(query('.tas'));
            const triangle = calculateWindTriangle(
                trueCourse,
                trueAirspeed,
                e6bWindDirection,
                e6bWindSpeed,
            );
            if (triangle && Number.isFinite(variation)) {
                setText(query('.hdg'),
                    `${formatDirection(triangle.trueHeading + variation)}M,` +
                    `${formatDirection(triangle.trueHeading)}T`);
                setText(query('.gs'), formatNumber(triangle.groundSpeed));
            } else {
                setText(query('.hdg'), '');
                setText(query('.gs'), '');
            }

            let slope = parsePositive(query('.d-slope'));
            if (slope >= 90) {
                slope = NaN;
            }
            const descentGroundSpeed = parsePositive(query('.d-gs'));
            const descentHeight = parsePositive(query('.d-alt'));
            setText(query('.d-dist'), formatNumber(descentDistance(descentHeight, slope), 1));
            setText(query('.d-rate'), formatNumber(Math.ceil(
                descentGroundSpeed * nauticalMileFeet / 60 * Math.tan(degreesToRadians(slope)),
            )));

            setText(query('.t-bank'), formatNumber(Math.round(
                standardRateBank(parsePositive(query('.t-tas'))),
            )));

            const pairedConversions = [
                ['.c-cel', '.c-fah', (value: number) => value * 1.8 + 32,
                    (value: number) => (value - 32) * 5 / 9, 2],
                ['.c-nm', '.c-sm', (value: number) => value * 1.15078,
                    (value: number) => value * 0.868976, 2],
                ['.c-ft', '.c-m', (value: number) => value * 0.3048,
                    (value: number) => value / 0.3048, 0],
                ['.c-lb', '.c-kg', (value: number) => value * 0.45359237,
                    (value: number) => value / 0.45359237, 0],
            ] as const;
            for (const [firstSelector, secondSelector, firstToSecond, secondToFirst, digits]
                of pairedConversions) {
                const first = query<HTMLInputElement>(firstSelector);
                const second = query<HTMLInputElement>(secondSelector);
                if (first?.classList.contains('active')) {
                    setText(second, formatNumber(firstToSecond(parseValue(first)), digits));
                } else if (second?.classList.contains('active')) {
                    setText(first, formatNumber(secondToFirst(parseValue(second)), digits));
                }
            }

            const fpmGroundSpeed = parsePositive(query('.fpm-gs'));
            const fpmRate = query<HTMLInputElement>('.fpm-rate');
            const fpmGradient = query<HTMLInputElement>('.fpm-gradient');
            if (fpmSource === 'rate') {
                setText(fpmGradient, formatNumber(PerformanceCommon.feetPerNauticalMile(
                    parseValue(fpmRate),
                    fpmGroundSpeed,
                )));
            } else if (fpmSource === 'gradient') {
                const gradient = parseValue(fpmGradient);
                setText(fpmRate, formatNumber(
                    Number.isFinite(gradient) && Number.isFinite(fpmGroundSpeed) && fpmGroundSpeed > 0
                        ? gradient * fpmGroundSpeed / 60
                        : NaN,
                ));
            }

            afterRefresh?.();
        };

        registerPair(root, '.h-in', '.h-out');
        registerPair(root, '.c-cel', '.c-fah');
        registerPair(root, '.c-nm', '.c-sm');
        registerPair(root, '.c-ft', '.c-m');
        registerPair(root, '.c-lb', '.c-kg');
        registerPair(root, '.fpm-rate', '.fpm-gradient');
        query<HTMLInputElement>('.fpm-rate')?.addEventListener('input', () => {
            fpmSource = 'rate';
        });
        query<HTMLInputElement>('.fpm-gradient')?.addEventListener('input', () => {
            fpmSource = 'gradient';
        });
        for (const input of root.querySelectorAll<HTMLInputElement>('input.update')) {
            input.addEventListener('input', refresh);
        }
        refresh();
        return refresh;
    };
}
