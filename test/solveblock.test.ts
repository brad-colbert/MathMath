import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, test } from 'vitest';
import { runWorksheet } from '../src/engine/evaluate.js';
import { runIncremental } from '../src/engine/incremental.js';
import { type Fn, type Mat, type Num, type Value, num } from '../src/engine/values.js';
import { emptyWorksheet } from '../src/format/native.js';
import { readTex, tex } from '../src/latex/latex.js';
import { readRegion } from '../src/latex/region.js';
import type { Worksheet } from '../src/model/ast.js';
import { type XElement, importWorksheet } from '../src/xmcd/import.js';

const sheet = (lines: string[]): Worksheet => {
  const ws = emptyWorksheet();
  ws.regions = lines.map((l, i) => ({ id: `r${i}`, left: 0, top: i * 30 - 8, alignX: 0, alignY: i * 30, disabled: false, content: readRegion(l) }));
  return ws;
};
/** The last region's value, or its error as a thrown Error. */
function last(...lines: string[]): Value {
  const out = runWorksheet(sheet(lines)).at(-1)!;
  if (out.error) throw new Error(out.error.reason);
  return out.value!;
}
const re = (v: Value): number => (v as Num).re;
const vec = (v: Value): number[] => [...(v as Mat).re];
const call = (f: Value, x: number): number => ((f as Fn).call([num(x)]) as Num).re;

const CIRCLE = ['x\\coloneq 1', 'y\\coloneq 0.5', '\\mathrm{Given}', 'x^2+y^2=4', 'x-y=0'];

