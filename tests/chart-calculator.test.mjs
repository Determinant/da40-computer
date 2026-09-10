import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const digest = value => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const chartTraceSource = await readFile(
  new URL('../dist/assets/js/chart-trace.js', import.meta.url),
  'utf8',
);
const commonSource = await readFile(
  new URL('../dist/assets/js/performance-common.js', import.meta.url),
  'utf8',
);
const flightToolsSource = await readFile(
  new URL('../dist/assets/js/flight-tools.js', import.meta.url),
  'utf8',
);
const da40Source = await readFile(
  new URL('../dist/assets/js/da40.js', import.meta.url),
  'utf8',
);

const tokenizePath = (pathData) =>
  pathData.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];

const sampleSvgPath = (pathData) => {
  const tokens = tokenizePath(pathData);
  const points = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let subpathX = 0;
  let subpathY = 0;

  const isCommand = (token) => /^[a-zA-Z]$/.test(token);
  const take = () => Number(tokens[index++]);
  const addPoint = (nextX, nextY) => {
    x = nextX;
    y = nextY;
    points.push({ x, y });
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }
    const relative = command === command.toLowerCase();
    switch (command.toLowerCase()) {
      case 'm': {
        const nextX = take() + (relative ? x : 0);
        const nextY = take() + (relative ? y : 0);
        addPoint(nextX, nextY);
        subpathX = x;
        subpathY = y;
        command = relative ? 'l' : 'L';
        break;
      }
      case 'l': {
        addPoint(take() + (relative ? x : 0), take() + (relative ? y : 0));
        break;
      }
      case 'h': {
        addPoint(take() + (relative ? x : 0), y);
        break;
      }
      case 'v': {
        addPoint(x, take() + (relative ? y : 0));
        break;
      }
      case 'c': {
        const startX = x;
        const startY = y;
        const control1X = take() + (relative ? startX : 0);
        const control1Y = take() + (relative ? startY : 0);
        const control2X = take() + (relative ? startX : 0);
        const control2Y = take() + (relative ? startY : 0);
        const endX = take() + (relative ? startX : 0);
        const endY = take() + (relative ? startY : 0);
        for (let step = 1; step <= 64; step++) {
          const t = step / 64;
          const u = 1 - t;
          addPoint(
            u ** 3 * startX + 3 * u ** 2 * t * control1X +
              3 * u * t ** 2 * control2X + t ** 3 * endX,
            u ** 3 * startY + 3 * u ** 2 * t * control1Y +
              3 * u * t ** 2 * control2Y + t ** 3 * endY,
          );
        }
        break;
      }
      case 'z': {
        addPoint(subpathX, subpathY);
        command = '';
        break;
      }
      default:
        throw new Error(`Unsupported SVG path command: ${command}`);
    }
  }
  return points;
};

const geometryFromPathData = (pathData) => {
  const points = sampleSvgPath(pathData);
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(
      lengths[index - 1] + Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].y - points[index - 1].y,
      ),
    );
  }
  const totalLength = lengths.at(-1);
  return {
    pathData,
    getTotalLength() {
      return totalLength;
    },
    getPointAtLength(requestedLength) {
      const length = Math.max(0, Math.min(totalLength, requestedLength));
      let right = lengths.findIndex((candidate) => candidate >= length);
      if (right <= 0) {
        return { ...points[0] };
      }
      const left = right - 1;
      const segmentLength = lengths[right] - lengths[left];
      const ratio = segmentLength === 0 ? 0 : (length - lengths[left]) / segmentLength;
      return {
        x: points[left].x + (points[right].x - points[left].x) * ratio,
        y: points[left].y + (points[right].y - points[left].y) * ratio,
      };
    },
  };
};

const pointAtCanvasX = (curve, canvasX) => {
  let left = 0;
  let right = curve.getTotalLength();
  if (curve.getPointAtLength(left).x > curve.getPointAtLength(right).x) {
    [left, right] = [right, left];
  }
  for (let iteration = 0; iteration < 64; iteration++) {
    const middle = (left + right) / 2;
    if (curve.getPointAtLength(middle).x < canvasX) {
      left = middle;
    } else {
      right = middle;
    }
  }
  return curve.getPointAtLength((left + right) / 2);
};

const makeTracePath = () => ({
  attributes: new Map(),
  setAttribute(name, value) {
    this.attributes.set(name, value);
  },
});

