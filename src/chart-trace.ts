namespace ChartTrace {
    export type Point = {
        x: number;
        y: number;
    };

    export type RenderResult = Point & {
        valid: boolean;
    };

    export type Mode = 'interpolated' | 'curve' | 'no-intersection';

    export type PathOptions = {
        mode: Mode;
        entry: Point | null;
        panelLeftX: number;
        panelRightX: number;
        touch: Point | null;
        samples: Point[];
    };

    export type Elements = {
        curve: SVGPathElement;
        inputGuide: SVGPathElement;
        outputGuide: SVGPathElement;
        marker: SVGPathElement;
        markerRadius: number;
    };

    type Coordinates = {
        getCanvasX: (x: number) => number;
        getCanvasY: (y: number) => number;
        getX: (canvasX: number) => number;
        getPointAtX: (path: SVGGeometryElement, x: number) => DOMPoint;
        getPointAtCanvasY: (path: SVGGeometryElement, canvasY: number) => DOMPoint;
    };

    export type RenderOptions = {
        elements: Elements;
        coord: Coordinates;
        curves: SVGGeometryElement[];
        previousCurveIndex: number;
        curveIndex: number;
        curveMark: number;
        output: number;
        ratio: number;
        x: number;
        canvasY: number;
        entry: Point | null;
    };

    export type ClampOptions = {
        elements: Elements;
        coord: Coordinates;
        curve: SVGGeometryElement;
        x: number;
        canvasY: number;
        entry: Point;
    };

    export const nearlyEqual = (a: number, b: number, tolerance = 1e-9) =>
        Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));

    export const betweenInclusive = (value: number, a: number, b: number, tolerance = 0) =>
        Math.min(a, b) - tolerance <= value && value <= Math.max(a, b) + tolerance;

    export const selectMode = (
        previousCurveIndex: number,
        curveIndex: number,
        output: number,
        curveMark: number,
    ): Exclude<Mode, 'no-intersection'> =>
        curveIndex === previousCurveIndex || nearlyEqual(output, curveMark)
            ? 'curve'
            : 'interpolated';

    export const sampleRange = (
        start: number,
        end: number,
        density: number,
        pointAt: (position: number, progress: number) => Point,
    ) => {
        const sampleCount = Math.max(1, Math.ceil(Math.abs(end - start) * density));
        const points: Point[] = [];
        for (let i = 0; i <= sampleCount; i++) {
            const progress = i / sampleCount;
            points.push(pointAt(start + (end - start) * progress, progress));
        }
        return points;
    };

    export const buildPath = ({
        mode,
        entry,
        panelLeftX,
        panelRightX,
        touch,
        samples,
    }: PathOptions) => {
        const commands: string[] = [];
        if (entry) {
            commands.push(`M ${entry.x},${entry.y}`);
            if (mode === 'curve' && touch) {
                commands.push(`H ${touch.x}`);
            } else if (mode === 'no-intersection') {
                commands.push(`H ${panelRightX}`);
            } else {
                commands.push(`H ${panelLeftX}`);
            }
        }
        if (mode !== 'no-intersection') {
            for (const point of samples) {
                commands.push(`${commands.length === 0 ? 'M' : 'L'} ${point.x},${point.y}`);
            }
        }
        return commands.join(' ');
    };

    const clearExit = (elements: Elements) => {
        elements.inputGuide.setAttribute('d', '');
        elements.outputGuide.setAttribute('d', '');
        elements.marker.setAttribute('d', '');
    };

    const renderExit = (
        elements: Elements,
        coord: Coordinates,
        selectedX: number,
        canvasY: number,
        inputPrefix = '',
    ): RenderResult => {
        const verticalGuide = `M ${selectedX},${coord.getCanvasY(0)} V ${canvasY}`;
        elements.inputGuide.setAttribute(
            'd',
            inputPrefix ? `${inputPrefix} ${verticalGuide}` : verticalGuide,
        );
        const panelRightX = coord.getCanvasX(1);
        elements.outputGuide.setAttribute('d', `M ${selectedX},${canvasY} H ${panelRightX}`);
        const radius = elements.markerRadius;
        elements.marker.setAttribute(
            'd',
            `M ${selectedX - radius},${canvasY} a ${radius},${radius} 0 1,0 ${radius * 2},0 ` +
            `a ${radius},${radius} 0 1,0 ${-radius * 2},0`,
        );
        return { x: panelRightX, y: canvasY, valid: true };
    };

    export const renderPassThrough = (
        elements: Elements,
        entry: Point,
        panelRightX: number,
    ): RenderResult => {
        elements.curve.setAttribute('d', `M ${entry.x},${entry.y} H ${panelRightX}`);
        clearExit(elements);
        return { x: panelRightX, y: entry.y, valid: true };
    };

    export const renderClampToCurve = ({
        elements,
        coord,
        curve,
        x,
        canvasY,
        entry,
    }: ClampOptions): RenderResult => {
        const selectedX = coord.getCanvasX(x);
        const curveStart = coord.getPointAtX(curve, 0);
        const samples = sampleRange(0, x, 48, (sampleX) => {
            const point = coord.getPointAtX(curve, sampleX);
            return { x: point.x, y: point.y };
        });
        elements.curve.setAttribute(
            'd',
            samples.map((point, index) =>
                `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' '),
        );
        return renderExit(
            elements,
            coord,
            selectedX,
            canvasY,
            `M ${entry.x},${entry.y} H ${curveStart.x} V ${curveStart.y}`,
        );
    };

    const setSvgAttributes = (element: SVGElement, attributes: Record<string, string>) => {
        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, value);
        }
    };

    export const createElements = (
        svg: Element,
        canvas: Element,
        strokeWidth: string,
    ): Elements => {
        const createPath = (attributes: Record<string, string>) => {
            const path = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
            setSvgAttributes(path, { 'pointer-events': 'none', ...attributes });
            canvas.appendChild(path);
            return path;
        };
        const parsedStrokeWidth = Number.parseFloat(strokeWidth);
        const numericStrokeWidth = Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : 1;
        const commonLine = {
            stroke: 'red',
            'stroke-width': strokeWidth,
            fill: 'none',
        };
        const curve = createPath({
            ...commonLine,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: '0.95',
        });
        const inputGuide = createPath({
            ...commonLine,
            'stroke-dasharray': `${numericStrokeWidth * 4} ${numericStrokeWidth * 3}`,
            opacity: '0.65',
        });
        const outputGuide = createPath({ ...commonLine, opacity: '0.85' });
        const marker = createPath({
            fill: 'red',
            stroke: 'white',
            'stroke-width': strokeWidth,
        });
        return {
            curve,
            inputGuide,
            outputGuide,
            marker,
            markerRadius: numericStrokeWidth * 3,
        };
    };

    export const render = ({
        elements,
        coord,
        curves,
        previousCurveIndex,
        curveIndex,
        curveMark,
        output,
        ratio,
        x,
        canvasY,
        entry,
    }: RenderOptions): RenderResult => {
        const previousCurve = curves[previousCurveIndex];
        const curve = curves[curveIndex];
        const panelLeftX = coord.getCanvasX(0);
        const panelRightX = coord.getCanvasX(1);
        const selectedX = coord.getCanvasX(x);
        let mode: Mode = selectMode(previousCurveIndex, curveIndex, output, curveMark);
        let touch: Point | null = null;
        let traceStartX = 0;

        if (entry && mode === 'curve') {
            const curveStart = coord.getPointAtX(curve, 0);
            const curveEnd = coord.getPointAtX(curve, 1);
            const touchTolerance = Math.max(1e-4, elements.markerRadius / 3);
            if (betweenInclusive(entry.y, curveStart.y, curveEnd.y, touchTolerance)) {
                const targetY = Math.max(
                    Math.min(curveStart.y, curveEnd.y),
                    Math.min(Math.max(curveStart.y, curveEnd.y), entry.y),
                );
                const curveTouch = coord.getPointAtCanvasY(curve, targetY);
                touch = { x: curveTouch.x, y: curveTouch.y };
                traceStartX = Math.max(0, Math.min(1, coord.getX(curveTouch.x)));
                // Nomographs are traversed from left to right. If the chosen
                // input lies before the horizontal line reaches this boundary
                // curve, following the curve backward would invent a
                // correction that is not present in the AFM.
                const traceDirectionTolerance = 1e-5;
                if (traceStartX > x + traceDirectionTolerance) {
                    mode = 'no-intersection';
                    touch = null;
                }
            } else {
                mode = 'no-intersection';
            }
        }

        const curveStartY = coord.getPointAtX(curve, 0).y;
        const previousCurveStartY = coord.getPointAtX(previousCurve, 0).y;
        let entryRatio = ratio;
        if (entry && mode === 'interpolated' && curveStartY !== previousCurveStartY) {
            const rawEntryRatio = (entry.y - previousCurveStartY) /
                (curveStartY - previousCurveStartY);
            entryRatio = Math.max(0, Math.min(1, rawEntryRatio));
        }
        const traceCanvasY = mode === 'interpolated' && x === 0 && entry ? entry.y : canvasY;
        const samples = mode === 'no-intersection'
            ? []
            : sampleRange(traceStartX, x, 48, (sampleX, progress) => {
                if (mode === 'curve') {
                    const point = coord.getPointAtX(curve, sampleX);
                    return { x: point.x, y: point.y };
                }
                const upperY = coord.getPointAtX(curve, sampleX).y;
                const lowerY = coord.getPointAtX(previousCurve, sampleX).y;
                const sampleRatio = x === 0
                    ? entryRatio
                    : entryRatio + (ratio - entryRatio) * progress;
                return {
                    x: coord.getCanvasX(sampleX),
                    y: lowerY === upperY
                        ? lowerY
                        : lowerY + (upperY - lowerY) * sampleRatio,
                };
            });

        elements.curve.setAttribute('d', buildPath({
            mode,
            entry,
            panelLeftX,
            panelRightX,
            touch,
            samples,
        }));
        if (mode === 'no-intersection') {
            clearExit(elements);
            return { x: panelRightX, y: entry?.y ?? traceCanvasY, valid: false };
        }
        return renderExit(elements, coord, selectedX, traceCanvasY);
    };
}
