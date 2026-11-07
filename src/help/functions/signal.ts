import type { Entry } from '../types.js';

// ── Fourier transforms ───────────────────────────────────────────────────────────────────────────

const FOURIER: Entry[] = [
  {
    name: 'fft', group: 'Fourier transforms', usage: 'fft(v)', mathcad: true,
    summary: 'The first half of the spectrum of 2^m real values, scaled by 1/√n.',
    details: [
      'v is a column vector of real values, 8 or more of them, and their number n must be a power of two (8, 16, 32…). The result has n/2 + 1 complex values, for frequencies 0 up to the Nyquist frequency; the other half is their mirror image, so it is left out.',
      'Uses a positive exponent, e^(+2πi·jk/n), and scales by 1/√n. [[FFT]] differs: it uses a negative exponent and scales by 1/n, so its first value is the mean. [[ifft]] takes the result back. For any length, or complex values, use [[cfft]].',
    ],
    units: 'The result has the units of v.',
    errors: ['A vector with fewer than 8 values, or a length that is not a power of two.', 'Complex values (use [[cfft]]), or anything but a column vector.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\1\\\\1\\\\1\\\\1\\\\1\\\\1\\\\1\\end{pmatrix}', '\\mathrm{fft}\\left(v\\right)='],
  },
  {
    name: 'FFT', group: 'Fourier transforms', usage: 'FFT(v)', mathcad: true,
    summary: 'The first half of the spectrum of 2^m real values, scaled by 1/n, so the first value is the mean.',
    details: [
      'Takes the same vectors as [[fft]], and gives the same n/2 + 1 values, but uses a negative exponent, e^(−2πi·jk/n), and scales by 1/n instead of 1/√n. The first value is therefore the mean of v, and a sine of amplitude 1 shows as a peak of 1/2. [[IFFT]] takes the result back.',
    ],
    units: 'The result has the units of v.',
    errors: ['A vector with fewer than 8 values, or a length that is not a power of two.', 'Complex values (use [[CFFT]]), or anything but a column vector.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\3\\\\1\\\\3\\\\1\\\\3\\\\1\\\\3\\end{pmatrix}', '\\mathrm{FFT}\\left(v\\right)='],
  },
  {
    name: 'ifft', group: 'Fourier transforms', usage: 'ifft(w)', mathcad: true,
    summary: 'The 2^m real values whose [[fft]] is the half spectrum w.',
    details: [
      'w is a column vector of 2^(m−1) + 1 values (5, 9, 17, 33…), the half spectrum that [[fft]] gives. The other half is filled in as the complex conjugate mirror image, so the result is real and has 2^m values. Uses a negative exponent and scales by 1/√n, the reverse of [[fft]]. It does not undo [[FFT]], which scales differently: use [[IFFT]] for that.',
    ],
    units: 'The result has the units of w.',
    errors: ['A length other than 2^m + 1, such as 4 or 10.', 'Anything but a column vector.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\\\6\\\\7\\\\8\\end{pmatrix}', '\\mathrm{ifft}\\left(\\mathrm{fft}\\left(v\\right)\\right)='],
  },
  {
    name: 'IFFT', group: 'Fourier transforms', usage: 'IFFT(w)', mathcad: true,
    summary: 'The 2^m real values whose [[FFT]] is the half spectrum w.',
    details: [
      'w is a column vector of 2^(m−1) + 1 values (5, 9, 17, 33…), as [[FFT]] gives. The other half is filled in as the complex conjugate mirror image, so the result is real and has 2^m values. Uses a positive exponent and no scaling, the reverse of [[FFT]]. It does not undo [[fft]], which scales differently: use [[ifft]] for that.',
    ],
    units: 'The result has the units of w.',
    errors: ['A length other than 2^m + 1, such as 4 or 10.', 'Anything but a column vector.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\2\\\\3\\\\4\\\\5\\\\6\\\\7\\\\8\\end{pmatrix}', '\\mathrm{IFFT}\\left(\\mathrm{FFT}\\left(v\\right)\\right)='],
  },
  {
    name: 'cfft', group: 'Fourier transforms', usage: 'cfft(A)', mathcad: true,
    summary: 'The complex Fourier transform of a vector or matrix of any size, scaled by 1/√n.',
    details: [
      'A can hold real or complex values, and any number of them: no power of two is needed. The result has the same size as A and holds every frequency. For a matrix the transform is two-dimensional, taken down each column and then along each row, and n is the total number of elements.',
      'Uses a positive exponent and scales by 1/√n, as [[fft]] does. [[CFFT]] differs: it uses a negative exponent and scales by 1/n. [[icfft]] takes the result back.',
    ],
    units: 'The result has the units of A.',
    errors: ['Nested arrays or text, or an empty array.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\1\\\\1\\\\1\\end{pmatrix}', '\\mathrm{cfft}\\left(v\\right)='],
  },
  {
    name: 'CFFT', group: 'Fourier transforms', usage: 'CFFT(A)', mathcad: true,
    summary: 'The complex Fourier transform of a vector or matrix of any size, scaled by 1/n, so the first value is the mean.',
    details: [
      'Takes the same arrays as [[cfft]], of any size and real or complex, and gives every frequency. Uses a negative exponent and scales by 1/n instead of 1/√n, so the first value is the mean of A. [[ICFFT]] takes the result back.',
    ],
    units: 'The result has the units of A.',
    errors: ['Nested arrays or text, or an empty array.'],
    example: ['v\\coloneq \\begin{pmatrix}1\\\\3\\\\1\\\\3\\end{pmatrix}', '\\mathrm{CFFT}\\left(v\\right)='],
  },
  {
    name: 'icfft', group: 'Fourier transforms', usage: 'icfft(A)', mathcad: true,
    summary: 'The inverse of [[cfft]]: a negative exponent and a 1/√n scale.',
    details: ['Takes a vector or matrix of any size, real or complex, and gives the same size. `icfft(cfft(A))` is A again, apart from rounding in the last digits. It does not undo [[CFFT]], which scales differently: use [[ICFFT]] for that.'],
    units: 'The result has the units of A.',
    errors: ['Nested arrays or text, or an empty array.'],
    example: ['w\\coloneq \\begin{pmatrix}2\\\\0\\\\0\\\\0\\end{pmatrix}', '\\mathrm{icfft}\\left(w\\right)='],
  },
  {
    name: 'ICFFT', group: 'Fourier transforms', usage: 'ICFFT(A)', mathcad: true,
    summary: 'The inverse of [[CFFT]]: a positive exponent and no scaling.',
    details: ['Takes a vector or matrix of any size, real or complex, and gives the same size. `ICFFT(CFFT(A))` is A again, apart from rounding in the last digits. It does not undo [[cfft]], which scales differently: use [[icfft]] for that.'],
    units: 'The result has the units of A.',
    errors: ['Nested arrays or text, or an empty array.'],
    example: ['w\\coloneq \\begin{pmatrix}2\\\\0\\\\0\\\\0\\end{pmatrix}', '\\mathrm{ICFFT}\\left(w\\right)='],
  },
];

