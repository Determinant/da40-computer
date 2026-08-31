type Bounds = {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
};

type ChartStep = {
    x: string;
    y: string;
    curves: string[];
    marks?: number[];
    getX: (input: number) => number | null;
    conservativePassThrough?: (input: number) => boolean;
    conservativeClampBelow?: (input: number) => boolean;
};

type ChartDefinition = {
    doc: string;
    svg: string;
    canvas: string;
    flipY?: boolean;
    lineWidth?: string;
    press: ChartStep;
    mass?: ChartStep;
    wind?: ChartStep;
    obst?: ChartStep;
    output: (value: number) => number;
};

type StepCalculator = (output: number | null, input: number) => number | null;
type ChartCalculator = (
    alt: number,
    oat: number,
    mass?: number,
    wind?: number,
    obst?: number,
) => number;

type WindTriangle = {
    windCorrectionAngle: number;
    trueHeading: number;
    groundSpeed: number;
};

type FuelMixture = 'bestEconomy' | 'bestPower';

type EnginePerformanceColumn = {
    power: number;
    rpm: number;
    fuelFlow: Record<FuelMixture, number | null>;
    manifoldPressure: (number | null)[];
    recommendedAltitude: readonly [number, number] | null;
};

type RecommendationPoint = {
    x: number;
    recommended: boolean;
};

type InterpolationPoint = readonly [number, number];

const interpolateLinear = (start: number, end: number, ratio: number) =>
    start + (end - start) * ratio;

const selectCurveBracket = (
    curveMarks: readonly number[],
    output: number,
): readonly [number, number] | null => {
    if (curveMarks.length === 0 || !Number.isFinite(output)) {
        return null;
    }
    let previousIndex = 0;
    for (let index = 0; index < curveMarks.length; index++) {
        if (output <= curveMarks[index]) {
            return [previousIndex, index];
        }
        previousIndex = index;
    }
    // Values beyond the final left-edge mark can still intersect the final
    // curve farther right. The renderer validates that intersection and its
    // left-to-right direction before accepting it.
    return [curveMarks.length - 1, curveMarks.length - 1];
};

const getBounds = (path: SVGGeometryElement): Bounds => {
    const start = path.getPointAtLength(0);
    const end = path.getPointAtLength(path.getTotalLength());
    const bounds = {
        xmin: start.x,
        xmax: end.x,
        ymin: start.y,
        ymax: end.y
    };
    if (bounds.xmin > bounds.xmax) {
        [bounds.xmin, bounds.xmax] = [bounds.xmax, bounds.xmin];
    }
    if (bounds.ymin > bounds.ymax) {
        [bounds.ymin, bounds.ymax] = [bounds.ymax, bounds.ymin];
    }
    return bounds;
};

const isGeometryPath = (path: Element | null): path is SVGGeometryElement =>
    path !== null &&
    typeof (path as SVGGeometryElement).getPointAtLength === 'function' &&
    typeof (path as SVGGeometryElement).getTotalLength === 'function';

class Coordinate {
    readonly origin: { x: number; y: number };
    readonly xmax: number;
    readonly ymax: number;
    readonly flipY: boolean;

    constructor(x: SVGGeometryElement, y: SVGGeometryElement, flipY?: boolean) {
        const ox = getBounds(x);
        const oy = getBounds(y);
        this.origin = {
            x: Math.min(oy.xmin, ox.xmin),
            y: Math.min(oy.ymin, ox.ymin),
        };
        this.xmax = Math.max(oy.xmax, ox.xmax);
        this.ymax = Math.max(oy.ymax, ox.ymax);
        this.flipY = !!flipY;
    }

    getCanvasX = (x: number) => (this.xmax - this.origin.x) * x + this.origin.x;
    getCanvasY(y: number) {
        const normalizedY = this.flipY ? 1 - y : y;
        return (this.ymax - this.origin.y) * normalizedY + this.origin.y;
    }

    private getPointAtCanvasCoordinate(
        path: SVGGeometryElement,
        target: number,
        coordinate: (point: DOMPoint) => number,
    ) {
        let left = 0;
        let right = path.getTotalLength();
        if (coordinate(path.getPointAtLength(left)) > coordinate(path.getPointAtLength(right))) {
            [left, right] = [right, left];
        }
        while (Math.abs(left - right) > 1e-4) {
            const middle = (left + right) / 2;
            if (coordinate(path.getPointAtLength(middle)) < target) {
                left = middle;
            } else {
                right = middle;
            }
        }
        return path.getPointAtLength((left + right) / 2);
    }

    getPointAtCanvasX = (path: SVGGeometryElement, canvasX: number) =>
        this.getPointAtCanvasCoordinate(path, canvasX, point => point.x);

    getPointAtCanvasY = (path: SVGGeometryElement, canvasY: number) =>
        this.getPointAtCanvasCoordinate(path, canvasY, point => point.y);

    getX = (canvasX: number) => (canvasX - this.origin.x) / (this.xmax - this.origin.x);
    getY = (canvasY: number) =>
        (this.flipY ? this.ymax - canvasY : canvasY - this.origin.y) /
        (this.ymax - this.origin.y);
    containsX(path: SVGGeometryElement, x: number) {
        const canvasX = this.getCanvasX(x);
        const startX = path.getPointAtLength(0).x;
        const endX = path.getPointAtLength(path.getTotalLength()).x;
        // Allow small endpoint gaps introduced while tracing the printed SVG,
        // but do not accept a materially truncated curve.
        const tolerance = Math.max(1e-4, Math.abs(this.xmax - this.origin.x) * 0.01);
        return Math.min(startX, endX) - tolerance <= canvasX &&
            canvasX <= Math.max(startX, endX) + tolerance;
    }
    getPointAtX = (path: SVGGeometryElement, x: number) =>
        this.getPointAtCanvasX(path, this.getCanvasX(x));
}

