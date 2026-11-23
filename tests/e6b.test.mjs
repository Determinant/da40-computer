import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../dist/assets/js/e6b.js', import.meta.url), 'utf8'), context);
const e6b = vm.runInContext('E6B', context);
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
const angleClose = (actual, expected, tolerance = 1e-6) => close(e6b.windCorrection(actual, expected), 0, tolerance);

// Worked problems from ASA E6-B manual, pp. 30, 33, 37–38:
// https://asa2fly.com/content/support-files/product-manuals/E6B_Manual.pdf
// Slide-rule answers are approximate; computed answers retain extra precision.
test('ASA forward and reverse wind examples match the published answers', () => {
  for (const [course, tas, windDirection, windSpeed, heading, gs] of [
    [90, 125, 230, 18, 95, 138], [300, 165, 240, 38, 288, 143],
    [150, 140, 40, 43, 133, 149], [20, 180, 330, 25, 14, 163],
    [260, 225, 110, 18, 258, 240],
  ]) {
    const [result] = e6b.solveWind({ course, tas, windDirection, windSpeed }, ['heading', 'gs']);
    angleClose(result.heading, heading, 1);
    close(result.gs, gs, 1);
  }
  const [wind] = e6b.solveWind({ course: 180, heading: 160, gs: 120, tas: 140 }, ['windDirection', 'windSpeed']);
  angleClose(wind.windDirection, 104, 1);
  close(wind.windSpeed, 50, 1);
});

test('crosswind headings and groundspeeds preserve the original E6B results', () => {
  for (const [course, heading] of [[360, 350], [180, 190]]) {
    const [result] = e6b.solveWind({ course, tas: 120, windDirection: 270, windSpeed: 20 }, ['heading', 'gs']);
    assert.equal(Math.round(result.heading), heading);
    close(result.gs, 118.3216, 0.001);
  }
  close(e6b.trueToMagnetic(190, -10), 180);
  close(e6b.trueToMagnetic(190, 10), 200);
});

test('all 15 pairs of unknowns recover independently constructed wind triangles', () => {
  const keys = ['course', 'heading', 'tas', 'gs', 'windDirection', 'windSpeed'];
  const rad = n => n * Math.PI / 180;
  for (let i = 1; i <= 120; i++) {
    const heading = (i * 137.53) % 360;
    const tas = 60 + i * 1.7;
    const windDirection = (i * 47.37) % 360;
    const windSpeed = 3 + i * 0.37;
    // Independent forward vector addition, not the implementation's inverse solver.
    const east = tas * Math.sin(rad(heading)) - windSpeed * Math.sin(rad(windDirection));
    const north = tas * Math.cos(rad(heading)) - windSpeed * Math.cos(rad(windDirection));
    const gs = Math.hypot(east, north);
    const course = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
    const triangle = { course, heading, tas, gs, windDirection, windSpeed };
    for (let a = 0; a < keys.length; a++) {
      for (let b = a + 1; b < keys.length; b++) {
        const unknowns = [keys[a], keys[b]];
        const known = { ...triangle };
        for (const key of unknowns) delete known[key];
        const answers = e6b.solveWind(known, unknowns);
        assert.ok(answers.some(answer => keys.every(key =>
          Math.abs(key === 'course' || key === 'heading' || key === 'windDirection'
            ? e6b.windCorrection(answer[key], triangle[key]) : answer[key] - triangle[key]) < 1e-5)),
        `Missing original triangle ${i}, ${unknowns}`);
      }
    }
  }
});

test('wind solver distinguishes calm, impossible, underdetermined, and ambiguous problems', () => {
  const [calm] = e6b.solveWind({ course: 360, tas: 120, windDirection: 0, windSpeed: 0 }, ['heading', 'gs']);
  close(calm.heading, 0);
  close(calm.gs, 120);
  const [reverseCalm] = e6b.solveWind({ course: 90, heading: 90, tas: 120, gs: 120 }, ['windDirection', 'windSpeed']);
  close(reverseCalm.windSpeed, 0);
  assert.throws(() => e6b.solveWind({ course: 0, tas: 10, windDirection: 90, windSpeed: 20 }, ['heading', 'gs']), /No flyable/);
  assert.throws(() => e6b.solveWind({ course: 0, heading: 0, windDirection: 0, windSpeed: 20 }, ['tas', 'gs']), /parallel/);
  assert.throws(() => e6b.solveWind({ course: 0, tas: 10, windDirection: 0, windSpeed: 20 }, ['heading', 'gs']), /No flyable/);
  // A tailwind stronger than TAS permits headings both with and against the desired track.
  const answers = e6b.solveWind({ course: 0, tas: 10, windDirection: 180, windSpeed: 20 }, ['heading', 'gs']);
  assert.equal(answers.length, 2);
  assert.deepEqual(Array.from(answers, a => Math.round(a.gs)).sort((a,b) => a-b), [10, 30]);
  // At a tangent the two mathematical roots describe the same solution.
  assert.equal(e6b.solveWind({ course: 0, tas: 10, windDirection: 135, windSpeed: Math.sqrt(200) }, ['heading', 'gs']).length, 1);
  for (const invalid of [NaN, Infinity, -1, 361]) {
    assert.throws(() => e6b.solveWind({ course: invalid, tas: 120, windDirection: 270, windSpeed: 10 }, ['heading', 'gs']));
  }
  assert.throws(() => e6b.solveWind({}, ['gs', 'gs']));
});

test('variation corrections wrap correctly in both directions', () => {
  close(e6b.trueToMagnetic(5, -10), 355);
  close(e6b.trueToMagnetic(355, 10), 5);
  close(e6b.windCorrection(5, 355), 10);
  close(e6b.windCorrection(355, 5), -10);
});
