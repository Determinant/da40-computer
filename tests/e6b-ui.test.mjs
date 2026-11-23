import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const sources = await Promise.all(['e6b', 'e6b-ui'].map(name =>
  readFile(new URL(`../dist/assets/js/${name}.js`, import.meta.url), 'utf8')));

const calculator = () => {
  class Element {
    value = '';
    textContent = '';
    hidden = false;
    classes = new Set();
    listeners = new Map();
    classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
    removeAttribute(name) { delete this[name]; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    fire(name, event = {}) { this.listeners.get(name)?.(event); }
  }
  class Input extends Element {}
  const keys = ['course', 'tas', 'heading', 'gs', 'windDirection', 'windSpeed'];
  const inputs = Object.fromEntries(keys.map(key => [key, new Input()]));
  const variation = new Input();
  const message = new Element();
  const messageRow = new Element();
  const wca = new Element();
  const mh = new Element();
  const clear = new Element();
  const nodes = new Map([
    ...keys.map(key => [`[data-field="${key}"]`, inputs[key]]),
    ['.e6b-variation', variation], ['.e6b-wca', wca], ['.e6b-mh', mh],
    ['.e6b-message', messageRow], ['[role="status"]', message], ['.e6b-clear', clear],
  ]);
  const root = new Element();
  root.querySelector = selector => nodes.get(selector);
  const context = vm.createContext({ HTMLInputElement: Input, document: { getElementById: () => root } });
  for (const source of sources) vm.runInContext(source, context);
  return {
    inputs, variation, message, messageRow, wca, mh,
    enter(key, value) {
      const input = key === 'variation' ? variation : inputs[key];
      input.value = value;
      root.fire('input', { target: input });
    },
    clear: () => clear.fire('click'),
  };
};

test('four entered values automatically solve the remaining pair and stay authoritative on edits', () => {
  const c = calculator();
  for (const [key, value] of Object.entries({ course: '90', tas: '125', windDirection: '230', windSpeed: '18' })) c.enter(key, value);
  assert.equal(c.inputs.heading.value, '95.31');
  assert.equal(c.inputs.gs.value, '138.25');
  assert.ok(c.inputs.heading.classes.has('calculated'));
  c.enter('variation', '-10');
  assert.equal(c.mh.textContent, '085°');
  assert.equal(c.wca.textContent, '5.3° R');
  c.enter('course', '230');
  assert.equal(c.inputs.heading.value, '230');
  assert.equal(c.inputs.gs.value, '107');
  c.enter('windDirection', '');
  assert.equal(c.inputs.heading.value, '');
  assert.equal(c.inputs.gs.value, '');
  assert.equal(c.wca.textContent, '');
  assert.equal(c.mh.textContent, '');
  assert.equal(c.inputs.course.value, '230');
  assert.equal(c.messageRow.hidden, true);
});

test('reverse wind problems and switching known values require no mode selector', () => {
  const c = calculator();
  for (const [key, value] of Object.entries({ course: '180', heading: '160', tas: '140', gs: '120' })) c.enter(key, value);
  assert.ok(Math.abs(Number(c.inputs.windDirection.value) - 104) < 1);
  assert.ok(Math.abs(Number(c.inputs.windSpeed.value) - 50) < 1);
  // Refreshing an existing input makes it newer than the other three.
  c.enter('course', '185');
  c.enter('windDirection', '110');
  assert.equal(c.messageRow.hidden, true);
  assert.ok(Number(c.inputs.heading.value) > 0);
  assert.ok(Number(c.inputs.windSpeed.value) > 0);
  assert.ok(c.inputs.heading.classes.has('calculated'));
  assert.ok(c.inputs.windSpeed.classes.has('calculated'));
  assert.equal(c.inputs.windDirection.value, '110');
  assert.equal(c.inputs.course.value, '185');
  assert.equal(c.inputs.tas.value, '140');
  assert.equal(c.inputs.gs.value, '120');
  c.clear();
  for (const input of Object.values(c.inputs)) assert.equal(input.value, '');
  assert.equal(c.messageRow.hidden, true);
});

test('editing calculated values switches inputs without clearing', () => {
  const c = calculator();
  for (const [key, value] of Object.entries({ course: '90', tas: '125', windDirection: '230', windSpeed: '18' })) c.enter(key, value);
  c.enter('heading', '100');
  assert.equal(c.inputs.heading.value, '100');
  assert.ok(!c.inputs.heading.classes.has('calculated'));
  assert.ok(c.inputs.course.classes.has('calculated'));
  assert.ok(c.inputs.gs.classes.has('calculated'));
  const east = 125 * Math.sin(100 * Math.PI / 180) - 18 * Math.sin(230 * Math.PI / 180);
  const north = 125 * Math.cos(100 * Math.PI / 180) - 18 * Math.cos(230 * Math.PI / 180);
  assert.ok(Math.abs(Number(c.inputs.gs.value) - Math.hypot(east, north)) < 0.01);
  assert.ok(Math.abs(Number(c.inputs.course.value) - Math.atan2(east, north) * 180 / Math.PI) < 0.01);
  c.enter('gs', '140');
  assert.equal(c.inputs.gs.value, '140');
  assert.ok(!c.inputs.gs.classes.has('calculated'));
  assert.ok(c.inputs.tas.classes.has('calculated'));
  assert.equal(c.inputs.heading.value, '100');
  assert.equal(c.inputs.windDirection.value, '230');
  assert.equal(c.inputs.windSpeed.value, '18');
  assert.equal(c.messageRow.hidden, true);
});

test('GS and TAS swap roles while preserving older wind inputs', () => {
  const c = calculator();
  for (const [key, value] of Object.entries({ windDirection: '230', windSpeed: '18', course: '90', tas: '125' })) c.enter(key, value);
  c.enter('gs', '140');
  assert.equal(c.inputs.gs.value, '140');
  assert.ok(!c.inputs.gs.classes.has('calculated'));
  assert.ok(c.inputs.tas.classes.has('calculated'));
  assert.ok(c.inputs.heading.classes.has('calculated'));
  const tas = Math.hypot(140 + 18 * Math.sin(230 * Math.PI / 180), 18 * Math.cos(230 * Math.PI / 180));
  assert.ok(Math.abs(Number(c.inputs.tas.value) - tas) < 0.01);
  for (const [key, value] of Object.entries({ windDirection: '230', windSpeed: '18', course: '90' })) {
    assert.equal(c.inputs[key].value, value);
    assert.ok(!c.inputs[key].classes.has('calculated'));
  }
  c.enter('tas', '125');
  assert.equal(c.inputs.tas.value, '125');
  assert.ok(!c.inputs.tas.classes.has('calculated'));
  assert.equal(c.inputs.gs.value, '138.25');
  assert.ok(c.inputs.gs.classes.has('calculated'));
  assert.equal(c.messageRow.hidden, true);
});

test('heading and course swap roles while preserving older wind inputs', () => {
  const c = calculator();
  for (const [key, value] of Object.entries({ windDirection: '230', windSpeed: '18', course: '90', tas: '125' })) c.enter(key, value);
  c.enter('heading', '100');
  assert.equal(c.inputs.heading.value, '100');
  assert.ok(!c.inputs.heading.classes.has('calculated'));
  assert.equal(c.inputs.course.value, '94.23');
  assert.ok(c.inputs.course.classes.has('calculated'));
  assert.equal(c.inputs.windDirection.value, '230');
  assert.equal(c.inputs.windSpeed.value, '18');
  assert.equal(c.inputs.tas.value, '125');
  c.enter('course', '90');
  assert.equal(c.inputs.course.value, '90');
  assert.ok(!c.inputs.course.classes.has('calculated'));
  assert.equal(c.inputs.heading.value, '95.31');
  assert.ok(c.inputs.heading.classes.has('calculated'));
  assert.equal(c.messageRow.hidden, true);
});

test('calm winds, ambiguous solutions, and invalid inputs do not leave stale results', () => {
  const c = calculator();
  c.enter('course', '90');
  c.enter('tas', '120');
  c.enter('windSpeed', '0');
  assert.equal(c.inputs.heading.value, '90');
  assert.equal(c.inputs.gs.value, '120');
  c.enter('gs', '130');
  assert.equal(c.inputs.gs.value, '130');
  assert.ok(!c.inputs.gs.classes.has('calculated'));
  assert.equal(c.inputs.tas.value, '130');
  assert.ok(c.inputs.tas.classes.has('calculated'));
  c.enter('heading', '100');
  assert.equal(c.inputs.course.value, '100');
  assert.ok(c.inputs.course.classes.has('calculated'));
  c.enter('tas', '120');
  assert.equal(c.inputs.gs.value, '120');
  assert.ok(c.inputs.gs.classes.has('calculated'));
  assert.equal(c.inputs.windSpeed.value, '0');
  assert.equal(c.messageRow.hidden, true);
  c.clear();
  for (const [key, value] of Object.entries({ course: '0', tas: '10', windDirection: '90', windSpeed: '20' })) c.enter(key, value);
  assert.match(c.message.textContent, /No flyable solution/);
  assert.equal(c.inputs.heading.value, '');
  c.enter('windDirection', '180');
  assert.match(c.message.textContent, /Two solutions:/);
  assert.match(c.message.textContent, /GS 30 kt/);
  assert.match(c.message.textContent, /GS 10 kt/);
  assert.equal(c.inputs.heading.value, '');
  c.enter('variation', 'bad');
  assert.match(c.message.textContent, /Variation/);
  assert.equal(c.mh.textContent, '');
});