const createChartCalculator = (chart: ChartDefinition): ChartCalculator => {
    const chartObject = document.getElementById(chart.doc) as HTMLObjectElement | null;
    const svgDoc = chartObject && chartObject.contentDocument;
    const svg = svgDoc && svgDoc.getElementById(chart.svg);
    const canvas = svgDoc && svgDoc.getElementById(chart.canvas);
    const tracePaths: SVGPathElement[] = [];
    let traceY: number | null = null;
    let traceRightX: number | null = null;

    if (!svgDoc || !svg || !canvas) {
        console.warn(`Chart unavailable: ${chart.doc}`);
        return () => NaN;
    }

    const prepareStep = (step: ChartStep): StepCalculator | null => {
        const xAxis = svgDoc.getElementById(step.x) as SVGGeometryElement | null;
        const yAxis = svgDoc.getElementById(step.y) as SVGGeometryElement | null;
        const curves = step.curves.map(id =>
            svgDoc.getElementById(id) as SVGGeometryElement | null);
        if (!isGeometryPath(xAxis) || !isGeometryPath(yAxis) ||
            !curves.every(isGeometryPath)) {
            console.warn(`Chart step unavailable: ${chart.doc}`);
            return null;
        }
        const geometryCurves = curves;
        const coord = new Coordinate(xAxis, yAxis, chart.flipY);
        const curveMarks = step.marks === undefined
            ? geometryCurves.map(curve => coord.getY(curve.getPointAtLength(0).y))
            : [...step.marks];
        if (curveMarks.length !== curves.length || curveMarks.some((mark, index) =>
            !Number.isFinite(mark) || (index > 0 && mark <= curveMarks[index - 1]))) {
            console.warn(`Chart curves out of order: ${chart.doc}`);
            return null;
        }
        const strokeWidth = chart.lineWidth ?? '1px';
        const traceElements = ChartTrace.createElements(svg, canvas, strokeWidth);
        tracePaths.push(
            traceElements.curve,
            traceElements.inputGuide,
            traceElements.outputGuide,
            traceElements.marker,
        );

        const updateTrace = (exit: ChartTrace.RenderResult) => {
            traceY = exit.y;
            traceRightX = exit.x;
        };

        return (output: number | null, input: number) => {
            if (output === null || !Number.isFinite(output) || !Number.isFinite(input)) {
                return null;
            }
            const entry = traceY === null || traceRightX === null
                ? null
                : { x: traceRightX, y: traceY };
            const renderHorizontal = () => {
                if (!entry) {
                    return null;
                }
                const traceExit = ChartTrace.renderPassThrough(
                    traceElements,
                    entry,
                    coord.getCanvasX(1),
                );
                updateTrace(traceExit);
                return output;
            };
            const passThrough = () => step.conservativePassThrough?.(input)
                ? renderHorizontal()
                : null;
            const x = step.getX(input);
            if (x === null) {
                return passThrough();
            }
            // The left edge of every correction panel is its identity
            // condition. Preserve the incoming value exactly instead of
            // introducing small SVG digitization offsets.
            if (entry && ChartTrace.nearlyEqual(x, 0)) {
                return renderHorizontal();
            }
            const bracket = selectCurveBracket(curveMarks, output);
            if (!bracket) {
                return passThrough();
            }
            const [prevCurveIdx, curveIdx] = bracket;
            if (!coord.containsX(geometryCurves[prevCurveIdx], x) ||
                !coord.containsX(geometryCurves[curveIdx], x)) {
                return passThrough();
            }
            const canvasY0 = coord.getPointAtX(geometryCurves[prevCurveIdx], x).y;
            const canvasY1 = coord.getPointAtX(geometryCurves[curveIdx], x).y;
            const ratio = prevCurveIdx === curveIdx
                ? 0
                : (output - curveMarks[prevCurveIdx]) /
                    (curveMarks[curveIdx] - curveMarks[prevCurveIdx]);
            const canvasY = canvasY0 === canvasY1
                ? canvasY0
                : interpolateLinear(canvasY0, canvasY1, ratio);
            const traceExit = ChartTrace.render({
                elements: traceElements,
                coord,
                curves: geometryCurves,
                previousCurveIndex: prevCurveIdx,
                curveIndex: curveIdx,
                curveMark: curveMarks[curveIdx],
                output,
                ratio,
                x,
                canvasY,
                entry,
            });
            if (!traceExit.valid) {
                if (entry && output < curveMarks[0] &&
                    step.conservativeClampBelow?.(input)) {
                    const clampExit = ChartTrace.renderClampToCurve({
                        elements: traceElements,
                        coord,
                        curve: geometryCurves[0],
                        x,
                        canvasY: coord.getPointAtX(geometryCurves[0], x).y,
                        entry,
                    });
                    updateTrace(clampExit);
                    return coord.getY(clampExit.y);
                }
                return passThrough();
            }
            updateTrace(traceExit);
            return coord.getY(traceExit.y);
        };
    }

    const inputPress = prepareStep(chart.press);
    const inputMass = chart.mass ? prepareStep(chart.mass) : null;
    const inputWind = chart.wind ? prepareStep(chart.wind) : null;
    const inputObst = chart.obst ? prepareStep(chart.obst) : null;

    if (!inputPress || (chart.mass && !inputMass) || (chart.wind && !inputWind) ||
        (chart.obst && !inputObst)) {
        return () => NaN;
    }

    return (alt: number, oat: number, mass?: number, wind?: number, obst?: number) => {
        for (const tracePath of tracePaths) {
            tracePath.setAttribute('d', '');
        }
        traceY = null;
        traceRightX = null;
        if (!Number.isFinite(alt) || !Number.isFinite(oat)) {
            return NaN;
        }
        if (alt < 0) {
            alt = 0;
        }
        if (alt > 10000) {
            return NaN;
        }
        let out = inputPress(alt, oat);
        if (inputMass) {
            out = inputMass(out, mass ?? NaN);
        }
        if (inputWind) {
            out = inputWind(out, wind ?? NaN);
        }
        if (inputObst) {
            out = inputObst(out, obst ?? NaN);
        }
        if (out === null) {
            return NaN;
        }
        return chart.output(out);
    };
};

const hasStringValue = (element: Element): element is Element & { value: string } =>
    typeof (element as Element & { value?: unknown }).value === 'string';

const getValue = (element: Element | null) => {
    if (!element) {
        return '';
    }
    return hasStringValue(element) ? element.value : (element as HTMLElement).innerText;
};

const setValue = (element: Element | null, value: unknown) => {
    if (!element) {
        return;
    }
    const text = String(value);
    if (hasStringValue(element)) {
        element.value = text;
    } else {
        (element as HTMLElement).innerText = text;
    }
};

const clearValue = (element: Element | null) => setValue(element, '');

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const formatFloat = (v: unknown, prec?: number) => isFiniteNumber(v) ? v.toFixed(prec === undefined ? 2 : prec) : '';
const formatInt = (v: unknown) => isFiniteNumber(v) ? v.toFixed(0) : '';
const formatInts = (...values: unknown[]) =>
    values.every(isFiniteNumber) ? values.map(formatInt).join(', ') : '';
const rectifyDir = (v: number) => (v % 360 + 360) % 360;
const formatDir = (v: unknown) => {
    if (!isFiniteNumber(v)) {
        return '';
    }
    const rounded = Math.round(rectifyDir(v)) % 360;
    return padZero(rounded || 360, 3);
};
const feetPerNauticalMile = (fpm: number, knots: number) =>
    Number.isFinite(fpm) && Number.isFinite(knots) && knots > 0 ? fpm * 60 / knots : NaN;

const withinDirRange = (d: number, from: number, to: number) => {
    from = rectifyDir(from);
    to = rectifyDir(to);
    d = rectifyDir(d);
    if (to < from) {
        to += 360;
    }
    if (d < from) {
        d += 360;
    }
    return d <= to;
};

const parseQNH = (e: Element | null) => {
    const x = parseValue(e);
    return (20 <= x && x <= 40) ? x : NaN;
};

const parseValue = (e: Element | null, d = NaN): number => {
    const text = getValue(e).trim();
    if (text === '') {
        return d;
    }
    const x = Number(text);
    return Number.isFinite(x) ? x : NaN;
};

const parsePositiveValue = (e: Element | null, d?: number): number => {
    const x = parseValue(e, d);
    return x >= 0 ? x : NaN;
};

const parseDirection = (e: Element | null, d?: number): number => {
    const x = parseValue(e, d);
    return 0 <= x && x <= 360 ? x : NaN;
};

const parseRunway = (e: Element | null, d?: number): number => {
    const x = parseValue(e, d);
    return Number.isInteger(x) && 1 <= x && x <= 36 ? x : NaN;
};

const rad2deg = (r: number) => r / Math.PI * 180;
const deg2rad = (d: number) => d / 180 * Math.PI;

const calculateWindTriangle = (
    trueCourse: number,
    trueAirspeed: number,
    windDirection: number,
    windSpeed: number,
): WindTriangle | null => {
    if (![trueCourse, trueAirspeed, windDirection, windSpeed].every(Number.isFinite) ||
        trueAirspeed <= 0 || windSpeed < 0) {
        return null;
    }
    const windAngle = deg2rad(windDirection - trueCourse);
    const crosswind = Math.sin(windAngle) * windSpeed;
    const correctionRatio = crosswind / trueAirspeed;
    if (Math.abs(correctionRatio) > 1) {
        return null;
    }
    const correctionRadians = Math.asin(correctionRatio);
    const groundSpeed = trueAirspeed * Math.cos(correctionRadians) -
        Math.cos(windAngle) * windSpeed;
    if (!(groundSpeed > 0)) {
        return null;
    }
    const windCorrectionAngle = rad2deg(correctionRadians);
    return {
        windCorrectionAngle,
        trueHeading: trueCourse + windCorrectionAngle,
        groundSpeed,
    };
};

