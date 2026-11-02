import { expect, test } from 'vitest';
import { NAME } from '../src/index.js';

test('the toolchain runs', () => {
  expect(NAME).toBe('MathMath');
});
