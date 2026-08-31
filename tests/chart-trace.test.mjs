import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../dist/assets/js/chart-trace.js', import.meta.url),
  'utf8',
);
const context = vm.createContext({});
vm.runInContext(source, context);
const trace = context.ChartTrace;

const fakePath = () => ({
  attributes: new Map(),
  setAttribute(name, value) {
    this.attributes.set(name, value);
  },
});

const fakeElements = () => ({
  curve: fakePath(),
  inputGuide: fakePath(),
  outputGuide: fakePath(),
  marker: fakePath(),
  markerRadius: 1,
});

const linearCurve = (startY, endY) => ({ startY, endY });
const linearCoordinates = {
  getCanvasX: (x) => x * 100,
  getCanvasY: (y) => y * 100,
  getX: (canvasX) => canvasX / 100,
  getPointAtX: (curve, x) => ({
    x: x * 100,
    y: curve.startY + (curve.endY - curve.startY) * x,
  }),
  getPointAtCanvasY: (curve, y) => {
    const x = (y - curve.startY) / (curve.endY - curve.startY);
    return { x: x * 100, y };
  },
};

test('interpolated paths bridge the gutter before sampling the panel', () => {
  const path = trace.buildPath({
    mode: 'interpolated',
    entry: { x: 10, y: 20 },
    panelLeftX: 15,
    panelRightX: 30,
    touch: null,
    samples: [{ x: 15, y: 20 }, { x: 25, y: 24 }],
  });
  assert.equal(path, 'M 10,20 H 15 L 15,20 L 25,24');
});

test('single-curve paths go horizontally to the touch point', () => {
  const path = trace.buildPath({
    mode: 'curve',
    entry: { x: 10, y: 20 },
    panelLeftX: 15,
    panelRightX: 30,
    touch: { x: 22, y: 20 },
    samples: [{ x: 22, y: 20 }, { x: 28, y: 25 }],
  });
  assert.equal(path, 'M 10,20 H 22 L 22,20 L 28,25');
});

test('range sampling preserves the requested endpoint order', () => {
  const samples = trace.sampleRange(0.8, 0.2, 10, (position) => ({
    x: position,
    y: position * 2,
  }));
  assert.equal(samples[0].x, 0.8);
  assert.ok(Math.abs(samples.at(-1).x - 0.2) < 1e-12);
  assert.ok(samples[1].x < samples[0].x);
});

test('no-intersection paths stop after the honest horizontal extension', () => {
  const path = trace.buildPath({
    mode: 'no-intersection',
    entry: { x: 10, y: 20 },
    panelLeftX: 15,
    panelRightX: 30,
    touch: null,
    samples: [{ x: 30, y: 25 }],
  });
  assert.equal(path, 'M 10,20 H 30');
});

test('conservative pass-through crosses the panel without inventing a curve', () => {
  const elements = fakeElements();
  elements.inputGuide.setAttribute('d', 'old-input-guide');
  elements.outputGuide.setAttribute('d', 'old-output-guide');
  elements.marker.setAttribute('d', 'old-marker');

  const exit = trace.renderPassThrough(elements, { x: 10, y: 20 }, 30);

  assert.equal(elements.curve.attributes.get('d'), 'M 10,20 H 30');
  assert.equal(elements.inputGuide.attributes.get('d'), '');
  assert.equal(elements.outputGuide.attributes.get('d'), '');
  assert.equal(elements.marker.attributes.get('d'), '');
  assert.deepEqual({ ...exit }, { x: 30, y: 20, valid: true });
});

test('conservative clamp visibly bridges to the lowest published curve', () => {
  const elements = fakeElements();
  const curve = linearCurve(20, 30);
  const exit = trace.renderClampToCurve({
    elements,
    coord: linearCoordinates,
    curve,
    x: 0.5,
    canvasY: 25,
    entry: { x: -10, y: 10 },
  });

  assert.match(elements.curve.attributes.get('d'), /^M 0,20 /);
  assert.match(elements.curve.attributes.get('d'), /L 50,25$/);
  assert.equal(
    elements.inputGuide.attributes.get('d'),
    'M -10,10 H 0 V 20 M 50,0 V 25',
  );
  assert.equal(elements.outputGuide.attributes.get('d'), 'M 50,25 H 100');
  assert.deepEqual({ ...exit }, { x: 100, y: 25, valid: true });
});