// True to magnetic: east is least (negative), west is best (positive).
const magneticHeadingFromTrue = (trueHeading: number, variationCorrection: number) =>
    trueHeading + variationCorrection;

const padZero = (num: number, size: number) => {
    return String(num).padStart(size, '0');
};

const arms = [
    90.6, // front left
    90.6, // front right
    128, // rear left
    128, // rear right
    143.7, // std baggage
    170.1, // baggage tube
    153.1, // ext baggage (forward)
    178.7, // ext baggage (aft)
];

const nauticalInFeet = 6076.12;
const descentDistance = (altitudeFeet: number, slopeDegrees: number) =>
    altitudeFeet / (nauticalInFeet * Math.tan(deg2rad(slopeDegrees)));
const fuelDensity = 6.01; // lb/gal
const fuelArm = 103.5;
const maxFuelVolumeStd = 40;
const maxFuelVolumeLong = 50;
const maxRearwardCGStd = 102;
const maxRearwardCGLong = 100.4;
const maxGrossWeight = 2535;
const maxGrossWeightAlt = 2646;
const maxZeroFuelWeight = 2535;
const maxStandardBaggageWeight = 66;
const maxBaggageTubeWeight = 11;
const maxExtendedForwardBaggageWeight = 100;
const maxExtendedAftBaggageWeight = 40;
const maxCombinedExtendedBaggageWeight = 100;

const seaLevelStandardTemperatureK = 288.15;
const seaLevelStandardPressurePa = 101325;
const standardTemperatureLapseRate = 0.0065;
const feetToMeters = 0.3048;
const knotsToMetersPerSecond = 0.5144444444444445;
const standardPressureExponent = 5.2558797;
const ratioOfSpecificHeats = 1.4;
const specificGasConstantAir = 287.05287;

// DA 40 AFM Rev. 10, section 5.3.2, pages 5-6 and 5-7. Each manifold-
// pressure array is indexed by pressure altitude from MSL through 17,000 ft.
const enginePerformancePressureAltitudes = [
    0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
    9000, 10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000,
];

const enginePerformanceTable: EnginePerformanceColumn[] = [
    {
        power: 45, rpm: 1800, fuelFlow: { bestEconomy: 5.8, bestPower: null },
        recommendedAltitude: [0, 11000],
        manifoldPressure: [
            22.7, 22.4, 22.1, 21.8, 21.5, 21.2, 20.9, 20.5, 20.2,
            19.9, 19.6, 19.3, null, null, null, null, null, null,
        ],
    },
    {
        power: 45, rpm: 2000, fuelFlow: { bestEconomy: 6.0, bestPower: null },
        recommendedAltitude: [10000, 13000],
        manifoldPressure: [
            21.3, 21.0, 20.7, 20.4, 20.2, 19.9, 19.6, 19.3, 19.0,
            18.7, 18.4, 18.2, 17.9, 17.6, null, null, null, null,
        ],
    },
    {
        power: 45, rpm: 2200, fuelFlow: { bestEconomy: 6.3, bestPower: 7.3 },
        recommendedAltitude: [12000, 16000],
        manifoldPressure: [
            20.2, 19.9, 19.6, 19.3, 19.0, 18.7, 18.4, 18.2, 17.9,
            17.6, 17.3, 17.0, 16.7, 16.4, 16.1, 15.8, 15.5, null,
        ],
    },
    {
        power: 45, rpm: 2400, fuelFlow: { bestEconomy: 6.6, bestPower: 7.7 },
        recommendedAltitude: [14000, 17000],
        manifoldPressure: [
            19.0, 18.7, 18.4, 18.2, 17.9, 17.6, 17.4, 17.1, 16.9,
            16.6, 16.3, 16.1, 15.8, 15.5, 15.3, 15.0, 14.7, 14.5,
        ],
    },
    {
        power: 55, rpm: 2000, fuelFlow: { bestEconomy: 7.0, bestPower: null },
        recommendedAltitude: [0, 9000],
        manifoldPressure: [
            23.9, 23.6, 23.3, 23.0, 22.7, 22.3, 22.0, 21.7, 21.3,
            21.1, null, null, null, null, null, null, null, null,
        ],
    },
    {
        power: 55, rpm: 2200, fuelFlow: { bestEconomy: 7.2, bestPower: 8.5 },
        recommendedAltitude: [8000, 11000],
        manifoldPressure: [
            22.4, 22.2, 21.9, 21.6, 21.2, 20.9, 20.6, 20.3, 20.0,
            19.7, 19.4, 19.1, null, null, null, null, null, null,
        ],
    },
    {
        power: 55, rpm: 2400, fuelFlow: { bestEconomy: 7.5, bestPower: 8.7 },
        recommendedAltitude: [10000, 13000],
        manifoldPressure: [
            21.2, 21.0, 20.7, 20.4, 20.1, 19.8, 19.5, 19.3, 19.0,
            18.7, 18.4, 18.1, 17.8, 17.6, null, null, null, null,
        ],
    },
    {
        power: 65, rpm: 2000, fuelFlow: { bestEconomy: 7.9, bestPower: null },
        recommendedAltitude: null,
        manifoldPressure: [
            26.8, 26.4, 26.0, 25.7, 25.4, null, null, null, null,
            null, null, null, null, null, null, null, null, null,
        ],
    },
    {
        power: 65, rpm: 2200, fuelFlow: { bestEconomy: 8.2, bestPower: 9.5 },
        recommendedAltitude: [0, 7000],
        manifoldPressure: [
            24.9, 24.5, 24.2, 23.8, 23.5, 23.1, 22.8, 22.4, null,
            null, null, null, null, null, null, null, null, null,
        ],
    },
    {
        power: 65, rpm: 2400, fuelFlow: { bestEconomy: 8.5, bestPower: 9.8 },
        recommendedAltitude: [6000, 9000],
        manifoldPressure: [
            23.4, 23.2, 22.9, 22.6, 22.3, 22.0, 21.7, 21.4, 21.0,
            20.7, null, null, null, null, null, null, null, null,
        ],
    },
    {
        power: 75, rpm: 2200, fuelFlow: { bestEconomy: 9.2, bestPower: 10.7 },
        recommendedAltitude: [0, 3000],
        manifoldPressure: [
            27.3, 26.8, 26.5, 26.1, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null,
        ],
    },
    {
        power: 75, rpm: 2400, fuelFlow: { bestEconomy: 9.5, bestPower: 11.0 },
        recommendedAltitude: [2000, 5000],
        manifoldPressure: [
            25.8, 25.5, 25.2, 24.8, 24.5, 24.1, null, null, null,
            null, null, null, null, null, null, null, null, null,
        ],
    },
];

const enginePerformancePowers = [45, 55, 65, 75];

const weightSteps = [1874, 2205, 2535, 2646];
const vys = [54, 60, 66, 67];
const vclimbs = [60, 68, 73, 76];
// KCAS read conservatively to the next whole knot from AFM 5.3.1 at the
// climb KIAS published in AFM 4A.2.
const vyCalibrated = [58, 64, 69, 70];
const vclimbCalibrated = [66, 73, 78, 81];
const vgs = [60, 68, 73, 76];
const vappLdgs = [58, 63, 71, 73];
const vappTos = [59, 66, 72, 74];
const vappUp = [60, 68, 73, 76];