describe('Find and Minerr', () => {
  test('two equations in two unknowns, from guesses above Given', () => {
    // Mathcad 14 gives √2, √2 from these guesses.
    vec(last(...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=')).forEach((v) => expect(v).toBeCloseTo(Math.SQRT2, 14));
  });
  test('a definition from Find, of each variable', () => {
    expect(re(last(...CIRCLE, '\\begin{pmatrix}p\\\\q\\end{pmatrix}\\coloneq \\mathrm{Find}\\left(x,y\\right)', 'p\\cdot q='))).toBeCloseTo(2, 12);
  });
  test('an inequality keeps the answer on its side, from a guess on the other', () => {
    // Mathcad 14: 2, from u = −1.
    expect(re(last('u\\coloneq -1', '\\mathrm{Given}', 'u>0', 'u^2=4', '\\mathrm{Find}\\left(u\\right)='))).toBeCloseTo(2, 9);
    vec(last('x\\coloneq -1', 'y\\coloneq -0.5', '\\mathrm{Given}', 'x^2+y^2=4', 'x-y=0', 'x<0', '\\mathrm{Find}\\left(x,y\\right)=')).forEach((v) => expect(v).toBeCloseTo(-Math.SQRT2, 9));
  });
  test('Find reports no solution; Minerr gives the nearest', () => {
    expect(() => last('w\\coloneq 1', '\\mathrm{Given}', 'w^2=-1', '\\mathrm{Find}\\left(w\\right)=')).toThrow(/No solution was found/);
    expect(Math.abs(re(last('w\\coloneq 1', '\\mathrm{Given}', 'w^2=-1', '\\mathrm{Minerr}\\left(w\\right)=')))).toBeLessThan(1e-3);
  });
  test('units: the current through two resistors from a source', () => {
    const v = last('I\\coloneq 1\\cdot \\mathrm{mA}', '\\mathrm{Given}', '12\\cdot \\mathrm{V}=I\\cdot \\left(1\\cdot k\\Omega+2\\cdot k\\Omega\\right)', '\\mathrm{Find}\\left(I\\right)=') as Num;
    expect(v.re).toBeCloseTo(0.004, 14);
    expect([...v.dim]).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });
  test('a block is closed by its solver, and a solver needs one', () => {
    expect(() => last(...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=', '\\mathrm{Find}\\left(x,y\\right)=')).toThrow(/Given above/);
    expect(() => last('x\\coloneq 1', '\\mathrm{Find}\\left(x\\right)=')).toThrow(/Given above/);
    expect(() => last('\\mathrm{Given}', 'z^2=4', '\\mathrm{Find}\\left(z\\right)=')).toThrow(/needs a guess for z/);
  });
  test('a function from a solve block, its constraints using the parameter, as f(a) := Find(x)', () => {
    const lines = ['x\\coloneq 1', '\\mathrm{Given}', 'x^2=a', 'f\\left(a\\right)\\coloneq \\mathrm{Find}\\left(x\\right)'];
    expect(re(last(...lines, 'f\\left(9\\right)='))).toBeCloseTo(3, 12);
    expect(re(last(...lines, 'f\\left(16\\right)='))).toBeCloseTo(4, 12);
    const ode = ['\\mathrm{Given}', "y'\\left(t\\right)=-k\\cdot y\\left(t\\right)", 'y\\left(0\\right)=1', 'Y\\left(k\\right)\\coloneq \\mathrm{Odesolve}\\left(t,2\\right)'];
    expect(call(last(...ode, 'Y\\left(2\\right)='), 1)).toBeCloseTo(Math.exp(-2), 10);
  });
  test("a sheet's own function named Find is called as itself", () => {
    expect(re(last('\\mathrm{Find}\\left(a\\right)\\coloneq a+1', '\\mathrm{Find}\\left(2\\right)='))).toBe(3);
  });
});

describe('root, Maximize and Minimize', () => {
  test('root from a guess, and between a and b', () => {
    expect(re(last('x\\coloneq 1', '\\mathrm{root}\\left(x^2-2,x\\right)='))).toBeCloseTo(Math.SQRT2, 14);
    expect(re(last('\\mathrm{root}\\left(x^2-2,x,-3,0\\right)='))).toBeCloseTo(-Math.SQRT2, 15);
    expect(() => last('\\mathrm{root}\\left(x^2-2,x,2,3\\right)=')).toThrow(/opposite signs/);
    expect(() => last('x\\coloneq 1', '\\mathrm{root}\\left(x^2+1,x\\right)=')).toThrow(/no root/);
  });
  test('Maximize and Minimize, alone and inside a solve block', () => {
    expect(re(last('f\\left(x\\right)\\coloneq -\\left(x-3\\right)^2', 'x\\coloneq 1', '\\mathrm{Maximize}\\left(f,x\\right)='))).toBeCloseTo(3, 6);
    expect(re(last('f\\left(x\\right)\\coloneq \\left(x-3\\right)^2', 'x\\coloneq 1', '\\mathrm{Given}', 'x\\le 2', '\\mathrm{Minimize}\\left(f,x\\right)='))).toBeCloseTo(2, 2);
    expect(() => last('f\\left(x\\right)\\coloneq x', 'x\\coloneq 1', '\\mathrm{Minimize}\\left(f,x\\right)=')).toThrow(/without bound/);
  });
});

describe('Odesolve', () => {
  test('a first-order equation with the derivative operator, as the probe', () => {
    // Mathcad 14 gave 0.367880853…, 1.4·10⁻⁶ from e⁻¹.
    const g = last('\\mathrm{Given}', '\\frac{\\mathrm{d}}{\\mathrm{d}t}g\\left(t\\right)+g\\left(t\\right)=0', 'g\\left(0\\right)=1', 'g\\coloneq \\mathrm{Odesolve}\\left(t,2\\right)', 'g=');
    expect(call(g, 1)).toBeCloseTo(Math.exp(-1), 12);
  });
  test("a second-order equation in primes: y'' + y = 0 is sin", () => {
    const y = last('\\mathrm{Given}', "y''\\left(t\\right)+y\\left(t\\right)=0", 'y\\left(0\\right)=0', "y'\\left(0\\right)=1", 'y\\coloneq \\mathrm{Odesolve}\\left(t,10\\right)', 'y=');
    for (const x of [0, 1.3, Math.PI / 2, 7.77, 10]) expect(call(y, x)).toBeCloseTo(Math.sin(x), 9);
    expect(() => call(y, 11)).toThrow(/solved from 0 to 10/);
  });
  test('a system, by a vector of unknowns', () => {
    const out = last('\\mathrm{Given}', "x'\\left(t\\right)=y\\left(t\\right)", "y'\\left(t\\right)=-x\\left(t\\right)", 'x\\left(0\\right)=1', 'y\\left(0\\right)=0',
      'S\\coloneq \\mathrm{Odesolve}\\left(\\begin{pmatrix}x\\\\y\\end{pmatrix},t,5\\right)', 'S=') as Mat;
    expect(call(out.cells![0]!, 2)).toBeCloseTo(Math.cos(2), 9);
    expect(call(out.cells![1]!, 2)).toBeCloseTo(-Math.sin(2), 9);
  });
  test('an RC discharge in volts and seconds', () => {
    const v = last('R\\coloneq 1\\cdot k\\Omega', 'C\\coloneq 1\\cdot \\mathrm{mF}', '\\mathrm{Given}', "v'\\left(t\\right)=\\frac{-v\\left(t\\right)}{R\\cdot C}", 'v\\left(0\\cdot \\mathrm{s}\\right)=5\\cdot \\mathrm{V}',
      'v\\coloneq \\mathrm{Odesolve}\\left(t,3\\cdot \\mathrm{s}\\right)', 'v\\left(1\\cdot \\mathrm{s}\\right)=') as Num;
    expect(v.re).toBeCloseTo(5 * Math.exp(-1), 9);
    expect([...v.dim]).toEqual([2, 1, -3, -1, 0, 0, 0]);
  });
  test('what it needs: an equation per unknown, its starting values, at one point', () => {
    expect(() => last('\\mathrm{Given}', "y'\\left(t\\right)=y\\left(t\\right)", 'y\\coloneq \\mathrm{Odesolve}\\left(t,1\\right)')).toThrow(/starting values/);
    expect(() => last('\\mathrm{Given}', "y''\\left(t\\right)=-y\\left(t\\right)", 'y\\left(0\\right)=0', 'y\\left(1\\right)=1', 'y\\coloneq \\mathrm{Odesolve}\\left(t,1\\right)')).toThrow(/two points/);
  });
});

describe('reading and writing', () => {
  test("primes are part of the name, as Mathcad keeps them: y'' is y″", () => {
    expect(readTex("y''\\left(t\\right)")).toEqual({ k: 'call', fn: { k: 'id', name: "y''" }, args: [{ k: 'id', name: 't' }] });
    expect(readTex('y^{\\prime}\\left(t\\right)')).toEqual({ k: 'call', fn: { k: 'id', name: "y'" }, args: [{ k: 'id', name: 't' }] });
    expect(tex(readTex("y''\\left(t\\right)"))).toBe("y''\\left(t\\right)");
  });
  test("a Mathcad sheet's solve block, with Find saved as its own element", () => {
    // As Mathcad 14 saved the probe: Given as a name, the constraints as equations, Find with its settings.
    const NS = 'xmlns:ml="http://schemas.mathsoft.com/math30"';
    const region = (k: number, math: string) => `<region region-id="${k}" left="0" top="${k * 20}" align-x="0" align-y="${k * 20}"><math>${math}</math></region>`;
    const xml = `<worksheet xmlns:ml="m"><settings><calculation><builtInVariables array-origin="0" convergence-tolerance="0.001" constraint-tolerance="0.001"/></calculation></settings><regions>${[
      `<ml:define ${NS}><ml:id>x</ml:id><ml:real>1</ml:real></ml:define>`,
      `<ml:id ${NS}>Given</ml:id>`,
      `<ml:apply ${NS}><ml:equal/><ml:apply><ml:pow/><ml:id>x</ml:id><ml:real>2</ml:real></ml:apply><ml:real>9</ml:real></ml:apply>`,
      `<ml:eval ${NS}><ml:apply><ml:Find auto-method="true" method="levenberg"/><ml:id>x</ml:id></ml:apply></ml:eval>`,
    ].map((m, k) => region(k, m)).join('')}</regions></worksheet>`;
    const ws = importWorksheet(new DOMParser().parseFromString(xml, 'text/xml').documentElement as unknown as XElement);
    expect(ws.ctol).toBe(0.001);
    expect(re(runWorksheet(ws).at(-1)!.value!)).toBeCloseTo(3, 12);
  });
});

describe('recalculating', () => {
  const noAlgebra = async () => ({ result: null, error: 'none' });
  test('editing a constraint calculates its Find again; deleting Given makes it an error', async () => {
    const before = sheet([...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=']);
    const first = await runIncremental(before, noAlgebra, null);
    vec(first.outcomes.at(-1)!.value!).forEach((v) => expect(v).toBeCloseTo(Math.SQRT2, 12));
    const edited = sheet([...CIRCLE.slice(0, 3), 'x^2+y^2=8', 'x-y=0', '\\mathrm{Find}\\left(x,y\\right)=']);
    const next = await runIncremental(edited, noAlgebra, first.snapshot);
    expect(next.ran).toContain('r5');
    vec(next.outcomes.at(-1)!.value!).forEach((v) => expect(v).toBeCloseTo(2, 12));
    const noGiven = sheet([...CIRCLE, '\\mathrm{Find}\\left(x,y\\right)=']);
    noGiven.regions.splice(2, 1);
    const third = await runIncremental(noGiven, noAlgebra, next.snapshot);
    expect(third.outcomes.at(-1)!.error?.reason).toMatch(/Given above/);
  });
});
