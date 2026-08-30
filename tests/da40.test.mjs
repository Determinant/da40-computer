import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../dist/assets/js/da40.js', import.meta.url),
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
  querySelector() { return element; },
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
vm.runInContext(source, context);

const evaluate = (expression) => vm.runInContext(expression, context);

test('paired integer output is blank when a value is unavailable', () => {
  assert.equal(evaluate('formatInts(NaN, NaN)'), '');
  assert.equal(evaluate('formatInts(67.4, NaN)'), '');
  assert.equal(evaluate('formatInts(67.4, 75.6)'), '67,76');
});

test('blank numeric input becomes NaN unless a default is provided', () => {
  assert.equal(evaluate("Number.isNaN(parseValue({ innerText: '  ' }))"), true);
  assert.equal(evaluate("parseValue({ innerText: '  ' }, 0)"), 0);
});

test('airspeed interpolation explicitly rejects mass above its table', () => {
  assert.equal(evaluate('Number.isNaN(interpolateAirspeed(vys, 3000))'), true);
});