const massClasses = [
    '.front-left-mass',
    '.front-right-mass',
    '.rear-left-mass',
    '.rear-right-mass',
    '.baggage-std-mass',
    '.baggage-tube-mass',
    '.baggage-ext-forward-mass',
    '.baggage-ext-aft-mass',
];
const momentClasses = [
    '.front-left-moment',
    '.front-right-moment',
    '.rear-left-moment',
    '.rear-right-moment',
    '.baggage-std-moment',
    '.baggage-tube-moment',
    '.baggage-ext-forward-moment',
    '.baggage-ext-aft-moment',
];

const takeoffChart: ChartDefinition = {
    doc: 'takeoff',
    svg: 'svg2',
    canvas: 'g10',
    press: {
        x: 'path1397',
        y: 'path1395',
        curves: ['path1427', 'path1540', 'path1558', 'path1577', 'path1597', 'path1620'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1700',
        y: 'path1698',
        curves: ['path1708', 'path1706', 'path1704', 'path1702'],
        getX: (mass) => {
            const minMass = 1874;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        },
        // Ignoring a favorable reduction from the 2646 lb reference mass
        // leaves a conservative (longer) take-off distance.
        conservativePassThrough: (mass) => mass > 0 && mass <= 2646,
    },
    wind: {
        x: 'path1816',
        y: 'path1814',
        curves: ['path1856', 'path1854', 'path1852', 'path1850', 'path1848', 'path1846'],
        getX: (wind) => {
            const minWind = 0;
            const maxWind = 20;
            if (wind < minWind || wind > maxWind) {
                return null; // wind out of range
            }
            return (wind - minWind) / (maxWind - minWind);
        },
        // The input is headwind only. Omitting its credit leaves the zero-wind
        // distance, which is conservative.
        conservativePassThrough: (wind) => wind >= 0,
    },
    obst: {
        x: 'path1962',
        y: 'path1960',
        curves: ['path2002', 'path2004', 'path2006', 'path2008', 'path2010', 'path2012', 'path2014', 'path2059', 'path2061'],
        getX: (obst) => {
            const minObst = 0;
            const maxObst = 50;
            if (obst < minObst || obst > maxObst) {
                return null;
            }
            return (obst - minObst) / (maxObst - minObst);
        },
        // Zero obstacle is the identity point. A positive obstacle must never
        // be ignored because doing so would understate the required distance.
        conservativePassThrough: (obst) => obst === 0,
        // When favorable upstream corrections put the entry below this
        // non-intersecting family, use its lowest curve. This assumes a longer
        // ground roll than calculated and is therefore conservative.
        conservativeClampBelow: (obst) => 0 < obst && obst <= 50,
    },
    output: (y) => Math.ceil((y * (1400 - 100) + 100) * 3.28084),
};

const landingChart: ChartDefinition = {
    doc: 'landing',
    svg: 'svg378',
    canvas: 'layer1',
    flipY: true,
    lineWidth: '0.35px',
    press: {
        x: 'path729',
        y: 'path727',
        curves: ['path1501', 'path1503', 'path1505', 'path1550', 'path1552', 'path1554'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1317',
        y: 'path1315',
        curves: ['path1339', 'path1341', 'path1397', 'path1399', 'path1401', 'path1403'],
        getX: (mass) => {
            const minMass = 1874;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        },
        // Ignoring a favorable reduction from the 2646 lb reference mass
        // leaves a conservative (longer) landing distance.
        conservativePassThrough: (mass) => mass > 0 && mass <= 2646,
    },
    wind: {
        x: 'path1381',
        y: 'path1379',
        curves: ['path642', 'path1199', 'path1201', 'path1249', 'path1296', 'path1298', 'path1300'],
        getX: (wind) => {
            const minWind = 0;
            const maxWind = 20;
            if (wind < minWind || wind > maxWind) {
                return null; // wind out of range
            }
            return (wind - minWind) / (maxWind - minWind);
        },
        conservativePassThrough: (wind) => wind >= 0,
    },
    obst: {
        x: 'path1433',
        y: 'path1431',
        curves: ['path1435', 'path1439', 'path1441', 'path1443', 'path1445', 'path1585', 'path1630', 'path1632', 'path1679', 'path1681', 'path1683', 'path1685'],
        getX: (obst) => {
            const minObst = 0;
            const maxObst = 50;
            if (obst < minObst || obst > maxObst) {
                return null;
            }
            return (maxObst - obst) / (maxObst - minObst);
        },
        // Unlike the take-off chart, this panel starts at the 50 ft landing
        // distance and moves right toward the shorter ground roll. Ignoring
        // any reduction within that published range therefore remains
        // conservative.
        conservativePassThrough: (obst) => obst >= 0 && obst <= 50,
    },
    output: (y) => Math.ceil((y * (1400 - 100) + 100) * 3.28084),
};

const takeoffClimbChart: ChartDefinition = {
    doc: 'takeoff-climb',
    svg: 'svg471',
    canvas: 'layer1',
    flipY: true,
    lineWidth: '0.35px',
    press: {
        x: 'path718',
        y: 'path716',
        curves: ['path733', 'path735', 'path737', 'path753', 'path755', 'path757'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1332',
        y: 'path1330',
        curves: ['path1353', 'path1355', 'path1357', 'path1359', 'path1361', 'path1363', 'path1365'],
        getX: (mass) => {
            const minMass = 2094;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        },
        // The chart's mass scale stops at 2094 lb. For a lighter airplane,
        // carrying the 2646 lb base rate straight through is a conservative
        // lower bound rather than extrapolating the mass correction.
        conservativePassThrough: (mass) => mass > 0 && mass <= 2646,
    },
    output: (y) => Math.ceil((1 - y) * (1600 - 0) + 0),
};

const cruiseClimbChart: ChartDefinition = {
    doc: 'cruise-climb',
    svg: 'svg471',
    canvas: 'layer1',
    flipY: true,
    lineWidth: '0.35px',
    press: {
        x: 'path728',
        y: 'path726',
        curves: ['path741', 'path743', 'path745', 'path747', 'path764', 'path766'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1375',
        y: 'path1377',
        curves: ['path1398', 'path1400', 'path1402', 'path1404', 'path1429', 'path1431', 'path1433'],
        getX: (mass) => {
            const minMass = 2094;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        },
        conservativePassThrough: (mass) => mass > 0 && mass <= 2646,
    },
    output: (y) => Math.ceil((1 - y) * (1600 - 0) + 0),
};

let takeoffCalc: ChartCalculator | undefined;
let landingCalc: ChartCalculator | undefined;
let takeoffClimbCalc: ChartCalculator | undefined;
let cruiseClimbCalc: ChartCalculator | undefined;
let fpmSource: 'rate' | 'gradient' | undefined;

const interpolateAirspeed = (speeds: readonly number[], mass: number): number => {
    if (!Number.isFinite(mass) || mass <= 0 || speeds.length !== weightSteps.length ||
        speeds.some(speed => !Number.isFinite(speed))) {
        return NaN;
    }
    if (mass <= weightSteps[0]) {
        return Math.ceil(speeds[0]);
    }
    for (let i = 1; i < weightSteps.length; i++) {
        const startMass = weightSteps[i - 1];
        const endMass = weightSteps[i];
        if (mass <= endMass) {
            const ratio = (mass - startMass) / (endMass - startMass);
            const speed = interpolateLinear(speeds[i - 1], speeds[i], ratio);
            return Math.ceil(Math.max(speed, speeds[0]));
        }
    }
    return NaN;
};

const interpolatePoints = (
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
    for (let i = 1; i < sorted.length; i++) {
        const [x0, y0] = sorted[i - 1];
        const [x1, y1] = sorted[i];
        if (x0 < input && input < x1) {
            return interpolateLinear(y0, y1, (input - x0) / (x1 - x0));
        }
    }
    return NaN;
};

const fuelFlowAtPower = (power: number, rpm: number, mixture: FuelMixture): number => {
    const powerPoints: InterpolationPoint[] = [];
    for (const tablePower of enginePerformancePowers) {
        const rpmPoints: InterpolationPoint[] = [];
        for (const column of enginePerformanceTable) {
            const fuelFlow = column.fuelFlow[mixture];
            if (column.power === tablePower && fuelFlow !== null) {
                rpmPoints.push([column.rpm, fuelFlow]);
            }
        }
        const fuelFlow = interpolatePoints(rpmPoints, rpm);
        if (Number.isFinite(fuelFlow)) {
            powerPoints.push([tablePower, fuelFlow]);
        }
    }
    return interpolatePoints(powerPoints, power);
};

const manifoldPressureForColumn = (
    column: EnginePerformanceColumn,
    pressureAltitude: number,
): number => {
    const altitudePoints: InterpolationPoint[] = [];
    for (let i = 0; i < enginePerformancePressureAltitudes.length; i++) {
        const manifoldPressure = column.manifoldPressure[i];
        if (manifoldPressure !== null && manifoldPressure !== undefined) {
            altitudePoints.push([enginePerformancePressureAltitudes[i], manifoldPressure]);
        }
    }
    return interpolatePoints(altitudePoints, pressureAltitude);
};

const manifoldPressureAtPower = (
    pressureAltitude: number,
    rpm: number,
    power: number,
): number => {
    const powerPoints: InterpolationPoint[] = [];
    for (const tablePower of enginePerformancePowers) {
        const rpmPoints: InterpolationPoint[] = [];
        for (const column of enginePerformanceTable) {
            if (column.power !== tablePower) {
                continue;
            }
            const manifoldPressure = manifoldPressureForColumn(column, pressureAltitude);
            if (Number.isFinite(manifoldPressure)) {
                rpmPoints.push([column.rpm, manifoldPressure]);
            }
        }
        const manifoldPressure = interpolatePoints(rpmPoints, rpm);
        if (Number.isFinite(manifoldPressure)) {
            powerPoints.push([tablePower, manifoldPressure]);
        }
    }
    return interpolatePoints(powerPoints, power);
};

const powerFromManifoldPressure = (
    pressureAltitude: number,
    rpm: number,
    manifoldPressure: number,
): number => {
    const inversePoints: InterpolationPoint[] = [];
    for (const power of enginePerformancePowers) {
        const tableManifoldPressure = manifoldPressureAtPower(pressureAltitude, rpm, power);
        if (Number.isFinite(tableManifoldPressure)) {
            inversePoints.push([tableManifoldPressure, power]);
        }
    }
    return interpolatePoints(inversePoints, manifoldPressure);
};

const calculateEnginePerformance = (
    pressureAltitude: number,
    rpm: number,
    manifoldPressure: number,
    mixture: FuelMixture,
): { power: number; fuelFlow: number } => {
    const power = powerFromManifoldPressure(pressureAltitude, rpm, manifoldPressure);
    return {
        power,
        fuelFlow: fuelFlowAtPower(power, rpm, mixture),
    };
};

// For an interpolated setting, require every table point that brackets it to
// be shaded. This avoids presenting an unmarked in-between setting as an AFM-
// recommended operating point.
const isRecommendedBetween = (
    points: readonly RecommendationPoint[],
    input: number,
): boolean => {
    if (!Number.isFinite(input) || points.some(point => !Number.isFinite(point.x))) {
        return false;
    }
    const sorted = [...points].sort((point0, point1) => point0.x - point1.x);
    if (sorted.some((point, index) => index > 0 && point.x === sorted[index - 1].x)) {
        return false;
    }
    for (const point of sorted) {
        if (Math.abs(input - point.x) < 1e-9) {
            return point.recommended;
        }
    }
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].x < input && input < sorted[i].x) {
            return sorted[i - 1].recommended && sorted[i].recommended;
        }
    }
    return false;
};

const isColumnRecommended = (
    column: EnginePerformanceColumn,
    pressureAltitude: number,
) => column.recommendedAltitude !== null &&
    column.recommendedAltitude[0] <= pressureAltitude &&
    pressureAltitude <= column.recommendedAltitude[1];

const isRecommendedAtPower = (
    pressureAltitude: number,
    rpm: number,
    power: number,
): boolean => {
    const rpmPoints: RecommendationPoint[] = [];
    for (const column of enginePerformanceTable) {
        if (column.power === power &&
            Number.isFinite(manifoldPressureForColumn(column, pressureAltitude))) {
            rpmPoints.push({
                x: column.rpm,
                recommended: isColumnRecommended(column, pressureAltitude),
            });
        }
    }
    return isRecommendedBetween(rpmPoints, rpm);
};

const isRecommendedEngineSetting = (
    pressureAltitude: number,
    rpm: number,
    manifoldPressure: number,
): boolean => {
    const power = powerFromManifoldPressure(pressureAltitude, rpm, manifoldPressure);
    if (!Number.isFinite(power)) {
        return false;
    }
    const powerPoints: RecommendationPoint[] = [];
    for (const tablePower of enginePerformancePowers) {
        if (Number.isFinite(manifoldPressureAtPower(pressureAltitude, rpm, tablePower))) {
            powerPoints.push({
                x: tablePower,
                recommended: isRecommendedAtPower(pressureAltitude, rpm, tablePower),
            });
        }
    }
    return isRecommendedBetween(powerPoints, power);
};

const checkCG = (mass: number, cg: number, isLongRange: boolean, isMAM: boolean) => {
    if (![mass, cg].every(Number.isFinite)) {
        return NaN;
    }
    const maxForwardCGMass = isMAM ? maxGrossWeightAlt : maxGrossWeight;
    const maxForwardCG = isMAM ? 97.6 : 96.9;
    const minForwardCG = mass > 2161
        ? (maxForwardCG - 94.5) / (maxForwardCGMass - 2161) * (mass - 2161) + 94.5
        : 94.5;
    const maxRearwardCG = isLongRange ? maxRearwardCGLong : maxRearwardCGStd;
    if (cg > maxRearwardCG) {
        return 1;
    }
    if (cg < minForwardCG) {
        return -1;
    }
    return 0;
};

// AFM 6.4.10 requires the CG to be inside the envelope both with empty fuel
// tanks (row 7) and with usable fuel included (row 9).
const areLoadingCGsWithinLimits = (
    zeroFuelMass: number,
    zeroFuelMoment: number,
    totalMass: number,
    totalMoment: number,
    isLongRange: boolean,
    isMAM: boolean,
) => {
    if (![zeroFuelMass, zeroFuelMoment, totalMass, totalMoment].every(Number.isFinite) ||
        zeroFuelMass <= 0 || totalMass <= 0) {
        return false;
    }
    return checkCG(zeroFuelMass, zeroFuelMoment / zeroFuelMass, isLongRange, isMAM) === 0 &&
        checkCG(totalMass, totalMoment / totalMass, isLongRange, isMAM) === 0;
};

const checkMass = (mass: number, mam: boolean) =>
    Number.isFinite(mass) && mass <= (mam ? maxGrossWeightAlt : maxGrossWeight);

const checkLoadingLimits = (stationMasses: number[], zeroFuelMass: number) =>
    stationMasses.length >= arms.length &&
    stationMasses.every(mass => Number.isFinite(mass) && mass >= 0) &&
    Number.isFinite(zeroFuelMass) && zeroFuelMass <= maxZeroFuelWeight &&
    stationMasses[4] <= maxStandardBaggageWeight &&
    stationMasses[5] <= maxBaggageTubeWeight &&
    stationMasses[6] <= maxExtendedForwardBaggageWeight &&
    stationMasses[7] <= maxExtendedAftBaggageWeight &&
    stationMasses[6] + stationMasses[7] <= maxCombinedExtendedBaggageWeight;

// AFM 1.5 defines TAS as CAS corrected for altitude and temperature. This uses
// the subsonic compressible-flow relation rather than treating KIAS as KCAS.
const calibratedToTrueAirspeed = (kcas: number, pressureAltitudeFeet: number, oatCelsius: number) => {
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
    const seaLevelMachSquared = Math.pow(calibratedMetersPerSecond / seaLevelSpeedOfSound, 2);
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

const refresh = () => {
    const weights = document.getElementById('weights')!;
    const outputs = document.getElementById('outputs')!;
    const env = document.getElementById('env')!;

    const qnh = env.querySelector('.qnh')!;
    const press = env.querySelector('.press-alt')!;
    const elev = parseValue(env.querySelector('.field-alt'));

    if (qnh.classList.contains('active')) {
        setValue(press, formatInt((29.92 - parseQNH(qnh)) * 1000 + elev));
    } else if (press.classList.contains('active')) {
        setValue(qnh, formatFloat(29.92 - (parseValue(press) - elev) / 1000, 2));
    } else {
        setValue(press, formatInt((29.92 - parseQNH(qnh)) * 1000 + elev));
    }

    let totalMass = parsePositiveValue(weights.querySelector('.empty-mass'));
    let totalMoment = parsePositiveValue(weights.querySelector('.empty-moment'));
    const stationMasses: number[] = [];
    for (let i = 0; i < massClasses.length; i++) {
        const mass = parsePositiveValue(weights.querySelector(massClasses[i]), 0);
        stationMasses.push(mass);
        const moment = mass * arms[i];
        setValue(weights.querySelector(momentClasses[i]), formatFloat(moment, 2));
        totalMass += mass;
        totalMoment += moment;
    }
    const zeroFuelMass = totalMass;
    const zeroFuelMoment = totalMoment;

    const isMAM = (weights.querySelector('input[name="mam-40-227"]') as HTMLInputElement).checked;
    const isLongRange = (weights.querySelector('input[name="longrange-tank"]') as HTMLInputElement).checked;
    const fuelVolume = parsePositiveValue(weights.querySelector('.fuel-vol'));
    const maxFuelVolume = isLongRange ? maxFuelVolumeLong : maxFuelVolumeStd;
    const fuelMass = Number.isFinite(fuelVolume) && fuelVolume <= maxFuelVolume ? fuelVolume * fuelDensity : NaN;
    const fuelMoment = fuelMass * fuelArm;
    setValue(weights.querySelector('.fuel-moment'), formatFloat(fuelMoment));
    totalMass += fuelMass;
    totalMoment += fuelMoment;

    setValue(weights.querySelector('.total-mass'), formatFloat(totalMass));
    setValue(weights.querySelector('.total-moment'), formatFloat(totalMoment));

    const cg = totalMoment / totalMass;
    const cgOut = checkCG(totalMass, cg, isLongRange, isMAM);
    const cgOk = areLoadingCGsWithinLimits(
        zeroFuelMass,
        zeroFuelMoment,
        totalMass,
        totalMoment,
        isLongRange,
        isMAM,
    );
    const massOk = checkMass(totalMass, isMAM);
    const loadingOk = massOk && checkLoadingLimits(stationMasses, zeroFuelMass);
    const wbOk = loadingOk && cgOk;

    const massOutput = outputs.querySelector('.total-mass')!;
    const cgOutput = outputs.querySelector('.cg')!;
    setValue(massOutput, formatFloat(totalMass));
    if (Number.isNaN(totalMass)) {
        (massOutput.parentNode as Element).classList.remove('ok');
    } else {
        const classes = (massOutput.parentNode as Element).classList;
        if (loadingOk) {
            classes.add('ok');
        } else {
            classes.remove('ok');
        }
    }
    let cgMark = formatFloat(cg);
    if (cgOut > 0) {
        cgMark += '>>';
    } else if (cgOut < 0) {
        cgMark = '<<' + cgMark;
    }
    setValue(cgOutput, cgMark);
    if (Number.isNaN(cg)) {
        (cgOutput.parentNode as Element).classList.remove('ok');
    } else {
        const classes = (cgOutput.parentNode as Element).classList;
        if (cgOk) {
            classes.add('ok');
        } else {
            classes.remove('ok');
        }
    }

    const oat = parseValue(env.querySelector('.oat'));
    const pressAlt = parseValue(env.querySelector('.press-alt'));

    if (wbOk) {
        const takeoffClimbKias = interpolateAirspeed(vys, totalMass);
        const cruiseClimbKias = interpolateAirspeed(vclimbs, totalMass);
        setValue(outputs.querySelector('.vy'),
            formatInts(
                takeoffClimbKias,
                cruiseClimbKias,
            ));
        setValue(outputs.querySelector('.vg'), formatInt(interpolateAirspeed(vgs, totalMass)));
        setValue(outputs.querySelector('.vapp'),
            formatInts(
                interpolateAirspeed(vappLdgs, totalMass),
                interpolateAirspeed(vappTos, totalMass),
                interpolateAirspeed(vappUp, totalMass),
            ));

        let va = 94;
        if (isMAM) {
            if (totalMass > 2284) {
                va = 111;
            }
        } else {
            if (totalMass > 2161) {
                va = 108;
            }
        }
        setValue(outputs.querySelector('.va'), formatInt(va));

        const wind = parseValue(env.querySelector('.headwind'));
        const takeoffClimbKcas = interpolateAirspeed(vyCalibrated, totalMass);
        const cruiseClimbKcas = interpolateAirspeed(vclimbCalibrated, totalMass);
        const takeoffClimbGroundSpeed = calibratedToTrueAirspeed(takeoffClimbKcas, pressAlt, oat) - wind;
        const cruiseClimbGroundSpeed = calibratedToTrueAirspeed(cruiseClimbKcas, pressAlt, oat) - wind;
        const obst = parsePositiveValue(env.querySelector('.obst'));
        if (takeoffCalc !== undefined) {
            setValue(outputs.querySelector('.takeoff'), formatInt(takeoffCalc(pressAlt, oat, totalMass, wind, obst)));
            setValue(outputs.querySelector('.landing'), formatInt(landingCalc!(pressAlt, oat, totalMass, wind, obst)));
            const takeoffClimb = takeoffClimbCalc!(pressAlt, oat, totalMass);
            const cruiseClimb = cruiseClimbCalc!(pressAlt, oat, totalMass);
            setValue(outputs.querySelector('.takeoff-climb'),
                formatInts(takeoffClimb, cruiseClimb));
            setValue(outputs.querySelector('.takeoff-climb-gradient'),
                formatInts(
                    feetPerNauticalMile(takeoffClimb, takeoffClimbGroundSpeed),
                    feetPerNauticalMile(cruiseClimb, cruiseClimbGroundSpeed),
                ));
        }
    } else {
        clearValue(outputs.querySelector('.vy'));
        clearValue(outputs.querySelector('.vg'));
        clearValue(outputs.querySelector('.vapp'));
        clearValue(outputs.querySelector('.va'));
        clearValue(outputs.querySelector('.takeoff'));
        clearValue(outputs.querySelector('.landing'));
        clearValue(outputs.querySelector('.takeoff-climb'));
        clearValue(outputs.querySelector('.takeoff-climb-gradient'));
    }

    const isa = 15 - 1.98 * (pressAlt / 1000);
    const densityAlt = pressAlt + 118.8 * (oat - isa);
    setValue(env.querySelector('.density-alt'), formatInt(densityAlt));
};

const refreshEnginePerformance = (tools: HTMLElement) => {
    const mixture: FuelMixture =
        tools.querySelector<HTMLInputElement>('.ep-best-power')!.checked
            ? 'bestPower'
            : 'bestEconomy';
    const pressureAltitude = parseValue(tools.querySelector('.ep-alt'));
    const rpm = parseValue(tools.querySelector('.ep-rpm'));
    const manifoldPressure = parseValue(tools.querySelector('.ep-mp'));
    const { power, fuelFlow } = calculateEnginePerformance(
        pressureAltitude,
        rpm,
        manifoldPressure,
        mixture,
    );
    const performanceOutput = tools.querySelector('.ep-output')!;
    const performance = [fuelFlow, power].every(Number.isFinite)
        ? `${formatFloat(fuelFlow, 2)} gal/h, ${formatInt(power)} % Power`
        : '';
    setValue(performanceOutput, performance);
    (performanceOutput.parentNode as Element).classList.toggle(
        'gray',
        Number.isFinite(fuelFlow) &&
            isRecommendedEngineSetting(pressureAltitude, rpm, manifoldPressure),
    );
};

const refreshTools = () => {
    const tools = document.getElementById('tools')!;

    refreshEnginePerformance(tools);

    const wcdir = parseDirection(tools.querySelector('.wc-dir'));
    const wcvel = parsePositiveValue(tools.querySelector('.wc-vel'));
    const wcrwy = parseRunway(tools.querySelector('.wc-rwy')) * 10;
    const wcd = deg2rad(wcrwy - wcdir);
    const xwind = Math.round(Math.sin(wcd) * wcvel);
    setValue(tools.querySelector('.wc-cross'),
        Number.isNaN(xwind) ? '' :
            (xwind === 0 ? '0' :
                (xwind > 0 ? `${formatInt(xwind)} →` : `← ${formatInt(-xwind)}`)));
    setValue(tools.querySelector('.wc-head'), formatInt(Math.round(Math.cos(wcd) * wcvel)));

    const inbound = tools.querySelector('.h-in')!;
    const outbound = tools.querySelector('.h-out')!;
    if (inbound.classList.contains('active')) {
        setValue(outbound, formatDir((parseDirection(inbound) + 180) % 360));
    } else if (outbound.classList.contains('active')) {
        setValue(inbound, formatDir((parseDirection(outbound) + 180) % 360));
    }
    const hHdg = parseDirection(tools.querySelector('.h-hdg'));
    let holdingType = '';
    let ob = parseDirection(outbound);
    if (!Number.isNaN(ob) && !Number.isNaN(hHdg)) {
        if ((tools.querySelector('.h-left') as HTMLInputElement).checked) {
            holdingType = withinDirRange(ob, hHdg + 110, hHdg - 70) ? 'D' :
                (withinDirRange(ob, hHdg + 1, hHdg + 110) ? 'P' : 'T');
        } else {
            holdingType = withinDirRange(ob, hHdg + 70, hHdg - 110) ? 'D' :
                (withinDirRange(ob, hHdg, hHdg + 70) ? 'T' : 'P');
        }
    }
    setValue(tools.querySelector('.h-type'), holdingType);

    const variationCorrection = parseValue(tools.querySelector('.vr'), 0);
    const trueCourse = parseDirection(tools.querySelector('.tc'));
    const windSpeed = parsePositiveValue(tools.querySelector('.winvel'));
    const windDirection = windSpeed === 0
        ? parseDirection(tools.querySelector('.windir'), 0)
        : parseDirection(tools.querySelector('.windir'));
    const tas = parsePositiveValue(tools.querySelector('.tas'));
    const windTriangle = calculateWindTriangle(trueCourse, tas, windDirection, windSpeed);
    if (!windTriangle || !Number.isFinite(variationCorrection)) {
        clearValue(tools.querySelector('.hdg'));
        clearValue(tools.querySelector('.gs'));
    } else {
        const magneticHeading = magneticHeadingFromTrue(
            windTriangle.trueHeading,
            variationCorrection,
        );
        setValue(tools.querySelector('.hdg'),
            `${formatDir(magneticHeading)}M,${formatDir(windTriangle.trueHeading)}T`);
        setValue(tools.querySelector('.gs'), formatInt(windTriangle.groundSpeed));
    }
    let slope = parsePositiveValue(tools.querySelector('.d-slope'));
    if (slope >= 90) {
        slope = NaN;
    }
    const slopeRad = deg2rad(slope);
    const dgs = parsePositiveValue(tools.querySelector('.d-gs'));
    const dh = parsePositiveValue(tools.querySelector('.d-alt'));
    setValue(tools.querySelector('.d-dist'), formatFloat(descentDistance(dh, slope), 1));
    setValue(tools.querySelector('.d-rate'), formatInt(Math.ceil(dgs * nauticalInFeet / 60 * Math.tan(slopeRad))));

    const ttas = parsePositiveValue(tools.querySelector('.t-tas'));
    setValue(tools.querySelector('.t-bank'), formatInt(Math.round(rad2deg(Math.atan(ttas / 364)))));

    const ccel = tools.querySelector('.c-cel')!;
    const cfah = tools.querySelector('.c-fah')!;
    if (ccel.classList.contains('active')) {
        setValue(cfah, formatFloat(parseValue(ccel) * 1.8 + 32));
    } else if (cfah.classList.contains('active')) {
        setValue(ccel, formatFloat((parseValue(cfah) - 32) * 5 / 9));
    }

    const cnm = tools.querySelector('.c-nm')!;
    const csm = tools.querySelector('.c-sm')!;
    if (cnm.classList.contains('active')) {
        setValue(csm, formatFloat(parseValue(cnm) * 1.15078));
    } else if (csm.classList.contains('active')) {
        setValue(cnm, formatFloat(parseValue(csm) * 0.868976));
    }

    const cft = tools.querySelector('.c-ft')!;
    const cm = tools.querySelector('.c-m')!;
    if (cft.classList.contains('active')) {
        setValue(cm, formatInt(parseValue(cft) * 0.3048));
    } else if (cm.classList.contains('active')) {
        setValue(cft, formatInt(parseValue(cm) / 0.3048));
    }

    const clb = tools.querySelector('.c-lb')!;
    const ckg = tools.querySelector('.c-kg')!;
    if (clb.classList.contains('active')) {
        setValue(ckg, formatInt(parseValue(clb) * 0.45359237));
    } else if (ckg.classList.contains('active')) {
        setValue(clb, formatInt(parseValue(ckg) / 0.45359237));
    }

    const fpmGs = parsePositiveValue(tools.querySelector('.fpm-gs'));
    const fpmRate = tools.querySelector('.fpm-rate');
    const fpmGradient = tools.querySelector('.fpm-gradient');
    if (fpmSource === 'rate') {
        setValue(fpmGradient, formatInt(feetPerNauticalMile(parseValue(fpmRate), fpmGs)));
    } else if (fpmSource === 'gradient') {
        const gradient = parseValue(fpmGradient);
        setValue(fpmRate,
            formatInt(Number.isFinite(gradient) && Number.isFinite(fpmGs) && fpmGs > 0 ?
                gradient * fpmGs / 60 : NaN));
    }
};

const regUpdatable = (updatable: NodeListOf<Element>, func: () => void) => {
    for (let i = 0; i < updatable.length; i++) {
        updatable[i].addEventListener('input', () => func());
    }
};

const normalizeInputText = (text: string, maxLength: number) =>
    text.replace(/[\r\n]/g, '').slice(0, maxLength);
const jurl = JsonUrl('lzma');
const weightStateClasses = [
    'empty-mass',
    'empty-moment',
    'front-left-mass',
    'front-right-mass',
    'rear-left-mass',
    'rear-right-mass',
    'baggage-std-mass',
    'baggage-tube-mass',
    'baggage-ext-forward-mass',
    'baggage-ext-aft-mass',
    'fuel-vol',
] as const;
const environmentStateClasses = [
    'oat',
    'qnh',
    'press-alt',
    'field-alt',
    'headwind',
    'obst',
] as const;
const stateCookieName = 'da40-state';

const refreshCalculations = () => {
    refresh();
    refreshTools();
};

const writeStateCookie = (data: string) => {
    document.cookie = `${stateCookieName}=${encodeURIComponent(data)}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
};

const collectText = (
    container: Element,
    classes: readonly string[],
    result: Record<string, unknown>,
) => {
    for (const className of classes) {
        result[className] = getValue(container.querySelector(`.${className}`));
    }
};

const getUserData = () => {
    const result: Record<string, unknown> = {};
    const weights = document.getElementById('weights')!;
    const env = document.getElementById('env')!;
    collectText(weights, weightStateClasses, result);
    collectText(env, environmentStateClasses, result);
    result['mam-40-227'] = weights.querySelector<HTMLInputElement>(
        'input[name="mam-40-227"]',
    )!.checked;
    result['longrange-tank'] = weights.querySelector<HTMLInputElement>(
        'input[name="longrange-tank"]',
    )!.checked;
    return jurl.compress(result);
};

const restoreText = (
    container: Element,
    classes: readonly string[],
    state: Record<string, unknown>,
) => {
    for (const className of classes) {
        const value = state[className];
        if (typeof value === 'string' || typeof value === 'number') {
            const element = container.querySelector<HTMLElement>(`.${className}`)!;
            const limitClass = [...element.classList].find(name => /^max\d+$/.test(name));
            const maxLength = limitClass ? Number(limitClass.slice(3)) : Number.MAX_SAFE_INTEGER;
            setValue(element, normalizeInputText(String(value), maxLength));
        }
    }
};

const setUserData = async (data: string) => {
    if (!data) {
        refreshCalculations();
        return;
    }

    try {
        const state = await jurl.decompress(data);
        if (state === null || typeof state !== 'object' || Array.isArray(state)) {
            throw new TypeError('Saved state must be an object.');
        }
        const weights = document.getElementById('weights')!;
        const env = document.getElementById('env')!;
        restoreText(weights, weightStateClasses, state);
        restoreText(env, environmentStateClasses, state);
        if (typeof state['mam-40-227'] === 'boolean') {
            weights.querySelector<HTMLInputElement>('input[name="mam-40-227"]')!.checked =
                state['mam-40-227'];
        }
        if (typeof state['longrange-tank'] === 'boolean') {
            weights.querySelector<HTMLInputElement>('input[name="longrange-tank"]')!.checked =
                state['longrange-tank'];
        }
        writeStateCookie(data);
    } catch (error) {
        console.warn('Ignoring invalid saved state.', error);
    }
    refreshCalculations();
};

const showSavedUrl = (savedUrl: string, copied: boolean) => {
    const output = document.getElementById('url')!;
    const message = document.createElement('span');
    const textarea = document.createElement('textarea');
    message.textContent = copied
        ? 'Saved and copied to clipboard:'
        : 'Saved. Copy this link:';
    textarea.value = savedUrl;
    textarea.readOnly = true;
    output.replaceChildren(message, textarea);
    if (!copied) {
        textarea.focus();
        textarea.select();
    }
};

const saveChanges = async () => {
    const output = document.getElementById('url')!;
    try {
        const state = await getUserData();
        writeStateCookie(state);
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('s', state);
        url.hash = '';
        window.history.replaceState(null, '', url.href);
        const savedUrl = window.location.href;
        let copied = false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(savedUrl);
                copied = true;
            }
        } catch {
            // The URL remains selectable when clipboard permission is unavailable.
        }
        showSavedUrl(savedUrl, copied);
    } catch (error) {
        console.error('Could not save the current state.', error);
        output.textContent = 'Could not save the current state.';
    }
};

const recover = () => {
    const query = new URLSearchParams(window.location.search).get('s');
    const cookie = document.cookie.match(new RegExp(`(?:^|;\\s*)${stateCookieName}=([^;]*)`));
    let cookieState = '';
    if (cookie) {
        try {
            cookieState = decodeURIComponent(cookie[1]);
        } catch {
            console.warn('Ignoring malformed saved-state cookie.');
        }
    }
    void setUserData(query || cookieState);
};

const regTandemInput = (container: Element, a: string, b: string) => {
    const ea = container.querySelector<HTMLElement>(a)!;
    const eb = container.querySelector<HTMLElement>(b)!;
    const register = (element: HTMLElement, counterpart: HTMLElement) => {
        element.addEventListener('focus', () => {
            element.classList.add('active');
            if (counterpart.classList.contains('active')) {
                clearValue(counterpart);
                counterpart.classList.remove('active');
            }
        });
        element.addEventListener('blur', () => element.classList.remove('active'));
    };
    register(ea, eb);
    register(eb, ea);
};

const tools = document.getElementById('tools')!;
const env = document.getElementById('env')!;
const toolsDrawer = document.getElementById('tools-drawer') as HTMLDialogElement;
const toolsToggle = document.getElementById('tools-toggle')!;
const toolsClose = document.getElementById('tools-close')!;

toolsToggle.addEventListener('click', () => {
    if (!toolsDrawer.open) {
        toolsDrawer.showModal();
        toolsToggle.setAttribute('aria-expanded', 'true');
    }
});
toolsClose.addEventListener('click', () => toolsDrawer.close());
toolsDrawer.addEventListener('click', event => {
    const bounds = toolsDrawer.getBoundingClientRect();
    const outsideDrawer = event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (event.target === toolsDrawer && outsideDrawer) {
        toolsDrawer.close();
    }
});
toolsDrawer.addEventListener('close', () => {
    toolsToggle.setAttribute('aria-expanded', 'false');
    toolsToggle.focus();
});

window.addEventListener('load', () => {
    takeoffCalc = createChartCalculator(takeoffChart);
    landingCalc = createChartCalculator(landingChart);
    takeoffClimbCalc = createChartCalculator(takeoffClimbChart);
    cruiseClimbCalc = createChartCalculator(cruiseClimbChart);
    recover();
});

regTandemInput(tools, '.h-in', '.h-out');
regTandemInput(tools, '.c-cel', '.c-fah');
regTandemInput(tools, '.c-nm', '.c-sm');
regTandemInput(tools, '.c-ft', '.c-m');
regTandemInput(tools, '.c-lb', '.c-kg');
regTandemInput(tools, '.fpm-rate', '.fpm-gradient');
tools.querySelector('.fpm-rate')!.addEventListener('input', () => fpmSource = 'rate');
tools.querySelector('.fpm-gradient')!.addEventListener('input', () => fpmSource = 'gradient');
regTandemInput(env, '.qnh', '.press-alt');

regUpdatable(document.querySelectorAll('#weights td .update'), refresh);
regUpdatable(document.querySelectorAll('#env td .update'), refresh);
regUpdatable(document.querySelectorAll('#tools td .update'), refreshTools);

document.getElementById('save')!.addEventListener('click', () => void saveChanges());
