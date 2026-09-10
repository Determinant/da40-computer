import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const digest = value => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const commonSource = await readFile(
  new URL('../dist/assets/js/performance-common.js', import.meta.url),
  'utf8',
);
const flightToolsSource = await readFile(
  new URL('../dist/assets/js/flight-tools.js', import.meta.url),
  'utf8',
);
const source = await readFile(
  new URL('../dist/assets/js/da40.js', import.meta.url),
  'utf8',
);
const html = await readFile(
  new URL('../public/da40.html', import.meta.url),
  'utf8',
);
const builtHtml = await readFile(
  new URL('../dist/da40.html', import.meta.url),
  'utf8',
);

const classList = {
  add() {},
  contains() { return false; },
  remove() {},
  toggle() {},
};
const element = {
  addEventListener() {},
  classList,
  innerText: '',
  parentNode: { classList },
  querySelector() { return element; },
  querySelectorAll() { return []; },
  setAttribute() {},
  textContent: '',
};
const context = vm.createContext({
  console,
  document: {
    getElementById() { return element; },
    querySelectorAll() { return []; },
  },
  JsonUrl() {
    return {
      compress: async () => '',
      decompress: async () => ({}),
    };
  },
  navigator: { clipboard: { writeText() {} } },
  URL,
  URLSearchParams,
  window: {
    addEventListener() {},
    location: { href: 'http://localhost/da40.html', search: '' },
  },
});
vm.runInContext(commonSource, context);
vm.runInContext(flightToolsSource, context);
vm.runInContext(source, context);

const evaluate = (expression) => vm.runInContext(expression, context);
const evaluateJson = (expression) =>
  JSON.parse(evaluate(`JSON.stringify(${expression})`));
const assertClose = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test('paired integer output is blank when a value is unavailable', () => {
  assert.equal(evaluate('formatInts(NaN, NaN)'), '');
  assert.equal(evaluate('formatInts(67.4, NaN)'), '');
  assert.equal(evaluate('formatInts(67.4, 75.6)'), '67, 76');
  assert.equal(evaluate('formatSlashInts(59, 67.4)'), '59 / 67');
});

test('blank numeric input becomes NaN unless a default is provided', () => {
  assert.equal(evaluate("Number.isNaN(parseValue({ innerText: '  ' }))"), true);
  assert.equal(evaluate("parseValue({ innerText: '  ' }, 0)"), 0);
  assert.equal(evaluate("parseValue({ innerText: '-200' })"), -200);
});

test('native form values are read and written without changing saved-state text', () => {
  assert.equal(evaluate("parseValue({ value: ' 12.5 ', innerText: 'wrong' })"), 12.5);
  assert.equal(evaluate(`(() => {
    const input = { value: '' };
    setValue(input, -20);
    return input.value;
  })()`), '-20');
});

test('OAT input accepts the AFM minimum of -20 C without truncation', () => {
  const oatClasses = html.match(/class="([^"]*\boat\b[^"]*)"/)?.[1].split(/\s+/) ?? [];
  assert.ok(oatClasses.includes('max3'));
  assert.equal(evaluate("normalizeInputText('-20', 3)"), '-20');
  assert.equal(evaluate("normalizeInputText('-200', 3)"), '-20');
  assert.equal(evaluate("normalizeInputText('12\\n3', 3)"), '123');
  assert.equal(evaluate(`(() => {
    const target = { classList: ['oat', 'max3'], value: '' };
    restoreText({ querySelector: () => target }, ['oat'], { oat: '-200' });
    return target.value;
  })()`), '-20');
});

test('DA40 groups takeoff and landing in one Field Performance box', () => {
  const fieldPerformance = html.match(
    /<table class="main performance-table field-performance-table" id="field-performance">([\s\S]*?)<\/table>/,
  )?.[1] ?? '';
  assert.match(fieldPerformance, />Field Performance</);
  assert.match(fieldPerformance, />Takeoff Distance · ft</);
  assert.match(fieldPerformance, /class="takeoff-ground"/);
  assert.match(fieldPerformance, /class="takeoff-obstacle"/);
  assert.match(fieldPerformance, />Landing Distance · ft</);
  assert.match(fieldPerformance, /class="landing-ldg-ground"/);
  assert.doesNotMatch(fieldPerformance, /landing-up/);
});

