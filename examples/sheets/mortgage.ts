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

import type { Example } from '../sheet.js';

export const mortgage: Example = {
  slug: 'mortgage',
  title: 'A mortgage, month by month',
  summary: 'A 30-year loan: its payment, where each payment goes, what paying a little extra saves, and whether solar panels pay their way.',
  build(s) {
    s.text('A mortgage, month by month. A loan of 320 000 at 6.5% a year, repaid monthly over 30 years. The finance functions follow the spreadsheet signs: money received, as the loan, is positive, and money paid out negative.');
    s.section('The loan, and the monthly payment. The rate is per period, so the yearly rate is divided by 12.', true);
    s.row('P\\coloneq 320000', 'r\\coloneq \\frac{6.5\\%}{12}', 'n\\coloneq 30\\cdot 12', { latex: 'M\\coloneq \\mathrm{pmt}\\left(r,n,P\\right)', x: 300 }, { latex: 'M=', x: 430 });
    s.text('Over the 30 years, the interest comes to more than the loan itself:');
    s.row({ latex: '\\mathrm{cumint}\\left(r,n,P,1,n\\right)=' }, { latex: '-M\\cdot n=', x: 250 });

    s.section('Where each payment goes. ipmt is the part of a month\'s payment that is interest and ppmt the part that pays down the loan; together they are the payment. Early on, most of it is interest.');
    s.row('k\\coloneq 1..n', 'I_{k}\\coloneq -\\mathrm{ipmt}\\left(r,k,n,P\\right)', 'R_{k}\\coloneq -\\mathrm{ppmt}\\left(r,k,n,P\\right)', 'B_{k}\\coloneq P+\\mathrm{cumprn}\\left(r,n,P,1,k\\right)');
    s.row({ latex: 'I_{1}=' }, { latex: 'R_{1}=', x: 120 }, { latex: 'I_{1}+R_{1}=', x: 240 }, { latex: '\\mathrm{cumint}\\left(r,n,P,1,12\\right)=', x: 360 });
    s.plots(
      { x: '\\frac{k}{12}', ys: ['I_{k}', 'R_{k}'], width: 230, height: 150, xTitle: 'years', traces: [{ color: '#dc2626', weight: 2 }, { color: '#2563eb', weight: 2 }] },
      { x: '\\frac{k}{12}', ys: ['B_{k}'], width: 230, height: 150, xTitle: 'years', yMin: '0', traces: [{ color: '#2563eb', weight: 2 }] },
    );
    s.text('Left: each month\'s interest, red, and principal, blue; they cross after about 19 and a half years. Right: what is still owed.');

    s.section('Paying 200 more each month. nper finds how long the loan then lasts, and the interest saved follows.');
    s.row({ latex: 'N\\coloneq \\mathrm{nper}\\left(r,M-200,P\\right)' }, { latex: '\\frac{N}{12}=', x: 200 }, { latex: '\\left(M-200\\right)\\cdot N-M\\cdot n=', x: 300 });
    s.text('Nearly seven years sooner, and more than 100 000 less interest. A 15-year loan, which usually comes at a lower rate, does better still. rate goes the other way, from a payment back to the rate:');
    s.row({ latex: 'M_{\\text{15}}\\coloneq \\mathrm{pmt}\\left(\\frac{5.75\\%}{12},180,P\\right)' }, { latex: 'M_{\\text{15}}=', x: 220 }, { latex: '12\\cdot \\mathrm{rate}\\left(180,M_{\\text{15}},P\\right)=', unit: '\\%', x: 340 });
    s.row({ latex: '\\mathrm{cumint}\\left(\\frac{5.75\\%}{12},180,P,1,180\\right)=' });
    s.text('A higher payment, but well under half the interest of the 30-year loan.');

    s.section('Solar panels on the roof: 14 000 now, then savings of 1400 the first year, rising 3% a year with the price of power, for 20 years. irr is the return they earn; npv, at the 6.5% the mortgage costs, says whether they beat paying it down.');
    s.row('c_{0}\\coloneq -14000', 'j\\coloneq 1..20', 'c_{j}\\coloneq 1400\\cdot 1.03^{j-1}');
    s.row({ latex: '\\mathrm{irr}\\left(c\\right)=', unit: '\\%' }, { latex: '\\mathrm{npv}\\left(6.5\\%,c\\right)\\cdot \\left(1+6.5\\%\\right)=', x: 200 });
    s.text('npv counts the first flow a year ahead, so multiplying by 1.065 brings it back to now. The panels return about 10.6% a year, and are worth some 5500 more than putting the money against the loan. Try 2% for the rise in the price of power.', { end: true });
  },
};