// ── Signal processing ────────────────────────────────────────────────────────────────────────────

const FIR_NOTE = 'A frequency is a fraction of the sample rate, from 0 to 0.5, where 0.5 is the Nyquist frequency. Typing `fc/fs` with both in Hz gives that fraction.';
const FIR_UNITS = 'Cutoffs are plain fractions of the sample rate: divide by the sample rate, as `fc/fs`. A frequency with units is refused.';

const SIGNAL_PROCESSING: Entry[] = [
  {
    name: 'convolve', group: 'Signal processing', usage: 'convolve(a, b)', mathcad: false,
    summary: 'The full convolution of two vectors, which has one value fewer than their lengths added.',
    details: ['Element k is the sum of a_i·b_(k−i). For vectors of lengths m and n the result is a column of m + n − 1 values. Convolving a signal with a filter\'s coefficients is how an FIR filter acts; [[applyFilter]] does that and keeps the signal\'s length. Complex values are accepted. Long vectors use the FFT inside.'],
    units: 'Units multiply, so a voltage convolved with a plain filter stays in volts.',
    errors: ['Anything that is not a vector, an empty vector, or nested arrays.'],
    example: ['\\mathrm{convolve}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},\\begin{pmatrix}1\\\\1\\end{pmatrix}\\right)='],
  },
  {
    name: 'correlate', group: 'Signal processing', usage: 'correlate(a, b)', mathcad: false,
    summary: 'The cross-correlation of two vectors at every lag.',
    details: [
      'The result is a column of m + n − 1 values for vectors of lengths m and n, covering lags from −(n − 1) to m − 1. Element k is the sum of a_(i+k)·conj(b_i), the second vector being conjugated if it is complex. Correlating a vector with itself puts lag 0 in the middle, and that is its largest value.',
    ],
    units: 'Units multiply.',
    errors: ['Anything that is not a vector, an empty vector, or nested arrays.'],
    example: ['\\mathrm{correlate}\\left(\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix},\\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}\\right)='],
  },
  {
    name: 'hannWindow', group: 'Signal processing', usage: 'hannWindow(n)', mathcad: false,
    summary: 'A Hann window of n points: a raised cosine that falls to 0 at both ends.',
    details: ['The window is symmetric, so its first and last points match, as a filter design wants. Multiply a signal by it, element by element, to reduce leakage in a spectrum. n is a whole number, 1 or more; a window of 1 point is 1.'],
    errors: ['An n that is not a whole number of 1 or more.'],
    example: ['\\mathrm{hannWindow}\\left(5\\right)='],
  },
  {
    name: 'hammingWindow', group: 'Signal processing', usage: 'hammingWindow(n)', mathcad: false,
    summary: 'A Hamming window of n points: a raised cosine that falls to 0.08 at both ends.',
    details: ['The window is symmetric, so its first and last points match. It is the default window of the FIR design functions such as [[firLowpass]]. n is a whole number, 1 or more; a window of 1 point is 1.'],
    errors: ['An n that is not a whole number of 1 or more.'],
    example: ['\\mathrm{hammingWindow}\\left(5\\right)='],
  },
  {
    name: 'blackmanWindow', group: 'Signal processing', usage: 'blackmanWindow(n)', mathcad: false,
    summary: 'A Blackman window of n points: a three-term cosine window with low side lobes.',
    details: ['The window is symmetric, so its first and last points match, and both are about 0. It gives lower leakage than [[hannWindow]] or [[hammingWindow]] but a wider main lobe. n is a whole number, 1 or more; a window of 1 point is 1.'],
    errors: ['An n that is not a whole number of 1 or more.'],
    example: ['\\mathrm{blackmanWindow}\\left(5\\right)='],
  },
  {
    name: 'kaiserWindow', group: 'Signal processing', usage: 'kaiserWindow(n, β)', mathcad: false,
    summary: 'A Kaiser window of n points, whose shape β sets from a rectangle to a narrow bell.',
    details: ['The window is symmetric, with a value of 1 in the middle. β = 0 gives a rectangle, all 1; larger β lowers the side lobes and widens the main lobe. Around 5 is like a [[hammingWindow]], and 8.6 like a [[blackmanWindow]]. n is a whole number, 1 or more.'],
    errors: ['An n that is not a whole number of 1 or more.', 'A negative β.'],
    example: ['\\mathrm{kaiserWindow}\\left(5,0\\right)=', '\\mathrm{kaiserWindow}\\left(5,5\\right)='],
  },
  {
    name: 'firLowpass', group: 'Signal processing', usage: 'firLowpass(n, fc, [window])', mathcad: false,
    summary: 'The n coefficients of a windowed-sinc low-pass FIR filter with cutoff fc.',
    details: [
      FIR_NOTE,
      'The result is a column of n coefficients, scaled so the gain at frequency 0 is exactly 1. The window is a vector of n points, as [[hannWindow]] gives; without one, a Hamming window is used. More taps give a sharper cutoff. The filter has a linear phase, and a delay of (n − 1)/2 samples. Use it with [[applyFilter]] or [[zeroPhaseFilter]], or look at it with [[freqResponse]].',
    ],
    units: FIR_UNITS,
    errors: ['A number of taps that is not a whole number of 1 or more.', 'A cutoff at or beyond 0 or 0.5.', 'A window whose length is not n.'],
    example: ['h\\coloneq \\mathrm{firLowpass}\\left(5,0.25\\right)', '\\mathrm{freqResponse}\\left(h,0\\right)='],
  },
  {
    name: 'firHighpass', group: 'Signal processing', usage: 'firHighpass(n, fc, [window])', mathcad: false,
    summary: 'The n coefficients of a windowed-sinc high-pass FIR filter with cutoff fc.',
    details: [
      FIR_NOTE,
      'The result is a column of n coefficients, scaled so the gain at the Nyquist frequency is exactly 1. n must be odd, because a filter with an even number of taps cannot pass the Nyquist frequency. The window is a vector of n points; without one, a Hamming window is used.',
    ],
    units: FIR_UNITS,
    errors: ['An even number of taps.', 'A cutoff at or beyond 0 or 0.5.', 'A window whose length is not n.'],
    example: ['h\\coloneq \\mathrm{firHighpass}\\left(5,0.25\\right)', '\\left|\\mathrm{freqResponse}\\left(h,0.5\\right)\\right|='],
  },
  {
    name: 'firBandpass', group: 'Signal processing', usage: 'firBandpass(n, f1, f2, [window])', mathcad: false,
    summary: 'The n coefficients of a windowed-sinc band-pass FIR filter passing f1 to f2.',
    details: [
      FIR_NOTE,
      'The result is a column of n coefficients, scaled so the gain at the middle of the band is exactly 1. f2 must be above f1. The window is a vector of n points; without one, a Hamming window is used.',
    ],
    units: FIR_UNITS,
    errors: ['A number of taps that is not a whole number of 1 or more.', 'An edge at or beyond 0 or 0.5, or f2 not above f1.', 'A window whose length is not n.'],
    example: ['h\\coloneq \\mathrm{firBandpass}\\left(7,0.1,0.3\\right)', '\\left|\\mathrm{freqResponse}\\left(h,0.2\\right)\\right|='],
  },
  {
    name: 'firBandstop', group: 'Signal processing', usage: 'firBandstop(n, f1, f2, [window])', mathcad: false,
    summary: 'The n coefficients of a windowed-sinc band-stop FIR filter rejecting f1 to f2.',
    details: [
      FIR_NOTE,
      'The result is a column of n coefficients, scaled so the gain at frequency 0 is exactly 1. n must be odd, because the filter passes the Nyquist frequency as well. f2 must be above f1. The window is a vector of n points; without one, a Hamming window is used.',
    ],
    units: FIR_UNITS,
    errors: ['An even number of taps.', 'An edge at or beyond 0 or 0.5, or f2 not above f1.', 'A window whose length is not n.'],
    example: ['h\\coloneq \\mathrm{firBandstop}\\left(7,0.1,0.3\\right)', '\\mathrm{freqResponse}\\left(h,0\\right)='],
  },
  {
    name: 'applyFilter', group: 'Signal processing', usage: 'applyFilter(filter, x)', mathcad: false,
    summary: 'Runs the signal x through a filter, once, forward in time, starting from rest.',
    details: [
      'The filter is a vector of FIR coefficients b, or a vector of two vectors (b; a) for an IIR filter, as the design functions such as [[butterLowpass]] give. The result has the length of x and the same delay the filter has. If x is a matrix, each column is a channel and is filtered separately; a row vector counts as one channel. For no delay, use [[zeroPhaseFilter]].',
    ],
    units: 'The result has the units of x. The coefficients must be plain numbers.',
    errors: ['A filter that is not a coefficient vector or a pair (b; a), or whose first a is 0.', 'A signal with complex values or text.'],
    example: ['x\\coloneq \\begin{pmatrix}1\\\\1\\\\1\\\\1\\end{pmatrix}', '\\mathrm{applyFilter}\\left(\\begin{pmatrix}0.5\\\\0.5\\end{pmatrix},x\\right)='],
  },
  {
    name: 'zeroPhaseFilter', group: 'Signal processing', usage: 'zeroPhaseFilter(filter, x)', mathcad: false,
    summary: 'Filters x forward and then backward, so the result has no delay and the filter\'s gain is squared.',
    details: [
      'The filter is as for [[applyFilter]]. Running it both ways cancels the phase shift, so features of the signal stay where they are, but the gain in dB doubles: a -3 dB cutoff becomes -6 dB. The ends are padded by reflection to keep the starting transients small. If x is a matrix, each column is filtered separately.',
    ],
    units: 'The result has the units of x. The coefficients must be plain numbers.',
    errors: ['A signal with 3 times the filter\'s length of values or fewer.', 'A filter that is not a coefficient vector or a pair (b; a).'],
    example: ['x\\coloneq \\begin{pmatrix}2\\\\2\\\\2\\\\2\\\\2\\\\2\\\\2\\\\2\\end{pmatrix}', '\\mathrm{zeroPhaseFilter}\\left(\\begin{pmatrix}0.5\\\\0.5\\end{pmatrix},x\\right)='],
  },
  {
    name: 'medsmooth', group: 'Signal processing', usage: 'medsmooth(y, n)', mathcad: true,
    summary: 'A running median of y over a window of n points, which removes spikes and keeps edges.',
    details: ['n is odd. Each value is replaced by the median of the n values centred on it. At the ends the window is cut short rather than padded, so the first and last values are medians of fewer points.'],
    units: 'The result has the units of y.',
    errors: ['An even window, or one less than 1.'],
    example: ['y\\coloneq \\begin{pmatrix}2\\\\2\\\\9\\\\2\\\\2\\end{pmatrix}', '\\mathrm{medsmooth}\\left(y,3\\right)='],
  },
  {
    name: 'unwrapPhase', group: 'Signal processing', usage: 'unwrapPhase(φ)', mathcad: false,
    summary: 'Removes the jumps of 2π from a vector of phase angles.',
    details: ['Where two neighbours differ by π or more, a multiple of 2π is added to this value and all after it, so the phase is continuous. Angles are in radians. To unwrap a response, take its `arg` first: `unwrapPhase(arg(H))`.'],
    errors: ['Complex values.', 'Anything that is not a vector.'],
    example: ['\\mathrm{unwrapPhase}\\left(\\begin{pmatrix}0\\\\3\\\\-3\\\\0\\end{pmatrix}\\right)='],
  },
  {
    name: 'freqResponse', group: 'Signal processing', usage: 'freqResponse(system, f)', mathcad: false,
    summary: 'The complex gain H of a filter or system at frequency f, or at each frequency of a vector.',
    details: [
      'The system is a vector of coefficients b, or a pair (b; a), with the constant term first, as [[butterLowpass]] and the other design functions give. How f is written decides the kind. A plain number is a **digital** filter and f is a fraction of the sample rate: H = Σ b_k·e^(−2πi·f·k) / Σ a_k·e^(−2πi·f·k). A frequency in Hz is an **analog** system, H(s) at s = 2πi·f, with coefficients of s.',
      'The result is complex: its magnitude is the gain (see [[ampToDb]] for decibels) and `arg` is the phase. A vector of frequencies gives a vector of values.',
    ],
    units: 'Frequencies are plain fractions for a digital filter, or in Hz for an analog one. The result has no units.',
    errors: ['A frequency with units other than Hz for a digital filter, or plain numbers mixed with units for an analog one.', 'A system that is not a coefficient vector or a pair (b; a).'],
    example: ['h\\coloneq \\begin{pmatrix}0.5\\\\0.5\\end{pmatrix}', '\\mathrm{freqResponse}\\left(h,0\\right)=', '\\left|\\mathrm{freqResponse}\\left(h,0.25\\right)\\right|='],
  },
  {
    name: 'impulseResponse', group: 'Signal processing', usage: 'impulseResponse(system, t)', mathcad: false,
    summary: 'The output of a system, started at rest, after an impulse at time 0, at time t or at each time of a vector.',
    details: [
      'The system is a vector b, or a pair (b; a), as for [[freqResponse]]. Times with units, such as `2·s`, treat it as an **analog** H(s) with coefficients of s; plain whole numbers are sample numbers 0, 1, 2… of a **digital** filter, whose impulse is a single 1 at sample 0.',
      'For an analog system, the impulse is the response to a unit area spike. A direct feed-through term in H(s) is left out of the impulse response. [[stepResponse]] gives the response to a constant 1.',
    ],
    units: 'Times in seconds for an analog system; plain sample numbers for a digital one. The result has no units.',
    errors: ['An analog system whose numerator is of higher degree than its denominator.', 'Plain numbers that are not whole and 0 or more, for a digital filter.', 'A digital filter given with units in its coefficients.'],
    example: ['h\\coloneq \\mathrm{butterLowpass}\\left(1,0.25\\right)', 'k\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\end{pmatrix}', '\\mathrm{impulseResponse}\\left(h,k\\right)='],
  },
  {
    name: 'stepResponse', group: 'Signal processing', usage: 'stepResponse(system, t)', mathcad: false,
    summary: 'The output of a system, started at rest, after a constant input of 1 from time 0, at time t or at each time of a vector.',
    details: [
      'The system is a vector b, or a pair (b; a), as for [[freqResponse]]. Times with units, such as `2·s`, treat it as an **analog** H(s) with coefficients of s; plain whole numbers are sample numbers 0, 1, 2… of a **digital** filter. The response settles at the system\'s gain at frequency 0. [[impulseResponse]] gives the response to a single spike.',
    ],
    units: 'Times in seconds for an analog system; plain sample numbers for a digital one. The result has no units.',
    errors: ['An analog system whose numerator is of higher degree than its denominator.', 'Plain numbers that are not whole and 0 or more, for a digital filter.', 'A digital filter given with units in its coefficients.'],
    example: ['h\\coloneq \\mathrm{butterLowpass}\\left(1,0.25\\right)', 'k\\coloneq \\begin{pmatrix}0\\\\1\\\\2\\\\3\\end{pmatrix}', '\\mathrm{stepResponse}\\left(h,k\\right)='],
  },
];

