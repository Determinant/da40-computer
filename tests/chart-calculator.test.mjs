import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const chartTraceSource = await readFile(
  new URL('../dist/assets/js/chart-trace.js', import.meta.url),
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

const inertElement = {
  addEventListener() {},
  classList: { add() {}, contains() { return false; }, remove() {}, toggle() {} },
  innerText: '',
  querySelector() { return inertElement; },
  setAttribute() {},
};
const context = vm.createContext({
  console,
  document: {
    createElementNS() {
      return makeTracePath();
    },
    getElementById(id) {
      const contentDocument = chartDocuments[id];
      return contentDocument ? { contentDocument } : inertElement;
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
    addEventListener() {},
    location: { href: 'http://localhost/da40.html', search: '' },
  },
});
vm.runInContext(chartTraceSource, context);
vm.runInContext(da40Source, context);
vm.runInContext(`
  globalThis.takeoffUnclampedCalc = createChartCalculator({
    ...takeoffChart,
    obst: { ...takeoffChart.obst, conservativeClampBelow: undefined },
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
    steps: ['press', 'mass', 'wind', 'obst']
      .filter((name) => chart[name])
      .map((name) => ({ name, curves: chart[name].curves })),
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

test('AFM take-off worked example is reproduced by both obstacle endpoints', () => {
  assertNear(calculate('takeoff', 2000, 15, 2205, 10, 0), 558, 25, 'ground roll');
  assertNear(calculate('takeoff', 2000, 15, 2205, 10, 50), 985, 35, '50 ft distance');
});

test('AFM landing worked example is reproduced by both obstacle endpoints', () => {
  assertNear(calculate('landing', 2000, 15, 2205, 10, 0), 624, 25, 'ground roll');
  // The embedded vector trace reads about 13 m conservatively above the
  // printed worked-example result of 405 m.
  assertNear(calculate('landing', 2000, 15, 2205, 10, 50), 1329, 50, '50 ft distance');
});

test('AFM climb worked examples are reproduced', () => {
  assertNear(calculate('takeoffClimb', 0, 15, 2205), 1160, 25, 'take-off climb');
  assertNear(calculate('cruiseClimb', 0, 15, 2205), 1050, 25, 'cruise climb');
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
