// MathMath: math on paper, in the browser.
// Copyright (C) 2026 Pelican Labs, LLC
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
// General Public License as published by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
// implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
// License for more details.
//
// You should have received a copy of the GNU Affero General Public License along with this program. If not,
// see <https://www.gnu.org/licenses/>.

import type { Entry } from '../types.js';

/** A distribution's four functions, described once. */
interface Dist {
  name: string;
  /** What it is, for the summaries: "the normal distribution". */
  what: string;
  /** Its parameters, as typed after the first argument. */
  params: string;
  /** What the parameters mean, a sentence. */
  meaning: string;
  discrete: boolean;
  /** Example arguments, as LaTeX: the value (or count) first. */
  at: string;
  /** Example parameters, as LaTeX. */
  ps: string;
  /** More about it, a sentence or two. */
  note?: string;
}

const DISTS: Dist[] = [
  { name: 'beta', what: 'the beta distribution', params: 's1, s2', meaning: 's1 and s2 are its two shape parameters, both above 0. It lies between 0 and 1.', discrete: false, at: '0.3', ps: '2,5' },
  { name: 'binom', what: 'the binomial distribution', params: 'n, p', meaning: 'the number of successes in n trials, each a success with probability p. n is a whole number, 1 or more.', discrete: true, at: '3', ps: '10,0.3' },
  { name: 'cauchy', what: 'the Cauchy distribution', params: 'l, s', meaning: 'l is its location (the peak) and s its scale, above 0.', discrete: false, at: '1.5', ps: '0.5,2' },
  { name: 'chisq', what: 'the chi-squared distribution', params: 'd', meaning: 'd is its degrees of freedom, above 0.', discrete: false, at: '2.5', ps: '3' },
  { name: 'exp', what: 'the exponential distribution', params: 'r', meaning: 'r is its rate, above 0; the mean is 1/r.', discrete: false, at: '0.7', ps: '2' },
  { name: 'F', what: 'the F distribution', params: 'd1, d2', meaning: 'd1 and d2 are its degrees of freedom, above 0.', discrete: false, at: '1.5', ps: '4,7' },
  { name: 'gamma', what: 'the gamma distribution', params: 's', meaning: 's is its shape, above 0; its scale is 1. For a scale θ, divide x by θ (and the density by θ).', discrete: false, at: '2.5', ps: '3' },
  { name: 'geom', what: 'the geometric distribution', params: 'p', meaning: 'the number of failures before the first success, each trial a success with probability p.', discrete: true, at: '2', ps: '0.3' },
  { name: 'hypergeom', what: 'the hypergeometric distribution', params: 'a, b, n', meaning: 'the number of successes in a sample of n, drawn without replacement from a successes and b failures.', discrete: true, at: '2', ps: '5,8,6' },
  { name: 'lnorm', what: 'the lognormal distribution', params: 'μ, σ', meaning: 'μ and σ are the mean and standard deviation of its logarithm; σ is above 0.', discrete: false, at: '1.5', ps: '0.2,0.8' },
  { name: 'logis', what: 'the logistic distribution', params: 'l, s', meaning: 'l is its location and s its scale, above 0.', discrete: false, at: '1.5', ps: '0.5,2' },
  { name: 'nbinom', what: 'the negative binomial distribution', params: 'n, p', meaning: 'the number of failures before the nth success, each trial a success with probability p. n is a whole number, 1 or more.', discrete: true, at: '3', ps: '4,0.6' },
  { name: 'norm', what: 'the normal distribution', params: 'μ, σ', meaning: 'μ is its mean and σ its standard deviation, above 0.', discrete: false, at: '1.5', ps: '0.5,2' },
  { name: 'pois', what: 'the Poisson distribution', params: 'λ', meaning: 'the number of events in an interval where λ, above 0, are expected.', discrete: true, at: '2', ps: '3.5' },
  { name: 't', what: "Student's t distribution", params: 'd', meaning: 'd is its degrees of freedom, above 0.', discrete: false, at: '1.5', ps: '4' },
  { name: 'unif', what: 'the uniform distribution', params: 'a, b', meaning: 'every value from a to b is equally likely; b is above a.', discrete: false, at: '1.5', ps: '1,4' },
  { name: 'weibull', what: 'the Weibull distribution', params: 's', meaning: 's is its shape, above 0; its scale is 1. For a scale λ, divide x by λ (and the density by λ).', discrete: false, at: '1.5', ps: '2' },
];