// ── Filters and systems ──────────────────────────────────────────────────────────────────────────

const lp = (name: string, args: string): string => `\\mathrm{${name}}\\left(${args}\\right)`;
const dB = (inner: string): string => `\\mathrm{ampToDb}\\left(\\mathrm{freqResponse}\\left(H,${inner}\\right)\\right)=`;

type Kind = 'Lowpass' | 'Highpass' | 'Bandpass' | 'Bandstop';
interface Family {
  key: string;
  /** The arguments between the order and the edges, by name. */
  extra: string[];
  /** Their values in the examples. */
  extraValues: string[];
  what: string;
  how: string;
  /** What the gain is at the edges, in words; and the example's answer line for an edge. */
  edge: string;
  note: string;
}

const FAMILIES: Family[] = [
  {
    key: 'butter', extra: [], extraValues: [], what: 'Butterworth',
    how: 'a Butterworth design, whose passband is as flat as possible and whose gain falls steadily, with no ripple',
    edge: 'The gain is −3.01 dB (1/√2) at each edge.',
    note: 'The order sets the steepness: the gain falls 20·n dB for each factor of 10 in frequency.',
  },
  {
    key: 'cheby1', extra: ['rp'], extraValues: ['1'], what: 'Chebyshev type I',
    how: 'a Chebyshev type I design, which ripples in the passband and falls steadily in the stopband',
    edge: 'rp is the ripple in dB allowed in the passband (above 0). The edges are the ends of the passband, where the gain has fallen by rp dB.',
    note: 'It falls faster than a Butterworth of the same order, at the cost of the ripple.',
  },
  {
    key: 'cheby2', extra: ['rs'], extraValues: ['40'], what: 'Chebyshev type II',
    how: 'a Chebyshev type II design, which is flat in the passband and ripples in the stopband',
    edge: 'rs is the attenuation in dB of the stopband (above 0). The edges are where the stopband starts, where the gain has fallen to −rs dB.',
    note: 'Beyond the edges the gain stays at or below −rs dB.',
  },
  {
    key: 'ellip', extra: ['rp', 'rs'], extraValues: ['1', '40'], what: 'elliptic (Cauer)',
    how: 'an elliptic design, which ripples in both bands and has the steepest fall for its order',
    edge: 'rp is the passband ripple in dB and rs the stopband attenuation in dB, both above 0 and rs more than rp. The edges are the ends of the passband, where the gain has fallen by rp dB.',
    note: 'For a given order, no other design here falls as fast between the bands.',
  },
  {
    key: 'bessel', extra: [], extraValues: [], what: 'Bessel',
    how: 'a Bessel design, whose delay is as flat as possible, so a signal in the passband keeps its shape',
    edge: 'The edges are not −3 dB points: they are where the phase response is half-way, so the gain there is below −3 dB, and falls further as the order rises (about −4.8 dB at order 2). The orders go up to 15, not 20.',
    note: 'The fall in gain is gentler than any of the other designs of the same order.',
  },
];

