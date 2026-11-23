namespace E6B {
    const normalize = (degrees: number) => (degrees % 360 + 360) % 360;
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const degrees = (radians: number) => radians * 180 / Math.PI;
    type Vector = [number, number];
    const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1]];
    const scale = (a: Vector, k: number): Vector => [a[0] * k, a[1] * k];
    const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1];
    const length = (a: Vector) => Math.hypot(...a);
    const unit = (angle: number): Vector => [Math.sin(radians(angle)), Math.cos(radians(angle))];
    const bearing = (v: Vector) => length(v) < 1e-8 ? 0 : normalize(degrees(Math.atan2(v[0], v[1])));
    const cross = (a: Vector, b: Vector) => a[0] * b[1] - a[1] * b[0];

    export type WindValues = {
        course: number;
        heading: number;
        tas: number;
        gs: number;
        windDirection: number;
        windSpeed: number;
    };
    export type WindKey = keyof WindValues;
    // All directions use one common north reference; windDirection is FROM.
    // air - windFrom - ground = 0, in east/north coordinates.
    const vectors = [
        { angle: 'heading', speed: 'tas', sign: 1 },
        { angle: 'windDirection', speed: 'windSpeed', sign: -1 },
        { angle: 'course', speed: 'gs', sign: -1 },
    ] as const;

    export const solveWind = (known: Partial<WindValues>, unknowns: readonly WindKey[]): WindValues[] => {
        if (unknowns.length !== 2 || new Set(unknowns).size !== 2 ||
            unknowns.some(key => !vectors.some(v => v.angle === key || v.speed === key))) {
            throw new Error('Choose two different quantities to calculate.');
        }
        const value = { ...known } as WindValues;
        for (const v of vectors) {
            for (const key of [v.angle, v.speed]) {
                if (unknowns.includes(key)) continue;
                const n = value[key];
                if (!Number.isFinite(n) || (key === v.angle ? n < 0 || n > 360
                    : key === 'windSpeed' ? n < 0 : n <= 0)) {
                    throw new Error('Enter directions from 0 to 360°, positive TAS/GS, and nonnegative wind speed.');
                }
            }
        }
        // Calm wind has no direction. A blank known direction is handled by the UI.
        const pending = vectors.filter(v => unknowns.includes(v.angle) || unknowns.includes(v.speed));
        const sum = vectors.filter(v => !pending.includes(v)).reduce<Vector>(
            (total, v) => add(total, scale(unit(value[v.angle]), v.sign * value[v.speed])), [0, 0],
        );
        const candidates: WindValues[] = [];
        const accept = (result: WindValues) => {
            if (!Object.values(result).every(Number.isFinite) || result.tas <= 1e-8 ||
                result.gs <= 1e-8 || result.windSpeed < -1e-8) return;
            result.windSpeed = Math.max(0, result.windSpeed);
            result.course = normalize(result.course);
            result.heading = normalize(result.heading);
            result.windDirection = result.windSpeed < 1e-8 ? 0 : normalize(result.windDirection);
            const residual = vectors.reduce<Vector>((s, v) =>
                add(s, scale(unit(result[v.angle]), v.sign * result[v.speed])), [0, 0]);
            if (length(residual) > 1e-6 * Math.max(1, result.tas, result.gs, result.windSpeed)) return;
            if (!candidates.some(previous => vectors.every(v =>
                Math.abs(previous[v.speed] - result[v.speed]) < 1e-6 &&
                (result[v.speed] < 1e-8 || Math.abs(normalize(previous[v.angle] - result[v.angle] + 180) - 180) < 1e-6)))) {
                candidates.push(result);
            }
        };
        if (pending.length === 1) {
            const v = pending[0];
            const solved = scale(sum, -v.sign);
            accept({ ...value, [v.speed]: length(solved), [v.angle]: bearing(solved) });
        } else {
            const [a, b] = pending;
            const angleA = unknowns.includes(a.angle);
            const angleB = unknowns.includes(b.angle);
            if (!angleA && !angleB) {
                // Known directions: solve two linear equations for the speeds.
                const u = scale(unit(value[a.angle]), a.sign);
                const v = scale(unit(value[b.angle]), b.sign);
                const determinant = cross(u, v);
                if (Math.abs(determinant) < 1e-10) {
                    throw new Error('These parallel directions do not determine a unique pair of speeds. Change which values are known.');
                }
                const target = scale(sum, -1);
                accept({ ...value, [a.speed]: cross(target, v) / determinant,
                    [b.speed]: cross(u, target) / determinant });
            } else if (angleA && angleB) {
                // Known speeds: intersect the two circles of possible vectors.
                const target = scale(sum, -1);
                const d = length(target);
                const ra = value[a.speed];
                const rb = value[b.speed];
                if (d < 1e-10) throw new Error('These values do not determine unique directions. Change which values are known.');
                const along = (ra * ra - rb * rb + d * d) / (2 * d);
                const heightSquared = ra * ra - along * along;
                if (heightSquared >= -1e-8) {
                    const axis = scale(target, 1 / d);
                    const normal: Vector = [-axis[1], axis[0]];
                    for (const side of [1, -1]) {
                        const av = add(scale(axis, along), scale(normal, side * Math.sqrt(Math.max(0, heightSquared))));
                        const bv = add(target, scale(av, -1));
                        accept({ ...value, [a.angle]: bearing(scale(av, a.sign)),
                            [b.angle]: bearing(scale(bv, b.sign)) });
                    }
                }
            } else {
                // One direction and one speed: intersect a line with a circle.
                const direction = angleA ? a : b;
                const speed = angleA ? b : a;
                const axis = scale(unit(value[speed.angle]), speed.sign);
                const projection = dot(sum, axis);
                const discriminant = projection * projection + value[direction.speed] ** 2 - dot(sum, sum);
                if (discriminant >= -1e-8) {
                    for (const side of [1, -1]) {
                        const magnitude = -projection + side * Math.sqrt(Math.max(0, discriminant));
                        const solved = scale(add(sum, scale(axis, magnitude)), -direction.sign);
                        accept({ ...value, [speed.speed]: magnitude, [direction.angle]: bearing(solved) });
                    }
                }
            }
        }
        if (!candidates.length) throw new Error('No flyable solution: check the known values and wind strength.');
        return candidates;
    };

    export const trueToMagnetic = (direction: number, variation: number) => normalize(direction + variation);
    export const windCorrection = (heading: number, course: number) => normalize(heading - course + 180) - 180;
}