test('DA40 retains exactly the four original interactive AFM chart objects', () => {
  const chartObjects = [...html.matchAll(
    /<object class="chart" data="([^"]+)" type="image\/svg\+xml" id="([^"]+)"><\/object>/g,
  )].map((match) => ({ data: match[1], id: match[2] }));
  assert.deepEqual(chartObjects, [
    { data: 'assets/charts/takeoff-chart.svg', id: 'takeoff' },
    { data: 'assets/charts/landing-chart.svg', id: 'landing' },
    { data: 'assets/charts/takeoff-climb-chart.svg', id: 'takeoff-climb' },
    { data: 'assets/charts/cruise-climb-chart.svg', id: 'cruise-climb' },
  ]);
});

test('the built DA40 page embeds those charts for direct file use', () => {
  assert.doesNotMatch(builtHtml, /<object\b[^>]*class="chart"/);
  for (const id of ['takeoff', 'landing', 'takeoff-climb', 'cruise-climb']) {
    assert.match(
      builtHtml,
      new RegExp(`<div class="chart chart-inline" id="${id}"[^>]*><template>`),
    );
  }
});

test('DA40 uses the shared general-tool implementation', () => {
  assert.match(source, /FlightTools\.initialize\(tools,/);
});

test('DA40 initializes all original SVG calculators before optional side tools', () => {
  const takeoffInit = source.indexOf('takeoffCalc = createChartCalculator(takeoffChart)');
  const landingInit = source.indexOf('landingCalc = createChartCalculator(landingChart)');
  const takeoffClimbInit = source.indexOf(
    'takeoffClimbCalc = createChartCalculator(takeoffClimbChart)',
  );
  const cruiseClimbInit = source.indexOf(
    'cruiseClimbCalc = createChartCalculator(cruiseClimbChart)',
  );
  const toolsInit = source.indexOf('FlightTools.initialize(tools');
  const recoverCall = source.indexOf('recover()', toolsInit);
  for (const chartInit of [takeoffInit, landingInit, takeoffClimbInit, cruiseClimbInit]) {
    assert.ok(chartInit >= 0 && chartInit < toolsInit);
  }
  assert.ok(toolsInit >= 0 && toolsInit < recoverCall);
  assert.match(source.slice(toolsInit, recoverCall), /catch \(error\)/);
});

test('direct-file operation does not access unsupported cookies', () => {
  const originalHref = context.window.location.href;
  context.window.location.href = 'file:///tmp/da40.html?s=saved';
  assert.equal(evaluate('supportsStateCookie()'), false);
  evaluate(`document.cookie = 'unchanged'; writeStateCookie('new-state')`);
  assert.equal(evaluate('document.cookie'), 'unchanged');
  context.window.location.href = originalHref;
});

test('airspeed interpolation clamps below its table and rejects invalid inputs', () => {
  assert.equal(evaluate('interpolateAirspeed(vys, 1800)'), 54);
  assert.equal(evaluate('Number.isNaN(interpolateAirspeed(vys, 0))'), true);
  assert.equal(evaluate('Number.isNaN(interpolateAirspeed(vys, 3000))'), true);
  assert.equal(evaluate('Number.isNaN(interpolateAirspeed([54], 2205))'), true);
});

test('linear point interpolation is order-independent, bounded, and unambiguous', () => {
  assert.equal(evaluate('interpolatePoints([[10, 100], [0, 0]], 5)'), 50);
  assert.equal(evaluate('Number.isNaN(interpolatePoints([[0, 0], [10, 100]], 11))'), true);
  assert.equal(evaluate('Number.isNaN(interpolatePoints([[0, 0], [0, 1]], 0))'), true);
  assert.equal(evaluate('Number.isNaN(interpolatePoints([[0, 0], [10, NaN]], 5))'), true);
});

test('curve bracketing checks both boundary curves before rejecting a value', () => {
  assert.deepEqual(evaluateJson('selectCurveBracket([0.2, 0.4, 0.6], 0.1)'), [0, 0]);
  assert.deepEqual(evaluateJson('selectCurveBracket([0.2, 0.4, 0.6], 0.3)'), [0, 1]);
  assert.deepEqual(evaluateJson('selectCurveBracket([0.2, 0.4, 0.6], 0.6)'), [1, 2]);
  assert.deepEqual(evaluateJson('selectCurveBracket([0.2, 0.4, 0.6], 0.7)'), [2, 2]);
  assert.equal(evaluate('selectCurveBracket([], 0.3)'), null);
});

test('engine performance data preserves representative AFM cells and recommendations', () => {
  assert.equal(evaluate('enginePerformanceTable.length'), 12);
  assert.equal(
    evaluate("enginePerformanceTable.find(x => x.power === 45 && x.rpm === 1800).fuelFlow.bestEconomy"),
    5.8,
  );
  assert.equal(
    evaluate("enginePerformanceTable.find(x => x.power === 65 && x.rpm === 2400).fuelFlow.bestPower"),
    9.8,
  );
  assert.equal(
    evaluate("enginePerformanceTable.find(x => x.power === 75 && x.rpm === 2400).manifoldPressure[5]"),
    24.1,
  );
  assert.equal(
    evaluate("enginePerformanceTable.find(x => x.power === 55 && x.rpm === 2200).manifoldPressure[12]"),
    null,
  );
  assert.deepEqual(
    evaluateJson(`enginePerformanceTable.map(column => [
      column.power,
      column.rpm,
      column.recommendedAltitude,
    ])`),
    [
      [45, 1800, [0, 11000]],
      [45, 2000, [10000, 13000]],
      [45, 2200, [12000, 16000]],
      [45, 2400, [14000, 17000]],
      [55, 2000, [0, 9000]],
      [55, 2200, [8000, 11000]],
      [55, 2400, [10000, 13000]],
      [65, 2000, null],
      [65, 2200, [0, 7000]],
      [65, 2400, [6000, 9000]],
      [75, 2200, [0, 3000]],
      [75, 2400, [2000, 5000]],
    ],
  );
});

test('AFM checksums cover every engine-performance and airspeed table cell', () => {
  const engineData = evaluateJson(`({
    pressureAltitudes: enginePerformancePressureAltitudes,
    columns: enginePerformanceTable,
  })`);
  assert.equal(engineData.pressureAltitudes.length, 18);
  assert.equal(engineData.columns.length, 12);
  assert.deepEqual(
    engineData.columns.map(column => column.manifoldPressure.length),
    Array(12).fill(engineData.pressureAltitudes.length),
  );
  assert.equal(
    digest(engineData),
    '1a2d6d00e4686a1b3ec862f21b575158f195b68a846c787be89641f4ac6cfea5',
  );

  const airspeedData = evaluateJson(`({
    weightSteps,
    takeoffClimbKias: vys,
    cruiseClimbKias: vclimbs,
    takeoffClimbKcas: vyCalibrated,
    cruiseClimbKcas: vclimbCalibrated,
    bestGlideKias: vgs,
    approachLdgKias: vappLdgs,
    emergencyToKias: vappTos,
    emergencyUpKias: vappUp,
  })`);
  assert.equal(
    digest(airspeedData),
    '44c3bf44fe4112ba0c19872bbedbbb6af736297c8a640f9870071a052ee8a409',
  );
});

test('every exact AFM engine and airspeed entry round-trips through the calculators', () => {
  const engineData = evaluateJson(`({
    pressureAltitudes: enginePerformancePressureAltitudes,
    columns: enginePerformanceTable,
  })`);
  let comparisons = 0;
  for (const column of engineData.columns) {
    for (const mixture of ['bestEconomy', 'bestPower']) {
      const expected = column.fuelFlow[mixture];
      const actual = evaluate(
        `fuelFlowAtPower(${column.power}, ${column.rpm}, '${mixture}')`,
      );
      comparisons++;
      if (expected === null) {
        assert.equal(Number.isNaN(actual), true);
      } else {
        assertClose(actual, expected);
      }
    }
    for (let index = 0; index < engineData.pressureAltitudes.length; index++) {
      const expected = column.manifoldPressure[index];
      const actual = evaluate(
        `manifoldPressureAtPower(${engineData.pressureAltitudes[index]}, ` +
          `${column.rpm}, ${column.power})`,
      );
      comparisons++;
      if (expected === null) {
        assert.equal(Number.isNaN(actual), true);
      } else {
        assertClose(actual, expected);
      }
    }
  }
  assert.equal(comparisons, 240);

  const schedules = evaluateJson(`[
    vys,
    vclimbs,
    vyCalibrated,
    vclimbCalibrated,
    vgs,
    vappLdgs,
    vappTos,
    vappUp,
  ]`);
  const roundTrippedSchedules = evaluateJson(`[
    vys,
    vclimbs,
    vyCalibrated,
    vclimbCalibrated,
    vgs,
    vappLdgs,
    vappTos,
    vappUp,
  ].map(speeds => weightSteps.map(mass => interpolateAirspeed(speeds, mass)))`);
  assert.deepEqual(roundTrippedSchedules, schedules);
});

test('engine performance calculates either AFM fuel mixture schedule', () => {
  assertClose(
    evaluate("calculateEnginePerformance(0, 2400, 24, 'bestEconomy').fuelFlow"),
    8.75,
  );
  assertClose(
    evaluate("calculateEnginePerformance(0, 2400, 24, 'bestPower').fuelFlow"),
    10.1,
  );
  assert.equal(
    evaluate("calculateEnginePerformance(0, 2400, 25.8, 'bestEconomy').fuelFlow"),
    9.5,
  );
  assert.equal(
    evaluate("calculateEnginePerformance(0, 2400, 25.8, 'bestPower').fuelFlow"),
    11,
  );
  assertClose(
    evaluate("calculateEnginePerformance(2500, 2300, 22.2625, 'bestEconomy').fuelFlow"),
    7.85,
  );
});

test('engine performance does not extrapolate beyond AFM data', () => {
  assert.equal(
    evaluate("Number.isNaN(calculateEnginePerformance(18000, 2400, 14, 'bestEconomy').fuelFlow)"),
    true,
  );
});

test('direction formatting rounds the result and wraps north correctly', () => {
  assert.equal(evaluate('FlightTools.formatDirection(12.5)'), '013');
  assert.equal(evaluate('FlightTools.formatDirection(359.6)'), '360');
});

test('descent distance retains tenths of a nautical mile', () => {
  assert.equal(evaluate('formatFloat(FlightTools.descentDistance(1000, 3), 1)'), '3.1');
  assert.equal(evaluate('formatFloat(FlightTools.descentDistance(100, 3), 1)'), '0.3');
});

test('wind navigation handles crosswinds, variation, infeasible wind, and calm wind', () => {
  assert.match(html, />E−\/W\+<\/td>/);
  assert.equal(
    evaluate('Math.round(FlightTools.calculateWindTriangle(360, 120, 270, 20).trueHeading)'),
    350,
  );
  assertClose(
    evaluate('FlightTools.calculateWindTriangle(360, 120, 270, 20).groundSpeed'),
    118.3216,
    0.001,
  );
  assert.equal(
    evaluate('Math.round(FlightTools.calculateWindTriangle(180, 120, 270, 20).trueHeading)'),
    190,
  );
  assert.equal(evaluate('FlightTools.calculateWindTriangle(0, 10, 90, 20) === null'), true);
  assert.equal(evaluate('FlightTools.formatDirection(190 - 10)'), '180');
  assert.equal(evaluate('FlightTools.formatDirection(190 + 10)'), '200');
  assert.equal(evaluate('FlightTools.calculateWindTriangle(90, 120, 0, 0).groundSpeed'), 120);
});

test('true airspeed conversion follows standard-atmosphere physics', () => {
  assertClose(evaluate('calibratedToTrueAirspeed(60, 0, 15)'), 60);

  // Independent subsonic-flow reference point at 10,000 ft ISA.
  const isaTas = evaluate('calibratedToTrueAirspeed(60, 10000, -4.8)');
  const warmTas = evaluate('calibratedToTrueAirspeed(60, 10000, 15)');
  assertClose(isaTas, 69.7894, 0.001);
  assert.ok(warmTas > isaTas);
});

test('engine-performance interpolation is bounded by the AFM table', () => {
  assertClose(evaluate("fuelFlowAtPower(50, 2300, 'bestEconomy')"), 6.9);
  assertClose(evaluate('manifoldPressureAtPower(500, 2300, 50)'), 20.575);
  assert.equal(evaluate("Number.isNaN(fuelFlowAtPower(80, 2400, 'bestEconomy'))"), true);
  assert.equal(evaluate('Number.isNaN(manifoldPressureAtPower(18000, 2400, 45))'), true);
});

test('recommended engine settings follow the AFM gray bands conservatively', () => {
  const cases = [
    ['lower edge included', 0, 1800, 22.7, true],
    ['below altitude band', 13000, 2400, 15.5, false],
    ['at altitude band', 14000, 2400, 15.3, true],
    ['unrecommended column', 0, 2000, 26.8, false],
    ['below 75% altitude band', 1000, 2400, 25.5, false],
    ['at 75% altitude band', 2000, 2400, 25.2, true],
    ['all interpolation corners recommended', 6500, 2300, 22.075, true],
    ['mixed interpolation corners', 5500, 2300, 22.4, false],
    ['recommended 75% setting', 0, 2200, 26.1, true],
    ['unrecommended interpolated power', 0, 2400, 24.6, false],
    ['outside table', 18000, 2400, 14, false],
  ];

  for (const [name, altitude, rpm, manifoldPressure, expected] of cases) {
    assert.equal(
      evaluate(`isRecommendedEngineSetting(${altitude}, ${rpm}, ${manifoldPressure})`),
      expected,
      name,
    );
  }
});

test('engine output combines fuel flow and interpolated power', () => {
  const state = evaluateJson(`(() => {
    const cell = {
      gray: false,
      classList: { toggle(_name, enabled) { cell.gray = enabled; } },
    };
    const nodes = {
      '.ep-alt': { innerText: '0' },
      '.ep-rpm': { innerText: '2200' },
      '.ep-mp': { innerText: '24.9' },
      '.ep-output': { innerText: '', parentNode: cell },
      '.ep-best-power': { checked: false },
    };
    const toolsElement = { querySelector(selector) { return nodes[selector]; } };
    refreshEnginePerformance(toolsElement);
    const recommended = [nodes['.ep-output'].innerText, cell.gray];
    nodes['.ep-rpm'].innerText = '2400';
    nodes['.ep-mp'].innerText = '23.4';
    refreshEnginePerformance(toolsElement);
    const notRecommended = [nodes['.ep-output'].innerText, cell.gray];
    nodes['.ep-mp'].innerText = '24';
    refreshEnginePerformance(toolsElement);
    const interpolated = [nodes['.ep-output'].innerText, cell.gray];
    nodes['.ep-alt'].innerText = '18000';
    refreshEnginePerformance(toolsElement);
    return [
      recommended,
      notRecommended,
      interpolated,
      [nodes['.ep-output'].innerText, cell.gray],
    ];
  })()`);
  assert.deepEqual(state, [
    ['8.20 gal/h, 65 % Power', true],
    ['8.50 gal/h, 65 % Power', false],
    ['8.75 gal/h, 68 % Power', false],
    ['', false],
  ]);
});

test('climb CAS tables match conservative AFM chart readings', () => {
  assert.deepEqual(
    evaluateJson('weightSteps.map(mass => interpolateAirspeed(vyCalibrated, mass))'),
    [58, 64, 69, 70],
  );
  assert.deepEqual(
    evaluateJson('weightSteps.map(mass => interpolateAirspeed(vclimbCalibrated, mass))'),
    [66, 73, 78, 81],
  );
});

test('climb gradient uses mass-dependent calibrated airspeed', () => {
  assert.equal(evaluate('interpolateAirspeed(vys, 2205)'), 60);
  assertClose(
    evaluate(
      'feetPerNauticalMile(600, calibratedToTrueAirspeed(interpolateAirspeed(vyCalibrated, 2205), 0, 15))',
    ),
    562.5,
  );
});

test('nomograph fallbacks ignore only favorable adjustments', () => {
  assert.equal(evaluate('takeoffClimbChart.mass.conservativePassThrough(2000)'), true);
  assert.equal(evaluate('cruiseClimbChart.mass.conservativePassThrough(2000)'), true);
  assert.equal(evaluate('takeoffChart.mass.conservativePassThrough(1800)'), true);
  assert.equal(evaluate('landingChart.mass.conservativePassThrough(1800)'), true);
  assert.equal(evaluate('takeoffChart.mass.conservativePassThrough(2700)'), false);
  assert.equal(evaluate('landingChart.mass.conservativePassThrough(2700)'), false);

  assert.equal(evaluate('takeoffChart.wind.conservativePassThrough(25)'), true);
  assert.equal(evaluate('landingChart.wind.conservativePassThrough(25)'), true);
  assert.equal(evaluate('takeoffChart.wind.conservativePassThrough(-1)'), false);
  assert.equal(evaluate('landingChart.wind.conservativePassThrough(-1)'), false);

  assert.equal(evaluate('takeoffChart.obst.conservativePassThrough(0)'), true);
  assert.equal(evaluate('landingChart.obst.conservativePassThrough(0)'), true);
  assert.equal(evaluate('takeoffChart.obst.conservativeClampBelow(0)'), false);
  assert.equal(evaluate('takeoffChart.obst.conservativeClampBelow(25)'), true);
  assert.equal(evaluate('takeoffChart.obst.conservativeClampBelow(51)'), false);
  assert.equal(evaluate('takeoffChart.obst.conservativePassThrough(25)'), false);
  assert.equal(evaluate('landingChart.obst.conservativePassThrough(25)'), true);
  assert.equal(evaluate('takeoffChart.obst.conservativePassThrough(50)'), false);
  assert.equal(evaluate('landingChart.obst.conservativePassThrough(50)'), true);
  assert.equal(evaluate('landingChart.obst.conservativePassThrough(51)'), false);
});

test('loading limits enforce zero-fuel and baggage limits', () => {
  const checkLimits = (masses, zeroFuelMass) =>
    evaluate(`checkLoadingLimits(${JSON.stringify(masses)}, ${zeroFuelMass})`);
  const atLimits = [180, 180, 150, 150, 66, 11, 60, 40];
  const overStationLimits = [
    ['standard baggage', [180, 180, 150, 150, 67, 11, 60, 40]],
    ['baggage tube', [180, 180, 150, 150, 66, 12, 60, 40]],
    ['combined extended baggage', [180, 180, 150, 150, 66, 11, 61, 40]],
    ['extended aft baggage', [180, 180, 150, 150, 66, 11, 60, 41]],
  ];

  assert.equal(checkLimits(atLimits, 2535), true);
  assert.equal(checkLimits(atLimits, 2536), false);
  for (const [name, masses] of overStationLimits) {
    assert.equal(checkLimits(masses, 2535), false, name);
  }
});

test('forward CG limit follows the MAM 40-227 selection', () => {
  assert.equal(evaluate('checkCG(2535, 96.9, false, false)'), 0);
  assert.equal(evaluate('checkCG(2535, 96.895, false, false)'), -1);
  assert.equal(evaluate('checkCG(2535, 96.895, false, true)'), 0);
  assert.equal(evaluate('checkCG(2646, 97.6, false, true)'), 0);
  assert.equal(evaluate('Number.isNaN(checkCG(NaN, 96.9, false, false))'), true);
});

test('loading condition requires both zero-fuel and fueled CG to be within limits', () => {
  const zeroFuelMass = 2000;
  const zeroFuelMoment = zeroFuelMass * 94;
  const fuelMass = 40 * 6.01;
  const totalMass = zeroFuelMass + fuelMass;
  const totalMoment = zeroFuelMoment + fuelMass * 103.5;

  assert.equal(
    evaluate(`checkCG(${totalMass}, ${totalMoment / totalMass}, false, true)`),
    0,
  );
  assert.equal(
    evaluate(`areLoadingCGsWithinLimits(${zeroFuelMass}, ${zeroFuelMoment}, ${totalMass}, ${totalMoment}, false, true)`),
    false,
  );
});