const KIND_TEXT: Record<Kind, { edges: string[]; phrase: string }> = {
  Lowpass: { edges: ['fc'], phrase: 'low-pass: passes frequencies below fc' },
  Highpass: { edges: ['fc'], phrase: 'high-pass: passes frequencies above fc' },
  Bandpass: { edges: ['f1', 'f2'], phrase: 'band-pass: passes frequencies from f1 to f2' },
  Bandstop: { edges: ['f1', 'f2'], phrase: 'band-stop: rejects frequencies from f1 to f2' },
};

/** The example's lines: design a 2nd-order filter and show its gain, or a pole count. */
function iirExample(f: Family, kind: Kind): string[] {
  const edges = kind === 'Lowpass' || kind === 'Highpass' ? ['0.1'] : ['0.1', '0.2'];
  const args = ['2', ...f.extraValues, ...edges].join(',');
  const design = `H\\coloneq ${lp(`${f.key}${kind}`, args)}`;
  if (f.key === 'bessel') {
    const at = kind === 'Lowpass' || kind === 'Bandstop' ? '0' : kind === 'Highpass' ? '0.5' : '0.2';
    return [design, `\\left|\\mathrm{freqResponse}\\left(H,${at}\\right)\\right|=`];
  }
  return [design, dB('0.1')];
}