test('first-panel paths begin directly at their first sample', () => {
  const path = trace.buildPath({
    mode: 'interpolated',
    entry: null,
    panelLeftX: 15,
    panelRightX: 30,
    touch: null,
    samples: [{ x: 15, y: 20 }, { x: 25, y: 24 }],
  });
  assert.equal(path, 'M 15,20 L 25,24');
});

test('curve-mark comparisons tolerate floating-point noise', () => {
  assert.equal(trace.nearlyEqual(0.3, 0.3000000001), true);
  assert.equal(trace.nearlyEqual(0.3, 0.30001), false);
});

test('trace mode distinguishes clamped, exact, and interpolated values', () => {
  assert.equal(trace.selectMode(0, 0, 0.1, 0.2), 'curve');
  assert.equal(trace.selectMode(1, 2, 0.3 + 1e-10, 0.3), 'curve');
  assert.equal(trace.selectMode(1, 2, 0.25, 0.3), 'interpolated');
});

test('range checks work in either curve direction', () => {
  assert.equal(trace.betweenInclusive(5, 2, 8), true);
  assert.equal(trace.betweenInclusive(5, 8, 2), true);
  assert.equal(trace.betweenInclusive(9, 8, 2), false);
});

test('rendering rejects a boundary curve reached after the selected input', () => {
  const elements = fakeElements();
  const curve = linearCurve(20, 10);
  const exit = trace.render({
    elements,
    coord: linearCoordinates,
    curves: [curve],
    previousCurveIndex: 0,
    curveIndex: 0,
    curveMark: 0.2,
    output: 0.1,
    ratio: 0,
    x: 0.2,
    canvasY: 18,
    entry: { x: -10, y: 15 },
  });
  assert.equal(elements.curve.attributes.get('d'), 'M -10,15 H 100');
  assert.equal(exit.valid, false);
});

test('rendering follows a boundary curve reached before the selected input', () => {
  const elements = fakeElements();
  const curve = linearCurve(20, 10);
  const exit = trace.render({
    elements,
    coord: linearCoordinates,
    curves: [curve],
    previousCurveIndex: 0,
    curveIndex: 0,
    curveMark: 0.2,
    output: 0.1,
    ratio: 0,
    x: 0.8,
    canvasY: 12,
    entry: { x: -10, y: 15 },
  });
  const path = elements.curve.attributes.get('d');
  assert.match(path, /^M -10,15 H 50 L 50,15 /);
  assert.match(path, /L 80,12$/);
  assert.deepEqual({ ...exit }, { x: 100, y: 12, valid: true });
});

test('rendering an interpolation stays connected and ends at the calculated point', () => {
  const elements = fakeElements();
  const lower = linearCurve(20, 30);
  const upper = linearCurve(40, 50);
  trace.render({
    elements,
    coord: linearCoordinates,
    curves: [lower, upper],
    previousCurveIndex: 0,
    curveIndex: 1,
    curveMark: 0.6,
    output: 0.5,
    ratio: 0.5,
    x: 0.6,
    canvasY: 36,
    entry: { x: -10, y: 30 },
  });
  const path = elements.curve.attributes.get('d');
  assert.match(path, /^M -10,30 H 0 L 0,30 /);
  assert.match(path, /L 60,36$/);
  assert.equal(elements.outputGuide.attributes.get('d'), 'M 60,36 H 100');
});

test('rendering without a real curve intersection marks the calculation invalid', () => {
  const elements = fakeElements();
  const curve = linearCurve(20, 10);
  const exit = trace.render({
    elements,
    coord: linearCoordinates,
    curves: [curve],
    previousCurveIndex: 0,
    curveIndex: 0,
    curveMark: 0.2,
    output: 0.1,
    ratio: 0,
    x: 0.2,
    canvasY: 18,
    entry: { x: -10, y: 25 },
  });
  assert.equal(elements.curve.attributes.get('d'), 'M -10,25 H 100');
  assert.equal(elements.inputGuide.attributes.get('d'), '');
  assert.equal(elements.outputGuide.attributes.get('d'), '');
  assert.equal(elements.marker.attributes.get('d'), '');
  assert.equal(exit.valid, false);
});