const call = (fn: string, args: string): string => `\\mathrm{${fn}}\\left(${args}\\right)=`;

function entries(d: Dist): Entry[] {
  const x = d.discrete ? 'k' : 'x';
  const what = d.discrete ? 'count k' : 'x';
  const meaning = `${d.discrete ? 'It counts ' : ''}${d.meaning.charAt(0).toUpperCase() + d.meaning.slice(1)}`;
  const counts = d.discrete ? ' A k that isn\'t a whole number has probability 0, and the cumulative probability counts up to the whole number below it.' : '';
  const family = `See also [[d${d.name}]], [[p${d.name}]], [[q${d.name}]] and [[r${d.name}]].`;
  const out: Entry[] = [
    {
      name: `d${d.name}`, group: 'Probability distributions', usage: `d${d.name}(${x}, ${d.params})`, mathcad: true,
      summary: d.discrete ? `The probability of exactly k in ${d.what}.` : `The probability density of ${d.what} at x.`,
      details: [meaning + counts, `A vector of ${what === 'x' ? 'values' : 'counts'} gives a vector. ${family}`, ...(d.note ? [d.note] : [])],
      units: 'Plain numbers, without units.',
      example: [call(`d${d.name}`, `${d.at},${d.ps}`)],
    },
    {
      name: `p${d.name}`, group: 'Probability distributions', usage: `p${d.name}(${x}, ${d.params})`, mathcad: true,
      summary: `The cumulative probability of ${d.what}: the chance of a value at or below ${x}.`,
      details: [meaning + counts, `[[q${d.name}]] goes back. ${family}`],
      units: 'Plain numbers, without units.',
      example: [call(`p${d.name}`, `${d.at},${d.ps}`)],
    },
    {
      name: `q${d.name}`, group: 'Probability distributions', usage: `q${d.name}(p, ${d.params})`, mathcad: true,
      summary: d.discrete ? `The inverse of [[p${d.name}]]: the smallest count whose cumulative probability reaches p.` : `The inverse of [[p${d.name}]]: the value below which a fraction p of ${d.what} lies.`,
      details: [meaning, `p is a probability, from 0 to 1. ${family}`],
      errors: ['A p below 0 or above 1.'],
      example: [call(`q${d.name}`, `0.3,${d.ps}`)],
    },
  ];
  if (d.name !== 'norm' && d.name !== 'unif') {
    out.push({
      name: `r${d.name}`, group: 'Random numbers', usage: `r${d.name}(m, ${d.params})`, mathcad: true, results: 'varies',
      summary: `A vector of m random numbers from ${d.what}.`,
      details: [meaning, `m is a whole number, 1 or more. The numbers stay the same each time the worksheet calculates; [[random]] says how to draw new ones. ${family}`],
      example: [call(`r${d.name}`, `5,${d.ps}`)],
    });
  }
  return out;
}