function iirEntry(f: Family, kind: Kind): Entry {
  const k = KIND_TEXT[kind];
  const name = `${f.key}${kind}`;
  const usage = `${name}(${['n', ...f.extra, ...k.edges].join(', ')})`;
  const band = k.edges.length === 2;
  const argText = [
    'n is the order, a whole number from 1 to ' + (f.key === 'bessel' ? '15' : '20') + '.',
    ...f.extra.map((e) => (e === 'rp' ? 'rp is the passband ripple in dB.' : 'rs is the stopband attenuation in dB.')),
    band ? 'f1 and f2 are the band edges, with f2 above f1.' : 'fc is the cutoff frequency.',
  ].join(' ');
  const example = iirExample(f, kind);
  return {
    name, group: 'Filters and systems', usage, mathcad: false,
    summary: `The (b; a) coefficients of an IIR ${f.what} ${kind === 'Lowpass' ? 'low-pass' : kind === 'Highpass' ? 'high-pass' : kind === 'Bandpass' ? 'band-pass' : 'band-stop'} filter.`,
    details: [
      `A ${k.phrase}, using ${f.how}. ${argText}`,
      'How the frequency is written decides the kind. A plain fraction of the sample rate, from 0 to 0.5, gives a **digital** filter (the bilinear transform, with its frequencies warped to match): typing `fc/fs` with both in Hz gives that fraction. A frequency in Hz, such as `1·kHz`, gives an **analog** filter, with coefficients of s in radians per second. All the edges must be of one kind.',
      `The result is a vector of two vectors, b over a, with the constant term first and a₀ = 1; feed it to [[applyFilter]], [[freqResponse]], [[stepResponse]], [[digitalPoles]] or [[analogPoles]]. ${f.edge} ${f.note}`,
    ],
    units: 'A frequency is a plain fraction of the sample rate (digital), or in Hz (analog). Ripple and attenuation are plain numbers in decibels.',
    errors: [
      `An order that is not a whole number from 1 to ${f.key === 'bessel' ? '15' : '20'}.`,
      'An edge that is a plain number outside 0 to 0.5, or one with units that is not a frequency, or edges of mixed kinds.',
      ...(band ? ['An upper edge that is not above the lower one.'] : []),
      ...(f.extra.length ? ['A ripple or attenuation of 0 or less.'] : []),
      ...(f.key === 'ellip' ? ['A stopband attenuation that is not more than the passband ripple.'] : []),
    ],
    example,
  };
}

