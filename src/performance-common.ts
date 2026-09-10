namespace PerformanceCommon {
    export type InterpolationPoint = readonly [number, number];
    export type AxisBracket = readonly [number, number, number];

    const seaLevelStandardTemperatureK = 288.15;
    const seaLevelStandardPressurePa = 101325;
    const standardTemperatureLapseRate = 0.0065;
    const feetToMeters = 0.3048;
    const knotsToMetersPerSecond = 0.5144444444444445;
    const standardPressureExponent = 5.2558797;
    const ratioOfSpecificHeats = 1.4;
    const specificGasConstantAir = 287.05287;

    export const interpolateLinear = (start: number, end: number, ratio: number) =>
        start + (end - start) * ratio;

    export const interpolatePoints = (
        points: readonly InterpolationPoint[],
        input: number,
    ): number => {
        if (!Number.isFinite(input) ||
            points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
            return NaN;
        }
        const sorted = [...points].sort(([x0], [x1]) => x0 - x1);
        if (sorted.some(([x], index) => index > 0 && x === sorted[index - 1][0])) {
            return NaN;
        }
        for (const [x, y] of sorted) {
            if (Math.abs(input - x) < 1e-9) {
                return y;
            }
        }
        for (let index = 1; index < sorted.length; index++) {
            const [x0, y0] = sorted[index - 1];
            const [x1, y1] = sorted[index];
            if (x0 < input && input < x1) {
                return interpolateLinear(y0, y1, (input - x0) / (x1 - x0));
            }
        }
        return NaN;
    };

    export const bracketAxis = (
        axis: readonly number[],
        input: number,
    ): AxisBracket | null => {
        if (!Number.isFinite(input) || axis.length === 0 ||
            axis.some((value, index) => !Number.isFinite(value) ||
                (index > 0 && value <= axis[index - 1]))) {
            return null;
        }
        for (let index = 0; index < axis.length; index++) {
            if (Math.abs(input - axis[index]) < 1e-9) {
                return [index, index, 0];
            }
            if (input < axis[index]) {
                if (index === 0) {
                    return null;
                }
                const lower = index - 1;
                return [lower, index, (input - axis[lower]) / (axis[index] - axis[lower])];
            }
        }
        return null;
    };

    export const feetPerNauticalMile = (fpm: number, knots: number) =>
        Number.isFinite(fpm) && Number.isFinite(knots) && knots > 0
            ? fpm * 60 / knots
            : NaN;

    export const calibratedToTrueAirspeed = (
        kcas: number,
        pressureAltitudeFeet: number,
        oatCelsius: number,
    ) => {
        if (![kcas, pressureAltitudeFeet, oatCelsius].every(Number.isFinite) ||
            kcas < 0 || oatCelsius <= -273.15) {
            return NaN;
        }
        const standardTemperatureK = seaLevelStandardTemperatureK -
            standardTemperatureLapseRate * pressureAltitudeFeet * feetToMeters;
        const actualTemperatureK = oatCelsius + 273.15;
        if (standardTemperatureK <= 0) {
            return NaN;
        }
        const pressureRatio = Math.pow(
            standardTemperatureK / seaLevelStandardTemperatureK,
            standardPressureExponent,
        );
        const seaLevelSpeedOfSound = Math.sqrt(
            ratioOfSpecificHeats * specificGasConstantAir * seaLevelStandardTemperatureK,
        );
        const calibratedMetersPerSecond = kcas * knotsToMetersPerSecond;
        const seaLevelMachSquared = Math.pow(
            calibratedMetersPerSecond / seaLevelSpeedOfSound,
            2,
        );
        const impactPressure = seaLevelStandardPressurePa * (
            Math.pow(
                1 + (ratioOfSpecificHeats - 1) / 2 * seaLevelMachSquared,
                ratioOfSpecificHeats / (ratioOfSpecificHeats - 1),
            ) - 1
        );
        const staticPressure = seaLevelStandardPressurePa * pressureRatio;
        const localMachSquared = 2 / (ratioOfSpecificHeats - 1) * (
            Math.pow(
                impactPressure / staticPressure + 1,
                (ratioOfSpecificHeats - 1) / ratioOfSpecificHeats,
            ) - 1
        );
        if (localMachSquared < 0) {
            return NaN;
        }
        const localSpeedOfSound = Math.sqrt(
            ratioOfSpecificHeats * specificGasConstantAir * actualTemperatureK,
        );
        return Math.sqrt(localMachSquared) * localSpeedOfSound / knotsToMetersPerSecond;
    };
}
