import { describe, expect, test } from 'vitest';
import { chooseUnits, unitsLatex } from '../src/engine/display-units.js';
import { NODIM, num } from '../src/engine/values.js';
import { formatValue } from '../src/ui/format.js';

const d = (L: number, M: number, T: number, I = 0, K = 0, N = 0, J = 0) => [L, M, T, I, K, N, J];
const names = (dim: number[]): string => unitsLatex(chooseUnits(dim).parts);
const f = { precision: 3, exponent: 3, trailingZeros: false };

// Expected forms were read from Mathcad 14.
describe('default units', () => {
  test.each<[string, number[], string]>([
    ['force', d(1, 1, -2), '\\mathrm{N}'],
    ['power', d(2, 1, -3), '\\mathrm{W}'],
    ['pressure', d(-1, 1, -2), '\\mathrm{Pa}'],
    ['resistance', d(2, 1, -3, -2), '\\Omega'],
    ['illuminance', d(-2, 0, 0, 0, 0, 0, 1), '\\mathrm{lx}'],
    ['luminous flux is candela', d(0, 0, 0, 0, 0, 0, 1), '\\mathrm{cd}'],
    ['frequency is one over seconds', d(0, 0, -1), '\\frac{1}{\\mathrm{s}}'],
    ['conductance is one over ohms', d(-2, -1, 3, 2), '\\frac{1}{\\Omega}'],
    ['a power of a named unit is that power', d(4, 2, -6, -4), '\\Omega^{2}'],
    ['one over a named unit', d(-2, -1, 3), '\\frac{1}{\\mathrm{W}}'],
    ['one over volume is one over litres', d(-3, 0, 0), '\\frac{1}{\\mathrm{L}}'],
    ['conductivity is not a power of one unit, so base units', d(-3, -1, 3, 2), '\\frac{\\mathrm{s}^{3}\\cdot \\mathrm{A}^{2}}{\\mathrm{m}^{3}\\cdot \\mathrm{kg}}'],
    ['irradiance is base units', d(0, 1, -3), '\\frac{\\mathrm{kg}}{\\mathrm{s}^{3}}'],
    ['thermal conductivity', d(1, 1, -3, 0, -1), '\\frac{\\mathrm{m}\\cdot \\mathrm{kg}}{\\mathrm{K}\\cdot \\mathrm{s}^{3}}'],
    ['area', d(2, 0, 0), '\\mathrm{m}^{2}'],
    ['metre kelvin', d(1, 0, 0, 0, 1), '\\mathrm{m}\\cdot \\mathrm{K}'],
  ])('%s', (_, dim, want) => expect(names(dim)).toBe(want));

  test('volume shows in litres', () => {
    expect(formatValue(num(2, d(3, 0, 0)), f)).toBe('2\\times10^{3}\\ \\mathrm{L}');
  });

  test('a chosen unit divides the value', () => {
    const cm = num(0.01, d(1, 0, 0));
    expect(formatValue(num(3, d(1, 0, 0)), f, { value: cm, latex: '\\mathrm{cm}' })).toBe('300\\ \\mathrm{cm}');
  });

  test('a unit that leaves some dimension over shows the rest', () => {
    const cm = num(0.01, d(1, 0, 0));
    expect(formatValue(num(3, d(1, 0, -1)), f, { value: cm, latex: '\\mathrm{cm}' })).toBe('300\\ \\mathrm{cm}\\cdot \\frac{1}{\\mathrm{s}}');
  });

  test('temperatures in degrees Celsius take their offset', () => {
    expect(formatValue(num(373.15, d(0, 0, 0, 0, 1)), f, { value: null, latex: '\\mathrm{°C}', offset: { scale: 1, zero: 273.15 } })).toBe('100\\ \\mathrm{°C}');
  });

  test('degC is the typed spelling of degrees Celsius', async () => {
    const { displayUnit } = await import('../src/ui/format.js');
    expect(displayUnit({ k: 'id', name: 'degC' }, undefined)).toMatchObject({ latex: '\\mathrm{°C}', offset: { zero: 273.15 } });
  });

  test('dimensionless values show no unit', () => {
    expect(formatValue(num(2, NODIM), f)).toBe('2');
  });
});