export const DISTRIBUTIONS: Entry[] = [
  ...DISTS.flatMap(entries),
  {
    name: 'erf', group: 'Probability distributions', usage: 'erf(x)', mathcad: true,
    summary: 'The error function, (2/√π)·∫₀ˣ e^(−t²) dt.',
    details: ['erf(−x) = −erf(x), and erf approaches 1 as x grows. [[erfc]] is 1 − erf(x), without losing digits in the tail. [[pnorm]] is ½·(1 + erf((x − μ)/(σ·√2))).'],
    example: ['\\mathrm{erf}\\left(0.5\\right)=', '\\mathrm{erf}\\left(-1.2\\right)='],
  },
  {
    name: 'erfc', group: 'Probability distributions', usage: 'erfc(x)', mathcad: true,
    summary: 'The complementary error function, 1 − erf(x), accurate far into the tail.',
    example: ['\\mathrm{erfc}\\left(0.5\\right)=', '\\mathrm{erfc}\\left(3\\right)='],
  },
  {
    name: 'cnorm', group: 'Probability distributions', usage: 'cnorm(x)', mathcad: true,
    summary: 'The cumulative probability of the standard normal distribution at x, as pnorm(x, 0, 1).',
    details: ['Kept from older versions. [[pnorm]] takes a mean and standard deviation too.'],
    example: ['\\mathrm{cnorm}\\left(1\\right)='],
  },
  {
    name: 'var', group: 'Statistics', usage: 'var(A, …)', mathcad: true,
    summary: 'The variance of all the elements, dividing by their number n: the population variance.',
    details: ['[[Var]] divides by n − 1, for a sample. Takes numbers, vectors and matrices, any mix. Its square root is [[stdev]].'],
    units: 'In the square of the elements\' units.',
    example: ['V\\coloneq \\begin{pmatrix}2\\\\4\\\\4\\\\5\\\\9\\end{pmatrix}', '\\mathrm{var}\\left(V\\right)='],
  },
  {
    name: 'Var', group: 'Statistics', usage: 'Var(A, …)', mathcad: true,
    summary: 'The sample variance of all the elements, dividing by n − 1.',
    details: ['[[var]] divides by n. Its square root is [[Stdev]].'],
    units: 'In the square of the elements\' units.',
    errors: ['Fewer than two values.'],
    example: ['V\\coloneq \\begin{pmatrix}2\\\\4\\\\4\\\\5\\\\9\\end{pmatrix}', '\\mathrm{Var}\\left(V\\right)='],
  },
  {
    name: 'median', group: 'Statistics', usage: 'median(A, …)', mathcad: true,
    summary: 'The middle value of all the elements, or the mean of the middle two when there\'s an even number.',
    units: 'In the elements\' units.',
    example: ['\\mathrm{median}\\left(\\begin{pmatrix}2\\\\9\\\\4\\\\5\\end{pmatrix}\\right)='],
  },
  {
    name: 'mode', group: 'Statistics', usage: 'mode(A, …)', mathcad: true,
    summary: 'The value that appears most often among all the elements.',
    errors: ['No value appearing more than once, or two values tied for most often.'],
    example: ['\\mathrm{mode}\\left(\\begin{pmatrix}2\\\\4\\\\4\\\\5\\\\9\\end{pmatrix}\\right)='],
  },
  {
    name: 'gmean', group: 'Statistics', usage: 'gmean(A, …)', mathcad: true,
    summary: 'The geometric mean of all the elements: the nth root of their product.',
    errors: ['A value of 0 or below.'],
    example: ['\\mathrm{gmean}\\left(\\begin{pmatrix}1\\\\2\\\\4\\end{pmatrix}\\right)='],
  },
  {
    name: 'hmean', group: 'Statistics', usage: 'hmean(A, …)', mathcad: true,
    summary: 'The harmonic mean of all the elements: n over the sum of their reciprocals.',
    errors: ['A value of 0 or below.'],
    example: ['\\mathrm{hmean}\\left(\\begin{pmatrix}1\\\\2\\\\4\\end{pmatrix}\\right)='],
  },
  {
    name: 'skew', group: 'Statistics', usage: 'skew(A, …)', mathcad: true,
    summary: 'The sample skewness of all the elements: how lopsided they are, positive when the long tail is above the mean.',
    details: ['n/((n − 1)(n − 2))·Σ((x − mean)/s)³, with s the sample standard deviation.'],
    errors: ['Fewer than three values.'],
    example: ['\\mathrm{skew}\\left(\\begin{pmatrix}2\\\\4\\\\4\\\\5\\\\9\\end{pmatrix}\\right)='],
  },
  {
    name: 'kurt', group: 'Statistics', usage: 'kurt(A, …)', mathcad: true,
    summary: 'The sample kurtosis of all the elements, in excess of a normal distribution\'s: positive for heavy tails.',
    details: ['With the sample standard deviation and the n − 1, n − 2, n − 3 corrections.'],
    errors: ['Fewer than four values.'],
    example: ['\\mathrm{kurt}\\left(\\begin{pmatrix}2\\\\4\\\\4\\\\5\\\\9\\end{pmatrix}\\right)='],
  },
  {
    name: 'cvar', group: 'Statistics', usage: 'cvar(A, B)', mathcad: true,
    summary: 'The covariance of two arrays of the same size, dividing by n.',
    details: ['Elements pair up by position. cvar(A, A) is [[var]](A).'],
    units: 'In the product of the two arrays\' units.',
    errors: ['Arrays of different sizes.'],
    example: ['\\mathrm{cvar}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},\\begin{pmatrix}2\\\\4\\\\7\\end{pmatrix}\\right)='],
  },
  {
    name: 'corr', group: 'Statistics', usage: 'corr(A, B)', mathcad: true,
    summary: 'The correlation of two arrays of the same size: from −1 to 1, 1 when one rises in step with the other.',
    errors: ['Arrays of different sizes.', 'An array whose values are all the same.'],
    example: ['\\mathrm{corr}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},\\begin{pmatrix}2\\\\4\\\\7\\end{pmatrix}\\right)='],
  },
];

