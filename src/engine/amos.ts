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

/**
 * Complex Bessel and Airy functions: a TypeScript port of D. E. Amos's Algorithm 644 (SLATEC routines ZBESJ, ZBESY,
 * ZBESI, ZBESK, ZBESH, ZAIRY, ZBIRY and their helpers), following SciPy's xsf C++ translation
 * (scipy/xsf, include/xsf/cpu/amos/amos.h, commit 3682d380347bcb80b9e3071e2e2278cab3da1a28).  Where the C++ translation
 * departs from the original Fortran in a way that looks like a transcription slip, the Fortran is followed and the
 * spot is marked with a comment.
 *
 * Conventions kept from Amos: members of an n-sequence are orders fnu, fnu+1, ..., fnu+n-1; kode = 1 returns the
 * plain function and kode = 2 the exponentially scaled one; nz counts members set to zero because of underflow
 * (which ones depends on the function: see the individual routines); ierr is 0 for success, 1 for
 * an input error, 2 for overflow (no result), 3 for loss of more than half the precision (result computed), 4 for
 * complete loss of precision (no result) and 5 for failure of the algorithm to converge.
 *
 * Deliberate departures from the C++ source (each marked where it occurs, and taken from the original Fortran):
 *  - uoik: the underflow test of the first member tests cos/sin of the phase (the C++ passes a real number to uchk);
 *    the loop over the remaining members uses |arg|, not |phi|, for the Airy-form test.
 *  - uni1 and uni2: when the first member underflows, return with nz = n (the C++ falls through in uni1 and leaves
 *    nz = 0 in uni2).  unik: return early when z/fnu is too small to scale.
 *  - unk1: the scale test in the last recurrence uses the value before s1s2, as unk2 and the Fortran do.
 *  - besi: keeps ierr = 3 (precision warning) for Re z < 0; the C++ resets it to 0.
 * Not reached by the test grid or by 500 000 random points (the guards are all there, but no input gets in): the
 * failure returns of acai/binu/besh/besj/besi, the first-member underflow exits and mid-sequence underflow handling
 * of uni1/uni2, the underflow exits of unk1/unk2, the rescaling at xx -= elim in kscl and bknu, the zero-order
 * special cases at the top of bknu's Miller loop, the tiny-z returns of unhj/unik, and ierr = 5 of airy.
 *
 * The notices below are required to be kept with the code.
 */

/*
 *
 * This file is a C++ translation of the Fortran code written by
 * D.E. Amos with the following original description:
 *
 *
 * A Portable Package for Bessel Functions of a Complex Argument
 * and Nonnegative Order
 *
 * This algorithm is a package of subroutines for computing Bessel
 * functions and Airy functions.  The routines are updated
 * versions of those routines found in TOMS algorithm 644.
 *
 * Disclaimer:
 *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *                 ISSUED BY SANDIA LABORATORIES,
 *                   A PRIME CONTRACTOR TO THE
 *               UNITED STATES DEPARTMENT OF ENERGY
 * * * * * * * * * * * * * *  NOTICE   * * * * * * * * * * * * * * *
 * THIS REPORT WAS PREPARED AS AN ACCOUNT OF WORK SPONSORED BY THE
 * UNITED STATES GOVERNMENT.  NEITHER THE UNITED STATES NOR THE
 * UNITED STATES DEPARTMENT OF ENERGY, NOR ANY OF THEIR
 * EMPLOYEES, NOR ANY OF THEIR CONTRACTORS, SUBCONTRACTORS, OR THEIR
 * EMPLOYEES, MAKES ANY WARRANTY, EXPRESS OR IMPLIED, OR ASSUMES ANY
 * LEGAL LIABILITY OR RESPONSIBILITY FOR THE ACCURACY, COMPLETENESS
 * OR USEFULNESS OF ANY INFORMATION, APPARATUS, PRODUCT OR PROCESS
 * DISCLOSED, OR REPRESENTS THAT ITS USE WOULD NOT INFRINGE
 * PRIVATELY OWNED RIGHTS.
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * THIS CODE HAS BEEN APPROVED FOR UNLIMITED RELEASE.
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 *
 *
 * The original Fortran code can be found at https://www.netlib.org/amos/
 *
 * References:
 *
 * [1]: Abramowitz, M. and Stegun, I. A., Handbook of Mathematical
 *      Functions, NBS Applied Math Series 55, U.S. Dept. of Commerce,
 *      Washington, D.C., 1955
 *
 * [2]: Amos, D. E., Algorithm 644, A Portable Package For Bessel
 *      Functions of a Complex Argument and Nonnegative Order, ACM
 *      Transactions on Mathematical Software, Vol. 12, No. 3,
 *      September 1986, Pages 265-273, DOI:10.1145/7921.214331
 *
 * [3]: Amos, D. E., Remark on Algorithm 644, ACM Transactions on
 *      Mathematical Software, Vol. 16, No. 4, December 1990, Page
 *      404, DOI:10.1145/98267.98299
 *
 * [4]: Amos, D. E., A remark on Algorithm 644: "A portable package
 *      for Bessel functions of a complex argument and nonnegative order",
 *      ACM Transactions on Mathematical Software, Vol. 21, No. 4,
 *      December 1995, Pages 388-393, DOI:10.1145/212066.212078
 *
 * [5]: Cody, W. J., Algorithm 665, MACHAR: A Subroutine to
 *      Dynamically Determine Machine Parameters, ACM Transactions on
 *      Mathematical Software, Vol. 14, No. 4, December 1988, Pages
 *      303-311, DOI:10.1145/50063.51907
 *
 */

/*
 * Copyright (C) 2024 SciPy developers
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * a. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * b. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * c. Names of the SciPy Developers may not be used to endorse or promote
 *    products derived from this software without specific prior written
 *    permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
 * OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

import type { C } from './complex.js';

// ---------------------------------------------------------------------------------------------------------------
// Complex arithmetic helpers (std::complex<double> equivalents) and machine constants.
// ---------------------------------------------------------------------------------------------------------------

const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const conj = (a: C): C => [a[0], -a[1]];
const cneg = (a: C): C => [-a[0], -a[1]];
/** Complex times real: componentwise, as C++ does for complex<double> * double. */
const csc = (a: C, r: number): C => [a[0] * r, a[1] * r];
/** Complex divided by real: componentwise. */
const cdr = (a: C, r: number): C => [a[0] / r, a[1] / r];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
/** Complex division with Smith's scaling, like the compiler runtime's __divdc3. */
const cdiv = (a: C, b: C): C => {
  const [ar, ai] = a;
  const [br, bi] = b;
  if (Math.abs(br) < Math.abs(bi)) {
    const ratio = br / bi;
    const denom = br * ratio + bi;
    return [(ar * ratio + ai) / denom, (ai * ratio - ar) / denom];
  }
  const ratio = bi / br;
  const denom = bi * ratio + br;
  return [(ai * ratio + ar) / denom, (ai - ar * ratio) / denom];
};
/** Real divided by complex. */
const rdiv = (r: number, b: C): C => cdiv([r, 0], b);
const cabs = (a: C): number => Math.hypot(a[0], a[1]);
const cexp = (a: C): C => {
  const e = Math.exp(a[0]);
  if (a[1] === 0) return [e, a[1]];
  return [e * Math.cos(a[1]), e * Math.sin(a[1])];
};
const clog = (a: C): C => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
const csqrt = (a: C): C => {
  const [x, y] = a;
  if (x === 0 && y === 0) return [0, y];
  if (y === 0) return x >= 0 ? [Math.sqrt(x), y] : [0, Math.sign(1 / y) * Math.sqrt(-x)];
  const t = Math.sqrt((Math.hypot(x, y) + Math.abs(x)) / 2);
  if (x >= 0) return [t, y / (2 * t)];
  return [Math.abs(y) / (2 * t), y >= 0 ? t : -t];
};
/** Polar form r*exp(i*theta), as std::polar. */
const cpolar = (r: number, theta: number): C => [r * Math.cos(theta), r * Math.sin(theta)];

const DBL_MIN = 2.2250738585072014e-308;
const DBL_MAX = Number.MAX_VALUE;
const DBL_EPSILON = Number.EPSILON;
const DBL_MANT_DIG = 53;
const DBL_MIN_EXP = -1021;
const DBL_MAX_EXP = 1024;
const DBL_DIG = 15;
const LOG10_2 = 0.3010299956639812;
const THRESHOLD_MIN = 1e3 * DBL_MIN;
const RTOL_MIN = DBL_EPSILON > 1e-18 ? DBL_EPSILON : 1e-18;
const M_PI = Math.PI;
const M_PI_2 = Math.PI / 2;
const M_SQRT1_2 = Math.SQRT1_2;
/** C-style truncation to int. */
const trunc = (x: number): number => Math.trunc(x);


// ---------------------------------------------------------------------------------------------------------------
// Coefficient tables (generated from the C++ source by script; see the test for the checksums).
// ---------------------------------------------------------------------------------------------------------------

const ZUNHJ_AR = [
  1.00000000000000000e+00, 1.04166666666666667e-01, 8.35503472222222222e-02, 1.28226574556327160e-01,
  2.91849026464140464e-01, 8.81627267443757652e-01, 3.32140828186276754e+00, 1.49957629868625547e+01,
  7.89230130115865181e+01, 4.74451538868264323e+02, 3.20749009089066193e+03, 2.40865496408740049e+04,
  1.98923119169509794e+05, 1.79190200777534383e+06,
];

const ZUNHJ_BR = [
  1.00000000000000000e+00, -1.45833333333333333e-01, -9.87413194444444444e-02, -1.43312053915895062e-01,
  -3.17227202678413548e-01, -9.42429147957120249e-01, -3.51120304082635426e+00, -1.57272636203680451e+01,
  -8.22814390971859444e+01, -4.92355370523670524e+02, -3.31621856854797251e+03, -2.48276742452085896e+04,
  -2.04526587315129788e+05, -1.83844491706820990e+06,
];

const ZUNHJ_C = [
  1.00000000000000000e+00, -2.08333333333333333e-01, 1.25000000000000000e-01, 3.34201388888888889e-01,
  -4.01041666666666667e-01, 7.03125000000000000e-02, -1.02581259645061728e+00, 1.84646267361111111e+00,
  -8.91210937500000000e-01, 7.32421875000000000e-02, 4.66958442342624743e+00, -1.12070026162229938e+01,
  8.78912353515625000e+00, -2.36408691406250000e+00, 1.12152099609375000e-01, -2.82120725582002449e+01,
  8.46362176746007346e+01, -9.18182415432400174e+01, 4.25349987453884549e+01, -7.36879435947963170e+00,
  2.27108001708984375e-01, 2.12570130039217123e+02, -7.65252468141181642e+02, 1.05999045252799988e+03,
  -6.99579627376132541e+02, 2.18190511744211590e+02, -2.64914304869515555e+01, 5.72501420974731445e-01,
  -1.91945766231840700e+03, 8.06172218173730938e+03, -1.35865500064341374e+04, 1.16553933368645332e+04,
  -5.30564697861340311e+03, 1.20090291321635246e+03, -1.08090919788394656e+02, 1.72772750258445740e+00,
  2.02042913309661486e+04, -9.69805983886375135e+04, 1.92547001232531532e+05, -2.03400177280415534e+05,
  1.22200464983017460e+05, -4.11926549688975513e+04, 7.10951430248936372e+03, -4.93915304773088012e+02,
  6.07404200127348304e+00, -2.42919187900551333e+05, 1.31176361466297720e+06, -2.99801591853810675e+06,
  3.76327129765640400e+06, -2.81356322658653411e+06, 1.26836527332162478e+06, -3.31645172484563578e+05,
  4.52187689813627263e+04, -2.49983048181120962e+03, 2.43805296995560639e+01, 3.28446985307203782e+06,
  -1.97068191184322269e+07, 5.09526024926646422e+07, -7.41051482115326577e+07, 6.63445122747290267e+07,
  -3.75671766607633513e+07, 1.32887671664218183e+07, -2.78561812808645469e+06, 3.08186404612662398e+05,
  -1.38860897537170405e+04, 1.10017140269246738e+02, -4.93292536645099620e+07, 3.25573074185765749e+08,
  -9.39462359681578403e+08, 1.55359689957058006e+09, -1.62108055210833708e+09, 1.10684281682301447e+09,
  -4.95889784275030309e+08, 1.42062907797533095e+08, -2.44740627257387285e+07, 2.24376817792244943e+06,
  -8.40054336030240853e+04, 5.51335896122020586e+02, 8.14789096118312115e+08, -5.86648149205184723e+09,
  1.86882075092958249e+10, -3.46320433881587779e+10, 4.12801855797539740e+10, -3.30265997498007231e+10,
  1.79542137311556001e+10, -6.56329379261928433e+09, 1.55927986487925751e+09, -2.25105661889415278e+08,
  1.73951075539781645e+07, -5.49842327572288687e+05, 3.03809051092238427e+03, -1.46792612476956167e+10,
  1.14498237732025810e+11, -3.99096175224466498e+11, 8.19218669548577329e+11, -1.09837515608122331e+12,
  1.00815810686538209e+12, -6.45364869245376503e+11, 2.87900649906150589e+11, -8.78670721780232657e+10,
  1.76347306068349694e+10, -2.16716498322379509e+09, 1.43157876718888981e+08, -3.87183344257261262e+06,
  1.82577554742931747e+04,
];

const ZUNHJ_ALFA = [
  -4.44444444444444444e-03, -9.22077922077922078e-04, -8.84892884892884893e-05, 1.65927687832449737e-04,
  2.46691372741792910e-04, 2.65995589346254780e-04, 2.61824297061500945e-04, 2.48730437344655609e-04,
  2.32721040083232098e-04, 2.16362485712365082e-04, 2.00738858762752355e-04, 1.86267636637545172e-04,
  1.73060775917876493e-04, 1.61091705929015752e-04, 1.50274774160908134e-04, 1.40503497391269794e-04,
  1.31668816545922806e-04, 1.23667445598253261e-04, 1.16405271474737902e-04, 1.09798298372713369e-04,
  1.03772410422992823e-04, 9.82626078369363448e-05, 9.32120517249503256e-05, 8.85710852478711718e-05,
  8.42963105715700223e-05, 8.03497548407791151e-05, 7.66981345359207388e-05, 7.33122157481777809e-05,
  7.01662625163141333e-05, 6.72375633790160292e-05, 6.93735541354588974e-04, 2.32241745182921654e-04,
  -1.41986273556691197e-05, -1.16444931672048640e-04, -1.50803558053048762e-04, -1.55121924918096223e-04,
  -1.46809756646465549e-04, -1.33815503867491367e-04, -1.19744975684254051e-04, -1.06184319207974020e-04,
  -9.37699549891194492e-05, -8.26923045588193274e-05, -7.29374348155221211e-05, -6.44042357721016283e-05,
  -5.69611566009369048e-05, -5.04731044303561628e-05, -4.48134868008882786e-05, -3.98688727717598864e-05,
  -3.55400532972042498e-05, -3.17414256609022480e-05, -2.83996793904174811e-05, -2.54522720634870566e-05,
  -2.28459297164724555e-05, -2.05352753106480604e-05, -1.84816217627666085e-05, -1.66519330021393806e-05,
  -1.50179412980119482e-05, -1.35554031379040526e-05, -1.22434746473858131e-05, -1.10641884811308169e-05,
  -3.54211971457743841e-04, -1.56161263945159416e-04, 3.04465503594936410e-05, 1.30198655773242693e-04,
  1.67471106699712269e-04, 1.70222587683592569e-04, 1.56501427608594704e-04, 1.36339170977445120e-04,
  1.14886692029825128e-04, 9.45869093034688111e-05, 7.64498419250898258e-05, 6.07570334965197354e-05,
  4.74394299290508799e-05, 3.62757512005344297e-05, 2.69939714979224901e-05, 1.93210938247939253e-05,
  1.30056674793963203e-05, 7.82620866744496661e-06, 3.59257485819351583e-06, 1.44040049814251817e-07,
  -2.65396769697939116e-06, -4.91346867098485910e-06, -6.72739296091248287e-06, -8.17269379678657923e-06,
  -9.31304715093561232e-06, -1.02011418798016441e-05, -1.08805962510592880e-05, -1.13875481509603555e-05,
  -1.17519675674556414e-05, -1.19987364870944141e-05, 3.78194199201772914e-04, 2.02471952761816167e-04,
  -6.37938506318862408e-05, -2.38598230603005903e-04, -3.10916256027361568e-04, -3.13680115247576316e-04,
  -2.78950273791323387e-04, -2.28564082619141374e-04, -1.75245280340846749e-04, -1.25544063060690348e-04,
  -8.22982872820208365e-05, -4.62860730588116458e-05, -1.72334302366962267e-05, 5.60690482304602267e-06,
  2.31395443148286800e-05, 3.62642745856793957e-05, 4.58006124490188752e-05, 5.24595294959114050e-05,
  5.68396208545815266e-05, 5.94349820393104052e-05, 6.06478527578421742e-05, 6.08023907788436497e-05,
  6.01577894539460388e-05, 5.89199657344698500e-05, 5.72515823777593053e-05, 5.52804375585852577e-05,
  5.31063773802880170e-05, 5.08069302012325706e-05, 4.84418647620094842e-05, 4.60568581607475370e-05,
  -6.91141397288294174e-04, -4.29976633058871912e-04, 1.83067735980039018e-04, 6.60088147542014144e-04,
  8.75964969951185931e-04, 8.77335235958235514e-04, 7.49369585378990637e-04, 5.63832329756980918e-04,
  3.68059319971443156e-04, 1.88464535514455599e-04, 3.70663057664904149e-05, -8.28520220232137023e-05,
  -1.72751952869172998e-04, -2.36314873605872983e-04, -2.77966150694906658e-04, -3.02079514155456919e-04,
  -3.12594712643820127e-04, -3.12872558758067163e-04, -3.05678038466324377e-04, -2.93226470614557331e-04,
  -2.77255655582934777e-04, -2.59103928467031709e-04, -2.39784014396480342e-04, -2.20048260045422848e-04,
  -2.00443911094971498e-04, -1.81358692210970687e-04, -1.63057674478657464e-04, -1.45712672175205844e-04,
  -1.29425421983924587e-04, -1.14245691942445952e-04, 1.92821964248775885e-03, 1.35592576302022234e-03,
  -7.17858090421302995e-04, -2.58084802575270346e-03, -3.49271130826168475e-03, -3.46986299340960628e-03,
  -2.82285233351310182e-03, -1.88103076404891354e-03, -8.89531718383947600e-04, 3.87912102631035228e-06,
  7.28688540119691412e-04, 1.26566373053457758e-03, 1.62518158372674427e-03, 1.83203153216373172e-03,
  1.91588388990527909e-03, 1.90588846755546138e-03, 1.82798982421825727e-03, 1.70389506421121530e-03,
  1.55097127171097686e-03, 1.38261421852276159e-03, 1.20881424230064774e-03, 1.03676532638344962e-03,
  8.71437918068619115e-04, 7.16080155297701002e-04, 5.72637002558129372e-04, 4.42089819465802277e-04,
  3.24724948503090564e-04, 2.20342042730246599e-04, 1.28412898401353882e-04, 4.82005924552095464e-05,
];

