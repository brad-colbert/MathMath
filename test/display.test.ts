import { describe, expect, test } from 'vitest';
import type { NumberFormat } from '../src/model/ast.js';
import { formatNumber } from '../src/ui/format.js';

const f = (precision: number, exponent: number, trailingZeros = false): NumberFormat => ({ precision, exponent, trailingZeros });

// Expected values were read from Mathcad 14.
describe('number display', () => {
  test.each<[number, NumberFormat, string]>([
    [1234.5678, f(3, 3), '1.235\\times10^{3}'],
    [1234.5678, f(3, 5), '1234.568'],
    [999.9996, f(3, 3), '1000'],
    [999.9996, f(6, 3), '999.9996'],
    [999.9996, f(3, 3, true), '1000.000'],
    [1000, f(3, 3), '1\\times10^{3}'],
    [1000, f(3, 3, true), '1.000\\times10^{3}'],
    [1000, f(3, 4), '1000'],
    [0.1234, f(3, 3), '0.123'],
    [0.001234, f(3, 3), '1.234\\times10^{-3}'],
    [0.001234, f(3, 5), '0.001'],
    [0.0001234, f(3, 5), '0'],
    [0.0009996, f(3, 3), '9.996\\times10^{-4}'],
    [1.5, f(3, 3, true), '1.500'],
    [0.30000000000000004, f(3, 3), '0.3'],
    [-1234.5678, f(3, 3), '-1.235\\times10^{3}'],
    [1e-16, f(3, 3), '0'],
    [1e-16, f(3, 3, true), '0.000'],
    [1.0000000000000001e-15, f(3, 3), '1\\times10^{-15}'],
  ])('%s', (x, format, want) => expect(formatNumber(x, format)).toBe(want));

  test.each<[number, number, string]>([
    [0.1, 2, '0.1'],
    [0.099, 2, '9.9\\times10^{-2}'],
    [0.01, 3, '0.01'],
    [0.0099, 3, '9.9\\times10^{-3}'],
    [0.001, 4, '0.001'],
    [0.00099, 4, '9.9\\times10^{-4}'],
    [0.0001, 5, '0.0001'],
    [0.00009, 5, '9\\times10^{-5}'],
    [99, 2, '99'],
    [100, 2, '1\\times10^{2}'],
    [999, 3, '999'],
    [9999, 4, '9999'],
    [10000, 4, '1\\times10^{4}'],
    [99999, 5, '99999'],
    [100000, 5, '1\\times10^{5}'],
  ])('the exponent threshold: %s at %s', (x, t, want) => expect(formatNumber(x, f(7, t))).toBe(want));
});