const makeChartDocument = async (relativePath, svgId, canvasId) => {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const elements = new Map();
  for (const match of source.matchAll(/<path\b[\s\S]*?\/>/g)) {
    const tag = match[0];
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const pathData = tag.match(/\bd="([^"]+)"/)?.[1];
    if (id && pathData) {
      elements.set(id, geometryFromPathData(pathData));
    }
  }
  const canvas = { appendChild() {} };
  elements.set(canvasId, canvas);
  elements.set(svgId, { namespaceURI: 'http://www.w3.org/2000/svg' });
  return {
    elements,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    querySelector(selector) {
      return elements.get(selector.replace(/^#/, '')) ?? null;
    },
  };
};

const chartDocuments = {
  takeoff: await makeChartDocument(
    '../public/assets/charts/takeoff-chart.svg',
    'svg2',
    'g10',
  ),
  landing: await makeChartDocument(
    '../public/assets/charts/landing-chart.svg',
    'svg378',
    'layer1',
  ),
  'takeoff-climb': await makeChartDocument(
    '../public/assets/charts/takeoff-climb-chart.svg',
    'svg471',
    'layer1',
  ),
  'cruise-climb': await makeChartDocument(
    '../public/assets/charts/cruise-climb-chart.svg',
    'svg471',
    'layer1',
  ),
};

const makeInlineChartHost = chartDocument => {
  const shadowRoot = {
    appendChild() {},
    querySelector(selector) {
      return chartDocument.getElementById(selector.replace(/^#/, ''));
    },
  };
  const template = {
    content: { cloneNode() { return {}; } },
    remove() {},
  };
  return {
    shadowRoot: null,
    attachShadow() {
      this.shadowRoot = shadowRoot;
      return shadowRoot;
    },
    querySelector(selector) {
      return selector === ':scope > template' ? template : null;
    },
  };
};
const inlineChartHosts = {
  'takeoff-inline': makeInlineChartHost(chartDocuments.takeoff),
  'landing-inline': makeInlineChartHost(chartDocuments.landing),
  'takeoff-climb-inline': makeInlineChartHost(chartDocuments['takeoff-climb']),
  'cruise-climb-inline': makeInlineChartHost(chartDocuments['cruise-climb']),
};

const inertElement = {
  addEventListener() {},
  classList: { add() {}, contains() { return false; }, remove() {}, toggle() {} },
  innerText: '',
  parentNode: {
    classList: { add() {}, contains() { return false; }, remove() {}, toggle() {} },
  },
  querySelector() { return inertElement; },
  querySelectorAll() { return []; },
  setAttribute() {},
};
const loadHandlers = [];
const context = vm.createContext({
  console: { ...console, error() {} },
  document: {
    cookie: '',
    createElementNS() {
      return makeTracePath();
    },
    getElementById(id) {
      const contentDocument = chartDocuments[id];
      return contentDocument
        ? { contentDocument }
        : inlineChartHosts[id] ?? inertElement;
    },
    querySelectorAll() { return []; },
  },
  JsonUrl() {
    return { compress: async () => '', decompress: async () => ({}) };
  },
  navigator: { clipboard: { writeText() {} } },
  URL,
  URLSearchParams,
  window: {
    addEventListener(eventName, handler) {
      if (eventName === 'load') {
        loadHandlers.push(handler);
      }
    },
    location: { href: 'http://localhost/da40.html', search: '' },
  },
});
vm.runInContext(chartTraceSource, context);
vm.runInContext(commonSource, context);
vm.runInContext(flightToolsSource, context);
vm.runInContext(da40Source, context);
vm.runInContext(`
  globalThis.takeoffUnclampedCalc = createChartCalculator({
    ...takeoffChart,
    obst: { ...takeoffChart.obst, conservativeClampBelow: undefined },
  });
  globalThis.takeoffInlineCalc = createChartCalculator({
    ...takeoffChart,
    doc: 'takeoff-inline',
  });
  globalThis.landingInlineCalc = createChartCalculator({
    ...landingChart,
    doc: 'landing-inline',
  });
  globalThis.takeoffClimbInlineCalc = createChartCalculator({
    ...takeoffClimbChart,
    doc: 'takeoff-climb-inline',
  });
  globalThis.cruiseClimbInlineCalc = createChartCalculator({
    ...cruiseClimbChart,
    doc: 'cruise-climb-inline',
  });
  takeoffCalc = createChartCalculator(takeoffChart);
  landingCalc = createChartCalculator(landingChart);
  takeoffClimbCalc = createChartCalculator(takeoffClimbChart);
  cruiseClimbCalc = createChartCalculator(cruiseClimbChart);
  globalThis.takeoffPressCalc = createChartCalculator({
    ...takeoffChart, mass: undefined, wind: undefined, obst: undefined,
  });
  globalThis.takeoffMassCalc = createChartCalculator({
    ...takeoffChart, wind: undefined, obst: undefined,
  });
  globalThis.takeoffNoObstCalc = createChartCalculator({ ...takeoffChart, obst: undefined });
  globalThis.landingPressCalc = createChartCalculator({
    ...landingChart, mass: undefined, wind: undefined, obst: undefined,
  });
  globalThis.landingMassCalc = createChartCalculator({
    ...landingChart, wind: undefined, obst: undefined,
  });
  globalThis.landingNoObstCalc = createChartCalculator({ ...landingChart, obst: undefined });
  globalThis.takeoffClimbPressCalc = createChartCalculator({
    ...takeoffClimbChart, mass: undefined,
  });
  globalThis.cruiseClimbPressCalc = createChartCalculator({
    ...cruiseClimbChart, mass: undefined,
  });
`, context);

const chartStructure = JSON.parse(vm.runInContext(`JSON.stringify(
  [takeoffChart, landingChart, takeoffClimbChart, cruiseClimbChart].map((chart) => ({
    doc: chart.doc,
    flipY: !!chart.flipY,
    lineWidth: chart.lineWidth ?? null,
    steps: ['press', 'mass', 'wind', 'obst']
      .filter((name) => chart[name])
      .map((name) => ({
        name,
        x: chart[name].x,
        y: chart[name].y,
        curves: chart[name].curves,
        marks: chart[name].marks ?? null,
      })),
  })),
)`, context));

const calculate = (name, ...inputs) =>
  vm.runInContext(`${name}Calc(${inputs.join(',')})`, context);

const assertNear = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test('original chart initialization survives an optional side-tool failure', () => {
  vm.runInContext(`
    takeoffCalc = undefined;
    landingCalc = undefined;
    takeoffClimbCalc = undefined;
    cruiseClimbCalc = undefined;
    globalThis.savedToolsInitialize = FlightTools.initialize;
    FlightTools.initialize = () => { throw new Error('simulated tool failure'); };
  `, context);
  try {
    assert.equal(loadHandlers.length, 1);
    loadHandlers[0]();
  } finally {
    vm.runInContext('FlightTools.initialize = globalThis.savedToolsInitialize;', context);
  }
  assert.deepEqual(
    JSON.parse(vm.runInContext(`JSON.stringify([
      typeof takeoffCalc,
      typeof landingCalc,
      typeof takeoffClimbCalc,
      typeof cruiseClimbCalc,
    ])`, context)),
    ['function', 'function', 'function', 'function'],
  );
});

test('inline shadow-root charts preserve representative original SVG calculations', () => {
  const cases = [
    ['takeoff', [2000, 15, 2205, 10, 0]],
    ['takeoff', [2000, 15, 2205, 10, 50]],
    ['landing', [2000, 15, 2205, 10, 0]],
    ['landing', [2000, 15, 2205, 10, 50]],
    ['takeoffClimb', [0, 15, 2205]],
    ['takeoffClimb', [6000, 0, 2400]],
    ['cruiseClimb', [0, 15, 2205]],
    ['cruiseClimb', [6000, 0, 2400]],
  ];
  for (const [name, inputs] of cases) {
    assert.equal(
      calculate(`${name}Inline`, ...inputs),
      calculate(name, ...inputs),
      `${name}: ${inputs.join(', ')}`,
    );
  }
});

test('configured AFM nomograph axes and curves retain their exact digitized geometry', () => {
  const geometry = chartStructure.map(chart => ({
    ...chart,
    steps: chart.steps.map(step => ({
      ...step,
      paths: [step.x, step.y, ...step.curves].map(id => {
        const path = chartDocuments[chart.doc].elements.get(id);
        assert.ok(path, `${chart.doc}: missing configured path ${id}`);
        return [id, tokenizePath(path.pathData)];
      }),
    })),
  }));
  assert.equal(
    digest(geometry),
    '08bbd7211f1f9280155ef3a85404ea3ac6c523350a297987fd2fe538c001a741',
  );
});

test('distance and climb outputs round in the conservative direction', () => {
  assert.equal(vm.runInContext('takeoffChart.output(0.10001)', context), 755);
  assert.equal(vm.runInContext('landingChart.output(0.10001)', context), 755);
  assert.equal(vm.runInContext('takeoffClimbChart.output(0.2501)', context), 1199);
  assert.equal(vm.runInContext('cruiseClimbChart.output(0.2501)', context), 1199);
});

const assertNondecreasing = (values, label) => {
  for (let index = 1; index < values.length; index++) {
    assert.ok(values[index - 1] <= values[index], `${label}: ${values.join(', ')}`);
  }
};

const assertNonincreasing = (values, label) => {
  for (let index = 1; index < values.length; index++) {
    assert.ok(values[index - 1] >= values[index], `${label}: ${values.join(', ')}`);
  }
};

const getContiguousFiniteRegion = (values, label) => {
  const firstFiniteIndex = values.findIndex(Number.isFinite);
  if (firstFiniteIndex === -1) {
    return [];
  }
  let lastFiniteIndex = values.length - 1;
  while (!Number.isFinite(values[lastFiniteIndex])) {
    lastFiniteIndex--;
  }
  const finiteRegion = values.slice(firstFiniteIndex, lastFiniteIndex + 1);
  assert.ok(
    finiteRegion.every(Number.isFinite),
    `${label}: unsupported hole inside charted region: ${values.join(', ')}`,
  );
  return finiteRegion;
};

const assertFiniteNondecreasing = (values, label) => {
  const finiteValues = getContiguousFiniteRegion(values, label);
  assert.ok(finiteValues.length >= 2, `${label}: insufficient charted values`);
  assertNondecreasing(finiteValues, label);
};

const assertFiniteNonincreasing = (values, label) => {
  const finiteValues = getContiguousFiniteRegion(values, label);
  assert.ok(finiteValues.length >= 2, `${label}: insufficient charted values`);
  assertNonincreasing(finiteValues, label);
};

test('finite interpolation results cannot contain unsupported holes', () => {
  assert.deepEqual(getContiguousFiniteRegion([NaN, 1, 2, NaN], 'boundary'), [1, 2]);
  assert.throws(
    () => getContiguousFiniteRegion([1, NaN, 2], 'hole'),
    /unsupported hole inside charted region/,
  );
});

test('all configured SVG curves satisfy the interpolation search assumptions', () => {
  for (const chart of chartStructure) {
    const document = chartDocuments[chart.doc];
    for (const step of chart.steps) {
      for (const curveId of step.curves) {
        const curve = document.elements.get(curveId);
        const length = curve.getTotalLength();
        const points = Array.from({ length: 129 }, (_, index) =>
          curve.getPointAtLength(length * index / 128));
        const xDirection = Math.sign(points.at(-1).x - points[0].x);
        const yDirection = Math.sign(points.at(-1).y - points[0].y);
        assert.notEqual(xDirection, 0, `${chart.doc}/${step.name}/${curveId}: vertical curve`);
        for (let index = 1; index < points.length; index++) {
          assert.ok(
            xDirection * (points[index].x - points[index - 1].x) >= -1e-7,
            `${chart.doc}/${step.name}/${curveId}: x reverses`,
          );
          assert.ok(
            yDirection === 0 ||
              yDirection * (points[index].y - points[index - 1].y) >= -1e-7,
            `${chart.doc}/${step.name}/${curveId}: y reverses`,
          );
        }
      }
    }
  }
});

test('take-off obstacle curves stay ordered and never intersect', () => {
  const document = chartDocuments.takeoff;
  const axis = document.elements.get('path1962');
  const axisStartX = axis.getPointAtLength(0).x;
  const axisEndX = axis.getPointAtLength(axis.getTotalLength()).x;
  const obstacleStep = chartStructure
    .find((chart) => chart.doc === 'takeoff')
    .steps.find((step) => step.name === 'obst');
  const curves = obstacleStep.curves.map((id) => document.elements.get(id));
  for (let sample = 0; sample <= 100; sample++) {
    const canvasX = axisStartX + (axisEndX - axisStartX) * sample / 100;
    const values = curves.map((curve) => pointAtCanvasX(curve, canvasX).y);
    for (let index = 1; index < values.length; index++) {
      assert.ok(
        values[index - 1] < values[index],
        `obstacle curves intersect at x=${canvasX}: ${values.join(', ')}`,
      );
    }
  }
});

test('published and worked AFM nomograph references are reproduced', () => {
  const references = [
    ['5.3.6 worked example, ground roll', 'takeoff', [2000, 15, 2205, 10, 0], 558, 25],
    ['5.3.6 worked example, 50 ft', 'takeoff', [2000, 15, 2205, 10, 50], 985, 35],
    ['5.3.7 worked example', 'takeoffClimb', [0, 15, 2205], 1160, 25],
    ['5.3.8 worked example', 'cruiseClimb', [0, 15, 2205], 1050, 25],
    ['5.3.10 worked example, ground roll', 'landing', [2000, 15, 2205, 10, 0], 624, 25],
    // The embedded vector trace reads about 13 m conservatively above the
    // printed worked-example result of 405 m.
    ['5.3.10 worked example, 50 ft', 'landing', [2000, 15, 2205, 10, 50], 1329, 50],
    // Page 5-19's 352 m note conflicts with the page 5-21 nomograph, which
    // reads approximately 285 m at the same MSL/ISA and 1150 kg condition.
    // Preserve the plotted value because this calculator explicitly traces
    // the nomograph; retain the non-conflicting 638 m note immediately below.
    ['5.3.10 MSL/ISA nomograph, ground roll', 'landing', [0, 15, 2535, 0, 0], 935, 40],
    ['5.3.10 MSL/ISA benchmark, 50 ft', 'landing', [0, 15, 2535, 0, 50], 2093, 60],
  ];
  for (const [label, chart, inputs, expected, tolerance] of references) {
    assertNear(calculate(chart, ...inputs), expected, tolerance, label);
  }
});

test('digitized AFM nomograph calculations retain their broad-grid checksums', () => {
  const altitudes = [0, 2000, 4000, 6000, 8000, 10000];
  const temperatures = [-20, 0, 15, 30, 50];
  const masses = [1874, 2205, 2535, 2646];
  const winds = [0, 10, 20];
  const obstacles = [0, 25, 50];
  const result = {};

  for (const chart of ['takeoff', 'landing']) {
    const samples = [];
    for (const altitude of altitudes) {
      for (const temperature of temperatures) {
        for (const mass of masses) {
          for (const wind of winds) {
            for (const obstacle of obstacles) {
              samples.push(calculate(
                chart,
                altitude,
                temperature,
                mass,
                wind,
                obstacle,
              ));
            }
          }
        }
      }
    }
    assert.equal(samples.length, 1080);
    result[chart] = digest(samples);
  }

  for (const chart of ['takeoffClimb', 'cruiseClimb']) {
    const samples = [];
    for (const altitude of altitudes) {
      for (const temperature of temperatures) {
        for (const mass of masses) {
          samples.push(calculate(chart, altitude, temperature, mass));
        }
      }
    }
    assert.equal(samples.length, 120);
    result[chart] = digest(samples);
  }

  assert.deepEqual(result, {
    takeoff: '38323778ac7bc8976b8fba2cb2540b041e890e032c67b6fd853fdb47abc70b70',
    landing: '7bf5b61b6b294abd695bbb6bbc1c117d3d3b69dc97f2d45c9e506a1c88f940ef',
    takeoffClimb: 'dc0c7b86fc26e60f774393effa35a87567494ad1b19c023fd10464f2942477ef',
    cruiseClimb: '87bfc15a58145702e7f0471ad094dde18f2e2b29e795c4efd70019965d361bbb',
  });
});

test('obstacle-panel reference edges preserve the preceding distance', () => {
  for (const wind of [0, 5, 10, 15, 20]) {
    assertNear(
      calculate('takeoff', 2000, 15, 2205, wind, 0),
      calculate('takeoffNoObst', 2000, 15, 2205, wind),
      1,
      `take-off at ${wind} kt`,
    );
    assertNear(
      calculate('landing', 2000, 15, 2205, wind, 50),
      calculate('landingNoObst', 2000, 15, 2205, wind),
      3,
      `landing at ${wind} kt`,
    );
  }
});

test('every correction-panel reference edge preserves its preceding result', () => {
  for (const [chart, referenceObstacle, climb] of [
    ['takeoff', 0, false],
    ['landing', 50, false],
    ['takeoffClimb', undefined, true],
    ['cruiseClimb', undefined, true],
  ]) {
    const pressureResult = calculate(`${chart}Press`, 2000, 15);
    const massResult = calculate(climb ? chart : `${chart}Mass`, 2000, 15, 2646);
    assertNear(massResult, pressureResult, 4, `${chart}: reference mass`);
    if (!climb) {
      const beforeWind = calculate(`${chart}Mass`, 2000, 15, 2646);
      const beforeObstacle = calculate(`${chart}NoObst`, 2000, 15, 2646, 0);
      assertNear(beforeObstacle, beforeWind, 4, `${chart}: zero wind`);
      assertNear(
        calculate(chart, 2000, 15, 2646, 0, referenceObstacle),
        beforeObstacle,
        4,
        `${chart}: obstacle reference`,
      );
    }
  }
});

test('dense interpolation grids contain no unsupported holes or performance reversal', () => {
  let comparisons = 0;
  const checkTrend = (values, increasing, label, identityBoundary = null) => {
    let finiteValues;
    if (identityBoundary === 'start') {
      assert.ok(Number.isFinite(values[0]), `${label}: identity result unavailable`);
      finiteValues = [values[0], ...getContiguousFiniteRegion(values.slice(1), label)];
    } else if (identityBoundary === 'end') {
      assert.ok(Number.isFinite(values.at(-1)), `${label}: identity result unavailable`);
      finiteValues = [
        ...getContiguousFiniteRegion(values.slice(0, -1), label),
        values.at(-1),
      ];
    } else {
      finiteValues = getContiguousFiniteRegion(values, label);
    }
    for (let index = 1; index < finiteValues.length; index++) {
      comparisons++;
      const valid = increasing
        ? finiteValues[index - 1] <= finiteValues[index]
        : finiteValues[index - 1] >= finiteValues[index];
      assert.ok(valid, `${label}: ${values.join(', ')}`);
    }
  };
  const altitudes = [0, 2500, 5000, 7500, 10000];
  const temperatures = [-20, -5, 15, 30, 50];
  const masses = [1874, 2094, 2205, 2400, 2646];
  const climbMasses = [2094, 2205, 2400, 2646];
  const winds = [0, 5, 10, 15, 20];
  const obstacles = [0, 10, 25, 40, 50];

  for (const chart of ['takeoff', 'landing']) {
    const referenceObstacle = chart === 'takeoff' ? 0 : 50;
    for (const temperature of temperatures) {
      checkTrend(
        altitudes.map((altitude) =>
          calculate(chart, altitude, temperature, 2205, 10, referenceObstacle)),
        true,
        `${chart}: pressure altitude`,
      );
    }
    for (const altitude of altitudes) {
      checkTrend(
        temperatures.map((temperature) =>
          calculate(chart, altitude, temperature, 2205, 10, referenceObstacle)),
        true,
        `${chart}: temperature`,
      );
      checkTrend(
        masses.map((mass) =>
          calculate(chart, altitude, 15, mass, 10, referenceObstacle)),
        true,
        `${chart}: mass`,
      );
      checkTrend(
        winds.map((wind) =>
          calculate(chart, altitude, 15, 2205, wind, referenceObstacle)),
        false,
        `${chart}: headwind`,
      );
      checkTrend(
        obstacles.map((obstacle) =>
          calculate(chart, altitude, 15, 2205, 10, obstacle)),
        true,
        `${chart}: obstacle`,
        chart === 'takeoff' ? 'start' : 'end',
      );
    }
  }

  for (const chart of ['takeoffClimb', 'cruiseClimb']) {
    for (const temperature of temperatures) {
      checkTrend(
        altitudes.map((altitude) => calculate(chart, altitude, temperature, 2205)),
        false,
        `${chart}: pressure altitude`,
      );
    }
    for (const altitude of altitudes) {
      checkTrend(
        temperatures.map((temperature) => calculate(chart, altitude, temperature, 2205)),
        false,
        `${chart}: temperature`,
      );
      checkTrend(
        [...climbMasses].reverse().map((mass) => calculate(chart, altitude, 15, mass)),
        true,
        `${chart}: lighter mass`,
      );
    }
  }
  assert.ok(comparisons >= 250, `expected broad grid coverage, got ${comparisons}`);
});

test('take-off corrections move only in their AFM directions', () => {
  assertFiniteNondecreasing(
    [1874, 2205, 2646].map((mass) => calculate('takeoff', 2000, 15, mass, 0, 50)),
    'heavier mass must not shorten take-off distance',
  );
  const winds = [0, 5, 10, 15, 20];
  const groundRolls = winds.map((wind) => calculate('takeoff', 2000, 15, 2205, wind, 0));
  const distancesOver50 = winds.map((wind) =>
    calculate('takeoff', 2000, 15, 2205, wind, 50));
  assertFiniteNonincreasing(
    groundRolls,
    'headwind must not lengthen take-off ground roll',
  );
  assertFiniteNonincreasing(
    distancesOver50,
    `headwind must not lengthen take-off 50 ft distance (ground rolls: ${groundRolls.join(', ')})`,
  );
  assertFiniteNondecreasing(
    [0, 10, 25, 40, 50].map((obstacle) =>
      calculate('takeoff', 2000, 15, 2205, 10, obstacle)),
    'higher obstacle must not shorten take-off distance',
  );
});

test('take-off obstacle clamp discards only unsupported headwind credit', () => {
  const rawHighWind = calculate('takeoffUnclamped', 2000, 15, 2205, 20, 50);
  const boundedHighWind = calculate('takeoff', 2000, 15, 2205, 20, 50);
  const chartedLowerWind = calculate('takeoffUnclamped', 2000, 15, 2205, 15, 50);
  const zeroWind = calculate('takeoffUnclamped', 2000, 15, 2205, 0, 50);
  assert.equal(Number.isNaN(rawHighWind), true);
  assert.ok(Number.isFinite(boundedHighWind));
  assert.ok(boundedHighWind <= chartedLowerWind);
  assert.ok(boundedHighWind <= zeroWind);
  assert.ok(boundedHighWind > calculate('takeoffUnclamped', 2000, 15, 2205, 20, 0));
});

test('landing corrections move only in their AFM directions', () => {
  assertNondecreasing(
    [1874, 2205, 2646].map((mass) => calculate('landing', 2000, 15, mass, 0, 50)),
    'heavier mass must not shorten landing distance',
  );
  assertNonincreasing(
    [0, 5, 10, 15, 20].map((wind) => calculate('landing', 2000, 15, 2205, wind, 50)),
    'headwind must not lengthen landing distance',
  );
  assertNondecreasing(
    [0, 10, 25, 40, 50].map((obstacle) =>
      calculate('landing', 2000, 15, 2205, 10, obstacle)),
    'higher obstacle must not shorten landing distance',
  );
});

test('climb interpolation remains monotonic and the light-mass fallback is conservative', () => {
  for (const chart of ['takeoffClimb', 'cruiseClimb']) {
    const rates = [2646, 2535, 2400, 2205, 2094].map((mass) =>
      calculate(chart, 6000, 0, mass));
    assertNondecreasing(rates, `${chart}: heavier-to-lighter mass must not reduce climb rate`);

    const maxMassRate = calculate(chart, 10000, 5, 2646);
    const lightFallback = calculate(chart, 10000, 5, 2000);
    assert.equal(lightFallback, maxMassRate);
    assert.ok(Number.isFinite(lightFallback));
  }
});

test('nomographs reject environmental extrapolation and unsafe corrections', () => {
  assert.equal(Number.isNaN(calculate('takeoff', Infinity, 15, 2205, 10, 50)), true);
  assert.equal(Number.isNaN(calculate('takeoff', 2000, NaN, 2205, 10, 50)), true);
  assert.equal(Number.isNaN(calculate('takeoff', 10001, 15, 2205, 10, 50)), true);
  assert.equal(Number.isNaN(calculate('landing', 2000, 51, 2205, 10, 50)), true);
  assert.equal(Number.isNaN(calculate('takeoff', 10000, 50, 2205, 10, 50)), true);
  assert.equal(Number.isNaN(calculate('landing', 10000, 50, 2205, 10, 50)), true);
  assert.equal(Number.isNaN(calculate('takeoffClimb', 10000, 50, 2205)), true);
  assert.ok(Number.isFinite(calculate('takeoffClimb', 10000, 5, 2205)));
  assert.equal(Number.isNaN(calculate('takeoff', 2000, 15, 2205, 10, 51)), true);
  assert.equal(Number.isNaN(calculate('takeoff', 2000, 15, 2700, 10, 50)), true);
});