const ZUNHJ_BETA = [
  1.79988721413553309e-02, 5.59964911064388073e-03, 2.88501402231132779e-03, 1.80096606761053941e-03,
  1.24753110589199202e-03, 9.22878876572938311e-04, 7.14430421727287357e-04, 5.71787281789704872e-04,
  4.69431007606481533e-04, 3.93232835462916638e-04, 3.34818889318297664e-04, 2.88952148495751517e-04,
  2.52211615549573284e-04, 2.22280580798883327e-04, 1.97541838033062524e-04, 1.76836855019718004e-04,
  1.59316899661821081e-04, 1.44347930197333986e-04, 1.31448068119965379e-04, 1.20245444949302884e-04,
  1.10449144504599392e-04, 1.01828770740567258e-04, 9.41998224204237509e-05, 8.74130545753834437e-05,
  8.13466262162801467e-05, 7.59002269646219339e-05, 7.09906300634153481e-05, 6.65482874842468183e-05,
  6.25146958969275078e-05, 5.88403394426251749e-05, -1.49282953213429172e-03, -8.78204709546389328e-04,
  -5.02916549572034614e-04, -2.94822138512746025e-04, -1.75463996970782828e-04, -1.04008550460816434e-04,
  -5.96141953046457895e-05, -3.12038929076098340e-05, -1.26089735980230047e-05, -2.42892608575730389e-07,
  8.05996165414273571e-06, 1.36507009262147391e-05, 1.73964125472926261e-05, 1.98672978842133780e-05,
  2.14463263790822639e-05, 2.23954659232456514e-05, 2.28967783814712629e-05, 2.30785389811177817e-05,
  2.30321976080909144e-05, 2.28236073720348722e-05, 2.25005881105292418e-05, 2.20981015361991429e-05,
  2.16418427448103905e-05, 2.11507649256220843e-05, 2.06388749782170737e-05, 2.01165241997081666e-05,
  1.95913450141179244e-05, 1.90689367910436740e-05, 1.85533719641636667e-05, 1.80475722259674218e-05,
  5.52213076721292790e-04, 4.47932581552384646e-04, 2.79520653992020589e-04, 1.52468156198446602e-04,
  6.93271105657043598e-05, 1.76258683069991397e-05, -1.35744996343269136e-05, -3.17972413350427135e-05,
  -4.18861861696693365e-05, -4.69004889379141029e-05, -4.87665447413787352e-05, -4.87010031186735069e-05,
  -4.74755620890086638e-05, -4.55813058138628452e-05, -4.33309644511266036e-05, -4.09230193157750364e-05,
  -3.84822638603221274e-05, -3.60857167535410501e-05, -3.37793306123367417e-05, -3.15888560772109621e-05,
  -2.95269561750807315e-05, -2.75978914828335759e-05, -2.58006174666883713e-05, -2.41308356761280200e-05,
  -2.25823509518346033e-05, -2.11479656768912971e-05, -1.98200638885294927e-05, -1.85909870801065077e-05,
  -1.74532699844210224e-05, -1.63997823854497997e-05, -4.74617796559959808e-04, -4.77864567147321487e-04,
  -3.20390228067037603e-04, -1.61105016119962282e-04, -4.25778101285435204e-05, 3.44571294294967503e-05,
  7.97092684075674924e-05, 1.03138236708272200e-04, 1.12466775262204158e-04, 1.13103642108481389e-04,
  1.08651634848774268e-04, 1.01437951597661973e-04, 9.29298396593363896e-05, 8.40293133016089978e-05,
  7.52727991349134062e-05, 6.69632521975730872e-05, 5.92564547323194704e-05, 5.22169308826975567e-05,
  4.58539485165360646e-05, 4.01445513891486808e-05, 3.50481730031328081e-05, 3.05157995034346659e-05,
  2.64956119950516039e-05, 2.29363633690998152e-05, 1.97893056664021636e-05, 1.70091984636412623e-05,
  1.45547428261524004e-05, 1.23886640995878413e-05, 1.04775876076583236e-05, 8.79179954978479373e-06,
  7.36465810572578444e-04, 8.72790805146193976e-04, 6.22614862573135066e-04, 2.85998154194304147e-04,
  3.84737672879366102e-06, -1.87906003636971558e-04, -2.97603646594554535e-04, -3.45998126832656348e-04,
  -3.53382470916037712e-04, -3.35715635775048757e-04, -3.04321124789039809e-04, -2.66722723047612821e-04,
  -2.27654214122819527e-04, -1.89922611854562356e-04, -1.55058918599093870e-04, -1.23778240761873630e-04,
  -9.62926147717644187e-05, -7.25178327714425337e-05, -5.22070028895633801e-05, -3.50347750511900522e-05,
  -2.06489761035551757e-05, -8.70106096849767054e-06, 1.13698686675100290e-06, 9.16426474122778849e-06,
  1.56477785428872620e-05, 2.08223629482466847e-05, 2.48923381004595156e-05, 2.80340509574146325e-05,
  3.03987774629861915e-05, 3.21156731406700616e-05, -1.80182191963885708e-03, -2.43402962938042533e-03,
  -1.83422663549856802e-03, -7.62204596354009765e-04, 2.39079475256927218e-04, 9.49266117176881141e-04,
  1.34467449701540359e-03, 1.48457495259449178e-03, 1.44732339830617591e-03, 1.30268261285657186e-03,
  1.10351597375642682e-03, 8.86047440419791759e-04, 6.73073208165665473e-04, 4.77603872856582378e-04,
  3.05991926358789362e-04, 1.60315694594721630e-04, 4.00749555270613286e-05, -5.66607461635251611e-05,
  -1.32506186772982638e-04, -1.90296187989614057e-04, -2.32811450376937408e-04, -2.62628811464668841e-04,
  -2.82050469867598672e-04, -2.93081563192861167e-04, -2.97435962176316616e-04, -2.96557334239348078e-04,
  -2.91647363312090861e-04, -2.83696203837734166e-04, -2.73512317095673346e-04, -2.61750155806768580e-04,
  6.38585891212050914e-03, 9.62374215806377941e-03, 7.61878061207001043e-03, 2.83219055545628054e-03,
  -2.09841352012720090e-03, -5.73826764216626498e-03, -7.70804244495414620e-03, -8.21011692264844401e-03,
  -7.65824520346905413e-03, -6.47209729391045177e-03, -4.99132412004966473e-03, -3.45612289713133280e-03,
  -2.01785580014170775e-03, -7.59430686781961401e-04, 2.84173631523859138e-04, 1.10891667586337403e-03,
  1.72901493872728771e-03, 2.16812590802684701e-03, 2.45357710494539735e-03, 2.61281821058334862e-03,
  2.67141039656276912e-03, 2.65203073395980430e-03, 2.57411652877287315e-03, 2.45389126236094427e-03,
  2.30460058071795494e-03, 2.13684837686712662e-03, 1.95896528478870911e-03, 1.77737008679454412e-03,
  1.59690280765839059e-03, 1.42111975664438546e-03,
];

const ZUNHJ_GAMA = [
  6.29960524947436582e-01, 2.51984209978974633e-01, 1.54790300415655846e-01, 1.10713062416159013e-01,
  8.57309395527394825e-02, 6.97161316958684292e-02, 5.86085671893713576e-02, 5.04698873536310685e-02,
  4.42600580689154809e-02, 3.93720661543509966e-02, 3.54283195924455368e-02, 3.21818857502098231e-02,
  2.94646240791157679e-02, 2.71581677112934479e-02, 2.51768272973861779e-02, 2.34570755306078891e-02,
  2.19508390134907203e-02, 2.06210828235646240e-02, 1.94388240897880846e-02, 1.83810633800683158e-02,
  1.74293213231963172e-02, 1.65685837786612353e-02, 1.57865285987918445e-02, 1.50729501494095594e-02,
  1.44193250839954639e-02, 1.38184805735341786e-02, 1.32643378994276568e-02, 1.27517121970498651e-02,
  1.22761545318762767e-02, 1.18338262398482403e-02,
];

const ZUNIK_C = [
  1.00000000000000000e+00, -2.08333333333333333e-01, 1.25000000000000000e-01, 3.34201388888888889e-01,
  -4.01041666666666667e-01, 7.03125000000000000e-02, -1.02581259645061728e+00, 1.84646267361111111e+00,
  -8.91210937500000000e-01, 7.32421875000000000e-02, 4.66958442342624743e+00, -1.12070026162229938e+01,
  8.78912353515625000e+00, -2.36408691406250000e+00, 1.12152099609375000e-01, -2.82120725582002449e+01,
  8.46362176746007346e+01, -9.18182415432400174e+01, 4.25349987453884549e+01, -7.36879435947963170e+00,
  2.27108001708984375e-01, 2.12570130039217123e+02, -7.65252468141181642e+02, 1.05999045252799988e+03,
  -6.99579627376132541e+02, 2.18190511744211590e+02, -2.64914304869515555e+01, 5.72501420974731445e-01,
  -1.91945766231840700e+03, 8.06172218173730938e+03, -1.35865500064341374e+04, 1.16553933368645332e+04,
  -5.30564697861340311e+03, 1.20090291321635246e+03, -1.08090919788394656e+02, 1.72772750258445740e+00,
  2.02042913309661486e+04, -9.69805983886375135e+04, 1.92547001232531532e+05, -2.03400177280415534e+05,
  1.22200464983017460e+05, -4.11926549688975513e+04, 7.10951430248936372e+03, -4.93915304773088012e+02,
  6.07404200127348304e+00, -2.42919187900551333e+05, 1.31176361466297720e+06, -2.99801591853810675e+06,
  3.76327129765640400e+06, -2.81356322658653411e+06, 1.26836527332162478e+06, -3.31645172484563578e+05,
  4.52187689813627263e+04, -2.49983048181120962e+03, 2.43805296995560639e+01, 3.28446985307203782e+06,
  -1.97068191184322269e+07, 5.09526024926646422e+07, -7.41051482115326577e+07, 6.63445122747290267e+07,
  -3.75671766607633513e+07, 1.32887671664218183e+07, -2.78561812808645469e+06, 3.08186404612662398e+05,
  -1.38860897537170405e+04, 1.10017140269246738e+02, -4.93292536645099620e+07, 3.25573074185765749e+08,
  -9.39462359681578403e+08, 1.55359689957058006e+09, -1.62108055210833708e+09, 1.10684281682301447e+09,
  -4.95889784275030309e+08, 1.42062907797533095e+08, -2.44740627257387285e+07, 2.24376817792244943e+06,
  -8.40054336030240853e+04, 5.51335896122020586e+02, 8.14789096118312115e+08, -5.86648149205184723e+09,
  1.86882075092958249e+10, -3.46320433881587779e+10, 4.12801855797539740e+10, -3.30265997498007231e+10,
  1.79542137311556001e+10, -6.56329379261928433e+09, 1.55927986487925751e+09, -2.25105661889415278e+08,
  1.73951075539781645e+07, -5.49842327572288687e+05, 3.03809051092238427e+03, -1.46792612476956167e+10,
  1.14498237732025810e+11, -3.99096175224466498e+11, 8.19218669548577329e+11, -1.09837515608122331e+12,
  1.00815810686538209e+12, -6.45364869245376503e+11, 2.87900649906150589e+11, -8.78670721780232657e+10,
  1.76347306068349694e+10, -2.16716498322379509e+09, 1.43157876718888981e+08, -3.87183344257261262e+06,
  1.82577554742931747e+04, 2.86464035717679043e+11, -2.40629790002850396e+12, 9.10934118523989896e+12,
  -2.05168994109344374e+13, 3.05651255199353206e+13, -3.16670885847851584e+13, 2.33483640445818409e+13,
  -1.23204913055982872e+13, 4.61272578084913197e+12, -1.19655288019618160e+12, 2.05914503232410016e+11,
  -2.18229277575292237e+10, 1.24700929351271032e+09, -2.91883881222208134e+07, 1.18838426256783253e+05,
];

const DGAMLN_GLN = [
  0.00000000000000000e+00, 0.00000000000000000e+00, 6.93147180559945309e-01, 1.79175946922805500e+00,
  3.17805383034794562e+00, 4.78749174278204599e+00, 6.57925121201010100e+00, 8.52516136106541430e+00,
  1.06046029027452502e+01, 1.28018274800814696e+01, 1.51044125730755153e+01, 1.75023078458738858e+01,
  1.99872144956618861e+01, 2.25521638531234229e+01, 2.51912211827386815e+01, 2.78992713838408916e+01,
  3.06718601060806728e+01, 3.35050734501368889e+01, 3.63954452080330536e+01, 3.93398841871994940e+01,
  4.23356164607534850e+01, 4.53801388984769080e+01, 4.84711813518352239e+01, 5.16066755677643736e+01,
  5.47847293981123192e+01, 5.80036052229805199e+01, 6.12617017610020020e+01, 6.45575386270063311e+01,
  6.78897431371815350e+01, 7.12570389671680090e+01, 7.46582363488301644e+01, 7.80922235533153106e+01,
  8.15579594561150372e+01, 8.50544670175815174e+01, 8.85808275421976788e+01, 9.21361756036870925e+01,
  9.57196945421432025e+01, 9.93306124547874269e+01, 1.02968198614513813e+02, 1.06631760260643459e+02,
  1.10320639714757395e+02, 1.14034211781461703e+02, 1.17771881399745072e+02, 1.21533081515438634e+02,
  1.25317271149356895e+02, 1.29123933639127215e+02, 1.32952575035616310e+02, 1.36802722637326368e+02,
  1.40673923648234259e+02, 1.44565743946344886e+02, 1.48477766951773032e+02, 1.52409592584497358e+02,
  1.56360836303078785e+02, 1.60331128216630907e+02, 1.64320112263195181e+02, 1.68327445448427652e+02,
  1.72352797139162802e+02, 1.76395848406997352e+02, 1.80456291417543771e+02, 1.84533828861449491e+02,
  1.88628173423671591e+02, 1.92739047287844902e+02, 1.96866181672889994e+02, 2.01009316399281527e+02,
  2.05168199482641199e+02, 2.09342586752536836e+02, 2.13532241494563261e+02, 2.17736934113954227e+02,
  2.21956441819130334e+02, 2.26190548323727593e+02, 2.30439043565776952e+02, 2.34701723442818268e+02,
  2.38978389561834323e+02, 2.43268849002982714e+02, 2.47572914096186884e+02, 2.51890402209723194e+02,
  2.56221135550009525e+02, 2.60564940971863209e+02, 2.64921649798552801e+02, 2.69291097651019823e+02,
  2.73673124285693704e+02, 2.78067573440366143e+02, 2.82474292687630396e+02, 2.86893133295426994e+02,
  2.91323950094270308e+02, 2.95766601350760624e+02, 3.00220948647014132e+02, 3.04686856765668715e+02,
  3.09164193580146922e+02, 3.13652829949879062e+02, 3.18152639620209327e+02, 3.22663499126726177e+02,
  3.27185287703775217e+02, 3.31717887196928473e+02, 3.36261181979198477e+02, 3.40815058870799018e+02,
  3.45379407062266854e+02, 3.49954118040770237e+02, 3.54539085519440809e+02, 3.59134205369575399e+02,
];

const DGAMLN_CF = [
  8.33333333333333333e-02, -2.77777777777777778e-03, 7.93650793650793651e-04, -5.95238095238095238e-04,
  8.41750841750841751e-04, -1.91752691752691753e-03, 6.41025641025641026e-03, -2.95506535947712418e-02,
  1.79644372368830573e-01, -1.39243221690590112e+00, 1.34028640441683920e+01, -1.56848284626002017e+02,
  2.19310333333333333e+03, -3.61087712537249894e+04, 6.91472268851313067e+05, -1.52382215394074162e+07,
  3.82900751391414141e+08, -1.08822660357843911e+10, 3.47320283765002252e+11, -1.23696021422692745e+13,
  4.88788064793079335e+14, -2.13203339609193739e+16,
];


/** Result of s1s2: the nz count, the two (possibly zeroed) values and the updated flag. */
interface S1S2Result {
  nz: number;
  s1: C;
  s2: C;
  iuf: number;
}

/**
 * Tests for a possible underflow resulting from adding the I and K functions in the analytic continuation formula
 * (s1 = K function, s2 = I function).  (ZS1S2)
 */
function s1s2(zr: C, s1in: C, s2in: C, ascle: number, alim: number, iufIn: number): S1S2Result {
  let s1 = s1in;
  let iuf = iufIn;
  let as1 = cabs(s1);
  const as2 = cabs(s2in);
  const aa0 = s1[0];
  const aln0 = s1[1];
  if (aa0 !== 0 || aln0 !== 0) {
    if (as1 !== 0) {
      const xx = zr[0];
      const aln = -xx - xx + Math.log(as1);
      const s1d = s1;
      s1 = [0, 0];
      as1 = 0;
      if (aln >= -alim) {
        const c1 = csub(csub(clog(s1d), zr), zr);
        s1 = cexp(c1);
        as1 = cabs(s1);
        iuf += 1;
      }
    }
  }
  const aa = Math.max(as1, as2);
  if (aa > ascle) return { nz: 0, s1, s2: s2in, iuf };
  return { nz: 1, s1: [0, 0], s2: [0, 0], iuf: 0 };
}

/**
 * Analytic continuation of the K function from the right to the left half plane, for Airy functions (order 1/3 or
 * 2/3, n = 1).  Returns nz (negative on failure: -1 overflow, -2 no convergence); y[0] holds the result.  (ZACAI)
 */
function acai(z: C, fnu: number, kode: number, mr: number, n: number, y: C[], rl: number, tol: number, elim: number, alim: number): number {
  let nz = 0;
  const zn = cneg(z);
  const az = cabs(z);
  const nn = n;
  const dfnu = fnu + (n - 1);
  let nw: number;
  if (az > 2.0 && az * az * 0.25 > dfnu + 1.0) {
    if (az >= rl) {
      // Asymptotic expansion for large z for the I function.
      nw = asyi(zn, fnu, kode, nn, y, rl, tol, elim, alim);
    } else {
      // Miller algorithm normalized by the series for the I function.
      nw = mlri(zn, fnu, kode, nn, y, tol);
    }
    if (nw < 0) {
      nz = -1;
      if (nw === -2) nz = -2;
      return nz;
    }
  } else {
    // Power series for the I function.
    seri(zn, fnu, kode, nn, y, tol, elim, alim);
  }
  // Analytic continuation to the left half plane for the K function.
  const cy: C[] = [[0, 0], [0, 0]];
  nw = bknu(zn, fnu, kode, 1, cy, tol, elim, alim);
  if (nw !== 0) {
    nz = -1;
    if (nw === -2) nz = -2;
    return nz;
  }
  const fmr = mr;
  const sgn = fmr < 0.0 ? M_PI : -M_PI;
  let csgn: C = [0.0, sgn];
  if (kode !== 1) {
    const yy = -zn[1];
    csgn = cmul(csgn, [Math.cos(yy), Math.sin(yy)]);
  }
  // cspn = exp(fnu*pi*i), computed to minimize losses of significance when fnu is large.
  const inu = trunc(fnu);
  const arg = (fnu - inu) * sgn;
  let cspn: C = [Math.cos(arg), Math.sin(arg)];
  if (inu % 2 === 1) cspn = cneg(cspn);
  let c1 = cy[0];
  let c2 = y[0];
  if (kode !== 1) {
    const ascle = THRESHOLD_MIN / tol;
    const r = s1s2(zn, c1, c2, ascle, alim, 0);
    c1 = r.s1;
    c2 = r.s2;
    nz += r.nz;
  }
  y[0] = cadd(cmul(cspn, c1), cmul(csgn, c2));
  return nz;
}

/**
 * Analytic continuation of the K function from the right to the left half plane:
 * K(fnu, zn*exp(mp)) = K(fnu, zn)*exp(-mp*fnu) - mp*I(fnu, zn), mp = pi*mr*i.  (ZACON)
 */
function acon(z: C, fnu: number, kode: number, mr: number, n: number, y: C[], rl: number, fnul: number, tol: number, elim: number, alim: number): number {
  let nz = 0;
  const zn = cneg(z);
  let nn = n;
  let nw = binu(zn, fnu, kode, nn, y, rl, fnul, tol, elim, alim);
  if (nw >= 0) {
    // Analytic continuation to the left half plane for the K function.
    nn = n > 2 ? 2 : n;
    const cy: C[] = [[0, 0], [0, 0]];
    nw = bknu(zn, fnu, kode, nn, cy, tol, elim, alim);
    if (nw === 0) {
      let s1 = cy[0];
      const fmr = mr;
      const sgn = fmr < 0 ? M_PI : -M_PI;
      let csgn: C = [0.0, sgn];
      if (kode !== 1) {
        const yy = -zn[1];
        csgn = cmul(csgn, [Math.cos(yy), Math.sin(yy)]);
      }
      const inu = trunc(fnu);
      const arg = (fnu - inu) * sgn;
      let cspn: C = [Math.cos(arg), Math.sin(arg)];
      if (inu % 2 === 1) cspn = cneg(cspn);
      let iuf = 0;
      let c1 = s1;
      let c2 = y[0];
      const ascle = THRESHOLD_MIN / tol;
      let sc1: C = [0, 0];
      let sc2: C = [0, 0];
      if (kode !== 1) {
        const r = s1s2(zn, c1, c2, ascle, alim, iuf);
        c1 = r.s1;
        c2 = r.s2;
        iuf = r.iuf;
        nz += r.nz;
        sc1 = c1;
      }
      y[0] = cadd(cmul(cspn, c1), cmul(csgn, c2));
      if (n === 1) return nz;
      cspn = cneg(cspn);
      let s2 = cy[1];
      c1 = s2;
      c2 = y[1];
      if (kode !== 1) {
        const r = s1s2(zn, c1, c2, ascle, alim, iuf);
        c1 = r.s1;
        c2 = r.s2;
        iuf = r.iuf;
        nz += r.nz;
        sc2 = c1;
      }
      y[1] = cadd(cmul(cspn, c1), cmul(csgn, c2));
      if (n === 2) return nz;
      cspn = cneg(cspn);
      const rz = rdiv(2.0, zn);
      let ck = csc(rz, fnu + 1.0);
      // Scale near exponent extremes during recurrence on K functions.
      const cscl = 1.0 / tol;
      const cscr = tol;
      const css = [cscl, 1.0, cscr];
      const csr = [cscr, 1.0, cscl];
      const bry = [ascle, 1.0 / ascle, DBL_MAX];
      const as2 = cabs(s2);
      let kflag = 2;
      if (as2 <= bry[0]) {
        kflag = 1;
      } else if (as2 >= bry[1]) {
        kflag = 3;
      }
      let bscle = bry[kflag - 1];
      s1 = csc(s1, css[kflag - 1]);
      s2 = csc(s2, css[kflag - 1]);
      let cs = csr[kflag - 1];
      for (let i = 3; i < n + 1; i++) {
        let st = s2;
        s2 = cadd(cmul(ck, s2), s1);
        s1 = st;
        c1 = csc(s2, cs);
        st = c1;
        c2 = y[i - 1];
        if (kode !== 1) {
          if (iuf >= 0) {
            const r = s1s2(zn, c1, c2, ascle, alim, iuf);
            c1 = r.s1;
            c2 = r.s2;
            iuf = r.iuf;
            nz += r.nz;
            sc1 = sc2;
            sc2 = c1;
            if (iuf === 3) {
              iuf = -4;
              s1 = csc(sc1, css[kflag - 1]);
              s2 = csc(sc2, css[kflag - 1]);
              st = sc2;
            }
          }
        }
        y[i - 1] = cadd(cmul(cspn, c1), cmul(csgn, c2));
        ck = cadd(ck, rz);
        cspn = cneg(cspn);
        if (kflag < 3) {
          const c1m = Math.max(Math.abs(c1[0]), Math.abs(c1[1]));
          if (c1m > bscle) {
            kflag += 1;
            bscle = bry[kflag - 1];
            s1 = csc(s1, cs);
            s2 = st;
            s1 = csc(s1, css[kflag - 1]);
            s2 = csc(s2, css[kflag - 1]);
            cs = csr[kflag - 1];
          }
        }
      }
      return nz;
    }
  }
  nz = -1;
  if (nw === -2) nz = -2;
  return nz;
}

