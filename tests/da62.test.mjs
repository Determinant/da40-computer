import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sources = await Promise.all([
  'performance-common.js',
  'da62-data.js',
  'da62.js',
].map(fileName => readFile(
  new URL(`../dist/assets/js/${fileName}`, import.meta.url),
  'utf8',
)));
const html = await readFile(
  new URL('../public/da62.html', import.meta.url),
  'utf8',
);

const context = vm.createContext({
  console,
  document: { getElementById: () => null },
});
for (const source of sources) {
  vm.runInContext(source, context);
}

const evaluate = expression => vm.runInContext(expression, context);
const evaluateJson = expression => JSON.parse(evaluate(`JSON.stringify(${expression})`));
const assertClose = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`,
);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('AFM arrays retain every published weight and altitude row', () => {
  assert.equal(evaluate(`Object.values(da62TakeoffTables).every(flap =>
    Object.values(flap).length === 6 && Object.values(flap).every(rows => rows.length === 11))`), true);
  assert.equal(evaluate(`[
    ...Object.values(da62TakeoffClimbTables),
    da62CruiseClimbTables,
    da62OeiClimbTables,
  ].every(table => Object.values(table).length === 6 &&
    Object.values(table).every(rows => rows.length === 11))`), true);
  assert.equal(evaluate(`Object.values(da62LandingTables).every(configuration =>
    Object.values(configuration).length === 6 &&
    Object.values(configuration).every(rows => rows.length === 11))`), true);
  assert.equal(evaluate(`Object.values(da62GoAroundClimbTables).length === 6 &&
    Object.values(da62GoAroundClimbTables).every(rows => rows.length === 6)`), true);
  assert.equal(evaluate(`[
    ...Object.values(da62TakeoffIsaTables),
    ...Object.values(da62LandingIsaTables),
  ].every(table => Object.values(table).length === 6 &&
    Object.values(table).every(fields =>
      fields.groundRoll.length === 11 && fields.over50ft.length === 11))`), true);
});

test('AFM array checksums cover every digitized performance cell', () => {
  const tables = evaluateJson(`[
    da62TakeoffTables,
    da62LandingTables,
    da62TakeoffClimbTables,
    da62CruiseClimbTables,
    da62OeiClimbTables,
    da62TakeoffIsaTables,
    da62LandingIsaTables,
    da62ClimbIsaTables,
    da62GoAroundClimbTables,
  ]`);
  assert.deepEqual(tables.map(digest), [
    '73c1d96de1c7c96abfd6c46588e12ddc453e179099d2187074016343e2e97b74',
    '85726d0847a069179148afcb5ff6f4671e958832db50ded32ff873185570f4ac',
    '6fba9ee275a286f344641cc0068577c98b72a20205aaa2ef39e362186004ff60',
    '72ea0df33d4f3b0a3f24d6222e41fe15ac899b7ba37717fadefe1da7b7142912',
    'd24eea57a30709ac0d1fdd10e08299c9680113e819eb808dbd65f54847fe6c5a',
    '55331bc0fe243d3ddcdfd52949066448a2a1c1a5d9706d820c1ee07f02837653',
    'b808f5f740b26ca25ee7e83f77c09216ab17a39d3b0cd7b2ff7676a854c51f64',
    '8214e53337e945c6e2d0c0cf341df04a5fbc22acc89d318394fb1e40eb6133d6',
    '5fd5968534698e4d4c9c43c65f5bce1c16be898b8dfdbac4b22975f87dade196',
  ]);
});

test('takeoff arrays preserve representative AFM cells', () => {
  assert.deepEqual(
    evaluateJson("DA62.calculateTakeoff(5071, 0, 0, 0, 'TO')"),
    { vrKias: 78, v50Kias: 86, groundRoll: 1450, over50ft: 2550 },
  );
  assert.deepEqual(
    evaluateJson("DA62.calculateTakeoff(3968, 0, 0, 0, 'UP')"),
    { vrKias: 80, v50Kias: 87, groundRoll: 1200, over50ft: 1700 },
  );
  assert.equal(
    evaluate("DA62.calculateTakeoff(4630, 10000, 0, 0, 'TO').over50ft"),
    4000,
  );
});

test('takeoff calculation interpolates weight, altitude, and OAT', () => {
  const result = evaluateJson("DA62.calculateTakeoff(4960.5, 500, 5, 0, 'TO')");
  assertClose(result.groundRoll, 1518.75);
  assertClose(result.over50ft, 2618.75);
  assertClose(result.vrKias, 78);
  assertClose(result.v50Kias, 86);
});

test('takeoff wind factors follow the AFM corrections', () => {
  assertClose(evaluate('DA62.takeoffWindFactor(12)'), 0.9);
  assertClose(evaluate('DA62.takeoffWindFactor(-3)'), 1.1);
  assert.equal(evaluate('Number.isNaN(DA62.takeoffWindFactor(120))'), true);
  assertClose(
    evaluate("DA62.calculateTakeoff(5071, 0, 0, 12, 'TO').groundRoll"),
    1305,
  );
});

test('table interpolation rejects holes and applies the AFM low-weight rule', () => {
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateTakeoff(5071, 10000, 40, 0, 'TO').groundRoll)"),
    true,
  );
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateTakeoff(5071, 9500, 35, 0, 'TO').groundRoll)"),
    true,
  );
  assert.deepEqual(
    evaluateJson("DA62.calculateTakeoff(3900, 0, 0, 0, 'TO')"),
    evaluateJson("DA62.calculateTakeoff(3968, 0, 0, 0, 'TO')"),
  );
  assert.equal(evaluate(
    "Number.isNaN(DA62.calculateTakeoff(3526.9, 0, 0, 0, 'TO').groundRoll)",
  ), true);
});

test('landing arrays preserve normal and abnormal-flap AFM cells', () => {
  assert.deepEqual(
    evaluateJson("DA62.calculateLanding(5071, 0, 0, 0, 'LDG')"),
    { vrefKias: 89, groundRoll: 1400, over50ft: 2500 },
  );
  assert.deepEqual(
    evaluateJson("DA62.calculateLanding(3968, 0, 0, 0, 'TO')"),
    { vrefKias: 88, groundRoll: 1450, over50ft: 2700 },
  );
  assert.deepEqual(
    evaluateJson("DA62.calculateLanding(3968, 0, 0, 0, 'UP')"),
    { vrefKias: 91, groundRoll: 1450, over50ft: 2700 },
  );
});

test('landing calculation interpolates each table axis and applies AFM wind factors', () => {
  const result = evaluateJson("DA62.calculateLanding(4960.5, 500, 5, 0, 'LDG')");
  assertClose(result.vrefKias, 89);
  assertClose(result.groundRoll, 1425);
  assertClose(result.over50ft, 2531.25);
  assertClose(evaluate('DA62.landingWindFactor(20)'), 0.9);
  assertClose(evaluate('DA62.landingWindFactor(-3)'), 1.1);
  assertClose(
    evaluate("DA62.calculateLanding(5071, 0, 0, 20, 'LDG').groundRoll"),
    1260,
  );
});

test('landing interpolation rejects hatched and out-of-range cells', () => {
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateLanding(5071, 10000, 40, 0, 'LDG').groundRoll)"),
    true,
  );
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateLanding(5071, 9500, 35, 0, 'UP').over50ft)"),
    true,
  );
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateLanding(5200, 0, 0, 0, 'LDG').groundRoll)"),
    true,
  );
});

test('AFM Section 5.2 lower bounds and published ISA anchors are retained', () => {
  assert.deepEqual(
    evaluateJson("DA62.calculateLanding(3900, 0, -5, 0, 'LDG')"),
    evaluateJson("DA62.calculateLanding(3968, 0, 0, 0, 'LDG')"),
  );
  assert.deepEqual(
    evaluateJson("DA62.calculateTakeoff(5071, 0, 15, 0, 'TO')"),
    { vrKias: 78, v50Kias: 86, groundRoll: 1574, over50ft: 2730 },
  );
  assert.deepEqual(
    evaluateJson("DA62.calculateLanding(5071, 0, 15, 0, 'LDG')"),
    { vrefKias: 89, groundRoll: 1446, over50ft: 2555 },
  );
  assert.equal(
    evaluate("DA62.calculateTakeoff(5071, 10000, -4.8, 0, 'TO').over50ft"),
    4803,
  );
  assert.equal(
    evaluate("DA62.calculateClimb('cruise', 5071, 20000, -24.6).rateFpm"),
    498,
  );
  assert.equal(
    evaluate("DA62.calculateClimb('cruise', 5071, 0, -30).rateFpm"),
    evaluate("DA62.calculateClimb('cruise', 5071, 0, -20).rateFpm"),
  );
});

test('DA62 groups takeoff and landing in one Field Performance box', () => {
  const fieldPerformance = html.match(
    /<table class="main performance-table field-performance-table" id="field-performance">([\s\S]*?)<\/table>/,
  )?.[1] ?? '';
  assert.match(fieldPerformance, />Field Performance</);
  assert.match(fieldPerformance, />Takeoff Distance · ft</);
  assert.match(fieldPerformance, />Landing Distance · ft</);
  assert.match(fieldPerformance, /class="result landing-ldg-ground"/);
  assert.match(fieldPerformance, />T\/O \/ UP</);
  assert.equal((fieldPerformance.match(/landing-abnormal-ground/g) ?? []).length, 1);
  assert.doesNotMatch(fieldPerformance, /landing-(?:to|up)-ground/);
  assert.doesNotMatch(html, /id="takeoff-performance"/);
});

test('DA62 exposes AFM go-around, OEI guidance, and twin-engine fuel flow', () => {
  assert.match(html, /class="result climb-go-around-rate"/);
  assert.match(html, /class="result climb-go-around-gradient"/);
  assert.match(html, /class="ff-power update"/);
  assert.match(html, /class="ff-per-engine"/);
  assert.match(html, /class="ff-total"/);
  assert.match(html, /below 3\.3% is highlighted/i);
});

test('DA62 defaults to a representative US seven-seat, TKS, and radar configuration', () => {
  for (const name of ['mam-62-001', 'oam-62-019', 'oam-62-002', 'oam-62-009']) {
    assert.match(
      html,
      new RegExp(`<input type="checkbox"[^>]*name="${name}"[^>]*checked>`),
      `${name} should be enabled in the default DA62 configuration.`,
    );
  }
  for (const name of ['mam-62-063', 'oam-62-001']) {
    assert.doesNotMatch(
      html,
      new RegExp(`<input type="checkbox"[^>]*name="${name}"[^>]*checked>`),
      `${name} should remain aircraft-specific rather than enabled by default.`,
    );
  }
  assert.match(html, /Garmin GWX 70 weather radar · OÄM 62-009/);
  assert.match(html, /including weather radar and the dry TKS system/);
});

test('DA62 follows the original blank-output validation behavior', () => {
  assert.doesNotMatch(html, /calculation-status/);
  assert.doesNotMatch(html, />—</);
});

test('DA62 keeps detailed rear-baggage stations out of the primary weights table', () => {
  const weights = html.match(
    /<table class="main weights-table" id="weights">([\s\S]*?)<\/table>/,
  )?.[1] ?? '';
  const editor = html.match(
    /<dialog id="rear-baggage-dialog"([\s\S]*?)<\/dialog>/,
  )?.[1] ?? '';
  assert.match(weights, />Rear Baggage</);
  assert.doesNotMatch(weights, /rear-[a-f]-mass/);
  assert.match(editor, /rear-baggage-five-seat/);
  assert.match(editor, /rear-baggage-seven-seat/);
  for (const area of ['a', 'b', 'c', 'd', 'e', 'f']) {
    assert.match(editor, new RegExp(`rear-${area}-mass`));
  }
});

test('DA62 restores primary calculations before optional General Tools', () => {
  const source = sources[2];
  const restoreCall = source.lastIndexOf('void restore(urlState || cookieState)');
  const toolsInit = source.lastIndexOf('FlightTools.initialize(tools');
  assert.ok(restoreCall >= 0 && restoreCall < toolsInit);
  assert.match(source.slice(toolsInit), /catch \(error\)/);
  assert.match(source, /supportsStateCookie\(\)/);
});

test('climb arrays preserve all DA62 climb modes', () => {
  assert.equal(evaluate("DA62.calculateClimb('takeoff', 5071, 0, -20, 'TO').rateFpm"), 990);
  assert.equal(evaluate("DA62.calculateClimb('takeoff', 5071, 0, -20, 'UP').rateFpm"), 1040);
  assert.equal(evaluate("DA62.calculateClimb('cruise', 4630, 0, -20).rateFpm"), 1200);
  assert.equal(evaluate("DA62.calculateClimb('oei', 5071, 20000, 10).rateFpm"), -285);
});

test('climb speed and rate interpolate while gradients use calibrated TAS', () => {
  const result = evaluateJson("DA62.calculateClimb('takeoff', 4518.5, 1000, 5, 'TO')");
  assertClose(result.kias, 84.5);
  assert.ok(Number.isFinite(result.rateFpm));
  assert.equal(evaluate('DA62.indicatedToCalibratedAirspeed(85)'), 84);
  assert.ok(result.ktas > evaluate('DA62.indicatedToCalibratedAirspeed(84.5)'));
  assertClose(result.gradientPercent, result.rateFpm / result.ktas * 0.98);
});

test('go-around climb and fuel flow reproduce their AFM tables', () => {
  assert.deepEqual(
    evaluateJson("DA62.calculateClimb('goAround', 5071, 0, -20)"),
    {
      kias: 89,
      ktas: evaluate('PerformanceCommon.calibratedToTrueAirspeed(88, 0, -20)'),
      rateFpm: 460,
      gradientPercent: 460 /
        evaluate('PerformanceCommon.calibratedToTrueAirspeed(88, 0, -20)') * 0.98,
    },
  );
  assert.equal(
    evaluate("DA62.calculateClimb('goAround', 3968, 10000, -4.8).rateFpm"),
    604,
  );
  assert.deepEqual(
    evaluateJson('DA62.calculateFuelFlow(75)'),
    { perEngineGph: 7.4, totalGph: 14.8 },
  );
  assert.deepEqual(
    evaluateJson('DA62.calculateFuelFlow(72.5)'),
    { perEngineGph: 7.15, totalGph: 14.3 },
  );
  const fuelFlow = [
    [30, 3.3], [35, 3.7], [40, 4.1], [45, 4.5], [50, 4.9],
    [55, 5.4], [60, 5.9], [65, 6.4], [70, 6.9], [75, 7.4],
    [80, 7.8], [85, 8.3], [90, 9.0], [95, 9.7], [100, 10.3],
  ];
  for (let index = 0; index < fuelFlow.length; index++) {
    const [power, expected] = fuelFlow[index];
    assert.deepEqual(
      evaluateJson(`DA62.calculateFuelFlow(${power})`),
      { perEngineGph: expected, totalGph: expected * 2 },
    );
    if (index > 0) {
      const [previousPower, previousFlow] = fuelFlow[index - 1];
      const midpoint = (power + previousPower) / 2;
      const expectedMidpoint = (expected + previousFlow) / 2;
      const result = evaluateJson(`DA62.calculateFuelFlow(${midpoint})`);
      assertClose(result.perEngineGph, expectedMidpoint);
      assertClose(result.totalGph, expectedMidpoint * 2);
    }
  }
  assert.equal(evaluate('Number.isNaN(DA62.calculateFuelFlow(29).totalGph)'), true);
  assert.equal(evaluate('Number.isNaN(DA62.calculateFuelFlow(101).totalGph)'), true);
  assert.equal(evaluate(
    "Number.isNaN(DA62.calculateClimb('goAround', 5071, 10001, 0).rateFpm)",
  ), true);
});

test('exhaustive AFM grids, ISA anchors, winds, interiors, holes, and gradients agree', () => {
  const app = evaluate('DA62');
  const data = evaluateJson(`({
    takeoff: da62TakeoffTables,
    landing: da62LandingTables,
    takeoffIsa: da62TakeoffIsaTables,
    landingIsa: da62LandingIsaTables,
    takeoffClimb: da62TakeoffClimbTables,
    cruiseClimb: da62CruiseClimbTables,
    oeiClimb: da62OeiClimbTables,
    goAroundClimb: da62GoAroundClimbTables,
    climbIsa: da62ClimbIsaTables,
  })`);
  const weights = [3968, 4189, 4407, 4630, 4850, 5071];
  const distanceAltitudes = Array.from({ length: 11 }, (_, index) => index * 1000);
  const climbAltitudes = Array.from({ length: 11 }, (_, index) => index * 2000);
  const goAroundAltitudes = climbAltitudes.slice(0, 6);
  const distanceTemperatures = [0, 10, 20, 30, 40, 50];
  const climbTemperatures = [-20, -10, 0, 10, 20, 30, 40, 50];
  const ratios = [
    [0.01, 0.01, 0.01],
    [0.25, 0.5, 0.75],
    [0.37, 0.41, 0.63],
    [0.73, 0.19, 0.91],
    [0.99, 0.99, 0.99],
  ];
  let comparisons = 0;
  const verify = (actual, expected, label) => {
    comparisons++;
    if (Number.isFinite(expected)) {
      assertClose(actual, expected, 1e-7);
    } else {
      assert.equal(Number.isNaN(actual), true, label);
    }
  };
  const lerp = (start, end, ratio) => start + (end - start) * ratio;
  const bracket = (axis, input) => {
    const exact = axis.findIndex(value => Math.abs(value - input) < 1e-9);
    if (exact >= 0) return [exact, exact, 0];
    for (let index = 1; index < axis.length; index++) {
      if (axis[index - 1] < input && input < axis[index]) {
        return [index - 1, index,
          (input - axis[index - 1]) / (axis[index] - axis[index - 1])];
      }
    }
    return null;
  };
  const interpolatePoints = (points, input) => {
    const sorted = points.toSorted(([first], [second]) => first - second);
    const bounded = Math.max(input, sorted[0][0]);
    const exact = sorted.find(([, value], index) =>
      Math.abs(sorted[index][0] - bounded) < 1e-9 && Number.isFinite(value));
    if (exact) return exact[1];
    for (let index = 1; index < sorted.length; index++) {
      const [x0, y0] = sorted[index - 1];
      const [x1, y1] = sorted[index];
      if (x0 < bounded && bounded < x1) {
        return lerp(y0, y1, (bounded - x0) / (x1 - x0));
      }
    }
    return NaN;
  };
  const oracle = (table, isa, altitudes, temperatures, weight, altitude, oat) => {
    const boundedWeight = 3527 <= weight && weight < 3968 ? 3968 : weight;
    const weightBracket = bracket(weights, boundedWeight);
    const altitudeBracket = bracket(altitudes, altitude);
    if (!weightBracket || !altitudeBracket) return NaN;
    const row = (weightIndex, altitudeIndex) => {
      const points = table[weightIndex][altitudeIndex]
        .map((value, index) => [temperatures[index], value])
        .filter(([, value]) => Number.isFinite(value));
      points.push([15 - 1.98 * altitudes[altitudeIndex] / 1000,
        isa[weightIndex][altitudeIndex]]);
      return interpolatePoints(points, oat);
    };
    const values = [weightBracket[0], weightBracket[1]].map(weightIndex =>
      [altitudeBracket[0], altitudeBracket[1]].map(altitudeIndex =>
        row(weightIndex, altitudeIndex)));
    if (values.flat().some(value => !Number.isFinite(value))) return NaN;
    return lerp(
      lerp(values[0][0], values[0][1], altitudeBracket[2]),
      lerp(values[1][0], values[1][1], altitudeBracket[2]),
      weightBracket[2],
    );
  };

  const distanceCases = [
    ['takeoff', 'TO', 'TO'], ['takeoff', 'UP', 'UP'],
    ['landing', 'LDG', 'LDG'], ['landing', 'ABNORMAL', 'UP'],
  ];
  for (const [kind, configuration, flap] of distanceCases) {
    const tableSource = data[kind][configuration];
    const isaSource = data[`${kind}Isa`][configuration];
    for (const weight of weights) {
      for (const [altitudeIndex, altitude] of distanceAltitudes.entries()) {
        for (const [temperatureIndex, temperature] of distanceTemperatures.entries()) {
          const result = kind === 'takeoff'
            ? app.calculateTakeoff(weight, altitude, temperature, 0, flap)
            : app.calculateLanding(weight, altitude, temperature, 0, flap);
          for (const field of ['groundRoll', 'over50ft']) {
            const expected = tableSource[String(weight)][altitudeIndex][field][temperatureIndex];
            verify(result[field], expected,
              `${kind}/${configuration}/${weight}/${altitude}/${temperature}/${field}`);
            if (Number.isFinite(expected)) {
              const headwind = kind === 'takeoff' ? 12 : 20;
              const headwindResult = kind === 'takeoff'
                ? app.calculateTakeoff(weight, altitude, temperature, headwind, flap)
                : app.calculateLanding(weight, altitude, temperature, headwind, flap);
              const tailwindResult = kind === 'takeoff'
                ? app.calculateTakeoff(weight, altitude, temperature, -3, flap)
                : app.calculateLanding(weight, altitude, temperature, -3, flap);
              verify(headwindResult[field], expected * 0.9, 'headwind correction');
              verify(tailwindResult[field], expected * 1.1, 'tailwind correction');
            }
          }
        }
        const isaTemperature = 15 - 1.98 * altitude / 1000;
        const isaResult = kind === 'takeoff'
          ? app.calculateTakeoff(weight, altitude, isaTemperature, 0, flap)
          : app.calculateLanding(weight, altitude, isaTemperature, 0, flap);
        verify(isaResult.groundRoll, isaSource[String(weight)].groundRoll[altitudeIndex],
          'ISA ground roll');
        verify(isaResult.over50ft, isaSource[String(weight)].over50ft[altitudeIndex],
          'ISA obstacle distance');
      }
    }
    const grids = Object.fromEntries(['groundRoll', 'over50ft'].map(field => [
      field,
      weights.map(weight => tableSource[String(weight)].map(row => row[field])),
    ]));
    const isaGrids = Object.fromEntries(['groundRoll', 'over50ft'].map(field => [
      field,
      weights.map(weight => isaSource[String(weight)][field]),
    ]));
    for (let weightIndex = 0; weightIndex < weights.length - 1; weightIndex++) {
      for (let altitudeIndex = 0;
        altitudeIndex < distanceAltitudes.length - 1; altitudeIndex++) {
        for (let temperatureIndex = 0;
          temperatureIndex < distanceTemperatures.length - 1; temperatureIndex++) {
          for (const [weightRatio, altitudeRatio, temperatureRatio] of ratios) {
            const weight = lerp(weights[weightIndex], weights[weightIndex + 1], weightRatio);
            const altitude = lerp(
              distanceAltitudes[altitudeIndex],
              distanceAltitudes[altitudeIndex + 1],
              altitudeRatio,
            );
            const temperature = lerp(
              distanceTemperatures[temperatureIndex],
              distanceTemperatures[temperatureIndex + 1],
              temperatureRatio,
            );
            const result = kind === 'takeoff'
              ? app.calculateTakeoff(weight, altitude, temperature, 0, flap)
              : app.calculateLanding(weight, altitude, temperature, 0, flap);
            for (const field of ['groundRoll', 'over50ft']) {
              verify(result[field], oracle(
                grids[field], isaGrids[field], distanceAltitudes,
                distanceTemperatures, weight, altitude, temperature,
              ), `${kind} interpolation`);
            }
          }
        }
      }
    }
  }

  const climbCases = [
    ['takeoff', 'TO', data.takeoffClimb.TO, data.climbIsa.TO, climbAltitudes],
    ['takeoff', 'UP', data.takeoffClimb.UP, data.climbIsa.UP, climbAltitudes],
    ['cruise', 'UP', data.cruiseClimb, data.climbIsa.cruise, climbAltitudes],
    ['oei', 'UP', data.oeiClimb, data.climbIsa.oei, climbAltitudes],
    ['goAround', 'UP', data.goAroundClimb, data.climbIsa.goAround, goAroundAltitudes],
  ];
  const calibration = [[75, 74], [80, 79], [85, 84], [90, 89], [95, 94], [100, 99]];
  const calibratedToTrue = (kcas, altitude, oat) => {
    const standardTemperature = 288.15 - 0.0065 * altitude * 0.3048;
    const pressure = 101325 * Math.pow(standardTemperature / 288.15, 5.2558797);
    const seaSound = Math.sqrt(1.4 * 287.05287 * 288.15);
    const seaMachSquared = Math.pow(kcas * 0.5144444444444445 / seaSound, 2);
    const impact = 101325 * (
      Math.pow(1 + 0.2 * seaMachSquared, 3.5) - 1
    );
    const localMachSquared = 5 * (Math.pow(impact / pressure + 1, 2 / 7) - 1);
    const localSound = Math.sqrt(1.4 * 287.05287 * (oat + 273.15));
    return Math.sqrt(localMachSquared) * localSound / 0.5144444444444445;
  };
  for (const [mode, flap, tableSource, isaSource, altitudes] of climbCases) {
    const grid = weights.map(weight => tableSource[String(weight)]);
    const isaGrid = weights.map(weight => isaSource[String(weight)]);
    for (const weight of weights) {
      for (const [altitudeIndex, altitude] of altitudes.entries()) {
        for (const [temperatureIndex, temperature] of climbTemperatures.entries()) {
          const result = app.calculateClimb(mode, weight, altitude, temperature, flap);
          const expected = tableSource[String(weight)][altitudeIndex][temperatureIndex];
          verify(result.rateFpm, expected, `${mode}/${weight}/${altitude}/${temperature}`);
          if (Number.isFinite(expected)) {
            const kcas = interpolatePoints(calibration, result.kias);
            const expectedGradient = expected /
              calibratedToTrue(kcas, altitude, temperature) * 0.98;
            verify(result.gradientPercent, expectedGradient, `${mode} gradient`);
          }
        }
        const isaTemperature = 15 - 1.98 * altitude / 1000;
        verify(
          app.calculateClimb(mode, weight, altitude, isaTemperature, flap).rateFpm,
          isaSource[String(weight)][altitudeIndex],
          `${mode} ISA`,
        );
      }
    }
    for (let weightIndex = 0; weightIndex < weights.length - 1; weightIndex++) {
      for (let altitudeIndex = 0; altitudeIndex < altitudes.length - 1; altitudeIndex++) {
        for (let temperatureIndex = 0;
          temperatureIndex < climbTemperatures.length - 1; temperatureIndex++) {
          for (const [weightRatio, altitudeRatio, temperatureRatio] of ratios) {
            const weight = lerp(weights[weightIndex], weights[weightIndex + 1], weightRatio);
            const altitude = lerp(
              altitudes[altitudeIndex], altitudes[altitudeIndex + 1], altitudeRatio,
            );
            const temperature = lerp(
              climbTemperatures[temperatureIndex],
              climbTemperatures[temperatureIndex + 1],
              temperatureRatio,
            );
            verify(
              app.calculateClimb(mode, weight, altitude, temperature, flap).rateFpm,
              oracle(grid, isaGrid, altitudes, climbTemperatures,
                weight, altitude, temperature),
              `${mode} interpolation`,
            );
          }
        }
      }
    }
  }
  assert.equal(comparisons, 31879);
});

test('climb interpolation rejects hatched cells', () => {
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateClimb('oei', 5071, 6000, 50).rateFpm)"),
    true,
  );
  assert.equal(
    evaluate("Number.isNaN(DA62.calculateClimb('cruise', 5071, 21000, 0).rateFpm)"),
    true,
  );
});

test('pressure altitude uses the same altimeter approximation as the DA40 page', () => {
  assert.equal(evaluate('DA62.pressureAltitude(5000, 29.92)'), 5000);
  assertClose(evaluate('DA62.pressureAltitude(5000, 30.12)'), 4800);
  assert.equal(evaluate('Number.isNaN(DA62.pressureAltitude(0, 10))'), true);
});

test('mass-and-balance stations and CG envelope match the AFM', () => {
  assert.deepEqual(
    evaluateJson('DA62.loadingStations.map(station => [station.key, station.arm])'),
    [
      ['front-left', 90.6], ['front-right', 90.6],
      ['row-one-left', 128], ['row-one-right', 128],
      ['row-two-left', 163.4], ['row-two-right', 163.4],
      ['nose-left', 18.5], ['nose-right', 2],
      ['rear-a', 159.8], ['rear-b', 164.4], ['rear-c', 164.4], ['rear-d', 164.4],
      ['rear-e', 173.6], ['rear-f', 164.4], ['deicing-fluid', 35.4],
    ],
  );
  assert.deepEqual(evaluateJson('DA62.cgLimits(3527, 5071)'), [92.13, 96.85]);
  assert.deepEqual(evaluateJson('DA62.cgLimits(5071, 5071)'), [96.85, 99.61]);
  assert.deepEqual(evaluateJson('DA62.cgLimits(4407, 4407)'), [96.85, 98.82]);
  assert.equal(evaluate('DA62.checkCG(5071, 96.84, 5071)'), -1);
  assert.equal(evaluate('DA62.checkCG(5071, 99.62, 5071)'), 1);
});

const loadingExpression = overrides => `DA62.calculateLoading({
  emptyMass: 3528,
  emptyMoment: ${overrides.emptyMoment ?? 337203},
  stationMasses: {
    'front-left': 176.5,
    'front-right': 176.5,
    'row-one-left': 154,
    'row-one-right': 154,
    'row-two-left': 66,
    'row-two-right': 66,
    'nose-left': 66,
    'nose-right': 66,
    'rear-e': 11,
    'deicing-fluid': 22,
    ${overrides.stationMasses ?? ''}
  },
  mainFuelGallons: ${overrides.mainFuelGallons ?? '198 / 7.01'},
  auxiliaryFuelGallons: ${overrides.auxiliaryFuelGallons ?? '36.4'},
  configuration: {
    mtom2300: ${overrides.mtom2300 ?? true},
    mzfm2200: ${overrides.mzfm2200 ?? false},
    sevenSeat: ${overrides.sevenSeat ?? true},
    auxiliaryTanks: ${overrides.auxiliaryTanks ?? true},
    deicingSystem: ${overrides.deicingSystem ?? true},
  },
})`;

test('mass-and-balance uses the AFM imperial arms with its rounded example inputs', () => {
  const loading = evaluateJson(loadingExpression({}));
  assert.equal(loading.zeroFuelMass, 4486);
  assertClose(loading.zeroFuelMoment, 434219, 1e-6);
  assertClose(loading.totalMass, 4939.164, 1e-6);
  assertClose(loading.cg, 98.5718765362, 1e-9);
  // The AFM's bilingual example was calculated from exact metric quantities;
  // its displayed rounded lb inputs therefore do not reproduce the printed moment.
  assert.notEqual(Math.round(loading.zeroFuelMoment), 434297);
  assert.equal(loading.maximumTakeoffMass, 5071);
  assert.equal(loading.maximumZeroFuelMass, 4489);
  assert.deepEqual(
    loading.cgCases.map(loadingCase => [
      loadingCase.fuel,
      loadingCase.deicingFluid,
      loadingCase.withinLimits,
    ]),
    [
      ['empty', 'loaded', true],
      ['loaded', 'loaded', true],
      ['empty', 'empty', true],
      ['loaded', 'empty', true],
    ],
  );
  assert.equal(loading.valid, true);
});

test('de-icing loading checks all four AFM fuel/fluid CG combinations', () => {
  const loading = evaluateJson(loadingExpression({ emptyMoment: 340023 }));
  assert.equal(loading.loadingWithinLimits, true);
  assert.deepEqual(
    loading.cgCases.map(loadingCase => loadingCase.withinLimits),
    [true, true, true, false],
  );
  assert.equal(loading.cgWithinLimits, false);
  assert.equal(loading.valid, false);
});

test('mass-and-balance enforces modification, tank, and baggage limits', () => {
  assert.equal(evaluate(`${loadingExpression({ mtom2300: false })}.valid`), false);
  assert.equal(evaluate(`${loadingExpression({ auxiliaryFuelGallons: 36.5 })}.valid`), false);
  assert.equal(evaluate(`${loadingExpression({ stationMasses: "'rear-e': 14," })}.valid`), false);
  assert.equal(evaluate(`${loadingExpression({ mainFuelGallons: 50 })}.loadingWithinLimits`), false);
  assert.equal(evaluate(`${loadingExpression({
    stationMasses: "'deicing-fluid': 35.2,",
    mzfm2200: true,
  })}.loadingWithinLimits`), true);
  assert.equal(evaluate(`${loadingExpression({
    stationMasses: "'deicing-fluid': 35.21,",
    mzfm2200: true,
  })}.loadingWithinLimits`), false);
});

test('DA62 page initializes calculations directly from a file URL', () => {
  const makeElement = (value = '') => {
    const classes = new Set();
    const listeners = new Map();
    const element = {
      value,
      textContent: '',
      hidden: false,
      open: false,
      maxLength: 8,
      classList: {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
      addEventListener: (type, listener) => listeners.set(type, listener),
      setAttribute() {},
      replaceChildren() {},
      focus() {},
      select() {},
      showModal() { this.open = true; },
      close() {
        this.open = false;
        this.listeners.get('close')?.();
      },
      getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 400 }),
      listeners,
    };
    return element;
  };
  const checkbox = checked => ({ ...makeElement(), checked });
  const elements = new Map([
    ['.empty-mass', makeElement('3528')],
    ['.empty-moment', makeElement('337203')],
    ['.front-left-mass', makeElement('176.5')],
    ['.front-right-mass', makeElement('176.5')],
    ['.row-one-left-mass', makeElement('154')],
    ['.row-one-right-mass', makeElement('154')],
    ['.row-two-left-mass', makeElement('66')],
    ['.row-two-right-mass', makeElement('66')],
    ['.nose-left-mass', makeElement('66')],
    ['.nose-right-mass', makeElement('66')],
    ['.rear-a-mass', makeElement('')],
    ['.rear-b-mass', makeElement('')],
    ['.rear-c-mass', makeElement('')],
    ['.rear-d-mass', makeElement('')],
    ['.rear-e-mass', makeElement('11')],
    ['.rear-f-mass', makeElement('')],
    ['.deicing-fluid-mass', makeElement('22')],
    ['.main-fuel-vol', makeElement(String(198 / 7.01))],
    ['.aux-fuel-vol', makeElement('36.4')],
    ['.oat', makeElement('15')],
    ['.qnh', makeElement('29.92')],
    ['.field-alt', makeElement('0')],
    ['.press-alt', makeElement('0')],
    ['.headwind', makeElement('0')],
    ['.ff-power', makeElement('75')],
    ['.ff-per-engine', makeElement()],
    ['.ff-total', makeElement()],
    ['[name="mam-62-001"]', checkbox(true)],
    ['[name="mam-62-063"]', checkbox(false)],
    ['[name="oam-62-019"]', checkbox(true)],
    ['[name="oam-62-001"]', checkbox(true)],
    ['[name="oam-62-002"]', checkbox(true)],
    ['[name="oam-62-009"]', checkbox(true)],
    ['.mass-wrapper', makeElement()],
    ['.cg-wrapper', makeElement()],
    ['.total-mass', makeElement()],
    ['.total-moment', makeElement()],
    ['.zero-fuel-mass', makeElement()],
    ['.zero-fuel-moment', makeElement()],
    ['.cg', makeElement()],
    ['.main-fuel-moment', makeElement()],
    ['.aux-fuel-moment', makeElement()],
    ['.rear-baggage-total', makeElement()],
    ['.rear-baggage-moment', makeElement()],
    ['.rear-baggage-limit', makeElement()],
    ['.rear-baggage-remaining', makeElement()],
    ['.rear-baggage-layout', makeElement()],
    ['.rear-baggage-five-seat', makeElement()],
    ['.rear-baggage-seven-seat', makeElement()],
    ['.density-alt', makeElement()],
    ['#rear-baggage-dialog', makeElement()],
    ['#rear-baggage-edit', makeElement()],
    ['#rear-baggage-close', makeElement()],
    ['#save', makeElement()],
    ['#url', makeElement()],
    ['#tools', {
      querySelector: () => { throw new Error('optional tool failure'); },
      querySelectorAll: () => { throw new Error('optional tool failure'); },
    }],
  ]);
  for (const station of [
    'front-left', 'front-right', 'row-one-left', 'row-one-right',
    'row-two-left', 'row-two-right', 'nose-left', 'nose-right',
    'rear-a', 'rear-b', 'rear-c', 'rear-d', 'rear-e', 'rear-f', 'deicing-fluid',
  ]) {
    elements.set(`.${station}-moment`, makeElement());
  }
  for (const prefix of [
    '.takeoff-to', '.takeoff-up', '.landing-ldg', '.landing-abnormal',
    '.climb-to', '.climb-up', '.climb-cruise', '.climb-oei', '.climb-go-around',
  ]) {
    for (const suffix of prefix.startsWith('.takeoff') || prefix.startsWith('.landing')
      ? ['-speed', '-ground', '-50']
      : ['-speed', '-rate', '-gradient']) {
      elements.set(`${prefix}${suffix}`, makeElement());
    }
  }
  const inputs = [...elements.entries()]
    .filter(([selector]) => selector.endsWith('-mass') || selector.endsWith('-vol') ||
      ['.oat', '.qnh', '.field-alt', '.press-alt', '.headwind'].includes(selector) ||
      selector.startsWith('[name='))
    .map(([, input]) => input);
  const calculator = {
    querySelector: selector => elements.get(selector) ?? null,
    querySelectorAll: selector => selector ===
      '#weights input.update, #rear-baggage-dialog input.update, #env input.update'
      ? inputs
      : elements.has(selector)
        ? [elements.get(selector)]
        : [],
  };
  const pageDocument = {
    getElementById: id => id === 'da62-calculator' ? calculator : null,
    createElement: () => makeElement(),
  };
  Object.defineProperty(pageDocument, 'cookie', {
    get: () => { throw new Error('file URLs do not support cookies'); },
    set: () => { throw new Error('file URLs do not support cookies'); },
  });
  const pageContext = vm.createContext({
    console: { ...console, error() {} },
    document: pageDocument,
    JsonUrl: () => ({
      compress: async () => '',
      decompress: async () => ({}),
    }),
    navigator: { clipboard: { writeText: async () => undefined } },
    URL,
    URLSearchParams,
    window: {
      location: { href: 'file:///tmp/da62.html', search: '' },
      history: { replaceState() {} },
    },
  });
  for (const source of sources) {
    vm.runInContext(source, pageContext);
  }

  assert.equal(elements.get('.takeoff-to-ground').textContent, '1530');
  assert.equal(elements.get('.takeoff-to-speed').textContent, '78 / 86');
  assert.notEqual(elements.get('.landing-ldg-ground').textContent, '');
  assert.equal(elements.get('.landing-abnormal-speed').textContent, '91 / 95');
  assert.notEqual(elements.get('.climb-go-around-rate').textContent, '');
  assert.equal(elements.get('.ff-per-engine').textContent, '7.4');
  assert.equal(elements.get('.ff-total').textContent, '14.8');
  assert.equal(elements.get('.climb-oei-gradient').classList.contains(
    'below-recommended',
  ), true);
  assert.equal(elements.get('.rear-baggage-total').textContent, '11');
  assert.equal(elements.get('.rear-baggage-moment').textContent, '1909.6');
  assert.equal(elements.get('.rear-baggage-five-seat').hidden, true);
  assert.equal(elements.get('.rear-baggage-seven-seat').hidden, false);
  elements.get('#rear-baggage-edit').listeners.get('click')();
  assert.equal(elements.get('#rear-baggage-dialog').open, true);
  elements.get('#rear-baggage-close').listeners.get('click')();
  assert.equal(elements.get('#rear-baggage-dialog').open, false);
  elements.get('.oat').value = '-5';
  elements.get('.oat').listeners.get('input')();
  assert.notEqual(elements.get('.takeoff-to-ground').textContent, '');
  assert.notEqual(elements.get('.climb-to-rate').textContent, '');
  assert.notEqual(elements.get('.landing-ldg-ground').textContent, '');

  elements.get('.oat').value = '15';
  elements.get('.main-fuel-vol').value = '51';
  elements.get('.main-fuel-vol').listeners.get('input')();
  assert.equal(elements.get('.mass-wrapper').classList.contains('ok'), false);
  assert.equal(elements.get('.takeoff-to-ground').textContent, '');
  assert.equal(elements.get('.landing-ldg-ground').textContent, '');
  assert.equal(elements.get('.climb-to-rate').textContent, '');
  assert.equal(elements.get('.climb-oei-gradient').classList.contains(
    'below-recommended',
  ), false);
});