const KINDS: Kind[] = ['Lowpass', 'Highpass', 'Bandpass', 'Bandstop'];
const IIR_DESIGN: Entry[] = FAMILIES.flatMap((f) => KINDS.map((k) => iirEntry(f, k)));

const SYSTEM_NOTE = 'The system is a vector of coefficients b, or a pair (b; a), as [[butterLowpass]] and the other design functions give, with the constant term first.';

const FILTERS: Entry[] = [
  ...IIR_DESIGN,
  {
    name: 'analogPoles', group: 'Filters and systems', usage: 'analogPoles(H)', mathcad: false,
    summary: 'The poles of an analog system H(s): the roots of its denominator.',
    details: [SYSTEM_NOTE + ' The coefficients are those of s, so (b; a) is H(s) = (b₀ + b₁s + …) / (a₀ + a₁s + …). The poles are sorted by real part and given as a column. A system is stable when every pole has a negative real part.'],
    units: 'The poles are in 1/s. A coefficient with units must carry s^k for the k-th one, as R·C and L·C do.',
    errors: ['A denominator that is a constant, which has no poles.', 'Coefficients with mixed units, or complex ones.'],
    example: ['b\\coloneq \\begin{pmatrix}1\\end{pmatrix}', 'a\\coloneq \\begin{pmatrix}6\\\\5\\\\1\\end{pmatrix}', '\\mathrm{analogPoles}\\left(\\begin{pmatrix}b\\\\a\\end{pmatrix}\\right)='],
  },
  {
    name: 'analogZeros', group: 'Filters and systems', usage: 'analogZeros(H)', mathcad: false,
    summary: 'The zeros of an analog system H(s): the roots of its numerator.',
    details: [SYSTEM_NOTE + ' The coefficients are those of s, so (b; a) is H(s) = (b₀ + b₁s + …) / (a₀ + a₁s + …). The zeros are sorted by real part and given as a column.'],
    units: 'The zeros are in 1/s. A coefficient with units must carry s^k for the k-th one, as R·C and L·C do.',
    errors: ['A numerator that is a constant, which has no zeros.', 'Coefficients with mixed units, or complex ones.'],
    example: ['b\\coloneq \\begin{pmatrix}2\\\\1\\end{pmatrix}', 'a\\coloneq \\begin{pmatrix}6\\\\5\\\\1\\end{pmatrix}', '\\mathrm{analogZeros}\\left(\\begin{pmatrix}b\\\\a\\end{pmatrix}\\right)='],
  },
  {
    name: 'digitalPoles', group: 'Filters and systems', usage: 'digitalPoles(H)', mathcad: false,
    summary: 'The poles of a digital filter H(z): the roots in z of its denominator.',
    details: [SYSTEM_NOTE + ' The coefficients are those of z⁻¹, so H(z) = (b₀ + b₁z⁻¹ + …) / (a₀ + a₁z⁻¹ + …). Both polynomials are brought to the same length first, so a numerator longer than the denominator adds poles at 0. The filter is stable when every pole is inside the unit circle, with magnitude below 1.'],
    units: 'The coefficients must be plain numbers, and so are the poles.',
    errors: ['A filter with no poles.', 'Coefficients with units, as an analog system has.'],
    example: ['\\mathrm{digitalPoles}\\left(\\begin{pmatrix}\\begin{pmatrix}1\\end{pmatrix}\\\\\\begin{pmatrix}1\\\\-0.5\\end{pmatrix}\\end{pmatrix}\\right)='],
  },
  {
    name: 'digitalZeros', group: 'Filters and systems', usage: 'digitalZeros(H)', mathcad: false,
    summary: 'The zeros of a digital filter H(z): the roots in z of its numerator.',
    details: [SYSTEM_NOTE + ' The coefficients are those of z⁻¹, so H(z) = (b₀ + b₁z⁻¹ + …) / (a₀ + a₁z⁻¹ + …). Both polynomials are brought to the same length first, so a denominator longer than the numerator adds zeros at 0. A vector b alone is an FIR filter.'],
    units: 'The coefficients must be plain numbers, and so are the zeros.',
    errors: ['A filter with no zeros.', 'Coefficients with units, as an analog system has.'],
    example: ['\\mathrm{digitalZeros}\\left(\\begin{pmatrix}1\\\\-0.25\\end{pmatrix}\\right)='],
  },
];

export const SIGNAL: Entry[] = [...FOURIER, ...SIGNAL_PROCESSING, ...FILTERS];