/**
 * Airy function Ai(z) (id = 0) or its derivative Ai'(z) (id = 1) for complex z.  kode = 2 multiplies the result by
 * exp(zeta), zeta = (2/3) z^(3/2).  nz = 1 means underflow to zero; ierr as described at the top of this file.  (ZAIRY)
 */
export function airy(zin: C, id: number, kode: number): { v: C; nz: number; ierr: number } {
  let z = zin;
  const tth = 2 / 3;
  const c1 = 0.35502805388781723926; // 1/(Gamma(2/3) * 3**(2/3))
  const c2 = 0.25881940379280679841; // 1/(Gamma(1/3) * 3**(1/3))
  const coef = 0.18377629847393068317; // 1 / (sqrt(3) * PI)
  let ierr = 0;
  let nz = 0;
  let ai: C = [0, 0];
  if (id < 0 || id > 1) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (ierr !== 0) return { v: [0, 0], nz, ierr };
  if (z[1] === 0.0) z = [z[0], 0.0];
  const az = cabs(z);
  const tol = DBL_EPSILON;
  const fid = id;
  let aa: number;
  let bb: number;
  let ak: number;
  let bk: number;
  let ck: number;
  let zta: C;

  if (az <= 1.0) {
    // Power series for abs(z) <= 1.
    let s1: C = [1, 0];
    let s2: C = [1, 0];
    if (az < tol) {
      aa = THRESHOLD_MIN;
      s1 = [0, 0];
      if (id !== 1) {
        if (az > aa) s1 = csc(z, c2);
        ai = csub([c1, 0], s1);
        return { v: ai, nz, ierr };
      }
      ai = [-c2, 0];
      aa = Math.sqrt(aa);
      if (az > aa) s1 = csc(cmul(z, z), 0.5);
      ai = cadd(ai, csc(s1, c1));
      return { v: ai, nz, ierr };
    }
    aa = az * az;
    if (aa >= tol / az) {
      let trm1: C = [1, 0];
      let trm2: C = [1, 0];
      let atrm = 1.0;
      const z3 = cmul(cmul(z, z), z);
      const az3 = az * aa;
      ak = 2.0 + fid;
      bk = 3.0 - fid - fid;
      ck = 4.0 - fid;
      const dk = 3.0 + fid + fid;
      let d1 = ak * dk;
      let d2 = bk * ck;
      let ad = d1 > d2 ? d2 : d1;
      ak = 24.0 + 9.0 * fid;
      bk = 30.0 - 9.0 * fid;
      for (let k = 1; k < 26; k++) {
        trm1 = cmul(trm1, cdr(z3, d1));
        s1 = cadd(s1, trm1);
        trm2 = cmul(trm2, cdr(z3, d2));
        s2 = cadd(s2, trm2);
        atrm *= az3 / ad;
        d1 += ak;
        d2 += bk;
        ad = d1 > d2 ? d2 : d1;
        if (atrm < tol * ad) break;
        ak += 18.0;
        bk += 18.0;
      }
    }
    if (id !== 1) {
      ai = csub(csc(s1, c1), csc(cmul(z, s2), c2));
      if (kode === 1) return { v: ai, nz, ierr };
      zta = csc(cmul(z, csqrt(z)), tth);
      ai = cmul(ai, cexp(zta));
      return { v: ai, nz, ierr };
    }
    ai = csc(s2, -c2);
    if (az > tol) {
      ai = cadd(ai, cdr(csc(cmul(cmul(z, z), s1), c1), 1 + fid));
    }
    if (kode === 1) return { v: ai, nz, ierr };
    zta = csc(cmul(z, csqrt(z)), tth);
    return { v: cmul(ai, cexp(zta)), nz, ierr };
  }
  // Case for abs(z) > 1.0.
  const fnu = (1.0 + fid) / 3.0;
  // Machine-dependent parameters: tol (unit roundoff), elim (exponential over/underflow limit), alim, rl (lower
  // boundary of the asymptotic expansion for large z), dig (digits in tol).
  let k1 = DBL_MIN_EXP;
  const k2 = DBL_MAX_EXP;
  const r1m5 = LOG10_2;
  const k = Math.abs(k1) > Math.abs(k2) ? Math.abs(k2) : Math.abs(k1);
  const elim = 2.303 * (k * r1m5 - 3.0);
  k1 = DBL_MANT_DIG - 1;
  aa = r1m5 * k1;
  const dig = aa > 18.0 ? 18.0 : aa;
  aa *= 2.303;
  const alim = elim + (-aa > -41.45 ? -aa : -41.45);
  const rl = 1.2 * dig + 3.0;
  const alaz = Math.log(az);
  // Test for range.
  aa = 0.5 / tol;
  bb = 2147483647 * 0.5;
  aa = aa > bb ? bb : aa;
  aa = Math.pow(aa, tth);
  if (az > aa) return { v: [0, 0], nz: 0, ierr: 4 };
  aa = Math.sqrt(aa);
  if (az > aa) ierr = 3;
  const csq = csqrt(z);
  zta = csc(cmul(z, csq), tth);
  // Re(zta) <= 0 when Re(z) < 0, especially when Im(z) is small.
  let iflag = 0;
  let sfac = 1.0;
  const zi = z[1];
  const zr = z[0];
  ak = zta[1];
  if (zr < 0.0) {
    bk = zta[0];
    ck = -Math.abs(bk);
    zta = [ck, ak];
  }
  if (zi === 0.0 && zr <= 0.0) zta = [0.0, ak];
  aa = zta[0];
  const cy: C[] = [[0, 0]];
  if (aa < 0.0 || zr <= 0.0) {
    if (kode !== 2) {
      // Overflow test.
      if (aa <= -alim) {
        aa = -aa + 0.25 * alaz;
        iflag = 1;
        sfac = tol;
        if (aa > elim) return { v: ai, nz: 0, ierr: 2 };
      }
    }
    // bknu and acai return exp(zta)*K(fnu, zta) on kode = 2.
    let mr = 1;
    if (zi < 0.0) mr = -1;
    const nn = acai(zta, fnu, kode, mr, 1, cy, rl, tol, elim, alim);
    if (nn < 0) {
      if (nn === -1) return { v: [0, 0], nz: 1, ierr };
      return { v: [0, 0], nz: 0, ierr: 5 };
    }
    nz += nn;
  } else {
    if (kode !== 2) {
      // Underflow test.
      if (aa >= alim) {
        aa = -aa - 0.25 * alaz;
        iflag = 2;
        sfac = 1.0 / tol;
        if (aa < -elim) return { v: [0, 0], nz: 1, ierr };
      }
    }
    nz = bknu(zta, fnu, kode, 1, cy, tol, elim, alim);
  }
  let s1 = csc(cy[0], coef);
  if (iflag === 0) {
    if (id !== 1) return { v: cmul(csq, s1), nz, ierr };
    return { v: cmul(cneg(z), s1), nz, ierr };
  }
  s1 = csc(s1, sfac);
  if (id !== 1) {
    s1 = cmul(s1, csq);
    return { v: cdr(s1, sfac), nz, ierr };
  }
  s1 = cmul(s1, cneg(z));
  return { v: cdr(s1, sfac), nz, ierr };
}

/**
 * Computes the I Bessel function for Re z >= 0 by the asymptotic expansion for large |z|, in the region
 * |z| > max(rl, fnu^2/2).  Returns nz (0), -1 on overflow for kode = 1, or -2 if the series fails to converge.
 * (ZASYI)
 */
function asyi(z: C, fnu: number, kode: number, n: number, y: C[], rl: number, tol: number, elim: number, alim: number): number {
  const nz = 0;
  const az = cabs(z);
  const x = z[0];
  const arm = THRESHOLD_MIN;
  const rtr1 = Math.sqrt(arm);
  const il = n > 2 ? 2 : n;
  const dfnu = fnu + (n - il);
  // Overflow test.
  let ak1 = csqrt(rdiv(0.5 * 0.3183098861837907, z)); // (0.5/pi)/z
  let cz = z;
  if (kode === 2) cz = [0.0, z[1]];
  const acz = cz[0];
  if (Math.abs(acz) <= elim) {
    const dnu2 = dfnu + dfnu;
    let koded = 1;
    if (!(Math.abs(acz) > alim && n > 2)) {
      koded = 0;
      ak1 = cmul(ak1, cexp(cz));
    }
    let fdn = 0.0;
    if (dnu2 > rtr1) fdn = dnu2 * dnu2;
    const ez = csc(z, 8.0);
    // When z is imaginary, the error test must be made relative to the first reciprocal power since this is the
    // leading term of the expansion for the imaginary part.
    const aez = 8.0 * az;
    const s = tol / aez;
    const jl = trunc(rl + rl) + 2;
    const yy = z[1];
    let p1: C = [0, 0];
    if (yy !== 0.0) {
      let inu = trunc(fnu);
      const arg = (fnu - inu) * M_PI;
      inu += n - il;
      const ak = -Math.sin(arg);
      let bk = Math.cos(arg);
      if (yy < 0.0) bk = -bk;
      p1 = [ak, bk];
      if (inu % 2 === 1) p1 = cneg(p1);
    }
    for (let k = 1; k < il + 1; k++) {
      let sqk = fdn - 1.0;
      const atol = s * Math.abs(sqk);
      let sgn = 1.0;
      let cs1: C = [1, 0];
      let cs2: C = [1, 0];
      let ck: C = [1, 0];
      let ak = 0.0;
      let aa = 1.0;
      let bb = aez;
      let dk = ez;
      let j: number;
      for (j = 1; j < jl + 1; j++) {
        ck = cmul(ck, rdiv(sqk, dk));
        cs2 = cadd(cs2, ck);
        sgn = -sgn;
        cs1 = cadd(cs1, csc(ck, sgn));
        dk = cadd(dk, ez);
        aa *= Math.abs(sqk) / bb;
        bb += aez;
        ak += 8.0;
        sqk -= ak;
        if (aa <= atol) break;
      }
      if (j === jl + 1 && aa > atol) return -2;
      let s2 = cs1;
      if (x + x < elim) s2 = cadd(s2, cmul(cmul(p1, cs2), cexp(csub(cneg(z), z))));
      fdn += 8.0 * dfnu + 4.0;
      p1 = cneg(p1);
      const m = n - il + k;
      y[m - 1] = cmul(s2, ak1);
    }
    if (n <= 2) return nz;
    const nn = n;
    let k = nn - 2;
    let ak = k;
    const rz = rdiv(2.0, z);
    for (let i = 3; i < nn + 1; i++) {
      y[k - 1] = cadd(cmul(csc(rz, ak + fnu), y[k]), y[k + 1]);
      ak -= 1.0;
      k -= 1;
    }
    if (koded === 0) return nz;
    const ckx = cexp(cz);
    for (let i = 0; i < nn; i++) y[i] = cmul(y[i], ckx);
    return nz;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------------------
// Machine-dependent parameters (identical in every driver routine of the C++ source).
// ---------------------------------------------------------------------------------------------------------------

/** tol: approximate unit roundoff limited to 1e-18. */
const TOL = RTOL_MIN;
/** elim: approximate exponential over- and underflow limit, exp(-elim) < exp(-alim) = exp(-elim)/tol. */
const ELIM = 2.303 * (Math.min(Math.abs(DBL_MIN_EXP), Math.abs(DBL_MAX_EXP)) * LOG10_2 - 3.0);
const DIG_RAW = LOG10_2 * (DBL_MANT_DIG - 1);
/** dig: number of base 10 digits in tol. */
const DIG = Math.min(DIG_RAW, 18.0);
const ALIM = ELIM + Math.max(-(DIG_RAW * 2.303), -41.45);
/** fnul: lower boundary of the uniform asymptotic expansions in the order (about 85.92 for double). */
const FNUL = 10.0 + 6.0 * (DIG - 3.0);
/** rl: lower boundary of the asymptotic expansion for large |z|. */
const RL = 1.2 * DIG + 3.0;
/** Half the largest int, used to bound the order and argument for the integer conversions. */
const HALF_INT_MAX = 2147483647 * 0.5;

/** Result of the sequence routines: values cy[0..n-1], underflow count nz and error flag ierr. */
export interface BesselResult {
  cy: C[];
  nz: number;
  ierr: number;
}

const zeros = (n: number): C[] => Array.from({ length: Math.max(n, 0) }, (): C => [0, 0]);

/**
 * Hankel functions H^(m)_(fnu+k)(z), k = 0..n-1, m = 1 or 2, for complex z (z not 0) and fnu >= 0.  kode = 2 scales
 * by exp(-i z) for m = 1 and exp(i z) for m = 2.  (ZBESH)
 */
export function besh(z: C, fnu: number, kode: number, m: number, n: number): BesselResult {
  const cy = zeros(n);
  let nz = 0;
  let ierr = 0;
  if (z[0] === 0.0 && z[1] === 0.0) ierr = 1;
  if (fnu < 0.0) ierr = 1;
  if (m < 1 || m > 2) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (n < 1) ierr = 1;
  if (ierr !== 0) return { cy, nz, ierr };
  let nn = n;
  const tol = TOL;
  const elim = ELIM;
  const alim = ALIM;
  const fnul = FNUL;
  const rl = RL;
  const fn = fnu + (nn - 1);
  const mm = 3 - m - m;
  const fmm = mm;
  let zn = cmul(z, [0.0, -fmm]);
  const xn = zn[0];
  const yn = zn[1];
  const az = cabs(z);
  const bb = DBL_MAX * 0.5;
  let aa = Math.min(0.5 / tol, bb);
  if (az > aa || fn > aa) return { cy, nz: 0, ierr: 4 };
  aa = Math.sqrt(aa);
  if (az > aa) ierr = 3;
  if (fn > aa) ierr = 3;
  if (az < THRESHOLD_MIN) return { cy, nz: 0, ierr: 2 };
  let mr: number;
  let nw: number;
  if (fnu <= fnul) {
    if (fn > 1.0 && fn <= 2.0 && az <= tol) {
      const arg = 0.5 * az;
      const aln = -fn * Math.log(arg);
      if (aln > elim) return { cy, nz: 0, ierr: 2 };
    } else if (fn > 1.0 && fn <= 2.0 && az > tol) {
      // Nothing to do.
    } else if (fn > 1.0 && fn > 2.0) {
      const nuf = uoik(zn, fnu, kode, 2, nn, cy, tol, elim, alim);
      if (nuf < 0) return { cy, nz: 0, ierr: 2 };
      nz += nuf;
      nn -= nuf;
      if (nn === 0) {
        if (xn < 0.0) return { cy, nz: 0, ierr: 2 };
        return { cy, nz, ierr };
      }
    }
    if (xn < 0.0 || (xn === 0.0 && yn < 0.0 && m === 2)) {
      mr = -mm;
      nw = acon(zn, fnu, kode, mr, nn, cy, rl, fnul, tol, elim, alim);
      if (nw < 0) {
        if (nw === -1) return { cy, nz: 0, ierr: 2 };
        return { cy, nz: 0, ierr: 5 };
      }
      nz = nw;
    } else {
      nz = bknu(zn, fnu, kode, nn, cy, tol, elim, alim);
    }
  } else {
    mr = 0;
    if (!(xn >= 0.0 && (xn !== 0.0 || yn >= 0.0 || m !== 2))) {
      mr = -mm;
      if (xn === 0.0 && yn < 0.0) zn = cneg(zn);
    }
    nw = bunk(zn, fnu, kode, mr, nn, cy, tol, elim, alim);
    if (nw < 0) {
      if (nw === -1) return { cy, nz: 0, ierr: 2 };
      return { cy, nz: 0, ierr: 5 };
    }
    nz += nw;
  }
  const sgn = -fmm < 0 ? -M_PI_2 : M_PI_2;
  const inu = trunc(fnu);
  const inuh = trunc(inu / 2);
  const ir = inu - 2 * inuh;
  const arg = (fnu - (inu - ir)) * sgn;
  const rhpi = 1.0 / sgn;
  const cpn = rhpi * Math.cos(arg);
  const spn = -rhpi * Math.sin(arg);
  let csgn: C = [spn, cpn];
  if (inuh % 2 === 1) csgn = cneg(csgn);
  const zt: C = [0.0, -fmm];
  const rtol = 1.0 / tol;
  const ascle = THRESHOLD_MIN * rtol;
  for (let i = 1; i < nn + 1; i++) {
    zn = cy[i - 1];
    let atol = 1.0;
    if (Math.max(Math.abs(zn[0]), Math.abs(zn[1])) <= ascle) {
      zn = csc(zn, rtol);
      atol = tol;
    }
    zn = cmul(zn, csgn);
    cy[i - 1] = csc(zn, atol);
    csgn = cmul(csgn, zt);
  }
  return { cy, nz, ierr };
}

/**
 * Modified Bessel functions I_(fnu+k)(z), k = 0..n-1, for complex z and fnu >= 0.  kode = 2 scales by exp(-|Re z|).
 * (ZBESI)
 */
export function besi(z: C, fnu: number, kode: number, n: number): BesselResult {
  const cy = zeros(n);
  let ierr = 0;
  if (fnu < 0.0) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (n < 1) ierr = 1;
  if (ierr !== 0) return { cy, nz: 0, ierr };
  const xx = z[0];
  const yy = z[1];
  const tol = TOL;
  const az = cabs(z);
  const fn = fnu + (n - 1);
  let aa = 0.5 / tol;
  aa = Math.min(aa, HALF_INT_MAX);
  if (az > aa || fn > aa) return { cy, nz: 0, ierr: 4 };
  aa = Math.sqrt(aa);
  if (az > aa) ierr = 3;
  if (fn > aa) ierr = 3;
  let zn = z;
  let csgn: C = [1, 0];
  if (xx < 0.0) {
    zn = cneg(z);
    const inu = trunc(fnu);
    let arg = (fnu - inu) * M_PI;
    if (yy < 0.0) arg = -arg;
    csgn = [Math.cos(arg), Math.sin(arg)];
    if (inu % 2 === 1) csgn = cneg(csgn);
  }
  const nz = binu(zn, fnu, kode, n, cy, RL, FNUL, tol, ELIM, ALIM);
  if (nz < 0) {
    if (nz === -2) return { cy, nz: 0, ierr: 5 };
    return { cy, nz: 0, ierr: 2 };
  }
  if (xx >= 0.0) return { cy, nz, ierr };
  const nn = n - nz;
  if (nn === 0) return { cy, nz, ierr };
  const rtol = 1.0 / tol;
  const ascle = THRESHOLD_MIN * rtol;
  for (let i = 1; i < nn + 1; i++) {
    zn = cy[i - 1];
    let atol = 1.0;
    if (Math.max(Math.abs(zn[0]), Math.abs(zn[1])) <= ascle) {
      zn = csc(zn, rtol);
      atol = tol;
    }
    cy[i - 1] = csc(cmul(zn, csgn), atol);
    csgn = cneg(csgn);
  }
  // The C++ source resets ierr to 0 here, which discards a precision warning (ierr = 3) set above; the original
  // Fortran does not, and neither do we.
  return { cy, nz, ierr };
}

/**
 * Bessel functions of the first kind J_(fnu+k)(z), k = 0..n-1, for complex z and fnu >= 0.  kode = 2 scales by
 * exp(-|Im z|).  (ZBESJ)
 */
export function besj(z: C, fnu: number, kode: number, n: number): BesselResult {
  const cy = zeros(n);
  let ierr = 0;
  if (fnu < 0.0) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (n < 1) ierr = 1;
  if (ierr !== 0) return { cy, nz: 0, ierr };
  const tol = TOL;
  const yy = z[1];
  const az = cabs(z);
  const fn = fnu + (n - 1);
  let aa = 0.5 / tol;
  aa = Math.min(aa, DBL_MAX * 0.5);
  if (az > aa || fn > aa) return { cy, nz: 0, ierr: 4 };
  aa = Math.sqrt(aa);
  if (az > aa) ierr = 3;
  if (fn > aa) ierr = 3;
  let ci: C = [0, 1];
  const inu = trunc(fnu);
  const inuh = trunc(inu / 2);
  const ir = inu - 2 * inuh;
  const arg = (fnu - (inu - ir)) * M_PI_2;
  let csgn: C = [Math.cos(arg), Math.sin(arg)];
  if (inuh % 2 === 1) csgn = cneg(csgn);
  let zn = cmul(cneg(z), ci);
  if (yy < 0.0) {
    zn = cneg(zn);
    csgn = [csgn[0], -csgn[1]];
    ci = [ci[0], -ci[1]];
  }
  const nz = binu(zn, fnu, kode, n, cy, RL, FNUL, tol, ELIM, ALIM);
  if (nz < 0) {
    if (nz === -2) return { cy, nz: 0, ierr: 5 };
    return { cy, nz: 0, ierr: 2 };
  }
  const nl = n - nz;
  if (nl === 0) return { cy, nz, ierr };
  const rtol = 1.0 / tol;
  const ascle = THRESHOLD_MIN * rtol;
  for (let i = 1; i < nl + 1; i++) {
    zn = cy[i - 1];
    let atol = 1.0;
    if (Math.max(Math.abs(zn[0]), Math.abs(zn[1])) <= ascle) {
      zn = csc(zn, rtol);
      atol = tol;
    }
    cy[i - 1] = csc(cmul(zn, csgn), atol);
    csgn = cmul(csgn, ci);
  }
  return { cy, nz, ierr };
}

/**
 * Modified Bessel functions of the second kind K_(fnu+k)(z), k = 0..n-1, for complex z (z not 0) and fnu >= 0.
 * kode = 2 scales by exp(z).  (ZBESK)
 */
export function besk(z: C, fnu: number, kode: number, n: number): BesselResult {
  const cy = zeros(n);
  const xx = z[0];
  const yy = z[1];
  let nz = 0;
  let ierr = 0;
  if (yy === 0.0 && xx === 0.0) ierr = 1;
  if (fnu < 0.0) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (n < 1) ierr = 1;
  if (ierr !== 0) return { cy, nz, ierr };
  let nn = n;
  const tol = TOL;
  const elim = ELIM;
  const alim = ALIM;
  const az = cabs(z);
  const fn = fnu + (nn - 1);
  let aa = 0.5 / tol;
  aa = Math.min(aa, HALF_INT_MAX);
  if (az > aa || fn > aa) return { cy, nz: 0, ierr: 4 };
  aa = Math.sqrt(aa);
  if (az > aa) ierr = 3;
  if (fn > aa) ierr = 3;
  if (az < THRESHOLD_MIN) return { cy, nz: 0, ierr: 2 };
  let nw: number;
  let mr: number;
  if (fnu <= FNUL) {
    if (fn > 1.0) {
      if (fn <= 2.0) {
        if (az <= tol) {
          const arg = 0.5 * az;
          const aln = -fn * Math.log(arg);
          if (aln > elim) return { cy, nz: 0, ierr: 2 };
        }
      } else {
        const nuf = uoik(z, fnu, kode, 2, nn, cy, tol, elim, alim);
        if (nuf < 0) return { cy, nz: 0, ierr: 2 };
        nz += nuf;
        nn -= nuf;
        if (nn === 0) {
          if (xx < 0.0) return { cy, nz: 0, ierr: 2 };
          return { cy, nz, ierr };
        }
      }
    }
    if (xx >= 0.0) {
      // Right half plane.
      nw = bknu(z, fnu, kode, nn, cy, tol, elim, alim);
      if (nw < 0) return { cy, nz: 0, ierr: nw === -1 ? 2 : 5 };
      return { cy, nz: nw, ierr };
    }
    // Left half plane.
    if (nz !== 0) return { cy, nz: 0, ierr: 2 };
    mr = 1;
    if (yy < 0.0) mr = -1;
    nw = acon(z, fnu, kode, mr, nn, cy, RL, FNUL, tol, elim, alim);
    if (nw < 0) return { cy, nz: 0, ierr: nw === -1 ? 2 : 5 };
    return { cy, nz: nw, ierr };
  }
  // Uniform asymptotic expansions for fnu > fnul.
  mr = 0;
  if (xx < 0.0) {
    mr = 1;
    if (yy < 0.0) mr = -1;
  }
  nw = bunk(z, fnu, kode, mr, nn, cy, tol, elim, alim);
  if (nw < 0) return { cy, nz: 0, ierr: nw === -1 ? 2 : 5 };
  nz += nw;
  return { cy, nz, ierr };
}

/**
 * Bessel functions of the second kind Y_(fnu+k)(z), k = 0..n-1, for complex z (z not 0) and fnu >= 0.  Computed from
 * the two Hankel functions.  kode = 2 scales by exp(-|Im z|).  (ZBESY)
 */
export function besy(z: C, fnu: number, kode: number, n: number): BesselResult {
  const xx = z[0];
  const yy = z[1];
  let ierr = 0;
  if (xx === 0.0 && yy === 0.0) ierr = 1;
  if (fnu < 0.0) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (n < 1) ierr = 1;
  if (ierr !== 0) return { cy: zeros(n), nz: 0, ierr };

  const hci: C = [0.0, 0.5];
  const h1 = besh(z, fnu, kode, 1, n);
  const cy = h1.cy;
  const nz1 = h1.nz;
  ierr = h1.ierr;
  if (ierr !== 0 && ierr !== 3) return { cy, nz: 0, ierr };
  const h2 = besh(z, fnu, kode, 2, n);
  const cwrk = h2.cy;
  const nz2 = h2.nz;
  ierr = h2.ierr;
  if (ierr !== 0 && ierr !== 3) return { cy, nz: 0, ierr };

  let nz = nz1 > nz2 ? nz2 : nz1;
  if (kode !== 2) {
    for (let i = 1; i < n + 1; i++) cy[i - 1] = cmul(hci, csub(cwrk[i - 1], cy[i - 1]));
    return { cy, nz, ierr };
  }

  const tol = RTOL_MIN;
  const elim = ELIM;
  const exr = Math.cos(xx);
  const exi = Math.sin(xx);
  let ey = 0.0;
  const tay = Math.abs(yy + yy);
  if (tay < elim) ey = Math.exp(-tay);
  let c1: C;
  let c2: C;
  if (yy < 0.0) {
    c1 = [exr, exi];
    c2 = csc([exr, -exi], ey);
  } else {
    c1 = csc([exr, exi], ey);
    c2 = [exr, -exi];
  }
  nz = 0;
  const rtol = 1.0 / tol;
  const ascle = THRESHOLD_MIN * rtol;
  for (let i = 1; i < n + 1; i++) {
    let aa = cwrk[i - 1][0];
    let bb = cwrk[i - 1][1];
    let atol = 1.0;
    if (Math.max(Math.abs(aa), Math.abs(bb)) <= ascle) {
      aa *= rtol;
      bb *= rtol;
      atol = tol;
    }
    let st = csc(cmul([aa, bb], c2), atol);
    aa = cy[i - 1][0];
    bb = cy[i - 1][1];
    atol = 1.0;
    if (Math.max(Math.abs(aa), Math.abs(bb)) <= ascle) {
      aa *= rtol;
      bb *= rtol;
      atol = tol;
    }
    st = csub(st, csc(cmul([aa, bb], c1), atol));
    cy[i - 1] = cmul(st, hci);
    if (st[0] === 0 && st[1] === 0 && ey === 0) nz += 1;
  }
  return { cy, nz, ierr };
}

/**
 * Computes the I Bessel function for Re z >= 0 by choosing among the power series, the asymptotic expansion, the
 * Miller algorithm, the uniform asymptotic expansion and the Wronskian method.  Returns nz (a negative value flags
 * overflow, -1, or no convergence, -2).  (ZBINU)
 */
function binu(z: C, fnu: number, kode: number, n: number, cy: C[], rl: number, fnul: number, tol: number, elim: number, alim: number): number {
  let nz = 0;
  const az = cabs(z);
  let nn = n;
  let dfnu = fnu + n - 1;
  let nw: number;
  if (az <= 2 || az * az * 0.25 <= dfnu + 1.0) {
    nw = seri(z, fnu, kode, nn, cy, tol, elim, alim);
    const inw = Math.abs(nw);
    nz += inw;
    nn -= inw;
    if (nn === 0) return nz;
    if (nw >= 0) return nz;
    dfnu = fnu + nn - 1;
  }
  if (az < rl) {
    if (dfnu <= 1.0) {
      nw = mlri(z, fnu, kode, nn, cy, tol);
      if (nw < 0) return nw === -2 ? -2 : -1;
      return nz;
    }
  } else if (dfnu <= 1.0 || az + az >= dfnu * dfnu) {
    nw = asyi(z, fnu, kode, nn, cy, rl, tol, elim, alim);
    if (nw < 0) return nw === -2 ? -2 : -1;
    return nz;
  }
  nw = uoik(z, fnu, kode, 1, nn, cy, tol, elim, alim);
  if (nw < 0) return nw === -2 ? -2 : -1;
  nz += nw;
  nn -= nw;
  if (nn === 0) return nz;
  dfnu = fnu + (nn - 1);
  if (dfnu > fnul || az > fnul) {
    let nui = trunc(fnul - dfnu) + 1;
    nui = nui > 0 ? nui : 0;
    const r = buni(z, fnu, kode, nn, cy, nui, fnul, tol, elim, alim);
    nw = r.nz;
    if (nw < 0) return nw === -2 ? -2 : -1;
    nz += nw;
    if (r.nlast === 0) return nz;
    nn = r.nlast;
  }
  if (az <= rl) {
    nw = mlri(z, fnu, kode, nn, cy, tol);
    if (nw < 0) return nw === -2 ? -2 : -1;
    return nz;
  }
  const cw = zeros(2);
  nw = uoik(z, fnu, kode, 2, 2, cw, tol, elim, alim);
  if (nw < 0) {
    nz = nn;
    for (let i = 0; i < nn; i++) cy[i] = [0, 0];
    return nz;
  }
  if (nw > 0) return -1;
  nw = wrsk(z, fnu, kode, nn, cy, cw, tol, elim, alim);
  if (nw < 0) return nw === -2 ? -2 : -1;
  return nz;
}

/**
 * Airy function Bi(z) (id = 0) or its derivative Bi'(z) (id = 1) for complex z.  kode = 2 multiplies the result by
 * exp(-|Re zeta|), zeta = (2/3) z^(3/2).  (ZBIRY)
 */
export function biry(zin: C, id: number, kode: number): { v: C; ierr: number } {
  let z = zin;
  const tth = 2 / 3;
  const c1 = 0.614926627446000735150922369; // 1/( 3**(1/6) Gamma(2/3))
  const c2 = 0.448288357353826357914823710; // 3**(1/6) / Gamma(1/3)
  const coef = 0.577350269189625764509148780; // sqrt( 1 / 3)
  let ierr = 0;
  if (id < 0 || id > 1) ierr = 1;
  if (kode < 1 || kode > 2) ierr = 1;
  if (ierr !== 0) return { v: [0, 0], ierr };
  if (z[1] === 0.0) z = [z[0], 0.0];
  const az = cabs(z);
  const tol = RTOL_MIN;
  const fid = id;
  let aa: number;
  let bi: C;
  let zta: C;
  if (az <= 1.0) {
    let s1: C = [1, 0];
    let s2: C = [1, 0];
    if (az < tol) {
      aa = c1 * (1.0 - fid) + fid * c2;
      return { v: [aa, 0], ierr };
    }
    aa = az * az;
    if (aa >= tol / az) {
      let trm1: C = [1, 0];
      let trm2: C = [1, 0];
      let atrm = 1.0;
      const z3 = cmul(cmul(z, z), z);
      const az3 = az * aa;
      let ak = 2.0 + fid;
      let bk = 3.0 - fid - fid;
      const ck = 4.0 - fid;
      const dk = 3.0 + fid + fid;
      let d1 = ak * dk;
      let d2 = bk * ck;
      let ad = Math.min(d1, d2);
      ak = 24.0 + 9.0 * fid;
      bk = 30.0 - 9.0 * fid;
      for (let k = 1; k < 26; k++) {
        trm1 = cmul(trm1, cdr(z3, d1));
        s1 = cadd(s1, trm1);
        trm2 = cmul(trm2, cdr(z3, d2));
        s2 = cadd(s2, trm2);
        atrm *= az3 / ad;
        d1 += ak;
        d2 += bk;
        ad = Math.min(d1, d2);
        if (atrm < tol * ad) break;
        ak += 18.0;
        bk += 18.0;
      }
    }
    if (id !== 1) {
      bi = cadd(csc(s1, c1), csc(cmul(z, s2), c2));
      if (kode === 1) return { v: bi, ierr };
      zta = csc(cmul(z, csqrt(z)), tth);
      aa = -Math.abs(zta[0]);
      return { v: csc(bi, Math.exp(aa)), ierr };
    }
    bi = csc(s2, c2);
    if (az > tol) bi = cadd(bi, cdr(csc(cmul(cmul(z, z), s1), c1), 1.0 + fid));
    if (kode === 1) return { v: bi, ierr };
    zta = csc(cmul(z, csqrt(z)), tth);
    aa = -Math.abs(zta[0]);
    return { v: csc(bi, Math.exp(aa)), ierr };
  }
  let fnu = (1.0 + fid) / 3.0;
  const elim = ELIM;
  const alim = ALIM;
  aa = 0.5 / tol;
  aa = Math.min(aa, HALF_INT_MAX);
  aa = Math.pow(aa, tth);
  if (az > aa) return { v: [0, 0], ierr: 4 };
  aa = Math.sqrt(aa);
  if (az > aa) ierr = 3;
  const csq = csqrt(z);
  zta = csc(cmul(z, csq), tth);
  let sfac = 1.0;
  const zi = z[1];
  const zr = z[0];
  const ak = zta[1];
  if (zr < 0.0) {
    const bk = zta[0];
    const ck = -Math.abs(bk);
    zta = [ck, ak];
  }
  if (zi === 0.0 && zr <= 0.0) zta = [0.0, ak];
  aa = zta[0];
  if (kode !== 2) {
    let bb = Math.abs(aa);
    if (bb >= alim) {
      bb += 0.25 * Math.log(az);
      sfac = tol;
      if (bb > elim) return { v: [0, 0], ierr: 2 };
    }
  }
  let fmr = 0.0;
  if (aa < 0.0 || zr <= 0.0) {
    fmr = M_PI;
    if (zi < 0.0) fmr = -M_PI;
    zta = cneg(zta);
  }
  const cy = zeros(2);
  const nz = binu(zta, fnu, kode, 1, cy, RL, FNUL, tol, elim, alim);
  if (nz < 0) return { v: [0, 0], ierr: nz === -1 ? 2 : 5 };
  aa = fmr * fnu;
  let s1 = csc(cmul(cy[0], [Math.cos(aa), Math.sin(aa)]), sfac);
  fnu = (2.0 - fid) / 3.0;
  binu(zta, fnu, kode, 2, cy, RL, FNUL, tol, elim, alim);
  cy[0] = csc(cy[0], sfac);
  cy[1] = csc(cy[1], sfac);
  const s2 = cadd(cdiv(csc(cy[0], fnu + fnu), zta), cy[1]);
  aa = fmr * (fnu - 1.0);
  s1 = csc(cadd(s1, cmul(s2, [Math.cos(aa), Math.sin(aa)])), coef);
  if (id !== 1) {
    s1 = cmul(s1, csq);
    return { v: cdr(s1, sfac), ierr };
  }
  s1 = cmul(s1, z);
  return { v: cdr(s1, sfac), ierr };
}

/**
 * Tests whether y, a scaled quantity larger than ascle, would underflow when scaled to its proper value: returns 1
 * if the smaller component is more than one precision below the larger, otherwise 0.  (ZUCHK)
 */
function uchk(y: C, ascle: number, tol: number): number {
  const yr = Math.abs(y[0]);
  const yi = Math.abs(y[1]);
  const ss = Math.max(yr, yi);
  let st = Math.min(yr, yi);
  if (st > ascle) return 0;
  st /= tol;
  return ss < st ? 1 : 0;
}

/**
 * Sets the first two K values and the whole recurrence to zero or to properly scaled values when intermediate
 * results lie in the underflow region.  Returns nz.  (ZKSCL)
 */
function kscl(zr: C, fnu: number, n: number, y: C[], rz: C, ascle: number, tol: number, elim: number): number {
  const cy: C[] = [[0, 0], [0, 0]];
  let nz = 0;
  let ic = 0;
  const nn = n > 2 ? 2 : n;
  let kk = 0;
  const elm = Math.exp(-elim);
  let xx = zr[0];
  let cs: C;
  for (let i = 1; i < nn + 1; i++) {
    const s1 = y[i - 1];
    cy[i - 1] = s1;
    const as = cabs(s1);
    const acs = -zr[0] + Math.log(as);
    nz += 1;
    y[i - 1] = [0, 0];
    if (acs < -elim) continue;
    cs = csub(clog(s1), zr);
    cs = csc([Math.cos(cs[1]), Math.sin(cs[1])], Math.exp(cs[0]) / tol);
    if (!uchk(cs, ascle, tol)) {
      y[i - 1] = cs;
      nz -= 1;
      ic = i;
    }
  }
  if (n === 1) return nz;
  if (ic <= 1) {
    y[0] = [0, 0];
    nz = 2;
  }
  if (n === 2) return nz;
  if (nz === 0) return nz;

  const fn = fnu + 1.0;
  let ck = csc(rz, fn);
  let s1 = cy[0];
  let s2 = cy[1];
  const zri = zr[1];
  let zd = zr;
  for (let i = 3; i < n + 1; i++) {
    kk = i;
    cs = s2;
    s2 = cmul(s2, ck);
    s2 = cadd(s2, s1);
    s1 = cs;
    ck = cadd(ck, rz);
    const as = cabs(s2);
    const alas = Math.log(as);
    const acs = alas - xx;
    nz += 1;
    y[i - 1] = [0, 0];
    if (acs >= -elim) {
      cs = clog(s2);
      cs = csub(cs, zd);
      cs = csc([Math.cos(cs[1]), Math.sin(cs[1])], Math.exp(cs[0]) / tol);
      if (!uchk(cs, ascle, tol)) {
        y[i - 1] = cs;
        nz -= 1;
        if (ic === kk - 1) {
          nz = kk - 2;
          for (let j = 0; j < nz; j++) y[j] = [0, 0];
          return nz;
        }
        ic = kk;
        continue;
      }
    }
    if (alas >= 0.5 * elim) {
      xx -= elim;
      zd = [xx, zri];
      s1 = csc(s1, elm);
      s2 = csc(s2, elm);
    }
  }
  nz = n;
  if (ic === n) nz = n - 1;
  for (let j = 0; j < nz; j++) y[j] = [0, 0];
  return nz;
}

const csinh = (a: C): C => [Math.sinh(a[0]) * Math.cos(a[1]), Math.cosh(a[0]) * Math.sin(a[1])];
const ccosh = (a: C): C => [Math.cosh(a[0]) * Math.cos(a[1]), Math.sinh(a[0]) * Math.sin(a[1])];

/**
 * Computes the K Bessel function in the right half plane (Re z >= 0) for orders fnu..fnu+n-1: Taylor-like series
 * for |z| <= 2, otherwise a Miller algorithm normalized by a Wronskian, with forward recurrence in scaled
 * arithmetic.  Returns nz (underflow count) or -2 if the Miller algorithm fails to converge.  (ZBKNU)
 *
 * The C++ is written with gotos; the labels (L100, L110, ...) are kept as the states of a small state machine.
 */
function bknu(z: C, fnu: number, kode: number, n: number, y: C[], tol: number, elim: number, alim: number): number {
  const kmax = 30;
  const r1 = 2.0;
  const rthpi = 1.25331413731550025;
  const spi = 1.90985931710274403;
  const fpi = 1.89769999331517738;
  const tth = 2 / 3;
  const cc = [
    5.77215664901532861e-1, -4.20026350340952355e-2, -4.21977345555443367e-2, 7.21894324666309954e-3, -2.15241674114950973e-4,
    -2.01348547807882387e-5, 1.13302723198169588e-6, 6.11609510448141582e-9,
  ];
  const xx = z[0];
  const yy = z[1];
  const caz = cabs(z);
  const cscl = 1.0 / tol;
  const crsc = tol;
  const css = [cscl, 1.0, crsc];
  const csr = [crsc, 1.0, cscl];
  const bry = [THRESHOLD_MIN / tol, tol / THRESHOLD_MIN, DBL_MAX];
  let nz = 0;
  let iflag = 0;
  let koded = kode;
  const rz = rdiv(2.0, z);
  let inu = trunc(fnu + 0.5);
  const dnu = fnu - inu;
  let s1: C = [0, 0];
  let s2: C = [0, 0];
  let ck: C = [0, 0];
  let dnu2 = 0.0;
  let kflag = 0;
  let coef: C = [0, 0];
  let p1: C;
  let p2: C;
  let pt: C;
  let zd: C = [0, 0];
  let ascle = 0;
  let aa: number;
  let bb: number;
  let ak = 0;
  let a1 = 0;
  let a2 = 0;
  let tm: number;
  let t1: number;
  let t2: number;
  let fhs = 0;
  let fk: number;
  let fks: number;
  let rk: number;
  let state = '';

  if (Math.abs(dnu) !== 0.5) {
    if (Math.abs(dnu) > tol) dnu2 = dnu * dnu;
    if (caz <= r1) {
      // Series for |z| <= r1.
      let fc = 1.0;
      let smu = clog(rz);
      const fmu = csc(smu, dnu);
      const csh = csinh(fmu);
      const cch = ccosh(fmu);
      if (dnu !== 0.0) {
        fc = dnu * M_PI;
        fc *= 1.0 / Math.sin(fc);
        smu = cdr(csh, dnu);
      }
      a2 = 1.0 + dnu;
      t2 = Math.exp(-gamln(a2));
      t1 = 1.0 / (t2 * fc);
      let g1: number;
      if (Math.abs(dnu) <= 0.1) {
        ak = 1.0;
        let s = cc[0];
        for (let k = 2; k < 9; k++) {
          ak *= dnu2;
          tm = cc[k - 1] * ak;
          s += tm;
          if (Math.abs(tm) < tol) break;
        }
        g1 = -s;
      } else {
        g1 = (t1 - t2) / (dnu + dnu);
      }
      const g2 = 0.5 * (t1 + t2);
      let f = csc(cadd(csc(cch, g1), csc(smu, g2)), fc);
      pt = cexp(fmu);
      let p = csc(pt, 0.5 / t2);
      let q = rdiv(0.5 / t1, pt);
      s1 = f;
      s2 = p;
      ak = 1.0;
      a1 = 1.0;
      ck = [1, 0];
      let bk = 1.0 - dnu2;
      if (inu <= 0 && n <= 1) {
        // Generate K(fnu, z), 0 <= fnu < 0.5 and n = 1.
        if (caz >= tol) {
          const cz = csc(cmul(z, z), 0.25);
          t1 = 0.25 * caz * caz;
          do {
            f = cdr(cadd(cadd(csc(f, ak), p), q), bk);
            p = cdr(p, ak - dnu);
            q = cdr(q, ak + dnu);
            rk = 1.0 / ak;
            ck = cmul(ck, csc(cz, rk));
            s1 = cadd(s1, cmul(ck, f));
            a1 *= t1 * rk;
            bk += ak + ak + 1.0;
            ak += 1.0;
          } while (a1 > tol);
        }
        y[0] = s1;
        if (koded === 1) return nz;
        y[0] = cmul(s1, cexp(z));
        return nz;
      }
      // Generate K(dnu, z) and K(dnu+1, z) for forward recurrence.
      if (caz >= tol) {
        const cz = csc(cmul(z, z), 0.25);
        t1 = 0.25 * caz * caz;
        do {
          f = cdr(cadd(cadd(csc(f, ak), p), q), bk);
          p = csc(p, 1.0 / (ak - dnu));
          q = csc(q, 1.0 / (ak + dnu));
          rk = 1.0 / ak;
          ck = cmul(ck, csc(cz, rk));
          s1 = cadd(s1, cmul(ck, f));
          s2 = cadd(s2, cmul(ck, csub(p, csc(f, ak))));
          a1 *= t1 * rk;
          bk += ak + ak + 1.0;
          ak += 1.0;
        } while (a1 > tol);
      }
      kflag = 2;
      bk = smu[0];
      a1 = fnu + 1.0;
      ak = a1 * Math.abs(bk);
      if (ak > alim) kflag = 3;
      p2 = csc(s2, css[kflag - 1]);
      s2 = cmul(p2, rz);
      s1 = csc(s1, css[kflag - 1]);
      if (koded !== 1) {
        f = cexp(z);
        s1 = cmul(s1, f);
        s2 = cmul(s2, f);
      }
      state = 'L100';
    }
  }

  if (state === '') {
    // iflag = 0: no underflow occurred.  iflag = 1: an underflow occurred; computation proceeds with koded = 2 and a
    // test for on-scale values is made during forward recursion.
    coef = cdiv([rthpi, 0], csqrt(z));
    kflag = 2;
    if (koded !== 2) {
      if (xx > alim) {
        koded = 2;
        iflag = 1;
        kflag = 2;
      } else {
        a1 = Math.exp(-xx) * css[kflag - 1];
        pt = csc([Math.cos(yy), -Math.sin(yy)], a1);
        coef = cmul(coef, pt);
      }
    }
    if (Math.abs(dnu) === 0.5) {
      s1 = coef;
      s2 = coef;
      state = 'L100';
    } else {
      // Miller algorithm for |z| > r1.
      ak = Math.abs(Math.cos(M_PI * dnu));
      if (ak === 0.0) {
        s1 = coef;
        s2 = coef;
        state = 'L100';
      } else {
        fhs = Math.abs(0.25 - dnu2);
        if (fhs === 0.0) {
          s1 = coef;
          s2 = coef;
          state = 'L100';
        }
      }
    }
  }

  if (state === '') {
    // Compute r2 = f(e).  If |z| >= r2, use forward recurrence to determine the backward index k.  r2 = f(e) is a
    // straight line on 12 <= e <= 60; e is computed from 2**(-e) = b**(1-digits) = tol.
    t1 = (DBL_MANT_DIG - 1) * LOG10_2 * (Math.log(10) / Math.log(2));
    t1 = Math.min(Math.max(t1, 12.0), 60.0);
    t2 = tth * t1 - 6.0;
    t1 = Math.abs(Math.atan2(yy, xx));
    if (t2 <= caz) {
      // Forward recurrence loop when |z| >= r2.
      const etest = ak / (M_PI * caz * tol);
      fk = 1.0;
      if (!(etest < 1.0)) {
        fks = 2.0;
        rk = caz + caz + 2.0;
        a1 = 0.0;
        a2 = 1.0;
        for (let i = 1; i < kmax + 1; i++) {
          ak = fhs / fks;
          const bk = rk / (fk + 1.0);
          tm = a2;
          a2 = bk * a2 - ak * a1;
          a1 = tm;
          rk += 2.0;
          fks += fk + fk + 2.0;
          fhs += fk + fk;
          fk += 1.0;
          tm = Math.abs(a2) * fk;
          if (etest < tm) break;
          if (i === kmax) return -2;
        }
        fk += spi * t1 * Math.sqrt(t2 / caz);
        fhs = Math.abs(0.25 - dnu2);
      }
    } else {
      // Compute the backward index k for |z| < r2.
      a2 = Math.sqrt(caz);
      ak *= fpi / (tol * Math.sqrt(a2));
      aa = (3.0 * t1) / (1.0 + caz);
      bb = (14.7 * t1) / (28.0 + caz);
      ak = (Math.log(ak) + (caz * Math.cos(aa)) / (1.0 + 0.008 * caz)) / Math.cos(bb);
      fk = (0.12125 * ak * ak) / caz + 1.5;
    }
    // Backward recurrence loop for the Miller algorithm.
    const k = trunc(fk);
    fk = k;
    fks = fk * fk;
    p1 = [0, 0];
    p2 = [tol, 0];
    let cs: C = p2;
    for (let i = 1; i < k + 1; i++) {
      a1 = fks - fk;
      a2 = (fks + fk) / (a1 + fhs);
      rk = 2.0 / (fk + 1.0);
      t1 = (fk + xx) * rk;
      t2 = yy * rk;
      pt = p2;
      p2 = csc(csub(cmul(p2, [t1, t2]), p1), a2);
      p1 = pt;
      cs = cadd(cs, p2);
      fks = a1 - fk + 1.0;
      fk -= 1.0;
    }
    // Compute (p2/cs) = (p2/abs(cs)) * (conj(cs)/abs(cs)) for better scaling.
    tm = cabs(cs);
    const ptr = 1.0 / tm;
    s1 = csc(p2, ptr);
    cs = csc([cs[0], -cs[1]], ptr);
    s1 = cmul(s1, cmul(coef, cs));
    if (inu <= 0 && n <= 1) {
      zd = z;
      state = iflag === 1 ? 'L190' : 'L130';
    } else {
      // Compute p1/p2 = (p1/abs(p2)) * conj(p2)/abs(p2) for scaling.
      tm = cabs(p2);
      const pr = 1.0 / tm;
      p1 = csc(p1, pr);
      p2 = csc([p2[0], -p2[1]], pr);
      pt = cmul(p1, p2);
      s2 = cmul(s1, cadd([1.0, 0], cdiv(csub([dnu + 0.5, 0], pt), z)));
      state = 'L100';
    }
  }

  // Forward recursion on the three term recursion relation with scaling near exponent extremes on kflag = 1 or 3.
  let inub = 0;
  let kk = 0;
  let j = 2;
  const cy: C[] = [[0, 0], [0, 0]];
  p1 = [0, 0];
  p2 = [0, 0];
  for (;;) {
    switch (state) {
      case 'L100': {
        ck = csc(rz, dnu + 1.0);
        if (n === 1) inu -= 1;
        if (inu <= 0) {
          if (n <= 1) s1 = s2;
          zd = z;
          state = iflag === 1 ? 'L190' : 'L130';
          break;
        }
        inub = 1;
        state = iflag === 1 ? 'L160' : 'L110';
        break;
      }
      case 'L110': {
        let sc1 = csr[kflag - 1];
        ascle = bry[kflag - 1];
        for (let i = inub; i < inu + 1; i++) {
          const st = s2;
          s2 = cadd(cmul(ck, s2), s1);
          s1 = st;
          ck = cadd(ck, rz);
          if (kflag < 3) {
            p2 = csc(s2, sc1);
            const p2m = Math.max(Math.abs(p2[0]), Math.abs(p2[1]));
            if (p2m > ascle) {
              kflag += 1;
              ascle = bry[kflag - 1];
              s1 = csc(s1, sc1);
              s2 = p2;
              s1 = csc(s1, css[kflag - 1]);
              s2 = csc(s2, css[kflag - 1]);
              sc1 = csr[kflag - 1];
            }
          }
        }
        if (n === 1) s1 = s2;
        state = 'L130';
        break;
      }
      case 'L130': {
        y[0] = csc(s1, csr[kflag - 1]);
        if (n === 1) return nz;
        y[1] = csc(s2, csr[kflag - 1]);
        if (n === 2) return nz;
        kk = 2;
        state = 'L140';
        break;
      }
      case 'L140': {
        kk += 1;
        if (kk > n) return nz;
        let sc1 = csr[kflag - 1];
        ascle = bry[kflag - 1];
        for (let i = kk; i < n + 1; i++) {
          p2 = s2;
          s2 = cadd(cmul(ck, s2), s1);
          s1 = p2;
          ck = cadd(ck, rz);
          p2 = csc(s2, sc1);
          y[i - 1] = p2;
          if (kflag < 3) {
            const p2m = Math.max(Math.abs(p2[0]), Math.abs(p2[1]));
            if (p2m > ascle) {
              kflag += 1;
              ascle = bry[kflag - 1];
              s1 = csc(s1, sc1);
              s2 = p2;
              s1 = csc(s1, css[kflag - 1]);
              s2 = csc(s2, css[kflag - 1]);
              sc1 = csr[kflag - 1];
            }
          }
        }
        return nz;
      }
      case 'L160': {
        // iflag = 1 cases: forward recurrence on scaled values on underflow.
        const elm = Math.exp(-elim);
        ascle = bry[0];
        zd = z;
        let xd = xx;
        const yd = yy;
        let ic = -1;
        j = 2;
        state = 'L190';
        for (let i = 1; i < inu + 1; i++) {
          const st = s2;
          s2 = cadd(cmul(ck, s2), s1);
          s1 = st;
          ck = cadd(ck, rz);
          const as = cabs(s2);
          const alas = Math.log(as);
          let p2r = alas - xd;
          if (p2r >= -elim) {
            const pp = cadd(cneg(zd), clog(s2));
            p2r = pp[0];
            const p2i = pp[1];
            const p2m = Math.exp(p2r) / tol;
            p1 = csc([Math.cos(p2i), Math.sin(p2i)], p2m);
            if (!uchk(p1, ascle, tol)) {
              j = 3 - j;
              cy[j - 1] = p1;
              if (ic === i - 1) {
                state = 'L180';
                inub = i + 1;
                break;
              }
              ic = i;
              continue;
            }
          }
          if (alas >= 0.5 * elim) {
            xd -= elim;
            s1 = csc(s1, elm);
            s2 = csc(s2, elm);
            zd = [xd, yd];
          }
        }
        if (state === 'L190' && n === 1) s1 = s2;
        break;
      }
      case 'L180': {
        kflag = 1;
        s2 = cy[j - 1];
        j = 3 - j;
        s1 = cy[j - 1];
        if (inub <= inu) {
          state = 'L110';
          break;
        }
        if (n === 1) s1 = s2;
        state = 'L130';
        break;
      }
      case 'L190': {
        y[0] = s1;
        if (n !== 1) y[1] = s2;
        ascle = bry[0];
        nz = kscl(zd, fnu, n, y, rz, ascle, tol, elim);
        inu = n - nz;
        if (inu <= 0) return nz;
        kk = nz + 1;
        s1 = y[kk - 1];
        y[kk - 1] = csc(s1, csr[0]);
        if (inu === 1) return nz;
        kk = nz + 2;
        s2 = y[kk - 1];
        y[kk - 1] = csc(s2, csr[0]);
        if (inu === 2) return nz;
        t2 = fnu + (kk - 1);
        ck = csc(rz, t2);
        kflag = 1;
        state = 'L140';
        break;
      }
      default:
        throw new Error('bknu: bad state');
    }
  }
}

/** Result of uni1/uni2: nw (underflow count or negative failure code) and nlast (see buni). */
interface UniResult {
  nw: number;
  nlast: number;
}

/**
 * Computes the I Bessel function for |z| > fnul and fnu+n-1 < fnul by raising the order by nui, evaluating by the
 * uniform asymptotic expansion (uni1 for I, uni2 for J form) and recurring back down.  (ZBUNI)
 */
function buni(z: C, fnu: number, kode: number, n: number, y: C[], nui: number, fnul: number, tol: number, elim: number, alim: number): { nz: number; nlast: number } {
  const nz = 0;
  const xx = z[0];
  const yy = z[1];
  let ax = Math.abs(xx) * Math.sqrt(3.0);
  let ay = Math.abs(yy);
  let iform = 1;
  if (ay > ax) iform = 2;
  let r: UniResult;
  if (nui === 0) {
    r = iform !== 2 ? uni1(z, fnu, kode, n, y, fnul, tol, elim, alim) : uni2(z, fnu, kode, n, y, fnul, tol, elim, alim);
    if (r.nw < 0) return { nz: r.nw === -2 ? -2 : -1, nlast: r.nlast };
    return { nz: r.nw, nlast: r.nlast };
  }
  let fnui = nui;
  const dfnu = fnu + (n - 1);
  const gnu = dfnu + fnui;
  const cy: C[] = [[0, 0], [0, 0]];
  r = iform !== 2 ? uni1(z, gnu, kode, 2, cy, fnul, tol, elim, alim) : uni2(z, gnu, kode, 2, cy, fnul, tol, elim, alim);
  const nw = r.nw;
  let nlast = r.nlast;
  if (nw >= 0) {
    if (nw !== 0) return { nz, nlast: n };
    ay = cabs(cy[0]);
    // Scale the recurrence to avoid over- and underflow.
    const bry = [THRESHOLD_MIN / tol, tol / THRESHOLD_MIN, 0];
    bry[2] = bry[1];
    let iflag = 2;
    let ascle = bry[1];
    ax = 1.0;
    let cscl = ax;
    if (ay <= bry[0]) {
      iflag = 1;
      ascle = bry[0];
      ax = 1.0 / tol;
      cscl = ax;
    } else if (ay >= bry[1]) {
      iflag = 3;
      ascle = bry[2];
      ax = tol;
      cscl = ax;
    }
    ay = 1.0 / ax;
    let cscr = ay;
    let s1 = csc(cy[1], cscl);
    let s2 = csc(cy[0], cscl);
    const rz = rdiv(2.0, z);
    let st: C;
    for (let i = 1; i < nui + 1; i++) {
      st = s2;
      s2 = cadd(cmul(csc(rz, dfnu + fnui), st), s1);
      s1 = st;
      fnui -= 1.0;
      if (iflag < 3) {
        st = csc(s2, cscr);
        const stm = Math.max(Math.abs(st[0]), Math.abs(st[1]));
        if (stm > ascle) {
          iflag += 1;
          ascle = bry[iflag - 1];
          s1 = csc(s1, cscr);
          s2 = st;
          ax *= tol;
          ay = 1.0 / ax;
          cscl = ax;
          cscr = ay;
          s1 = csc(s1, cscl);
          s2 = csc(s2, cscl);
        }
      }
    }
    y[n - 1] = csc(s2, cscr);
    if (n === 1) return { nz, nlast };
    const nl = n - 1;
    fnui = nl;
    let k = nl;
    for (let i = 0; i < nl; i++) {
      st = s2;
      s2 = cadd(cmul(csc(rz, fnu + fnui), s2), s1);
      s1 = st;
      st = csc(s2, cscr);
      y[k - 1] = st;
      fnui -= 1.0;
      k -= 1;
      if (iflag < 3) {
        st = csc(s2, cscr);
        const stm = Math.max(Math.abs(st[0]), Math.abs(st[1]));
        if (stm > ascle) {
          iflag += 1;
          ascle = bry[iflag - 1];
          s1 = csc(s1, cscr);
          s2 = st;
          ax *= tol;
          ay = 1.0 / ax;
          cscl = ax;
          cscr = ay;
          s1 = csc(s1, cscl);
          s2 = csc(s2, cscl);
        }
      }
    }
    return { nz, nlast };
  }
  nlast = r.nlast;
  return { nz: nw === -2 ? -2 : -1, nlast };
}

/** Chooses between the two uniform asymptotic expansions for the K function by sector of z.  (ZBUNK) */
function bunk(z: C, fnu: number, kode: number, mr: number, n: number, y: C[], tol: number, elim: number, alim: number): number {
  const ax = Math.abs(z[0]) * 1.7321;
  const ay = Math.abs(z[1]);
  if (ay <= ax) return unk1(z, fnu, kode, mr, n, y, tol, elim, alim);
  return unk2(z, fnu, kode, mr, n, y, tol, elim, alim);
}

/** Natural log of the gamma function for z > 0 (NaN otherwise); table lookup for small integers.  (DGAMLN) */
function gamln(z: number): number {
  const con = 1.83787706640934548; // LN(2*PI)
  let nz = 0;
  if (z > 0.0) {
    if (z <= 101.0) {
      nz = trunc(z);
      const fz = z - nz;
      if (fz <= 0.0) {
        if (nz <= 100) return DGAMLN_GLN[nz - 1];
      }
    }
    const wdtol = RTOL_MIN;
    const rln = LOG10_2 * DBL_MANT_DIG;
    const fln = Math.max(Math.min(rln, 20.0), 3.0) - 3.0;
    const zm = 1.8 + 0.3875 * fln;
    const mz = trunc(zm) + 1;
    const zmin = mz;
    let zdmy = z;
    let zinc = 0.0;
    if (z < zmin) {
      zinc = zmin - nz;
      zdmy = z + zinc;
    }
    let zp = 1.0 / zdmy;
    const t1 = DGAMLN_CF[0] * zp;
    let s = t1;
    if (zp >= wdtol) {
      const zsq = zp * zp;
      const tst = t1 * wdtol;
      for (let i = 2; i < 23; i++) {
        zp *= zsq;
        const trm = DGAMLN_CF[i - 1] * zp;
        if (Math.abs(trm) < tst) break;
        s += trm;
      }
    }
    if (zinc === 0.0) {
      const tlg = Math.log(z);
      return z * (tlg - 1.0) + 0.5 * (con - tlg) + s;
    }
    zp = 1.0;
    nz = trunc(zinc);
    for (let i = 0; i < nz; i++) zp *= z + i;
    const tlg = Math.log(zdmy);
    return zdmy * (tlg - 1.0) - Math.log(zp) + 0.5 * (con - tlg) + s;
  }
  return NaN;
}

/**
 * Computes the I Bessel function for Re z >= 0 by the Miller algorithm (backward recurrence) normalized by the
 * power series.  Returns nz (0) or -2 if the Miller algorithm fails to converge.  (ZMLRI)
 */
function mlri(z: C, fnu: number, kode: number, n: number, y: C[], tol: number): number {
  const scle = DBL_MIN / tol;
  const nz = 0;
  const az = cabs(z);
  const x = z[0];
  const iaz = trunc(az);
  const ifnu = trunc(fnu);
  const inu = ifnu + n - 1;
  let at = iaz + 1;
  let ck = rdiv(at, z);
  const rz = rdiv(2.0, z);
  let p1: C = [0, 0];
  let p2: C = [1, 0];
  let ack = (at + 1.0) / az;
  let rho = ack + Math.sqrt(ack * ack - 1.0);
  let rho2 = rho * rho;
  let tst = (rho2 + rho2) / ((rho2 - 1.0) * (rho - 1.0));
  tst /= tol;
  let ak = at;
  let pt: C;
  let ap: number;
  let i: number;
  for (i = 1; i < 81; i++) {
    pt = p2;
    p2 = csub(p1, cmul(ck, p2));
    p1 = pt;
    ck = cadd(ck, rz);
    ap = cabs(p2);
    if (ap > tst * ak * ak) break;
    ak += 1.0;
    if (i === 80) return -2;
  }
  i += 1;
  let k = 0;
  if (inu >= iaz) {
    p1 = [0, 0];
    p2 = [1, 0];
    at = inu + 1;
    ck = rdiv(at, z);
    ack = at / az;
    tst = Math.sqrt(ack / tol);
    let itime = 1;
    for (k = 1; k < 81; k++) {
      pt = p2;
      p2 = csub(p1, cmul(ck, p2));
      p1 = pt;
      ck = cadd(ck, rz);
      ap = cabs(p2);
      if (ap >= tst) {
        if (itime === 2) break;
        ack = cabs(ck);
        const flam = ack + Math.sqrt(ack * ack - 1.0);
        const fkap = ap / cabs(p1);
        rho = Math.min(flam, fkap);
        tst *= Math.sqrt(rho / (rho * rho - 1.0));
        itime = 2;
      }
      if (k === 80) return -2;
    }
  }
  k += 1;
  const kk = Math.max(i + iaz, k + inu);
  let fkk = kk;
  p1 = [0, 0];
  p2 = [scle, 0];
  const fnf = fnu - ifnu;
  const tfnf = fnf + fnf;
  let bk = gamln(fkk + tfnf + 1.0) - gamln(fkk + 1.0) - gamln(tfnf + 1.0);
  bk = Math.exp(bk);
  let sum: C = [0, 0];
  const km = kk - inu;
  for (i = 1; i < km + 1; i++) {
    pt = p2;
    p2 = cadd(p1, cmul(csc(rz, fkk + fnf), p2));
    p1 = pt;
    ak = 1.0 - tfnf / (fkk + tfnf);
    ack = bk * ak;
    sum = cadd(sum, csc(p1, ack + bk));
    bk = ack;
    fkk -= 1.0;
  }
  y[n - 1] = p2;
  if (n !== 1) {
    for (i = 2; i < n + 1; i++) {
      pt = p2;
      p2 = cadd(p1, cmul(csc(rz, fkk + fnf), p2));
      p1 = pt;
      ak = 1.0 - tfnf / (fkk + tfnf);
      ack = bk * ak;
      sum = cadd(sum, csc(p1, ack + bk));
      bk = ack;
      fkk -= 1.0;
      const m = n - i + 1;
      y[m - 1] = p2;
    }
  }
  if (ifnu > 0) {
    for (i = 1; i < ifnu + 1; i++) {
      pt = p2;
      p2 = cadd(p1, cmul(csc(rz, fkk + fnf), p2));
      p1 = pt;
      ak = 1.0 - tfnf / (fkk + tfnf);
      ack = bk * ak;
      sum = cadd(sum, csc(p1, ack + bk));
      bk = ack;
      fkk -= 1.0;
    }
  }
  pt = z;
  if (kode === 2) pt = [pt[0] - x, pt[1]];
  p1 = cadd(csc(clog(rz), -fnf), pt);
  ap = gamln(1.0 + fnf);
  pt = [p1[0] - ap, p1[1]];
  p2 = cadd(p2, sum);
  ap = cabs(p2);
  const pr = 1.0 / ap;
  ck = csc(cexp(pt), pr);
  pt = csc([p2[0], -p2[1]], pr);
  const cnorm = cmul(ck, pt);
  for (let j = 0; j < n; j++) y[j] = cmul(y[j], cnorm);
  return nz;
}

/**
 * Ratios of I Bessel functions cy[k] = I_(fnu+k)(z)/I_(fnu+k-1)(z) by backward recurrence with a forward-recurrence
 * starting index.  (ZRATI)
 */
function rati(z: C, fnu: number, n: number, cy: C[], tol: number): void {
  const az = cabs(z);
  const inu = trunc(fnu);
  const idnu = inu + n - 1;
  const fdnu = idnu;
  const magz = trunc(az);
  const amagz = magz + 1;
  const fnup = Math.max(amagz, fdnu);
  let id = idnu - magz - 1;
  let itime = 1;
  let k = 1;
  const rz = rdiv(2.0, z);
  let t1 = csc(rz, fnup);
  let p2 = cneg(t1);
  let p1: C = [1, 0];
  t1 = cadd(t1, rz);
  if (id > 0) id = 0;
  let ap2 = cabs(p2);
  let ap1 = cabs(p1);
  const arg = (ap2 + ap2) / (ap1 * tol);
  const test1 = Math.sqrt(arg);
  let test = test1;
  const rap1 = 1.0 / ap1;
  p1 = csc(p1, rap1);
  p2 = csc(p2, rap1);
  ap2 *= rap1;
  let pt: C;
  for (;;) {
    k += 1;
    ap1 = ap2;
    pt = p2;
    p2 = csub(p1, cmul(t1, p2));
    p1 = pt;
    t1 = cadd(t1, rz);
    ap2 = cabs(p2);
    if (ap1 > test) break;
    if (itime !== 2) {
      const ak = cabs(t1) * 0.5;
      const flam = ak + Math.sqrt(ak * ak - 1.0);
      const rho = Math.min(ap2 / ap1, flam);
      test = test1 * Math.sqrt(rho / (rho * rho - 1.0));
      itime = 2;
    }
  }
  const kk = k + 1 - id;
  let ak = kk;
  const dfnu = fnu + n - 1;
  // From here t1 is a real number (it is complex(ak, 0) in the C++ source).
  let t1r = ak;
  p1 = [1.0 / ap2, 0];
  p2 = [0, 0];
  for (let i = 1; i < kk + 1; i++) {
    pt = p1;
    p1 = cadd(cmul(csc(rz, dfnu + t1r), p1), p2);
    p2 = pt;
    t1r -= 1.0;
  }
  if (p1[0] === 0 && p1[1] === 0) p1 = [tol, tol];
  cy[n - 1] = cdiv(p2, p1);
  if (n === 1) return;
  k = n - 1;
  ak = k;
  t1r = ak;
  const cdfnu = csc(rz, fnu);
  for (let i = 2; i < n + 1; i++) {
    pt = cadd(cadd(cdfnu, csc(rz, t1r)), cy[k]);
    if (pt[0] === 0 && pt[1] === 0) pt = [tol, tol];
    cy[k - 1] = rdiv(1.0, pt);
    t1r -= 1.0;
    k -= 1;
  }
}

/**
 * Computes the I Bessel function for Re z >= 0 by the power series, for |z| <= 2 or |z|^2/4 <= fnu+n.  Returns nz
 * (count of underflowed members), negated if the underflow was in the first members and the series must be
 * abandoned.  (ZSERI)
 */
function seri(z: C, fnu: number, kode: number, n: number, y: C[], tol: number, elim: number, alim: number): number {
  let nz = 0;
  const az = cabs(z);
  if (az === 0.0) {
    y[0] = [0, 0];
    if (fnu === 0.0) y[0] = [1, 0];
    if (n === 1) return nz;
    for (let i = 1; i < n; i++) y[i] = [0, 0];
    return nz;
  }
  const x = z[0];
  const arm = THRESHOLD_MIN;
  const rtr1 = Math.sqrt(arm);
  let crsc = 1.0;
  let iflag = 0;
  if (az >= arm) {
    const halfZ = csc(z, 0.5);
    let cz: C = [0, 0];
    if (az > rtr1) cz = cmul(halfZ, halfZ);
    const acz = cabs(cz);
    let nn = n;
    const ck = clog(halfZ);
    let ss = 0;
    let ascle = 0;
    let dfnu = 0;
    const w: C[] = [[0, 0], [0, 0]];
    for (;;) {
      // L10
      dfnu = fnu + (nn - 1);
      let fnup = dfnu + 1.0;
      let ak1 = csc(ck, dfnu);
      let ak = gamln(fnup);
      ak1 = [ak1[0] - ak, ak1[1]];
      if (kode === 2) ak1 = [ak1[0] - x, ak1[1]];
      const rak1 = ak1[0];
      let underflow = false;
      if (rak1 > -elim) {
        // L30
        if (rak1 <= -alim) {
          iflag = 1;
          ss = 1.0 / tol;
          crsc = tol;
          ascle = arm * ss;
        }
        ak = ak1[1];
        let aa = Math.exp(rak1);
        if (iflag === 1) aa *= ss;
        let coef = csc([Math.cos(ak), Math.sin(ak)], aa);
        const atol = (tol * acz) / fnup;
        const il = nn > 2 ? 2 : nn;
        for (let i = 1; i < il + 1; i++) {
          dfnu = fnu + (nn - i);
          fnup = dfnu + 1.0;
          let s1: C = [1, 0];
          if (acz >= tol * fnup) {
            ak1 = [1, 0];
            ak = fnup + 2.0;
            let s = fnup;
            aa = 2.0;
            for (;;) {
              const rs = 1.0 / s;
              ak1 = cmul(ak1, cz);
              ak1 = csc(ak1, rs);
              s1 = cadd(s1, ak1);
              s += ak;
              ak += 2.0;
              aa *= acz;
              aa *= rs;
              if (aa <= atol) break;
            }
          }
          const s2 = cmul(s1, coef);
          w[i - 1] = s2;
          if (iflag !== 0) {
            if (uchk(s2, ascle, tol)) {
              underflow = true;
              break;
            }
          }
          const m = nn - i + 1;
          y[m - 1] = csc(s2, crsc);
          if (i !== il) coef = cmul(coef, rdiv(dfnu, halfZ));
        }
      } else {
        underflow = true;
      }
      if (underflow) {
        // L20
        nz += 1;
        y[nn - 1] = [0, 0];
        if (acz > dfnu) return -nz;
        nn -= 1;
        if (nn === 0) return nz;
        continue;
      }
      if (nn <= 2) return nz;
      let k = nn - 2;
      ak = k;
      const rz = rdiv(2.0, z);
      let ib = 3;
      if (iflag === 1) {
        // L80
        let s1 = w[0];
        let s2 = w[1];
        let l: number;
        let found = false;
        for (l = 3; l < nn + 1; l++) {
          const c = s2;
          s2 = cadd(s1, cmul(csc(rz, ak + fnu), s2));
          s1 = c;
          const c2 = csc(s2, crsc);
          y[k - 1] = c2;
          ak -= 1.0;
          k -= 1;
          if (cabs(c2) > ascle) {
            found = true;
            break;
          }
        }
        if (!found) return nz;
        // L100
        ib = l + 1;
        if (ib > nn) return nz;
      }
      // L60
      for (let i = ib; i < nn + 1; i++) {
        y[k - 1] = cadd(cmul(csc(rz, ak + fnu), y[k]), y[k + 1]);
        ak -= 1.0;
        k -= 1;
      }
      return nz;
    }
  }
  nz = n;
  if (fnu === 0.0) nz -= 1;
  y[0] = [0, 0];
  if (fnu === 0.0) y[0] = [1, 0];
  if (n === 1) return nz;
  for (let i = 1; i < n; i++) y[i] = [0, 0];
  return nz;
}

/** Output of unhj. */
interface UnhjResult {
  phi: C;
  arg: C;
  zeta1: C;
  zeta2: C;
  asum: C;
  bsum: C;
}

/**
 * Parameters for the uniform asymptotic expansions of the Bessel functions of large order (Airy-function form): phi,
 * arg, zeta1, zeta2 and the sums asum, bsum.  With ipmtr = 1 only phi, arg, zeta1, zeta2 are computed.  (ZUNHJ)
 */
function unhj(z: C, fnu: number, ipmtr: number, tol: number): UnhjResult {
  const ex1 = 1 / 3;
  const ex2 = 2 / 3;
  const thpi = 4.71238898038468986;
  const cr: C[] = zeros(14);
  const dr: C[] = zeros(14);
  const up: C[] = zeros(14);
  const p: C[] = zeros(30);
  const ap: number[] = new Array<number>(30).fill(0);
  let asum: C = [0, 0];
  let bsum: C = [0, 0];

  const rfnu = 1 / fnu;
  const ac = fnu * THRESHOLD_MIN;
  if (Math.abs(z[0]) <= ac && Math.abs(z[1]) <= ac) {
    return {
      zeta1: [2.0 * Math.abs(Math.log(THRESHOLD_MIN)) + fnu, 0],
      zeta2: [fnu, 0],
      phi: [1, 0],
      arg: [1, 0],
      asum,
      bsum,
    };
  }
  const zb = csc(z, rfnu);
  const rfnu2 = rfnu * rfnu;
  const fn13 = Math.pow(fnu, ex1);
  const fn23 = fn13 * fn13;
  const rfn13 = 1.0 / fn13;
  let w2 = csub([1, 0], cmul(zb, zb));
  // Amos's AZSQRT and C's csqrt differ when the imaginary part is zero (sign swap): force +0.
  if (w2[1] === 0) w2 = [w2[0], 0];
  const aw2 = cabs(w2);
  let k: number;
  let suma: C;
  let sumb: C;
  let za: C;
  let zc: C;
  let zeta: C;
  let pp: number;
  let ias: number;
  let ibs: number;
  if (aw2 <= 0.25) {
    k = 1;
    p[0] = [1, 0];
    suma = [ZUNHJ_GAMA[0], 0];
    ap[0] = 1.0;
    if (aw2 >= tol) {
      for (k = 2; k < 31; k++) {
        p[k - 1] = cmul(p[k - 2], w2);
        suma = cadd(suma, csc(p[k - 1], ZUNHJ_GAMA[k - 1]));
        ap[k - 1] = ap[k - 2] * aw2;
        if (ap[k - 1] < tol) break;
      }
    }
    // Check for exhausted loop.
    if (k === 31) k = 30;
    const kmax = k;
    zeta = cmul(w2, suma);
    const arg = csc(zeta, fn23);
    za = csqrt(suma);
    const zeta2 = csc(csqrt(w2), fnu);
    const zeta1 = cmul(zeta2, cadd([1, 0], csc(cmul(zeta, za), ex2)));
    za = cadd(za, za);
    const phi = csc(csqrt(za), rfn13);
    if (ipmtr === 1) return { phi, arg, zeta1, zeta2, asum, bsum };
    sumb = [0, 0];
    for (k = 1; k < kmax + 1; k++) sumb = cadd(sumb, csc(p[k - 1], ZUNHJ_BETA[k - 1]));
    asum = [0, 0];
    bsum = sumb;
    let l1 = 0;
    let l2 = 30;
    const btol = tol * (Math.abs(bsum[0]) + Math.abs(bsum[1]));
    let atol = tol;
    pp = 1.0;
    ias = 0;
    ibs = 0;
    if (rfnu2 < tol) {
      asum = [asum[0] + 1, asum[1]];
      bsum = csc(bsum, rfnu * rfn13);
      return { phi, arg, zeta1, zeta2, asum, bsum };
    }
    for (let is = 2; is < 8; is++) {
      atol /= rfnu2;
      pp *= rfnu2;
      if (ias !== 1) {
        suma = [0, 0];
        for (k = 1; k < kmax + 1; k++) {
          const m = l1 + k;
          suma = cadd(suma, csc(p[k - 1], ZUNHJ_ALFA[m - 1]));
          if (ap[k - 1] < atol) break;
        }
        asum = cadd(asum, csc(suma, pp));
        if (pp < tol) ias = 1;
      }
      if (ibs !== 1) {
        sumb = [0, 0];
        for (k = 1; k < kmax + 1; k++) {
          const m = l2 + k;
          sumb = cadd(sumb, csc(p[k - 1], ZUNHJ_BETA[m - 1]));
          if (ap[k - 1] < atol) break;
        }
        bsum = cadd(bsum, csc(sumb, pp));
        if (pp < btol) ibs = 1;
      }
      if (ias === 1 && ibs === 1) break;
      l1 += 30;
      l2 += 30;
    }
    asum = [asum[0] + 1, asum[1]];
    bsum = csc(bsum, rfnu * rfn13);
    return { phi, arg, zeta1, zeta2, asum, bsum };
  }
  const w = csqrt(w2);
  za = cdiv(cadd([1, 0], w), zb);
  zc = clog(za);
  let zcr = zc[0];
  let zci = zc[1];
  if (zci < 0) zci = 0.0;
  if (zci > M_PI_2) zci = M_PI_2;
  if (zcr < 0) zcr = 0.0;
  zc = [zcr, zci];
  const zth = csc(csub(zc, w), 1.5);
  const zeta1 = csc(zc, fnu);
  const zeta2 = csc(w, fnu);
  const azth = cabs(zth);
  const zthr = zth[0];
  const zthi = zth[1];
  let ang = thpi;
  if (zthr < 0.0 || zthi >= 0.0) {
    ang = M_PI_2;
    if (zthr !== 0.0) {
      ang = Math.atan(zthi / zthr);
      if (zthr < 0.0) ang += M_PI;
    }
  }
  pp = Math.pow(azth, ex2);
  ang *= ex2;
  const zetar = pp * Math.cos(ang);
  let zetai = pp * Math.sin(ang);
  if (zetai < 0.0) zetai = 0.0;
  zeta = [zetar, zetai];
  const arg = csc(zeta, fn23);
  const rtzta = cdiv(zth, zeta);
  za = cdiv(rtzta, w);
  const phi = csc(csqrt(cadd(za, za)), rfn13);
  if (ipmtr === 1) return { phi, arg, zeta1, zeta2, asum, bsum };
  const tfn = rdiv(rfnu, w);
  const rzth = rdiv(rfnu, zth);
  zc = csc(rzth, ZUNHJ_AR[1]);
  const t2 = rdiv(1.0, w2);
  up[1] = cmul(cadd(csc(t2, ZUNHJ_C[1]), [ZUNHJ_C[2], 0]), tfn);
  bsum = cadd(up[1], zc);
  asum = [0, 0];
  if (rfnu < tol) {
    asum = [asum[0] + 1, asum[1]];
    bsum = cmul(bsum, rdiv(-rfn13, rtzta));
    return { phi, arg, zeta1, zeta2, asum, bsum };
  }
  let przth = rzth;
  let ptfn = tfn;
  up[0] = [1, 0];
  pp = 1.0;
  let bsumr = bsum[0];
  let bsumi = bsum[1];
  const btol = tol * (Math.abs(bsumr) + Math.abs(bsumi));
  let ks = 0;
  let kp1 = 2;
  let l = 3;
  ias = 0;
  ibs = 0;
  for (let lr = 2; lr < 13; lr += 2) {
    const lrp1 = lr + 1;
    for (k = lr; k < lrp1 + 1; k++) {
      ks += 1;
      kp1 += 1;
      l += 1;
      za = [ZUNHJ_C[l - 1], 0];
      for (let j = 2; j < kp1 + 1; j++) {
        l += 1;
        const t = cmul(za, t2);
        za = [t[0] + ZUNHJ_C[l - 1], t[1]];
      }
      ptfn = cmul(ptfn, tfn);
      up[kp1 - 1] = cmul(ptfn, za);
      cr[ks - 1] = csc(przth, ZUNHJ_BR[ks]);
      przth = cmul(przth, rzth);
      dr[ks - 1] = csc(przth, ZUNHJ_AR[ks + 1]);
    }
    pp *= rfnu2;
    if (ias !== 1) {
      suma = up[lr];
      let ju = lrp1;
      for (let jr = 1; jr < lrp1; jr++) {
        ju -= 1;
        suma = cadd(suma, cmul(cr[jr - 1], up[ju - 1]));
      }
      asum = cadd(asum, suma);
      const test = Math.abs(asum[0]) + Math.abs(asum[1]);
      if (pp < tol && test < tol) ias = 1;
    }
    if (ibs !== 1) {
      sumb = cadd(up[lr + 1], cmul(up[lr], zc));
      let ju = lrp1;
      for (let jr = 1; jr < lrp1; jr++) {
        ju -= 1;
        sumb = cadd(sumb, cmul(dr[jr - 1], up[ju - 1]));
      }
      bsum = cadd(bsum, sumb);
      bsumr = bsum[0];
      bsumi = bsum[1];
      const test = Math.abs(bsumr) + Math.abs(bsumi);
      if (pp < tol && test < tol) ibs = 1;
    }
    if (ias === 1 && ibs === 1) break;
  }
  asum = [asum[0] + 1, asum[1]];
  bsum = cmul(bsum, rdiv(-rfn13, rtzta));
  return { phi, arg, zeta1, zeta2, asum, bsum };
}

/** Persistent outputs of unik between calls: the init count and the last phi, zeta1, zeta2, sum. */
interface UnikState {
  init: number;
  phi: C;
  zeta1: C;
  zeta2: C;
  sum: C;
}

const newUnikState = (): UnikState => ({
  init: 0,
  phi: [0, 0],
  zeta1: [0, 0],
  zeta2: [0, 0],
  sum: [0, 0],
});

/**
 * Parameters for the uniform asymptotic expansion of the I (ikflg = 1) or K (ikflg = 2) Bessel function of large
 * order: phi, zeta1, zeta2 and the sum of the polynomial series.  With ipmtr = 1 only phi, zeta1 and zeta2 are
 * computed.  Results are stored in st and the 16-entry work array cwrk; st.init > 0 means cwrk is already filled.  (ZUNIK)
 */
function unik(zr: C, fnu: number, ikflg: number, ipmtr: number, tol: number, st: UnikState, cwrk: C[]): void {
  const con = [3.98942280401432678e-1, 1.25331413731550025]; // ( 1/sqrt(2 PI), sqrt(PI/2) )
  if (st.init === 0) {
    const rfn = 1.0 / fnu;
    let ac = fnu * THRESHOLD_MIN;
    if (Math.abs(zr[0]) <= ac && Math.abs(zr[1]) <= ac) {
      // z/fnu too small.  The C++ source falls through here; the original Fortran returns, and so do we.
      ac = 2.0 * Math.abs(Math.log(THRESHOLD_MIN)) + fnu;
      st.zeta1 = [ac, 0];
      st.zeta2 = [fnu, 0];
      st.phi = [1, 0];
      return;
    }
    let t = csc(zr, rfn);
    let s = cadd([1, 0], cmul(t, t));
    let sr = csqrt(s);
    const zn = cdiv(cadd([1, 0], sr), t);
    st.zeta1 = csc(clog(zn), fnu);
    st.zeta2 = csc(sr, fnu);
    t = rdiv(1.0, sr);
    sr = csc(t, rfn);
    cwrk[15] = csqrt(sr);
    st.phi = csc(cwrk[15], con[ikflg - 1]);
    if (ipmtr !== 0) return;
    const t2 = rdiv(1.0, s);
    cwrk[0] = [1, 0];
    let crfn: C = [1, 0];
    ac = 1.0;
    let l = 1;
    let k: number;
    for (k = 2; k < 16; k++) {
      s = [0, 0];
      for (let j = 1; j < k + 1; j++) {
        l += 1;
        const m = cmul(s, t2);
        s = [m[0] + ZUNIK_C[l - 1], m[1]];
      }
      crfn = cmul(crfn, sr);
      cwrk[k - 1] = cmul(crfn, s);
      ac *= rfn;
      const test = Math.abs(cwrk[k - 1][0]) + Math.abs(cwrk[k - 1][1]);
      if (ac < tol && test < tol) break;
    }
    // Guard against exhausted loop.
    if (k === 16) k -= 1;
    st.init = k;
  }
  let total: C = [0, 0];
  if (ikflg !== 2) {
    // Sum for the I function.
    for (let i = 0; i < st.init; i++) total = cadd(total, cwrk[i]);
    st.phi = csc(cwrk[15], con[0]);
  } else {
    // Sum for the K function.
    let t = 1.0;
    for (let i = 1; i < st.init + 1; i++) {
      total = cadd(total, csc(cwrk[i - 1], t));
      t = -t;
    }
    st.phi = csc(cwrk[15], con[1]);
  }
  st.sum = total;
}

/**
 * I Bessel function for large order by the uniform asymptotic expansion for Re z >= 0 (|arg z| <= pi/2 sector with
 * unik); y receives the n members.  Returns nw (underflow count, or negative on failure) and nlast (number of
 * members left to compute by another method).  (ZUNI1)
 */
function uni1(z: C, fnu: number, kode: number, n: number, y: C[], fnul: number, tol: number, elim: number, alim: number): UniResult {
  let nz = 0;
  let nd = n;
  let nlast = 0;
  const cscl = 1.0 / tol;
  const crsc = tol;
  const css = [cscl, 1.0, crsc];
  const csr = [crsc, 1.0, cscl];
  const bry = [THRESHOLD_MIN / tol, 0.0, 0.0];
  bry[1] = 1.0 / bry[0];
  bry[2] = DBL_MAX;
  const cy: C[] = zeros(2);
  const st = newUnikState();
  const cwrk = zeros(16);
  let iflag = 0;
  let fn = Math.max(fnu, 1.0);
  st.init = 0;
  unik(z, fn, 1, 1, tol, st, cwrk);
  let s1: C;
  if (kode !== 1) {
    s1 = cadd(cneg(st.zeta1), csc(cdiv([fn, 0], cadd(z, st.zeta2)), fn));
  } else {
    s1 = cadd(cneg(st.zeta1), st.zeta2);
  }
  let rs1 = s1[0];
  if (Math.abs(rs1) > elim) {
    // The C++ source does not return here, which lets it carry on and overwrite the zeros; the Fortran returns.
    if (rs1 > 0) return { nw: -1, nlast };
    for (let i = 0; i < n; i++) y[i] = [0, 0];
    return { nw: n, nlast };
  }
  for (;;) {
    // L30
    const nn = nd > 2 ? 2 : nd;
    let underflow = false;
    let i: number;
    for (i = 1; i < nn + 1; i++) {
      fn = fnu + nd - i;
      st.init = 0;
      unik(z, fn, 1, 0, tol, st, cwrk);
      if (kode !== 1) {
        s1 = cadd(cadd(cneg(st.zeta1), csc(cdiv([fn, 0], cadd(z, st.zeta2)), fn)), [0.0, z[1]]);
      } else {
        s1 = cadd(cneg(st.zeta1), st.zeta2);
      }
      rs1 = s1[0];
      if (Math.abs(rs1) > elim) {
        underflow = true;
        break;
      }
      if (i === 1) iflag = 2;
      if (Math.abs(rs1) >= alim) {
        const aphi = cabs(st.phi);
        rs1 += Math.log(aphi);
        if (Math.abs(rs1) > elim) {
          underflow = true;
          break;
        }
        if (i === 1) iflag = 1;
        if (rs1 >= 0.0) {
          if (i === 1) iflag = 3;
        }
      }
      let s2 = cmul(st.phi, st.sum);
      s1 = csc([Math.cos(s1[1]), Math.sin(s1[1])], Math.exp(s1[0]) * css[iflag - 1]);
      s2 = cmul(s2, s1);
      if (iflag === 1) {
        if (uchk(s2, bry[0], tol)) {
          underflow = true;
          break;
        }
      }
      cy[i - 1] = s2;
      const m = nd - i + 1;
      y[m - 1] = csc(s2, csr[iflag - 1]);
    }
    if (!underflow) {
      if (nd > 2) {
        const rz = rdiv(2.0, z);
        let sa = cy[0];
        let sb = cy[1];
        let c1r = csr[iflag - 1];
        let ascle = bry[iflag - 1];
        let k = nd - 2;
        fn = k;
        for (let ii = 3; ii < nd + 1; ii++) {
          let c2 = sb;
          sb = cadd(sa, cmul(csc(rz, fnu + fn), c2));
          sa = c2;
          c2 = csc(sb, c1r);
          y[k - 1] = c2;
          k -= 1;
          fn -= 1.0;
          if (iflag >= 3) continue;
          if (Math.max(Math.abs(c2[0]), Math.abs(c2[1])) <= ascle) continue;
          iflag += 1;
          ascle = bry[iflag - 1];
          sa = csc(sa, c1r);
          sb = c2;
          sa = csc(sa, css[iflag - 1]);
          sb = csc(sb, css[iflag - 1]);
          c1r = csr[iflag - 1];
        }
      }
      return { nw: nz, nlast };
    }
    // L110: set underflow and update parameters.
    if (rs1 > 0.0) return { nw: -1, nlast };
    y[nd - 1] = [0, 0];
    nz += 1;
    nd -= 1;
    if (nd === 0) return { nw: nz, nlast };
    const nuf = uoik(z, fnu, kode, 1, nd, y, tol, elim, alim);
    if (nuf < 0) return { nw: -1, nlast };
    nd -= nuf;
    nz += nuf;
    if (nd === 0) return { nw: nz, nlast };
    fn = fnu + nd - 1;
    if (fn >= fnul) continue;
    nlast = nd;
    return { nw: nz, nlast };
  }
}

/**
 * I Bessel function for large order by the uniform asymptotic expansion of the J form (Airy-function expansion,
 * unhj), used near the imaginary axis; same results as uni1.  (ZUNI2)
 */
function uni2(z: C, fnu: number, kode: number, n: number, y: C[], fnul: number, tol: number, elim: number, alim: number): UniResult {
  let nz = 0;
  let nlast = 0;
  const aic = 1.265512123484645396; // log(2 sqrt(pi))
  const cip: C[] = [[1, 0], [0, 1], [-1, 0], [-0, -1]];
  const ci: C = [0, 1];
  const cscl = 1.0 / tol;
  const crsc = tol;
  const csr = [crsc, 1.0, cscl];
  const css = [cscl, 1.0, crsc];
  const bry = [THRESHOLD_MIN / tol, 0.0, 0.0];
  const cy: C[] = zeros(2);
  const yy = z[1];
  let nd = n;
  let zn = cmul(cneg(z), ci);
  let zb = z;
  let cid = cneg(ci);
  const inu = trunc(fnu);
  const ang = M_PI_2 * (fnu - inu);
  let c2: C = [Math.cos(ang), Math.sin(ang)];
  const zar = c2;
  let inn = inu + n - 1;
  inn = inn % 4;
  c2 = cmul(c2, cip[inn]);
  if (yy <= 0.0) {
    zn = conj(cneg(zn));
    zb = conj(zb);
    cid = cneg(cid);
    c2 = conj(c2);
  }
  let fn = Math.max(fnu, 1.0);
  let h = unhj(zn, fn, 0, tol);
  let s1: C;
  if (kode !== 1) {
    s1 = cadd(cneg(h.zeta1), csc(cdiv([fnu, 0], cadd(zb, h.zeta2)), fnu));
  } else {
    s1 = cadd(cneg(h.zeta1), h.zeta2);
  }
  let rs1 = s1[0];
  if (Math.abs(rs1) > elim) {
    if (rs1 > 0.0) return { nw: -1, nlast };
    // The C++ source forgets to set nz = n here; the Fortran sets it.
    for (let i = 0; i < n; i++) y[i] = [0, 0];
    return { nw: n, nlast };
  }
  let iflag = 0;
  for (;;) {
    // L10
    const nn = nd > 2 ? 2 : nd;
    let underflow = false;
    for (let i = 1; i < nn + 1; i++) {
      fn = fnu + (nd - i);
      h = unhj(zn, fn, 0, tol);
      if (kode !== 1) {
        const ay = Math.abs(yy);
        s1 = cadd(cadd(cneg(h.zeta1), csc(cdiv([fn, 0], cadd(zb, h.zeta2)), fn)), csc([0, 1], ay));
      } else {
        s1 = cadd(cneg(h.zeta1), h.zeta2);
      }
      rs1 = s1[0];
      if (Math.abs(rs1) > elim) {
        underflow = true;
        break;
      }
      if (i === 1) iflag = 2;
      if (Math.abs(rs1) >= alim) {
        const aphi = cabs(h.phi);
        const aarg = cabs(h.arg);
        rs1 += Math.log(aphi) - 0.25 * Math.log(aarg) - aic;
        if (Math.abs(rs1) > elim) {
          underflow = true;
          break;
        }
        if (i === 1) iflag = 1;
        if (rs1 >= 0.0) {
          if (i === 1) iflag = 3;
        }
      }
      const ai = airy(h.arg, 0, 2).v;
      const dai = airy(h.arg, 1, 2).v;
      let s2 = cmul(h.phi, cadd(cmul(ai, h.asum), cmul(dai, h.bsum)));
      const c2r = Math.exp(s1[0]) * css[iflag - 1];
      const c2i = s1[1];
      s1 = csc([Math.cos(c2i), Math.sin(c2i)], c2r);
      s2 = cmul(s2, s1);
      if (iflag === 1) {
        if (uchk(s2, bry[0], tol)) {
          underflow = true;
          break;
        }
      }
      if (yy <= 0.0) s2 = conj(s2);
      const j = nd - i + 1;
      s2 = cmul(s2, c2);
      cy[i - 1] = s2;
      y[j - 1] = csc(s2, csr[iflag - 1]);
      c2 = cmul(c2, cid);
    }
    if (!underflow) {
      if (nd > 2) {
        const rz = rdiv(2.0, z);
        bry[1] = 1.0 / bry[0];
        bry[2] = DBL_MAX;
        let sa = cy[0];
        let sb = cy[1];
        let c1r = csr[iflag - 1];
        let ascle = bry[iflag - 1];
        let k = nd - 2;
        fn = k;
        for (let i = 3; i < nd + 1; i++) {
          const c = sb;
          sb = cadd(sa, cmul(csc(rz, fnu + fn), sb));
          sa = c;
          const c2n = csc(sb, c1r);
          y[k - 1] = c2n;
          k -= 1;
          fn -= 1.0;
          if (iflag < 3) {
            const c2m = Math.max(Math.abs(c2n[0]), Math.abs(c2n[1]));
            if (c2m > ascle) {
              iflag += 1;
              ascle = bry[iflag - 1];
              sa = csc(sa, c1r);
              sb = c2n;
              sa = csc(sa, css[iflag - 1]);
              sb = csc(sb, css[iflag - 1]);
              c1r = csr[iflag - 1];
            }
          }
        }
      }
      return { nw: nz, nlast };
    }
    // L50
    if (rs1 <= 0.0) {
      y[nd - 1] = [0, 0];
      nz += 1;
      nd -= 1;
      if (nd === 0) return { nw: nz, nlast };
      const nuf = uoik(z, fnu, kode, 1, nd, y, tol, elim, alim);
      if (nuf >= 0) {
        nd -= nuf;
        nz += nuf;
        if (nd === 0) return { nw: nz, nlast };
        fn = fnu + nd - 1;
        if (fn >= fnul) {
          inn = (inu + nd - 1) % 4;
          c2 = cmul(zar, cip[inn]);
          if (yy <= 0.0) c2 = conj(c2);
          continue;
        }
        nlast = nd;
        return { nw: nz, nlast };
      }
    }
    return { nw: -1, nlast };
  }
}

/**
 * K Bessel function for large order, uniform asymptotic expansion in the sector |arg z| <= 60 degrees (unik form),
 * with analytic continuation to the left half plane when mr is nonzero.  Returns nz or a negative failure code
 * (-1 overflow).  (ZUNK1)
 */
function unk1(z: C, fnu: number, kode: number, mr: number, n: number, y: C[], tol: number, elim: number, alim: number): number {
  const cscl = 1.0 / tol;
  const crsc = tol;
  const css = [cscl, 1.0, crsc];
  const csr = [crsc, 1.0, cscl];
  const cwrkArr: C[][] = [zeros(16), zeros(16), zeros(16)];
  const stArr: UnikState[] = [newUnikState(), newUnikState()];
  const cy: C[] = zeros(2);
  const bry = [THRESHOLD_MIN / tol, tol / THRESHOLD_MIN, DBL_MAX];

  let iflag = 0;
  let kdflg = 1;
  let kflag = 1;
  let fn = fnu;
  let nz = 0;
  const x = z[0];
  const zr = x < 0.0 ? cneg(z) : z;
  let dv = newUnikState();
  let j = 2;
  let i: number;
  let s1: C;
  let s2: C;
  let rs1: number;
  for (i = 1; i < n + 1; i++) {
    j = 3 - j; // j flip flops between 1, 2
    const jc = j - 1;
    fn = fnu + (i - 1);
    const st = stArr[jc];
    st.init = 0;
    unik(zr, fn, 2, 0, tol, st, cwrkArr[jc]);
    if (kode !== 1) {
      s1 = csub(st.zeta1, csc(cdiv([fn, 0], cadd(zr, st.zeta2)), fn));
    } else {
      s1 = csub(st.zeta1, st.zeta2);
    }
    rs1 = s1[0];
    let toL10 = false;
    if (Math.abs(rs1) <= elim) {
      if (kdflg === 1) kflag = 2;
      if (Math.abs(rs1) >= alim) {
        const aphi = cabs(st.phi);
        rs1 += Math.log(aphi);
        if (Math.abs(rs1) > elim) {
          toL10 = true;
        } else {
          if (kdflg === 1) kflag = 1;
          if (rs1 >= 0.0) {
            if (kdflg === 1) kflag = 3;
          }
        }
      }
      if (!toL10) {
        s2 = cmul(st.phi, st.sum);
        const c2m = Math.exp(s1[0]) * css[kflag - 1];
        s1 = csc([Math.cos(s1[1]), Math.sin(s1[1])], c2m);
        s2 = cmul(s2, s1);
        if (!(kflag === 1 && uchk(s2, bry[0], tol))) {
          cy[kdflg - 1] = s2;
          y[i - 1] = csc(s2, csr[kflag - 1]);
          if (kdflg === 2) break;
          kdflg = 2;
          continue;
        }
      }
    }
    // L10
    if (rs1 > 0.0) return -1;
    if (x < 0.0) return -1;
    kdflg = 1;
    y[i - 1] = [0, 0];
    nz += 1;
    if (i > 1) {
      if (y[i - 2][0] !== 0 || y[i - 2][1] !== 0) {
        y[i - 2] = [0, 0];
        nz += 1;
      }
    }
  }
  // Check for exhausted loop.
  if (i === n + 1) i = n;

  const rz = rdiv(2.0, zr);
  let ck = csc(rz, fn);
  let ib = i + 1;
  if (n >= ib) {
    fn = fnu + (n - 1);
    let ipard = 1;
    if (mr !== 0) ipard = 0;
    dv.init = 0;
    unik(zr, fn, 2, ipard, tol, dv, cwrkArr[2]);
    if (kode !== 1) {
      s1 = csub(dv.zeta1, csc(cdiv([fn, 0], cadd(zr, dv.zeta2)), fn));
    } else {
      s1 = csub(dv.zeta1, dv.zeta2);
    }
    rs1 = s1[0];
    let ok = false;
    if (Math.abs(rs1) <= elim) {
      if (Math.abs(rs1) < alim) {
        ok = true;
      } else {
        const aphi = cabs(dv.phi);
        rs1 += Math.log(aphi);
        if (Math.abs(rs1) < elim) ok = true;
      }
    }
    if (!ok) {
      if (rs1 > 0.0) return -1;
      if (x < 0.0) return -1;
      nz = n;
      for (let q = 0; q < n; q++) y[q] = [0, 0];
      return nz;
    }
    // L50
    s1 = cy[0];
    s2 = cy[1];
    let c1r = csr[kflag - 1];
    let ascle = bry[kflag - 1];
    for (i = ib; i < n + 1; i++) {
      const c2o = s2;
      s2 = cadd(cmul(ck, s2), s1);
      s1 = c2o;
      ck = cadd(ck, rz);
      const c2 = csc(s2, c1r);
      y[i - 1] = c2;
      if (kflag < 3) {
        const c2m = Math.max(Math.abs(c2[0]), Math.abs(c2[1]));
        if (c2m > ascle) {
          kflag += 1;
          ascle = bry[kflag - 1];
          s1 = csc(s1, c1r);
          s2 = c2;
          s1 = csc(s1, css[kflag - 1]);
          s2 = csc(s2, css[kflag - 1]);
          c1r = csr[kflag - 1];
        }
      }
    }
  }
  if (mr === 0) return nz;
  // Analytic continuation to the left half plane for the K function.
  nz = 0;
  const fmr = mr;
  const sgn = fmr < 0.0 ? M_PI : -M_PI;
  const csgn: C = [0.0, sgn];
  const inu = trunc(fnu);
  const fnf = fnu - inu;
  const ifn = inu + n - 1;
  const ang = fnf * sgn;
  let cspn: C = [Math.cos(ang), Math.sin(ang)];
  if (ifn % 2 === 1) cspn = cneg(cspn);
  const asc = bry[0];
  let kk = n;
  let iuf = 0;
  kdflg = 1;
  ib -= 1;
  const ic = ib - 1;
  let k: number;
  let c2: C;
  for (k = 1; k < n + 1; k++) {
    fn = fnu + (kk - 1);
    let m = 3;
    let useL70 = n <= 2;
    if (!useL70) {
      if (!(kk === n && ib < n)) {
        if (kk === ib || kk === ic) {
          useL70 = true;
        } else {
          dv.init = 0;
        }
      }
    }
    if (useL70) {
      // L70: reuse the stored expansion parameters of member j.
      dv = { ...stArr[j - 1] };
      m = j;
      j = 3 - j;
    }
    unik(zr, fn, 1, 0, tol, dv, cwrkArr[m - 1]);
    let skipTo100 = false;
    if (kode !== 1) {
      s1 = cadd(cneg(dv.zeta1), csc(cdiv([fn, 0], cadd(zr, dv.zeta2)), fn));
    } else {
      s1 = cadd(cneg(dv.zeta1), dv.zeta2);
    }
    rs1 = s1[0];
    s2 = [0, 0];
    if (Math.abs(rs1) > elim) {
      // L110
      if (rs1 > 0.0) return -1;
      skipTo100 = true;
    } else {
      if (kdflg === 1) iflag = 2;
      let toL110 = false;
      if (Math.abs(rs1) >= alim) {
        const aphi = cabs(dv.phi);
        rs1 += Math.log(aphi);
        if (Math.abs(rs1) > elim) {
          toL110 = true;
        } else {
          if (kdflg === 1) iflag = 1;
          if (rs1 >= 0.0) {
            if (kdflg === 1) iflag = 3;
          }
        }
      }
      if (toL110) {
        if (rs1 > 0.0) return -1;
        skipTo100 = true;
      }
    }
    if (!skipTo100) {
      s2 = cmul(cmul(csgn, dv.phi), dv.sum);
      const c2m = Math.exp(s1[0]) * css[iflag - 1];
      s1 = csc([Math.cos(s1[1]), Math.sin(s1[1])], c2m);
      s2 = cmul(s2, s1);
      if (iflag === 1) {
        if (uchk(s2, bry[0], tol)) s2 = [0, 0];
      }
    }
    // L100
    cy[kdflg - 1] = s2;
    c2 = s2;
    s2 = csc(s2, csr[iflag - 1]);
    s1 = y[kk - 1];
    if (kode !== 1) {
      const r = s1s2(zr, s1, s2, asc, alim, iuf);
      s1 = r.s1;
      s2 = r.s2;
      iuf = r.iuf;
      nz += r.nz;
    }
    y[kk - 1] = cadd(cmul(s1, cspn), s2);
    kk -= 1;
    cspn = cneg(cspn);
    if (c2[0] === 0 && c2[1] === 0) {
      kdflg = 1;
      continue;
    }
    if (kdflg === 2) break;
    kdflg = 2;
  }
  // Check for exhausted loop.
  if (k === n + 1) k -= 1;
  // L130
  const il = n - k;
  if (il === 0) return nz;
  s1 = cy[0];
  s2 = cy[1];
  let cs = csr[iflag - 1];
  let ascle = bry[iflag - 1];
  fn = inu + il;
  for (i = 1; i < il + 1; i++) {
    const c2o = s2;
    s2 = cadd(s1, cmul(csc(rz, fn + fnf), s2));
    s1 = c2o;
    fn -= 1.0;
    let c2n = csc(s2, cs);
    const ckk = c2n;
    let c1 = y[kk - 1];
    if (kode !== 1) {
      const r = s1s2(zr, c1, c2n, asc, alim, iuf);
      c1 = r.s1;
      c2n = r.s2;
      iuf = r.iuf;
      nz += r.nz;
    }
    y[kk - 1] = cadd(cmul(c1, cspn), c2n);
    kk -= 1;
    cspn = cneg(cspn);
    if (iflag < 3) {
      // The C++ source tests c2 (after s1s2) here; the Fortran, like unk2, tests the value before s1s2 (ckk).
      const c2m = Math.max(Math.abs(ckk[0]), Math.abs(ckk[1]));
      if (c2m > ascle) {
        iflag += 1;
        ascle = bry[iflag - 1];
        s1 = csc(s1, cs);
        s2 = ckk;
        s1 = csc(s1, css[iflag - 1]);
        s2 = csc(s2, css[iflag - 1]);
        cs = csr[iflag - 1];
      }
    }
  }
  return nz;
}

/**
 * K Bessel function for large order, uniform asymptotic expansion near the imaginary axis (Airy-function form, unhj),
 * with analytic continuation to the left half plane when mr is nonzero.  Same results as unk1.  (ZUNK2)
 */
function unk2(z: C, fnu: number, kode: number, mr: number, n: number, y: C[], tol: number, elim: number, alim: number): number {
  const cr1: C = [1.0, 1.73205080756887729]; // 1 + sqrt(3)i
  const cr2: C = [-0.5, -8.66025403784438647e-1]; // 0.5 cr1
  const aic = 1.26551212348464539; // log(2 sqrt(pi))
  const cip: C[] = [[1, 0], [-0, -1], [-1, 0], [0, 1]];
  const mi: C = [-0, -1]; // -i
  const cscl = 1.0 / tol;
  const crsc = tol;
  const css = [cscl, 1.0, crsc];
  const csr = [crsc, 1.0, cscl];
  const hs: UnhjResult[] = [];
  const cy: C[] = zeros(2);
  const bry = [THRESHOLD_MIN / tol, tol / THRESHOLD_MIN, DBL_MAX];

  let iflag = 0;
  let kdflg = 1;
  let kflag = 1;
  let fn = fnu;
  let nz = 0;
  const x = z[0];
  const zr = x < 0.0 ? cneg(z) : z;
  const yy = zr[1];
  let zn = cmul(cneg(zr), [0, 1]);
  let zb = zr;
  const inu = trunc(fnu);
  const fnf = fnu - inu;
  let ang = -M_PI_2 * fnf;
  const car = Math.cos(ang);
  const sar = Math.sin(ang);
  const cpn = M_PI_2 * car;
  const spn = M_PI_2 * sar;
  let c2: C = [spn, -cpn];
  let kk = (inu % 4) + 1;
  let cs = cmul(cmul(cr1, c2), cip[kk - 1]);
  if (yy <= 0.0) {
    zn = conj(cneg(zn));
    zb = conj(zb);
  }
  let j = 2;
  let i: number;
  let s1: C;
  let s2: C;
  let rs1: number;
  for (i = 1; i < n + 1; i++) {
    j = 3 - j;
    fn = fnu + (i - 1);
    const h = unhj(zn, fn, 0, tol);
    hs[j - 1] = h;
    if (kode !== 1) {
      s1 = csub(h.zeta1, csc(cdiv([fn, 0], cadd(zb, h.zeta2)), fn));
    } else {
      s1 = csub(h.zeta1, h.zeta2);
    }
    rs1 = s1[0];
    let toL70 = false;
    if (Math.abs(rs1) <= elim) {
      if (kdflg === 1) kflag = 2;
      if (Math.abs(rs1) >= alim) {
        const aphi = cabs(h.phi);
        const aarg = cabs(h.arg);
        rs1 += Math.log(aphi) - 0.25 * Math.log(aarg) - aic;
        if (Math.abs(rs1) > elim) {
          toL70 = true;
        } else {
          if (kdflg === 1) kflag = 1;
          if (rs1 >= 0.0) {
            if (kdflg === 1) kflag = 3;
          }
        }
      }
      if (!toL70) {
        c2 = cmul(h.arg, cr2);
        const ai = airy(c2, 0, 2).v;
        const dai = airy(c2, 1, 2).v;
        s2 = cmul(cmul(cs, h.phi), cadd(cmul(ai, h.asum), cmul(cmul(cr2, dai), h.bsum)));
        const c2m = Math.exp(s1[0]) * css[kflag - 1];
        s1 = csc([Math.cos(s1[1]), Math.sin(s1[1])], c2m);
        s2 = cmul(s2, s1);
        if (kflag === 1) {
          if (uchk(s2, bry[0], tol)) toL70 = true;
        }
        if (!toL70) {
          if (yy <= 0.0) s2 = conj(s2);
          cy[kdflg - 1] = s2;
          y[i - 1] = csc(s2, csr[kflag - 1]);
          cs = cmul(cs, mi);
          if (kdflg === 2) break;
          kdflg = 2;
          continue;
        }
      }
    } else {
      toL70 = true;
    }
    // L70
    if (rs1 > 0.0) return -1;
    // For x < 0 the I function to be added will overflow.
    if (x < 0.0) return -1;
    kdflg = 1;
    y[i - 1] = [0, 0];
    cs = cmul(cs, mi);
    nz += 1;
    if (i !== 1) {
      if (y[i - 2][0] !== 0 || y[i - 2][1] !== 0) {
        y[i - 2] = [0, 0];
        nz += 1;
      }
    }
  }
  // Check for exhausted loop.
  if (i === n + 1) i = n;

  const rz = rdiv(2.0, zr);
  let ck = csc(rz, fn);
  let ib = i + 1;
  let dh: UnhjResult | null = null;
  if (n >= ib) {
    fn = fnu + (n - 1);
    let ipard = 1;
    if (mr !== 0) ipard = 0;
    dh = unhj(zn, fn, ipard, tol);
    if (kode !== 1) {
      s1 = csub(dh.zeta1, csc(cdiv([fn, 0], cadd(zb, dh.zeta2)), fn));
    } else {
      s1 = csub(dh.zeta1, dh.zeta2);
    }
    rs1 = s1[0];
    let ok = false;
    if (Math.abs(rs1) <= elim) {
      if (Math.abs(rs1) < alim) {
        ok = true;
      } else {
        const aphi = cabs(dh.phi);
        rs1 += Math.log(aphi);
        if (Math.abs(rs1) < elim) ok = true;
      }
    }
    if (!ok) {
      if (rs1 > 0.0) return -1;
      if (x < 0.0) return -1;
      nz = n;
      for (let q = 0; q < n; q++) y[q] = [0, 0];
      return nz;
    }
    // L120
    s1 = cy[0];
    s2 = cy[1];
    let c1r = csr[kflag - 1];
    let ascle = bry[kflag - 1];
    for (i = ib; i < n + 1; i++) {
      const c2o = s2;
      s2 = cadd(cmul(ck, s2), s1);
      s1 = c2o;
      ck = cadd(ck, rz);
      const c2n = csc(s2, c1r);
      y[i - 1] = c2n;
      if (kflag < 3) {
        const c2m = Math.max(Math.abs(c2n[0]), Math.abs(c2n[1]));
        if (c2m > ascle) {
          kflag += 1;
          ascle = bry[kflag - 1];
          s1 = csc(s1, c1r);
          s2 = c2n;
          s1 = csc(s1, css[kflag - 1]);
          s2 = csc(s2, css[kflag - 1]);
          c1r = csr[kflag - 1];
        }
      }
    }
  }
  if (mr === 0) return nz;
  // Analytic continuation to the left half plane for the K function.
  nz = 0;
  const fmr = mr;
  const sgn = fmr < 0.0 ? M_PI : -M_PI;
  let csgn: C = [0.0, sgn];
  if (yy <= 0.0) csgn = cneg(csgn);
  const ifn = inu + n - 1;
  ang = fnf * sgn;
  let cspn: C = [Math.cos(ang), Math.sin(ang)];
  if (ifn % 2 === 1) cspn = cneg(cspn);
  cs = cmul([car, -sar], csgn);
  const inx = (ifn % 4) + 1;
  c2 = cip[inx - 1];
  cs = cmul(cs, conj(c2));
  const asc = bry[0];
  let iuf = 0;
  kk = n;
  kdflg = 1;
  ib -= 1;
  const ic = ib - 1;
  let k: number;
  for (k = 1; k < n + 1; k++) {
    fn = fnu + (kk - 1);
    let useL172 = n <= 2;
    if (!useL172) {
      if (!(kk === n && ib < n)) {
        if (kk === ib || kk === ic) {
          useL172 = true;
        } else {
          dh = unhj(zn, fn, 0, tol);
        }
      }
    }
    if (useL172) {
      dh = hs[j - 1];
      j = 3 - j;
    }
    const d = dh as UnhjResult;
    if (kode !== 1) {
      s1 = cadd(cneg(d.zeta1), csc(cdiv([fn, 0], cadd(zb, d.zeta2)), fn));
    } else {
      s1 = cadd(cneg(d.zeta1), d.zeta2);
    }
    rs1 = s1[0];
    s2 = [0, 0];
    let zeroIt = false;
    if (Math.abs(rs1) > elim) {
      if (rs1 > 0.0) return -1;
      zeroIt = true;
    } else {
      if (kdflg === 1) iflag = 2;
      if (Math.abs(rs1) >= alim) {
        const aphi = cabs(d.phi);
        const aarg = cabs(d.arg);
        rs1 += Math.log(aphi) - 0.25 * Math.log(aarg) - aic;
        if (Math.abs(rs1) > elim) {
          if (rs1 > 0.0) return -1;
          zeroIt = true;
        } else {
          if (kdflg === 1) iflag = 1;
          if (rs1 >= 0.0) {
            if (kdflg === 1) iflag = 3;
          }
        }
      }
    }
    if (!zeroIt) {
      const ai = airy(d.arg, 0, 2).v;
      const dai = airy(d.arg, 1, 2).v;
      s2 = cmul(cmul(cs, d.phi), cadd(cmul(ai, d.asum), cmul(dai, d.bsum)));
      const c2m = Math.exp(s1[0]) * css[iflag - 1];
      s1 = csc([Math.cos(s1[1]), Math.sin(s1[1])], c2m);
      s2 = cmul(s2, s1);
      if (iflag === 1) {
        if (uchk(s2, bry[0], tol)) s2 = [0, 0];
      }
    }
    // L250
    if (yy <= 0.0) s2 = conj(s2);
    cy[kdflg - 1] = s2;
    const c2v = s2;
    s2 = csc(s2, csr[iflag - 1]);
    s1 = y[kk - 1];
    if (kode !== 1) {
      const r = s1s2(zr, s1, s2, asc, alim, iuf);
      s1 = r.s1;
      s2 = r.s2;
      iuf = r.iuf;
      nz += r.nz;
    }
    y[kk - 1] = cadd(cmul(s1, cspn), s2);
    kk -= 1;
    cspn = cneg(cspn);
    cs = cmul(cs, mi);
    if (c2v[0] === 0 && c2v[1] === 0) {
      kdflg = 1;
      continue;
    }
    if (kdflg === 2) break;
    kdflg = 2;
  }
  // Check for exhausted loop.
  if (k === n + 1) k = n;
  const il = n - k;
  if (il === 0) return nz;
  s1 = cy[0];
  s2 = cy[1];
  let csv = csr[iflag - 1];
  let ascle = bry[iflag - 1];
  fn = inu + il;
  for (i = 1; i < il + 1; i++) {
    const c2o = s2;
    s2 = cadd(s1, cmul(csc(rz, fn + fnf), c2o));
    s1 = c2o;
    fn -= 1.0;
    let c2n = csc(s2, csv);
    const ckk = c2n;
    let c1 = y[kk - 1];
    if (kode !== 1) {
      const r = s1s2(zr, c1, c2n, asc, alim, iuf);
      c1 = r.s1;
      c2n = r.s2;
      iuf = r.iuf;
      nz += r.nz;
    }
    y[kk - 1] = cadd(cmul(c1, cspn), c2n);
    kk -= 1;
    cspn = cneg(cspn);
    if (iflag < 3) {
      const c2m = Math.max(Math.abs(ckk[0]), Math.abs(ckk[1]));
      if (c2m > ascle) {
        iflag += 1;
        ascle = bry[iflag - 1];
        s1 = csc(s1, csv);
        s2 = ckk;
        s1 = csc(s1, css[iflag - 1]);
        s2 = csc(s2, css[iflag - 1]);
        csv = csr[iflag - 1];
      }
    }
  }
  return nz;
}

/**
 * Tests for underflow or overflow of the I (ikflg = 1) or K (ikflg = 2) function of order fnu+k, k = 0..n-1, using
 * the uniform asymptotic expansion; the members that underflow are set to zero.  Returns the number of underflowed
 * members, or -1 if the first member would overflow.  (ZUOIK)
 */
function uoik(z: C, fnu: number, kode: number, ikflg: number, n: number, y: C[], tol: number, elim: number, alim: number): number {
  const aic = 1.265512123484645396;
  const cwrk = zeros(16);
  let nuf = 0;
  let nn = n;
  const x = z[0];
  const zr = x < 0 ? cneg(z) : z;
  const zb = zr;
  const yy = zr[1];
  let ax = Math.abs(x) * Math.sqrt(3.0);
  let ay = Math.abs(yy);
  let iform = 1;
  if (ay > ax) iform = 2;
  let gnu = Math.max(fnu, 1.0);
  if (ikflg !== 1) {
    const fnn = nn;
    const gnn = fnu + fnn - 1;
    gnu = Math.max(gnn, fnn);
  }
  const st = newUnikState();
  let phi: C;
  let arg: C = [0, 0];
  let cz: C;
  let aarg = 0;
  let zn: C = [0, 0];
  if (iform !== 2) {
    st.init = 0;
    unik(zr, gnu, ikflg, 1, tol, st, cwrk);
    phi = st.phi;
    cz = cadd(cneg(st.zeta1), st.zeta2);
  } else {
    zn = cmul(cneg(zr), [0, 1]);
    if (yy <= 0.0) zn = [-zn[0], zn[1]];
    const h = unhj(zn, gnu, 1, tol);
    phi = h.phi;
    arg = h.arg;
    cz = csub(h.zeta2, h.zeta1);
    aarg = cabs(arg);
  }
  if (kode === 2) cz = csub(cz, zb);
  if (ikflg === 2) cz = cneg(cz);
  let aphi = cabs(phi);
  let rcz = cz[0];

  const zeroAll = (): number => {
    for (let i = 0; i < nn; i++) y[i] = [0, 0];
    return nn;
  };
  // Overflow test.
  if (rcz > elim) return -1;
  if (rcz >= alim) {
    rcz += Math.log(aphi);
    if (iform === 2) rcz -= 0.25 * Math.log(aarg) + aic;
    if (rcz > elim) return -1;
  } else {
    // Underflow test.
    if (rcz >= -elim) {
      if (rcz > -alim) {
        // Pass.
      } else {
        rcz += Math.log(aphi);
        if (iform === 2) rcz -= 0.25 * Math.log(aarg) + aic;
        if (rcz > -elim) {
          const ascle = THRESHOLD_MIN / tol;
          cz = cadd(cz, clog(phi));
          if (iform !== 1) {
            const la = clog(arg);
            cz = [cz[0] - (0.25 * la[0] + aic), cz[1] - 0.25 * la[1]];
          }
          ax = Math.exp(rcz) / tol;
          ay = cz[1];
          // The C++ source has cz = ax * exp(ay) (a real number) here; the Fortran, and the later loop, use
          // ax * (cos(ay) + i sin(ay)).
          cz = [ax * Math.cos(ay), ax * Math.sin(ay)];
          if (uchk(cz, ascle, tol)) return zeroAll();
        } else {
          return zeroAll();
        }
      }
    } else {
      return zeroAll();
    }
  }
  if (ikflg === 2 || n === 1) return nuf;
  for (;;) {
    gnu = fnu + (nn - 1);
    if (iform !== 2) {
      st.init = 0;
      unik(zr, gnu, ikflg, 1, tol, st, cwrk);
      phi = st.phi;
      cz = csub(st.zeta2, st.zeta1);
    } else {
      const h = unhj(zn, gnu, 1, tol);
      phi = h.phi;
      arg = h.arg;
      cz = csub(h.zeta2, h.zeta1);
      // The C++ source uses abs(phi) here; the Fortran uses abs(arg).
      aarg = cabs(arg);
    }
    if (kode === 2) cz = csub(cz, zb);
    aphi = cabs(phi);
    rcz = cz[0];
    if (rcz >= -elim) {
      if (rcz > -alim) return nuf;
      rcz += Math.log(aphi);
      if (iform === 2) rcz -= 0.25 * Math.log(aarg) + aic;
      if (rcz > -elim) {
        const ascle = THRESHOLD_MIN / tol;
        cz = cadd(cz, clog(phi));
        if (iform !== 1) {
          const la = clog(arg);
          cz = [cz[0] - (0.25 * la[0] + aic), cz[1] - 0.25 * la[1]];
        }
        ax = Math.exp(rcz) / tol;
        ay = cz[1];
        cz = [ax * Math.cos(ay), ax * Math.sin(ay)];
        if (!uchk(cz, ascle, tol)) return nuf;
      }
    }
    y[nn - 1] = [0, 0];
    nn -= 1;
    nuf += 1;
    if (nn === 0) return nuf;
  }
}

/**
 * Computes the I Bessel function for Re z >= 0 by the Wronskian method: ratios from rati combined with the K
 * function and its successor.  cw holds the two K values.  Returns nz (0) or a negative failure code.  (ZWRSK)
 */
function wrsk(zr: C, fnu: number, kode: number, n: number, y: C[], cw: C[], tol: number, elim: number, alim: number): number {
  const nz = 0;
  const nw = bknu(zr, fnu, kode, 2, cw, tol, elim, alim);
  if (nw !== 0) return nw === -2 ? -2 : -1;
  rati(zr, fnu, n, y, tol);
  let cinu: C = [1, 0];
  if (kode !== 1) {
    const yy = zr[1];
    cinu = [Math.cos(yy), Math.sin(yy)];
  }
  const acw = cabs(cw[1]);
  let ascle = THRESHOLD_MIN / tol;
  let cscl = 1.0;
  if (acw <= ascle) {
    cscl = 1.0 / tol;
  } else {
    ascle = 1.0 / ascle;
    if (acw >= ascle) cscl = tol;
  }
  const c1 = csc(cw[0], cscl);
  const c2 = csc(cw[1], cscl);
  let st = y[0];
  let ct = cmul(zr, cadd(c2, cmul(st, c1)));
  const act = cabs(ct);
  const rct = 1.0 / act;
  ct = csc(conj(ct), rct);
  cinu = cmul(cinu, csc(ct, rct));
  y[0] = csc(cinu, cscl);
  if (n === 1) return nz;
  for (let i = 2; i < n + 1; i++) {
    cinu = cmul(cinu, st);
    st = y[i - 1];
    y[i - 1] = csc(cinu, cscl);
  }
  return nz;
}
