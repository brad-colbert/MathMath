# Changelog

All notable changes to MathMath are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Before 1.0, a minor version is a release with new features and a
patch version is fixes only. Each release is a git tag, `v` plus the version.

The `.mathmath` file format has its own version number, stored in each file. It changes only when the format
does, and those changes are noted here.

## [Unreleased]

## [0.54.0] - 2026-11-16

Mathcad's Polyhedron: the 80 uniform polyhedra and their duals, drawn solid in surface plots.

### Added

- Polyhedron, Mathcad's way to draw the uniform polyhedra: a surface plot of Polyhedron("snub cube") draws it
  solid and lit, with dark edges, in one blue as Mathcad does, and turns when dragged. It takes what Mathcad takes:
  a polyhedron's name or its dual's, in any case, "#1" to "#80", or the Wythoff symbol exactly as PolyLookup gives
  it. All 80 and their 80 duals are built by Wythoff's construction, and each matches Kaleido, the program
  Mathcad's numbering comes from, in its vertices, edges, faces and the faces round every vertex. The star
  polyhedra's faces pass through each other as they should. In a colour map from Format → Color map…, each kind of
  face takes its own colour. MathMath also draws the great retrosnub icosidodecahedron, number 79, which Mathcad 14
  leaves empty.
- Mathcad worksheets with a 3D plot of a polyhedron open with it as a MathMath plot, drawn and turnable, in place
  of Mathcad's stored picture. Other Mathcad 3D plots still open as their pictures.
- A Help entry for Polyhedron, a part on it in the Plots topic, and a new gallery example: a snub, its dual, a
  star, and any of the 80 by number.

### Fixed

- The expression under a surface or contour plot sits centred under it, rather than at its right.

### Known limits

- A dual whose polyhedron has faces through the centre, as the hemipolyhedra do, has vertices at infinity; its faces
  run out as prisms, cut off at a fixed distance from the centre. Mathcad cuts them at the plot's box instead, so
  they look different there.
- A polyhedron is drawn as a picture in the plot, at twice the screen's resolution, rather than as lines and
  shapes, because its faces cross each other; it prints at that resolution.

## [0.53.0] - 2026-11-16

Colour maps for surface and contour plots, with Mathcad's SaveColormap and LoadColormap.

### Added

- Colour maps for surface and contour plots: Format → Color map… chooses how heights are colored, from a list with
  a swatch of each. MathMath has five of its own: ramp, the light-to-dark blue plots have always used and still use
  by default, gray, spectrum, viridis and heat. Choosing one only redraws the plot.
- SaveColormap("name", M), Mathcad's way to make a colour map: M's rows are red, green and blue from 0 to 255,
  lowest heights first. Where Mathcad keeps the map as a file in its own folder, MathMath keeps it in the worksheet,
  for the plots below it, and offers it as Mathcad's name.cmp file to save, which Mathcad reads. Values are cut to
  whole numbers and held to 0..255, and the matrix must be n × 3 with at least two rows, as in Mathcad.
- LoadColormap("name"): a map's colours as a matrix, from one saved above, an attached Mathcad .cmp file, or
  MathMath's own. Files now attaches .cmp files, so Mathcad's own maps, as Fire or Royal, work by name.
- Help entries for both, a part on colour maps in the Plots topic, and a new gallery example: hills in a map made
  with SaveColormap, beside the same heights in viridis.

### Changed

- The .mathmath format: a surface or contour plot can save the colour map it names. The format's version stays the
  same; an earlier MathMath opens such a plot in its usual blue ramp.

### Known limits

- A plot naming a map that isn't saved, attached or MathMath's own draws in the blue ramp, saying so only when the
  pointer rests on it; it doesn't ask for the file as LoadColormap does.

## [0.52.0] - 2026-11-16

Mathcad's Seed, until, trace, pause and PolyLookup.

### Added

- Seed, Mathcad's way to repeat random numbers: after Seed(x), the regions below draw one after another from a
  single stream started at x, so Seed(x) again draws the same numbers again. It takes 1 to 2147483647, as
  Mathcad does, and gives the seed in effect before. Sheets without Seed draw exactly as before, and
  recalculating only what changed still gives the same numbers as a full run.
- until, which stops a definition over a range variable at the first value where its condition turns negative:
  x_k := until(c, e). It works inside larger expressions and in recurrences, as w_(k+1) := until(100 − w_k,
  2·w_k), and refuses use anywhere else, as Mathcad does.
- trace and pause, Mathcad's debugging prints: trace("x = {0}", x) prints a line in a small box under the
  region, a line a pass in a loop, and gives 0. The box isn't printed with the sheet. pause prints the same way;
  a browser can't stop a calculation to wait, as Mathcad's pause does.
- PolyLookup, the names, duals and Wythoff symbols of the 80 uniform polyhedra, numbered as Mathcad numbers them.
- Help entries for each, parts on them in the Random numbers, Ranges, Programs and Plots topics, and a new gallery
  example: estimating π by darts with a repeatable seed, a cooling cup stopped by until, and Newton's method
  followed with trace.

### Known limits

- Seed's numbers differ from Mathcad's, whose generator isn't public, and once numbers have been drawn Mathcad's
  Seed gives its generator's position, where MathMath gives the seed in effect.
- Polyhedron, LoadColormap and SaveColormap aren't in MathMath yet: they need polyhedra and colour maps in 3D
  plots, which come in later releases.

## [0.51.1] - 2026-11-11

Answers from → laid out as Mathcad 14 lays them out: decimals, imaginary numbers and equations.

### Fixed

- Decimal answers from → are laid out as Mathcad 14 lays them out: written out in full between 10⁻⁶ and 10⁶, as
  1/12 float → 0.083333333333333333333, where it showed 0.83333333333333333333×10⁻¹, and with an exponent outside,
  as 1.0×10⁷; trailing zeros are dropped, as 1/2 float → 0.5, and a whole number keeps .0, as 2.0.
- The last of 20 digits is rounded, as Mathcad rounds it: 2·10⁶/3 float → 666666.66666666666667, where the
  algebra engine cut it off at …666.
- An imaginary part shows as one number, as 2.0 + 3.0i and 1.4142135623730950488i, where it showed 3.0·1i; i on
  its own shows as i, as x² + 1 = 0 solve → ±i, and i·x as x·i, as Mathcad writes them. An upright i written
  without a number, as in the impedance example, shows as i too.
- An exact complex answer no longer shows the engine's rough decimal after it: 3i/4 → 3i/4, where it showed
  3i/4 = 0.75i.
- A number typed with more digits than a double holds keeps them all under →: 12345678901234567890123 float →
  1.234567890123456789×10²², where the last digits were lost.
- An equation under → keeps its right-hand side: x = 3 → x = 3, where it showed x alone.
- A Mathcad sheet whose → has a keyword with an argument, as float, 5 or solve, x, opens with it: Mathcad saves
  these as a sequence, which was read as one unknown keyword.
- The float Help entry and the Symbolic evaluation topic say how answers are laid out.

## [0.51.0] - 2026-11-11

Mathcad's symbolic-only functions: Si, Ci, Shi, Chi, Ei, FresnelS, FresnelC, dilog, Zeta, Psi, LambertW, IsPrime, numer and denom.

### Added

- Mathcad's symbolic-only functions: the sine and cosine integrals Si and Ci, their hyperbolic forms Shi and Chi,
  the exponential integral Ei and Eₙ as Ei(n, x), the Fresnel integrals FresnelS and FresnelC, the dilogarithm
  dilog, Riemann's Zeta, the digamma and polygamma functions Psi(x) and Psi(n, x), Lambert's W as LambertW(x) and
  LambertW(n, x) on any branch, IsPrime, and numer and denom. With →, Giac keeps them exact where it can, as
  Zeta(2) → π²/6 and Psi(1) → −γ, and their derivatives come out as Mathcad gives them, as d/dx FresnelS(x) →
  sin(πx²/2). The float keyword gives their decimals, and MathMath gives their values with = too, which Mathcad
  14 can't. The values agree with Mathcad 14's float answers and with mpmath, at over 600 points, to about 1e−12
  or better.
- A derivative of a function of your own with no definition, as d/dx g(x²), now shows as having no closed form,
  where it was an error about reading Giac's answer.
- Help entries for each, a part on them in the Special functions topic, and a new gallery example: light bending
  round a razor's edge, the Gibbs overshoot of a square wave, and a diode's current solved exactly with LambertW.

### Changed

- Psi typed as a call, Psi(x), is now Mathcad's digamma function; Psi on its own is still Ψ, and Ψ typed with
  Ctrl+G is still Ψ, as a function of your own or not.

### Known limits

- The values MathMath works out itself have a double's 16 significant digits, so float shows those, not 20,
  for Shi, Chi, FresnelS, FresnelC, dilog, Psi(n, x), Ci of a negative number, and any of them with a decimal
  argument. With whole-number arguments, Si, Ci, Ei, Zeta, Psi(x) and LambertW keep all 20 digits.
- Mathcad 14 gives LambertW(−0.2) as 0, which is wrong; MathMath gives the true value, −0.2592. Mathcad 14
  leaves Shi and Chi unevaluated, even with float; MathMath gives their values.
- Their arguments must be real, apart from LambertW's. Giac doesn't know Shi, Chi, FresnelS, FresnelC or dilog,
  so MathMath writes their derivatives in itself, of any order; but their integrals and series aren't found, and
  show as having no closed form.

## [0.50.0] - 2026-11-11

Mathcad's partial differential equation solvers: Pdesolve, numol, relax and multigrid.

### Added

- Pdesolve, Mathcad's solve block for partial differential equations in one space dimension and time: the
  equations written as u.t(x, t) = …, with u.x and u.xx for the space derivatives, an initial condition and
  boundary conditions, giving u(x, t) as a function. And numol, the same problem given as functions. Both use
  Mathcad's method of lines, differenced to fourth order in space as Mathcad does, and agree with Mathcad 14 to
  about 1e−6 on every problem probed with fixed-value or open ends (the heat, advection and wave equations, and
  systems), Pdesolve on its default 10 × 10 grid and with its linear interpolation between points; Mathcad's own
  blocks, opened from its files, give the same answers. A problem of 101 points across takes a fraction of a second.
- relax and multigrid, Mathcad's solvers for Poisson's and Laplace's equations on a square: Numerical Recipes'
  successive over-relaxation and full multigrid, as Mathcad's are, giving Mathcad's answers to the last digit.
- Help entries for the four, a part on them in the Differential equations topic, and a new gallery example: a
  rod cooling and a plate heated at one edge.

### Known limits

- With a slope (Neumann) boundary condition, Mathcad 14's answers aren't consistent: numol drifts away from u = x
  with a slope of 1 at both ends, which should stay as it is, and both numol and Pdesolve gain heat through an
  insulated end, rising above the starting temperature. MathMath's follow the exact solutions, so they differ from
  Mathcad's there.
- numol's algebraic equations (num_pae above 0), and Pdesolve's algebraic constraints, aren't supported yet.
- Mathcad offers four ways to difference space, chosen by right-clicking Pdesolve; MathMath uses its default, and
  opens a sheet saved with another as if it used the default.
- Where a boundary value changes with time, Mathcad 14's numol shows that boundary's value at the in-between
  times slightly wrong (its interior values are right); MathMath's are the boundary condition's.

## [0.49.0] - 2026-11-11

Mathcad's statespace, sbval, bvalfit and Jacob, and a Help topic on differential equations.

### Added

- statespace, Mathcad's solver for linear systems x′ = A(t)·x + B(t)·u(t), with A, B and the input u as functions of
  time, giving the same kind of table as rkfixed. Mathcad 14 integrates it to the worksheet's TOL, so at the default
  its answers are about 1e−5 from the true ones; MathMath's are accurate to about 1e−12 whatever TOL is, and agree
  with Mathcad's at a TOL of 1e−10 to better than 1e−9. A stiff system, with rates far apart, is solved quickly by
  an implicit method.
- sbval and bvalfit, Mathcad's shooting solvers for boundary-value problems: the unknown starting values that make
  a solution meet conditions at the far end, or from both ends at a point between, by Newton's method on the
  solution. They agree with Mathcad 14 to 1e−10 or better on every problem probed, linear and nonlinear, finding the
  same one of two solutions from the same guesses, near or far; on one linear problem Mathcad stops 6e−9 short of the exact
  answer, which MathMath reaches. Where Mathcad returns a number regardless, for a problem with no solution or a
  score of the wrong length, MathMath says what is wrong.
- Jacob(F(x), x), the Jacobian of a vector function at the vector x, worked out numerically as Mathcad does and
  agreeing with it to about 1e−13; it gives the stiff solvers their Jacobian, as J(t, y) := augment(…, Jacob(D(t, y), y)).
- Help entries for the four, a new Help topic on differential equations, and a new gallery example: a circuit
  with statespace, a beam by shooting, and a stiff reaction with Jacob.

## [0.48.0] - 2026-11-11

Convert for Mathcad's file functions, Mathcad's WAV and HLS/HSV writes, and hue, lightness and saturation.

### Added

- Convert, for Mathcad worksheets that read files: Mathcad's READRGB, READBMP, READ_IMAGE, READ_RED, READ_GREEN,
  READ_BLUE, READ_HLS, READ_HSV and their hue, lightness, saturation and value readers, READWAV, GETWAVINFO and
  READPRN stay grayed, as before, and a bar above the paper now offers to change them to the MathMath expressions
  that give the same numbers from the attached file, any folder dropped: READ_HSV("a.bmp") becomes
  rgbToHsv(readImage("a.bmp"), 360). Undo puts them back. READWAV and READPRN wait until their file is attached,
  since how they convert depends on it. Every conversion is checked against Mathcad 14's own answers on the same
  files.
- Each grayed Mathcad file function's note now names that exact expression, and READWAV and GETWAVINFO, which
  before showed as unknown, are recognized.
- Mathcad's WRITEWAV, WRITE_HLS and WRITE_HSV work as its other file writes do, as definitions such as
  WRITEWAV("tone.wav", 8000, 16) := M, offering the file to save. WRITEWAV writes as Mathcad 14 does: 1 to 16
  bits, each sample cut toward zero and wrapped rather than clipped, the bits as given in the header.
- rgbToHls and hlsToRgb, the hue, lightness and saturation model Mathcad's READ_HLS uses; wavInfo, a WAV file's
  channels, rate, bits and bytes a second; a full turn of hue for rgbToHsv and hsvToRgb, so 360 gives degrees as
  Mathcad's do; and a channel number for imageChannels, counted from ORIGIN, as imageChannels(M, 0) for red.
- Help entries for all of these, and the Files and images topic explains Convert.

### Changed

- readImage of a picture that isn't attached now waits for it, grayed, and the bar above the paper asks for it, as
  readWav and readTable already did, rather than showing an error.

### Known limits

- Convert doesn't move regions, so a converted line, longer than the Mathcad call, can run into one to its right.
- The conversions are checked on bitmap pictures. A JPEG may differ from Mathcad's by a level here and there,
  where the browser decodes it differently.
- WRITEBMP("name", M) and the other writes on the right of a definition, which Mathcad also allows, are still
  refused: write them as WRITEBMP("name") := M.

## [0.47.0] - 2026-11-10

Mathcad's feet-and-inches, time and angle formats, generalized eigenvalues and svd2, and keys for comparisons and logic.

### Added

- Mathcad's scaling functions for builders' and surveyors' formats. FIF reads a length in feet, inches and a fraction
  of an inch, as "9' 6-1/4\"" or three numbers; hhmmss reads a time as "1:02:03.5" or three numbers; DMS reads an
  angle in degrees, minutes and seconds. Each also works in a result's unit placeholder, as in Mathcad: FIF shows a
  length as "9' 6-1/4\"", with the closest fraction of an inch whose denominator is 256 or less; hhmmss shows a time
  as "1:2:3.5", the seconds to 3 decimals; and DMS shows an angle as a vector of degrees, minutes and seconds. Their
  answers match Mathcad 14's on more than 100 cases probed, including how each handles signs and what it refuses.
- time(z), Mathcad's clock for timing a calculation: seconds since 1970, to the millisecond.
- Help has entries for the four, and a new example in the gallery, a staircase in feet and inches: risers and
  treads from a builder's tape, the stringer's angle in degrees and minutes, and the time to build it.
- Mathcad's genvals and genvecs, the eigenvalues and eigenvectors of M·x = λ·N·x, the problem of vibration and
  buckling, and svd2, the singular value decomposition as three arrays: the singular values, U and Vᵀ. They follow
  LAPACK 3.0's methods, the ones Mathcad 14 uses, so the eigenvalues come in Mathcad's order and the vectors with
  its signs: they match Mathcad 14 on all 34 matrix pairs and 21 matrices probed, real and complex, where a newer
  LAPACK (3.12) gives another order or other signs on more than a dozen of them. An infinite eigenvalue, from a
  singular N, is the largest number, signed, for real matrices and NaN for complex ones, as in Mathcad. Help entries for the three, and a new gallery example: how a three-storey building sways.
- About links LAPACK's license, which covers these and the existing eigenvalue functions.
- Keys for comparisons and logic, as in Mathcad: Ctrl+Shift+7 for ∧ (and), Ctrl+Shift+6 for ∨ (or), Ctrl+Shift+5 for
  ⊕ (exclusive or), Ctrl+Shift+1 for ¬ (not) and Ctrl+0 for ≥. A new Boolean menu on the toolbar has all of them,
  with ≤ and ≠, whose keys Ctrl+9 and Ctrl+3 the browser keeps for switching tabs. Before, none of these could be
  typed except ≤ on the touch keypad.

### Known limits

- svd2 gives the singular values A's units and U and Vᵀ none, since U and V are rotations; Mathcad 14 gives all
  three parts A's units.
- The older svd is still MathMath's own method: its columns can differ in sign from Mathcad's svd. svd2 matches.

## [0.46.0] - 2026-11-10

Mathcad's smoothing, correlation and wavelet functions, and ∧ and ∨ read with Mathcad's precedence.

### Added

- Mathcad's smoothing, correlation and wavelet functions: ksmooth, a Gaussian kernel smoother; supsmooth,
  Friedman's super smoother; correl and correl2d; and wave and iwave, the Daubechies wavelet transform. Their
  answers agree with Mathcad 14's to within 6e−15 at every point probed, supsmooth exactly on 128 points. ksmooth's kernel is b/2.696756 wide, the
  constant Mathcad's answers show, which its Help rounds to 0.37·b; correl orders its lags as Mathcad does, no
  shift first; supsmooth returns three points or fewer as they are, as Mathcad does.
- Help has entries for the six, and Curve fitting has a part on smoothing.
- A new example in the gallery, cleaning up a noisy signal: three smoothers compared, an echo's delay found by
  correlation, a signal kept in a tenth of its wavelet coefficients, and a picture blurred with a kernel.

### Fixed

- ∧ binds more loosely than comparisons and ∨ more loosely than ∧, as Mathcad 14 reads them, so x > 1 ∧ x < 5
  means (x > 1) ∧ (x < 5), and a ∨ b ∧ c means a ∨ (b ∧ c). Before, they bound as tightly as comparisons, so the
  first was read as ((x > 1) ∧ x) < 5. The editor has no key for ∧ and ∨, so this affected math from Mathcad
  files and pasted LaTeX once it was edited; a sheet saved earlier keeps the grouping it was saved with.

## [0.45.0] - 2026-11-10

Mathcad's coordinate conversions, log-spaced points and 3D plot grids, and curves in 3D plots.

### Added

- Mathcad's graphing helpers: xy2pol, pol2xy, xyz2sph, sph2xyz, xyz2cyl and cyl2xyz to change coordinates;
  logspace and logpts for points on a log scale; and CreateMesh and CreateSpace, which sample a surface of two
  parameters, or a curve of one, for a 3D plot, with an optional mapping to another coordinate system. They follow
  Mathcad 14's conventions, probed: xy2pol's angle runs from 0 to 2π but the azimuth of xyz2sph and xyz2cyl from
  −π to π; logpts steps evenly within each decade (logpts(0, 1, 3) is 1, 4, 7); CreateMesh's result is a 1 × 1
  array holding X, Y and Z, as Mathcad gives it.
- The surface plot draws CreateMesh's result as it is, and CreateSpace's three vectors as a curve in space,
  colored by height.
- Help has a Plots and coordinates group, and the Plots page tells how to make surfaces and curves.
- A new example in the gallery, shapes in three dimensions: a torus, a helix and a lumpy sphere, with coordinate
  conversions and log-spaced points.

## [0.44.0] - 2026-11-10

Mathcad's finance functions, and percent as a unit.

### Added

- Mathcad's 18 finance functions: pmt, pv, fv, nper and rate for loans and savings; ipmt, ppmt, cumint and cumprn
  for the interest and principal in each payment; npv, irr, mirr and fvc for a series of cash flows; eff and nom
  for nominal and effective rates; cnper, crate and fvadj for growth without payments. They follow Mathcad's
  conventions, probed in Mathcad 14: money paid out is negative, npv discounts the first flow by one period, and
  irr and rate solve from a guess of 10%. At a rate of 0, fv keeps pv and nper keeps fv's sign, as the formulas
  do; Mathcad 14 gets both wrong there. irr((−1000, 100)) gives −90%, where Mathcad 14 was
  still calculating after a minute.
- Percent is a unit, as in Mathcad: type 8.25%, which is 0.0825, and show a result in % by typing % in its unit.
- Help has a Finance group and a Finance topic page, and the Units page mentions %.
- A new example in the gallery, a mortgage month by month: its payment, where each payment goes, what paying a
  little extra saves, and whether solar panels pay their way.

## [0.43.1] - 2026-11-10

root keeps its own variable when that name is also a range variable, as in Mathcad.

### Fixed

- root(f(x), x, a, b) gives one answer when x is also a range variable on the sheet, as in Mathcad: the x inside it
  belongs to root. Before, defining a value from it said "range variable in a non-indexed definition", and showing
  it gave a column of the same root, once for each value of x. The guess form, root(f(x), x), still takes each
  value of a range variable x as a guess, as Mathcad does.

## [0.43.0] - 2026-11-10

The Bessel, Hankel, Airy and spherical Bessel functions take complex arguments, from a port of Amos's library.

### Added

- The Bessel functions take complex arguments, as in Mathcad: J0, J1, Jn, Y0, Y1, Yn, I0, I1, In, K0, K1, Kn, the
  Hankel functions H1 and H2, the Airy functions Ai, Bi, DAi and DBi, and the spherical js and ys, with every
  scaled .sc form. They come from a port of Amos's library, the one Mathcad's scaled forms follow; orders stay
  real, and negative ones work at any argument, in the scaled forms too, which Mathcad 14 calls undefined. On the imaginary axis, as js(0, 2i), MathMath gives the true value,
  where Mathcad 14's is 1/√2 of it; beyond |z| of about 10⁹, where Mathcad 14 gives up on J, Y and the Hankel
  functions, MathMath still gives their values. ber and bei still need a real argument, as in Mathcad.
- About credits Amos's library and SciPy's translation of it, and links their license notices.
- A new example in the gallery, the skin effect in a wire: alternating current crowding to the surface of a copper
  bar, from J0 and J1 of a complex argument.

## [0.42.1] - 2026-11-10

Help and the Examples gallery catch up with the functions added in 0.39 to 0.42.

### Added

- Four new examples in the gallery, one for each batch of functions added in 0.39 to 0.42: phasors and power-factor
  correction (complex numbers), fitting a cooling curve (line, expfit, genfit and regress), ordering parts by the box
  (strings, lookup and rounding to a step), and a drumhead's modes from Bessel zeros, with Γ giving the volume of
  a ball in n dimensions.

### Changed

- Help has new pages on complex numbers, curve fitting and special functions, and Typing math now covers typing
  imaginary numbers (3+4i), strings inside math, names with digits (str2num), and a literal subscript after a digit
  (J0.sc). The pages had fallen behind the functions added in 0.39 to 0.42.

## [0.42.0] - 2026-11-10

Mathcad's special functions: Γ, the orthogonal polynomials, hypergeometric functions, and the Bessel family for real arguments.

### Added

- Mathcad's special functions:
  - Γ(z), real or complex, and the incomplete gamma Γ(a, x); and `lnΓ`, the analytic log-gamma, as Mathcad's:
    `lnΓ(−0.5)` is 1.2655 − iπ.
  - The orthogonal polynomials `Her` (physicists' Hermite), `Tcheb`, `Ucheb`, `Lag`, `Leg` and `Jac`.
  - `fhyper` and `mhyper`, the Gauss and confluent hypergeometric functions; `ibeta`, the incomplete beta function;
    `sinc`, `ε` (the antisymmetric tensor) and `ln0`.
  - The Bessel functions `J0`, `J1`, `Jn`, `Y0`, `Y1`, `Yn`, `I0`, `I1`, `In`, `K0`, `K1`, `Kn`, of any real order,
    fractional and negative included; the Hankel functions `H1` and `H2`; the Airy functions `Ai`, `Bi`, `DAi` and
    `DBi`; the Kelvin functions `ber` and `bei`; and the spherical Bessel functions `js` and `ys`. Each Bessel and
    Airy function has Mathcad's scaled form, typed with .sc, as `J0.sc` and `K0.sc`, which stays in range where the
    plain one overflows.

  All checked against Mathcad 14 at about 500 points, and against mpmath at 40 digits, including large arguments
  beyond what was probed. Where `fhyper` or `mhyper` would lose digits to its series cancelling, it says so instead
  of giving a wrong number.
- Typing a period after a name that ends in a digit, as `J0` then `.sc`, starts its literal subscript, as after a
  letter.

### Known limits

- The Bessel, Hankel, Airy and spherical functions take real arguments for now. Mathcad also takes complex ones, which
  need a port of Amos's complex Bessel library.
- Where Mathcad 14 is wrong, MathMath gives the true value:
  - At a negative argument, a Bessel function of fractional order is complex: `Jn(0.5, −2)` is 0.513i, where Mathcad
    14 gives 0, keeping only the real part; it gives NaN for `Y1(−2)`, which is 0.107 − 1.153i.
  - `js` and `ys` of a whole order at a negative argument follow js(m, −x) = (−1)^m·js(m, x), where Mathcad 14
    gives 0 for `js` and the opposite sign for `ys`.
  - `mhyper(0.5, 1, 100)` is 1.52·10⁴², where Mathcad 14 gives 0; and `lnΓ(1e5)`, where Mathcad 14 overflows.

## [0.41.0] - 2026-11-10

Strings, lookup, whole numbers and rounding to a step, as Mathcad's, with `predict`; and `regress` keeps its digits far from 0.

### Added

- Mathcad's string functions: `substr`, `search`, `str2num` (which reads Mathcad's number syntax, complex numbers
  and 0FFh, 17o, 101b included), `str2vec`, `vec2str`, `format` (`format("{0} and {1}", 3, 4.5)`) and `error`, for a
  program to stop with a message of its own.
- `IsString`, `IsArray`, `IsScalar` and `IsNaN`, and `NaN` itself; `SIUnitsOf`, and `UnitsOf`, its older name.
- `lookup`, `hlookup`, `vlookup` and `match`, which compare numbers within the worksheet's TOL and strings exactly.
- `gcd`, `lcm`, `combin` and `permut`. `permut` gives the number where Mathcad 14 overflows to 0, as `permut(60, 30)`.
- `Ceil`, `Floor`, `Round` and `Trunc` with a step, as `Ceil(x, ft)`: rounding to a multiple of a unit. As in
  Mathcad, they read z/y to 15 digits first, so `Floor(0.3, 0.1)` is 0.3, not 0.2.
- `predict`, linear prediction by Burg's method, matching Mathcad 14 to 15 digits.
- `genfit` takes its parameters one by one as well as in a vector, as F(x, A, c), and a plain number as the guess
  when there's one parameter, as Mathcad's Help describes. (0.40.0 said Mathcad 14 can't fit an F that gives the
  value alone; it can, with its optimized method, the default in new worksheets.) Worksheets from Mathcad that use
  `genfit` or `polyroots` now open with them as calls; before, they couldn't be read.

All of these were checked against Mathcad 14 at about 300 cases, errors included.

### Changed

- `num2str` writes numbers to 15 significant digits, as Mathcad does (`num2str(1/3)` is "0.333333333333333", not
  "0.3333333333333333"), writes complex numbers as "2 + 3i", and refuses units, as Mathcad does.

### Fixed

- Typing a string that isn't a function's last argument works: `concat("a","b")` used to come out as
  `concat("a"),"b"`, because the closing quote stepped out of the parentheses too.
- Typed names with digits in the middle, as `str2num` or `num2str`, read as one name, not `str2·num`.
- A space typed after `{`, `}`, `~` or `^` in a string is kept, so `format("{0} and {1}", …)` keeps its space, and
  `~` and `^` in a string show as themselves instead of as accents on the next letter.
- `regress` far from 0 lost digits: a quadratic at x around 1 000 000 was out by 1 part in 7000. It now fits in
  centred variables and matches Mathcad 14 to 13 digits.
- A string answer drops no characters: braces and backslashes in it used to vanish from the display.
- A worksheet's stored answer that is purely imaginary, such as 2i, now shows as 2i, not 2.

### Known limits

- `loess` isn't here yet. Mathcad's returns the internal state of Cleveland's loess program for interp to use,
  and matching it means porting that program. (0.40.0 said `loess` and `predict` couldn't be checked against
  Mathcad; that was a mistake in the probe sheets, not Mathcad, and both have now been checked.)

## [0.40.0] - 2026-11-10

Curve fitting: straight lines, polynomials in one variable or several, any combination of functions, and the nonlinear fits.

### Added

- Curve fitting, as Mathcad's: `slope`, `intercept`, `line`, `stderr` and `medfit` for straight lines; `linfit` for
  any combination of functions; `regress` for polynomials, in one variable or several, with `interp` to evaluate
  them; `genfit` for any model; and `expfit`, `lgsfit`, `logfit`, `lnfit`, `pwrfit` and `sinfit` for exponential,
  logistic, logarithmic, power and sine curves. Each was checked against Mathcad 14 on exact and noisy data, and
  `regress` against the answers in Mathcad's own example sheets, including its order for several variables (xy, y², y, 1, x, x² for two
  of degree 2). `slope`, `intercept` and `stderr` keep units, as Mathcad's do.
- `genfit` takes Mathcad 14's form of F(x, u), which gives the value and then its partial derivatives, and also an F
  that gives the value alone, where Mathcad 14 says it doesn't converge.

- `slope`, `intercept` and `line` of points that all share one x are an error, where Mathcad gives NaN.

### Known limits

- `loess` and `predict` are not here yet: they couldn't be checked against Mathcad, so they wait rather than
  guess at Mathcad's method.

## [0.39.0] - 2026-11-09

The elementary functions take complex numbers, with Mathcad's branches, and the rest of its trigonometric and hyperbolic functions are here.

### Added

- The rest of Mathcad's trigonometric and hyperbolic functions: `acot`, `asec`, `acsc`, `coth`, `sech`, `csch`,
  `asinh`, `acosh`, `atanh`, `acoth`, `asech` and `acsch`; and `csgn` and `signum`, the signs of a complex number.
- `exp`, `sin`, `cos`, `tan`, `cot`, `sec`, `csc`, `sinh`, `cosh`, `tanh` and `atan` take complex numbers, so
  phasors such as exp(j·ω·t) work.
- `asin(2)`, `acos(2)`, `acosh(0.5)` and the like give a complex answer, as in Mathcad, where they were refused.
  On a branch cut each takes the same side as Mathcad 14: `asin(2)` is π/2 − 1.317i, and `atanh(2)` is
  0.549 − 1.571i. All 29 functions were checked against Mathcad 14 at 18 arguments each.
- A number typed straight before `i` or `j`, as `3+4i` or `4j`, is an imaginary number, as in Mathcad. Before,
  only the `i` on the keypad was; a typed `4i` meant 4 times a variable `i`, which is now written `4·i`.
- LaTeX pasted with `\sinh`, `\coth`, `\arcsin` and the like reads as Mathcad's names (`arcsin` is `asin`).

### Changed

- `cot(0)`, `csc(0)`, `coth(0)` and `csch(0)` are errors, as in Mathcad ("a singularity"), where they gave an
  infinite value.
- Far from the usual range, as `asin(1e−10 + 1e−10i)`, the inverse functions keep all their digits, where
  Mathcad 14's own lose some or all of them; across the range probed they agree with Mathcad's to 14 digits.

### Known limits

- Symbolic evaluation (→) doesn't know the new functions yet.

## [0.38.2] - 2026-11-09

Typed plot axis limits show as numbers, and strings show straight quotes.

### Fixed

- A plot axis limit typed with a unit, such as `0.2·s` on an axis in seconds, shows as a number in the axis's unit,
  `0.2`, in the same style as the limits fitted to the data, instead of as the expression in a different font.
  Clicking it still edits what was typed.
- Strings show straight quotes, `"abc"`, as in Mathcad, where both quotes were closing curly ones, `”abc”`. They
  stay curly while a string is being edited.

## [0.38.1] - 2026-11-09

Strings no longer show a gap before an underscore.

### Fixed

- A string with an underscore, brace or other escaped character in it, such as `"data_2.csv"`, no longer shows a
  gap before that character. The gap was the space that belongs after `:=` or `=`, put in the wrong place;
  strings now sit that space away from the operator, as numbers do.

## [0.38.0] - 2026-11-09

`eigenvecs` gives Mathcad's eigenvectors, signs included, and each differential equation solver has its own method.

### Changed

- Each of Mathcad's differential equation solvers now uses its own method, as Mathcad's do, where before all
  but `rkfixed` shared two:
  - `Rkadapt` and `rkadapt`: Cash–Karp Runge–Kutta;
  - `Bulstoer` and `bulstoer`: Bulirsch–Stoer extrapolation, which takes very long steps on smooth solutions;
  - `Adams`: Adams–Bashforth–Moulton of orders 1 to 12, efficient on smooth problems and slow on stiff ones;
  - `Stiffb` and `stiffb`: semi-implicit extrapolation;
  - `Stiffr` and `stiffr`: Rosenbrock (as before);
  - `Radau`: Radau IIA of order 5;
  - `BDF`: backward differentiation formulas of orders 1 to 5;
  - `AdamsBDF`: Adams until the equations prove stiff, then BDF, and back again.

  Answers agree with the old ones, and with Mathcad's, to each method's accuracy. Odesolve is unchanged.

### Fixed

- `eigenvecs` gives Mathcad's eigenvectors, signs included. Mathcad 14 finds them with LAPACK 3.0's method, and
  MathMath now does the same, down to the order of its arithmetic, where a column's sign can hang on the last
  bit. 53 of 54 test matrices probed in Mathcad 14 now match it exactly, against 2 before.
- `eigenvals` lists eigenvalues in Mathcad's order on every matrix probed, including one where it differed before.

### Known limits

- On a matrix whose eigenvalues are all on the unit circle, such as a rotation, a column of `eigenvecs` can still
  come out with the opposite sign to Mathcad's: there, the sign depends on rounding inside Mathcad's own
  arithmetic library.

## [0.37.1] - 2026-11-09

Editing math no longer moves the regions below it.

### Fixed

- Editing math no longer moves the regions below it. Any change to a region, even one that kept it the same
  size, pushed everything below it down by a few points, because the editor's box was measured against the
  region as drawn. Now regions below move only when the edited one actually grows into them, and then just
  far enough to clear it, all together, as one step to undo.

## [0.37.0] - 2026-11-08

Giac, the algebra engine, credited in the app with its license and source.

### Added

- About names Giac, the algebra engine behind exact answers, with its authors, its license (GNU GPL, version 3
  or later) and a link to its source code, in every copy of MathMath. Help's page on symbolic evaluation says
  the same.
- The README records which Giac build MathMath runs and where its source is published: the build reports
  giac 1.9.0-xx, and its author ships the identical file in the Giac 2.0.0 source package.

## [0.36.0] - 2026-11-08

Five more examples: a shelf, a wall, orbits, a spectrum, and exact answers.

### Added

- Five more examples:
  - "How much does a bookshelf sag?", beam bending with units, and the thickness that keeps a shelf straight;
  - "Heat loss through a wall", layers in series, temperatures through the wall in °C, and what thicker
    insulation saves in a year;
  - "Orbits, from a satellite to a comet", a solve block for the geostationary orbit, and Halley's Comet on a
    polar plot with Kepler's equation;
  - "Finding a hum in the noise", an FFT that picks two tones out of noise, and a filter that brings them back;
  - "Exact answers: calculus and Laplace", symbolic calculus and algebra, and a spring and damper solved exactly
    with the Laplace transform and checked against a numerical solution.

## [0.35.0] - 2026-11-08

Examples: worksheets that show what MathMath does, built into the app.

### Added

- Examples: a gallery of worksheets that show what MathMath does, each a small real problem worked on paper:
  - a two-minute tour;
  - a thrown baseball with air drag;
  - an active low-pass filter from its netlist, with a Bode plot;
  - matching an antenna on a Smith chart;
  - a Monte Carlo tolerance study of ten thousand voltage dividers;
  - measuring a washer in a noisy picture with image processing;
  - "How cloudy is the Earth?", which reads NASA's public-domain Apollo 17 photograph from its web address and
    sorts its pixels into cloud, ocean and land by color.

  Open them from Examples on the toolbar (☰ on a phone), Try an example on the splash, or Help's contents. An
  example opens in place of the worksheet, as Open does, and asks first if there are unsaved changes.

## [0.34.2] - 2026-11-08

eigenvals in Mathcad's order, and WRITEPRN exactly as Mathcad writes it.

### Fixed

- `eigenvals` lists eigenvalues in Mathcad's order. Mathcad doesn't sort them: their order comes from how they
  are found, which is LAPACK's way, so MathMath now finds them the same way. 11 of 12 test matrices come out in
  Mathcad 14's exact order, against 7 before; `eigenvecs` follows the same order.
- `WRITEPRN` writes numbers exactly as Mathcad 14 does, checked against a file it wrote: very large and small
  numbers in exponent form, as 1.235e+005, and a space before every column so wide numbers stay apart.

## [0.34.1] - 2026-11-08

The deployed server sends the app manifest with its proper type.

### Fixed

- The deployed server sends the app manifest as `application/manifest+json`, its proper type, rather than as
  an unknown file. Browsers read it either way; this keeps it correct.

## [0.34.0] - 2026-11-08

Mathcad's file writes, WRITEBMP, WRITERGB and WRITEPRN, offer their files to save.

### Added

- Mathcad's file writes work: `WRITEBMP("name") := M` writes a gray picture, `WRITERGB("name") := M` a color one
  from red, green and blue blocks side by side, and `WRITEPRN("name") := M` a data file of numbers. As with
  `writeImage`, the region shows a Save button that downloads the file, named without the folder in its path.
  They work in Mathcad worksheets you open, and can be typed. A .bmp name gives a bitmap, as Mathcad writes;
  a kind the browser can't write, such as .gif, is saved as PNG. WRITEPRN writes 4 significant figures in
  columns 8 wide, Mathcad's defaults.

### Fixed

- A Mathcad file write in an opened worksheet no longer defines a function named after it, silently writing
  nothing; and its file name keeps its spaces. `APPENDPRN` and `WRITEBIN` writes now say they aren't carried
  out.

## [0.33.0] - 2026-11-08

Phones and tablets: the page fits the screen, a one-row toolbar, and a keypad for math.

### Added

- Phones and tablets.
  - The page fits the screen's width. Pinch, or + and − on the toolbar, zooms it; Fit fits it again.
  - The toolbar is one row there: Open, Save, undo and redo, zoom and LIVE, with ☰ for every other tool.
  - Tapping the paper starts math with a keypad: numbers and operators, functions, templates and units,
    letters and Greek. A bar above it finishes the math (Done, or ⏎ for new math below), moves to the next
    blank, or evaluates symbolically. Text regions use the phone's own keyboard.
  - A finger scrolls the page; touching and holding a region selects it, and a finger then drags it.
  - Help and the trace styles panel fit the screen, and a hosted copy's bar goes below the paper.
- Help: how to use MathMath on a phone or tablet, under Typing math.

### Known limits

- With a finger, there's no drawing a box to select several regions, and no reading values by hovering over a
  plot.

## [0.32.0] - 2026-11-08

Probability distributions and statistics as in Mathcad, Reroll for new random numbers, and an icon.

### Added

- Probability distributions, as Mathcad has them: for each of beta, binomial, Cauchy, chi-squared, exponential,
  F, gamma, geometric, hypergeometric, lognormal, logistic, negative binomial, normal, Poisson, Student's t,
  uniform and Weibull, a density or probability (`dnorm`), a cumulative probability (`pnorm`), its inverse
  (`qnorm`) and random numbers (`rnorm`). Checked against Mathcad 14 to 11 or more digits. Also `erf`,
  `erfc` and `cnorm`.
- The statistics Mathcad has beside `mean` and `stdev`: `var` and `Var`, `median`, `mode`, `gmean`, `hmean`,
  `skew`, `kurt`, `cvar` and `corr`.
- Reroll on the toolbar draws new random numbers, from a new seed for the worksheet. Random numbers otherwise
  stay the same as the sheet calculates, and undo brings the old ones back. The seed is saved with the
  worksheet (a new, optional field in the file), and a Mathcad worksheet's own seed is kept when it's opened.
- Help: an entry for each new function, and a page on random numbers.
- An icon: a white M² on blue grid paper, for browser tabs and bookmarks, phone home screens, and the splash.
  An app manifest lets the browser install MathMath as an app, with its own window.

### Fixed

- A Mathcad worksheet's CTOL, how nearly a solve block's constraints must hold, now applies in the app. It
  was read from the file but not used when calculating there.
- Help no longer says random numbers change each time a worksheet calculates; they stay until Reroll.

## [0.31.0] - 2026-11-08

A hook for hosting a copy of MathMath with its own additions, such as ads, without changing the app.

### Added

- A way to host a copy of MathMath with its own additions, such as ads, without changing the app. A build with
  `MATHMATH_SITE` set to a folder holding `site.json` adds that site's extra security-policy sources, loads
  its script, and links About to the source code. The script can fill a bar at the left of the desk, clear of the
  paper and of Help, that otherwise stays hidden and never prints. Builds without it are unchanged. The README describes `site.json`.

## [0.30.0] - 2026-11-08

A splash screen saying what MathMath is, and the AGPL notice, copyright Pelican Labs, LLC, in every source file.

### Added

- A splash screen when MathMath opens: what it is, in a few lines and a worked example, and the copyright.
  Start calculating, Esc or a click outside closes it. A tick box turns it off for next time, and the
  version on the toolbar, or About MathMath in Help, shows it again. It says that Mathcad is PTC's trademark
  and that MathMath isn't affiliated with or endorsed by PTC; the README says so too.

### Changed

- MathMath is copyright Pelican Labs, LLC, under the GNU Affero General Public License v3.0 or later. Every
  source file now carries the license notice, and a test checks that new files do too.

## [0.29.1] - 2026-11-08

length, last, collect, float, complex results and Mathcad's file functions behave as in Mathcad.

### Fixed

- `length` and `last` refuse a matrix or a row vector, as Mathcad does, rather than counting its rows.
- `collect` gives a polynomial in its variable, highest power first, as Mathcad does: (x + a)·(x + b)
  collects to x² + (a + b)·x + a·b, where it came back partly factored.
- `float` shows all 20 digits, or as many as asked for with `float, n`, rather than 16. They're kept when the
  worksheet is saved, and when a Mathcad worksheet with such answers is opened.
- A complex result whose real or imaginary part is under 10⁻¹⁰ of the other shows that part as 0, as
  Mathcad's complex threshold does, so rounding noise such as 25 − 2.3·10⁻¹⁵i shows as 25. A Mathcad
  worksheet's own threshold is kept.
- Mathcad's file functions, refused here, each say what to use instead: `readTable` for data files,
  `readImage` for pictures, `writeImage` to save one. Before, every one suggested `readImage`.
- Help text no longer shows raw LaTeX in a few entries.
- Typing a definition of a function call with a value inside the brackets, as Mathcad's
  `WRITEPRN("out.prn") := M`, kept it as typed math to fix rather than stopping the worksheet from opening.

## [0.29.0] - 2026-11-07

Help, in a panel beside the paper, with an entry for every function and keyword, and F1.

### Added

- Help, in a panel beside the paper: Help on the toolbar, or F1. It has an entry for every function and
  symbolic keyword, 255 in all, each with how it's called, what it gives, how it treats units, what it
  refuses, and a worked example with its answer, and whether Mathcad has it too. Topic pages cover typing
  math and its keys, units, ranges and arrays, plots, solve blocks, programs, symbolic evaluation, and files.
  - Search finds an entry by its name or by what it does, as "standing wave" for `vswr`.
  - F1 while typing opens the entry for the function the caret is in. With a region selected, it opens the
    first function in it; otherwise the contents.
  - Insert puts an example on the sheet, where you last clicked or below everything, and it calculates
    there. One undo takes it away.
  - Every example is checked by the tests to calculate and to show the answer printed beside it, and every
    function must have an entry, so the help can't fall behind the functions.

### Known limits

- F1 finds functions and keywords by name, not operators or units. The symbolic keywords' answers are
  shown as written, not calculated in the panel.

## [0.28.0] - 2026-11-07

RF tools: reflection, transmission lines, network parameters and a Smith chart.

### Added

- RF tools: reflection, transmission lines and two-port network parameters.
  - `zToGamma(Z, Z0)` and `gammaToZ(Γ, Z0)` convert between an impedance and its reflection coefficient Γ;
    `vswr(Γ)`, `returnLoss(Γ)` and `mismatchLoss(Γ)` give the standing wave ratio and the losses in dB.
    Z0 is 50 Ω when left out. They work element by element, so a sweep gives a vector.
  - `lineInput(ZL, Z0, θ)` is the impedance looking into a line of impedance Z0 and electrical length
    θ = β·ℓ (radians or degrees) ended in ZL. A lossy line's θ is complex, β·ℓ − j·α·ℓ, and an open end is
    ZL = ∞·Ω.
  - `sToZ`, `zToS`, `sToY`, `yToS`, `zToY` and `yToZ` convert S, Z and Y matrices of any number of ports;
    those with S take Z0 as an optional second argument.
  - `sToAbcd`, `abcdToS`, `zToAbcd`, `abcdToZ`, `yToAbcd` and `abcdToY` convert two-ports to and from ABCD
    (chain) matrices, whose B is in ohms and C in siemens. `abcdSeries(Z)`, `abcdShunt(Z)` and
    `abcdLine(Z0, θ)` give the ABCD matrices of a part in series, a part to ground and a line, so a network is
    the product of its parts' matrices, in order.
  - A network with no such matrix is reported, with the reason: a part in series alone has no Z matrix, and
    a part to ground alone has no Y matrix.
- A Smith chart, from Format → Smith chart on a plot. Each trace is a reflection coefficient Γ, or a vector
  of them; the x slot, if filled, is what Γ is swept over, as a frequency. Hovering over a point shows Γ as
  magnitude∠angle, the impedance it means normalized to Z0, and the swept value. Plotting an impedance gives
  a message pointing to `zToGamma`. The choice is saved in the file; an older version of MathMath can't
  draw a Smith chart.

### Known limits

- Network conversions take one real reference impedance, the same at every port. ABCD matrices are for
  two-ports only. The Smith chart has no admittance grid. Line impedances come from you: there are no
  formulas for coax or microstrip dimensions.

## [0.27.0] - 2026-11-07

Circuit analysis from a netlist: node voltages and branch currents, at DC or at a frequency.

### Added

- Circuit analysis from a netlist: `nodeVoltages(N)` and `branchCurrents(N)` at DC, or `nodeVoltages(N, f)` and
  `branchCurrents(N, f)` at a frequency f. A netlist is a matrix with a row for each part: its name in quotes,
  whose first letter says what it is (R resistor, C capacitor, L inductor, V voltage source, I current source,
  O ideal op-amp), its two nodes and its value, as `("R1", 1, 2, 10·kΩ)`. Node 0 is ground, and the others
  are numbered 1, 2, … with none missing. An op-amp's row holds its + input, − input and output nodes.
  Values can be sheet variables, carry units or be plain numbers in ohms, farads, henries, volts and amperes,
  and a source's value can be a phasor. At DC capacitors are open and inductors are shorts; at f, sources are
  phasors at f.
  - `nodeVoltages` lists the voltages from node 0, so element k is node k's voltage with either ORIGIN.
  - `branchCurrents` lists the current through each part in the netlist's order, flowing from its first node
    to its second, so a source supplying power shows a negative current. An op-amp's is the current it
    drives out of its output.
  - A node with no path to ground, a loop of voltage sources (inductors count, at DC) and an op-amp without
    feedback are reported by name rather than giving meaningless numbers.

### Known limits

- Netlists take resistors, capacitors, inductors, independent sources and ideal op-amps: not dependent
  (controlled) sources, transistors or diodes, and no transient analysis. Node numbers, not names.

## [0.26.1] - 2026-11-07

No brackets around a derivative, limit or sum that ends a product, as in Mathcad.

### Changed

- A derivative, a limit, or a sum or product with limits that ends a product is shown without brackets, as
  in Mathcad: `E·I·d⁴/dx⁴ w(x)` rather than `E·I·(d⁴/dx⁴ w(x))`. They keep their brackets when something
  follows them in the product, since their body reads on to the right. An integral, which ends at its dx,
  needs none in a product.

### Fixed

- A limit followed by a factor, as `(lim f)·3`, was shown without brackets, which reads as the limit of
  `f·3`; it's bracketed now.

## [0.26.0] - 2026-11-06

Find and Minerr with vector, matrix and complex unknowns, and ERR.

### Added

- Find and Minerr solve for vectors and matrices as well as numbers, as Mathcad's: from a guess `v := (1; 1)`,
  `v₀ + v₁ = 3` and `v₀ − v₁ = 1` give v = (2; 1), and a matrix equation such as `M·x = b` holds element by
  element. Even `A·A = M`, with A a matrix, finds a square root of M. Several unknowns of different shapes,
  as `Find(x, s)`, come back nested. An inequality between a vector and a number holds for each element.
  Maximize and Minimize take vectors too, calling the function with the whole vector.
- Complex unknowns: a complex guess lets Find look for a complex answer, so `z := 1 + i` with `z² = −4` finds
  2i. A real guess still looks for a real answer only, as in Mathcad.
- ERR, as in Mathcad: after Find or Minerr, how far the constraints are from holding, the square root of the
  sum of each one's error squared. It's 0 when Find solves exactly, and inequalities count how far they're
  broken.

### Fixed

- Minerr, when its constraints can't all hold and one is an inequality, stopped short of the closest answer:
  `q = 1`, `q = 2` and `q > 5` gave 2.17 instead of 8/3, which Mathcad 14 gives.

## [0.25.0] - 2026-11-06

The nth derivative operator, dⁿ/dxⁿ.

### Added

- The nth derivative, dⁿ/dxⁿ, as Mathcad's (Ctrl+Shift+?, or the dⁿ/dxⁿ button): orders 0 to 5, the 0th being
  the expression itself. Type the order above; it's shown below too. It works in units, at each value of a
  range, from a variable order such as `n`, and under → through the algebra engine. In an Odesolve block,
  d²/dt² y(t) is y''(t), so equations can be written either way. Mathcad sheets with it are read.
  Higher derivatives are found by Ridders' extrapolation, at least as accurately as Mathcad 14: e.g. eˣ's fourth
  derivative at 1 to 5·10⁻¹⁰ (Mathcad: 3·10⁻⁹), and d²/dx² sin x at x = 1000 to 10⁻¹³.

### Known limits

- Numerical derivatives of order 6 and above are refused, as in Mathcad: finite differences are mostly
  rounding noise there. The algebra engine has no such limit.

## [0.24.0] - 2026-11-06

Odesolve with conditions at two points (boundary value problems).

### Added

- Odesolve with conditions at two points (boundary value problems), as Mathcad's: `y(0) = 0` and `y(1) = 1`,
  or a slope at the far end, `y'(1) = 0`. As in Mathcad, the solution runs from the point farther from the
  end, so the second point may lie inside the interval or past its end, and the conditions may come in either
  order. Linear and nonlinear equations, higher orders, systems and units all work: a hanging cable,
  `y'' = w/H·√(1 + y'²)` between supports at 0 m and 100 m, sags 12.76 m at the middle.
- Fast-growing solutions come out right. Odesolve splits the interval into segments and solves for every
  joint at once (multiple shooting), so `y'' = 100·y` with `y(0) = 1` and `y(5) = 0` is accurate, where Mathcad
  14's answer is wrong by orders of magnitude and it gives up over a longer interval.
- When no solution meets the conditions, as `y'' + y = 0` with `y(0) = 0` and `y(π) = 1`, Odesolve says so
  instead of giving one that only seems to.

### Fixed

- The ODE solvers could stop with "the step size became too small" when a step landed a rounding error short
  of a point they had to reach.

### Known limits

- Odesolve's conditions can be at two points at most, and each gives one value, as `y(1) = 0` or `y'(1) = 0`,
  as in Mathcad: a combination such as `y(1) + y'(1) = 0` isn't accepted.

## [0.23.0] - 2026-11-06

Solve blocks: Find, Minerr, Maximize, Minimize and Odesolve, and root.

### Added

- Solve blocks, as Mathcad's. Define a guess for each unknown, then a region with `Given`, then the
  constraints, one to a region, then the function that closes the block. A constraint is an equation or an
  inequality: `x^2 + y^2 = 4` typed in a region of its own is a constraint, not a result to work out.
  - `Find(x, y, …)` gives the values that make every constraint hold, within CTOL (0.001 unless a Mathcad
    sheet sets it), or an error when there are none. One unknown gives a number, several a vector, each in
    its own units. Inequalities (`<`, `>`, `≤`, `≥`) keep the answer on their side.
  - `Minerr(x, y, …)` gives the nearest it can get, even when the constraints can't all hold.
  - `Maximize(f, x, …)` and `Minimize(f, x, …)` find where the function f is largest or smallest, alone or
    inside a solve block, whose constraints then limit where they look.
  - `Odesolve(t, b)` solves a differential equation and its starting values, written between Given and
    Odesolve, from the starting point to b, and gives the solution as a function: `y := Odesolve(t, 10)` then
    `y(2.5) =`. Derivatives may be written with primes, `y''(t) + y(t) = 0`, or with d/dt. `Odesolve((x; y),
    t, b)` solves a system, and an optional third number sets how many steps it keeps (1000 unless given).
    Units carry through, so a circuit can be solved in coulombs and seconds.
- A function defined from a solve block, as `f(a) := Find(x)` with constraints that use a, solves the block
  again for each argument, as in Mathcad: `f(9)` and `f(16)` from one block. Odesolve works the same way.
- Every equation and inequality region between Given and the function that closes the block is one of its
  constraints, as in Mathcad.
- `root(f(x), x)`, from x's value as a guess, and `root(f(x), x, a, b)`, between a and b where f changes
  sign, as Mathcad's.
- Primes after a name, as `y'` and `y''`, typed with the apostrophe key: Mathcad keeps them in the name.
- Mathcad sheets' solve blocks and CTOL are read, including the form Mathcad saves Find, Minerr, Maximize,
  Minimize and Odesolve in.

### Known limits

- Find and the rest solve for real numbers, one number per unknown: not complex numbers or whole vectors.
  Minerr doesn't set Mathcad's ERR variable.
- Odesolve's starting values must all be at one point: conditions at two points (boundary value problems)
  aren't supported yet. Its derivatives are primes or first derivatives d/dt; the d²/dt² operator form
  isn't read from Mathcad sheets yet.
- Results agree with Mathcad's to the solvers' accuracy: MathMath works to the last digit or two where
  Mathcad stops at its tolerance, so Mathcad's root(x² − 2, x) is 1.41421356206 and MathMath's 1.41421356237.

## [0.22.0] - 2026-11-05

Mathcad's differential equation solvers, with units.

### Added

- Mathcad's ordinary differential equation solvers. Each takes the starting values, the interval x1 to x2,
  and D(x, y), a function giving the vector of derivatives, and gives a matrix with x in the first column
  and a column for each value of y. As in Mathcad 14, y may start as a single number, x2 may be below x1,
  and D always receives y as a vector.
  - `rkfixed(y, x1, x2, n, D)`: fixed-step fourth-order Runge–Kutta, matching Mathcad 14's results to the
    last digit.
  - `Rkadapt`, `Bulstoer` and `Adams(…, [tol])`, answers at n + 1 evenly spaced points, and `rkadapt` and
    `bulstoer(y, x1, x2, acc, D, kmax, save)`, answers at the solver's own steps. These share one adaptive
    Runge–Kutta solver (Dormand–Prince 5(4)).
  - For stiff equations: `Stiffb` and `Stiffr(…, D, J)` and `stiffb` and `stiffr(y, x1, x2, acc, D, J, kmax,
    save)`, whose Jacobian J(x, y) has ∂D/∂x in its first column, then ∂D/∂y; and `Radau(…, D, [J], [M],
    [tol])`, `BDF` and `AdamsBDF(…, D, [J], [tol])`, whose Jacobian is ∂D/∂y alone and can be left out. `M`
    is a constant mass matrix, for M·y′ = D. These share one stiff solver (Rosenbrock 4(3)).
- Units in the differential equation solvers, which Mathcad 14 refuses: x may have a unit and each value
  of y its own, so a circuit's voltages and currents can be solved in volts, amps and seconds. D's values
  must be in y's units per x's. A start of 0 takes its unit from D, so (0·V; 0·A) works.

### Changed

- Dirac's impulse is now Δ(x), as Mathcad 14 writes it in inverse Laplace transforms, and `δ(m, n)` is only
  Kronecker's delta, as in Mathcad. 0.20.0 used δ(x) for both.
- The second argument to `laplace`, `invlaplace`, `ztrans` and `invztrans` is MathMath's own: Mathcad 14
  won't open a sheet that uses it.

### Fixed

- A column taken out of a matrix whose entries have different units, as M⟨1⟩, took the first column's unit
  where it started at 0. It now takes its own.

### Known limits

- `Odesolve` isn't supported yet: it works inside a Given solve block, which MathMath doesn't have.
- The adaptive and stiff solvers agree with Mathcad's to each method's accuracy, not digit for digit; with
  no tolerance given they work to 10⁻⁹, tighter than Mathcad's defaults. `rkadapt` and the other solvers that
  keep their own steps choose different steps from Mathcad's.

## [0.21.0] - 2026-11-05

Programs and user functions run about three times faster.

### Changed

- Programs and the functions you define run about three times faster. Expressions are now turned into
  closures once, rather than walked as a tree each time they're worked out, and a loop's arithmetic on
  plain numbers, its reads of matrix elements, and its writes into a matrix it owns take direct paths.
  Answers are unchanged: every result on the test sheets is identical, bit for bit.

### Fixed

- An index that draws a random number, as `v[floor(rnd(3))]`, drew it twice. It now draws once.

## [0.20.0] - 2026-11-05

Transfer functions, filter design in five families, and Laplace and z-transforms.

### Added

- Transfer functions. A system is (b; a), coefficients constant term first, as `polyroots` and the `coeffs`
  keyword list them: H(s) = (b₀ + b₁s + …)/(a₀ + a₁s + …). As with filter design, units decide the kind:
  frequencies and times with units treat it as analog, plain numbers as digital (fractions of the sample
  rate, and sample numbers). Coefficients written from a circuit's parts may keep their units, the k-th in
  sᵏ, so an RLC lowpass is `(1; (1; R·C; L·C))`.
- `freqResponse(H, f)` with f in Hz gives an analog H at s = i·2πf, for Bode plots with `ampToDb`, `arg` and
  the log axes. Fractions of the sample rate work as before.
- `stepResponse(H, t)` and `impulseResponse(H, t)`: at times with units, an analog system's response from
  t = 0, as SciPy's `step` and `impulse` (the impulse response leaves out an impulse at 0 from a direct
  term); at sample numbers, a digital filter's.
- `analogPoles` and `analogZeros` (in 1/s), and `digitalPoles` and `digitalZeros` (in the z-plane).
- `polyroots(v)`, Mathcad's: the roots of a polynomial, coefficients constant term first, which may be
  complex. Roots are sorted by real part, then imaginary.
- `unwrapPhase(φ)` removes the jumps of 2π in a phase, as NumPy's `unwrap`, for phase plots past ±180°.
- Filter design in four more families, each with Lowpass, Highpass, Bandpass and Bandstop forms, as SciPy's:
  Chebyshev type I (`cheby1Lowpass(n, ripple, f)`, ripple in dB), Chebyshev type II
  (`cheby2Lowpass(n, attenuation, f)`, f where the stopband starts), elliptic
  (`ellipLowpass(n, ripple, attenuation, f)`), and Bessel (`besselLowpass(n, f)`, phase-normalized).
- Analog filter design: every family, Butterworth included, designs an analog H(s) when its edges are
  frequencies with units, such as `butterLowpass(4, 1·kHz)`, scaled so a₀ = 1. Any frequency with units is
  read as cycles per second (Hz), since Hz and 1/s are the same unit.
- The Laplace and z-transform keywords, as Mathcad's: `laplace, t` (result in s), `invlaplace, s` (in t),
  `ztrans, n` (in z) and `invztrans, z` (in n). A second argument names the result's variable. They are on
  the Keywords menu. Decimals in the expression are made exact first, so 0.5ⁿ transforms like (1/2)ⁿ.
- `Φ(x)`, Mathcad's step function (1 from 0 up), and `δ(m, n)`, Mathcad's Kronecker delta. `δ(x)` with one
  argument is Dirac's impulse, which inverse transforms give: 0 away from 0, ∞ at 0. A transform's variable
  must have no value on the sheet, as Mathcad requires.

### Changed

- `freqResponse` with frequencies in Hz now evaluates an analog H(s) instead of asking for a fraction of the
  sample rate.

### Known limits

- A sheet value with time units inside a transformed expression is written in base units, and its seconds
  `s` can't be told apart from Laplace's `s`. Transform expressions without units, or strip the units first.
- Bessel filters go up to order 15; past that their poles lose accuracy. The other families go to 20.

## [0.19.0] - 2026-11-05

Electrical engineering: units, phasors, decibels and standard part values.

### Added

- Electrical units, with the names and values Mathcad 14 uses, so sheets that use them now calculate:
  ohms (`Ω`, `kΩ`, `MΩ`, `ohm`), siemens (`S`, `mho`), farads (`F`, `μF`, `nF`, `pF`), henries (`H`, `mH`,
  `μH`), coulombs (`C` to `pC`), `Wb`, teslas (`T`, `gauss`, `G`), `Oe`, and smaller amps, volts, seconds
  and watts (`kA`, `μA`, `nA`, `pA`, `μV`, `nV`, `μs`, `ps`, `μW`, `nW`). Results already showed in ohms,
  farads and henries.
- More units that Mathcad 14 lacks: `mΩ`, `GΩ`, `mS`, `μS`, `mF`, `nH`, `pH`, `mT`, `μT`, `MV`, `VA`,
  `kVA`, `MVA`, `Wh`, `kWh`, `Ah`, `mAh` and `eV`. VA shows as W and Wh as J, since they measure the same
  thing.
- Ways to type units without Greek letters: `kohm`, `Mohm`, `mohm` (milliohms) and `Gohm`, and `u` for
  micro (`uF`, `uH`, `uA`, `uV`, `uC`, `uW`, `uS`, `uT`). Typing `Omega` alone gives `Ω`. The
  micro sign `µ` that many keyboards type is read as `μ`.
- `parallel(Z1, Z2, …)`: resistors or impedances in parallel, or capacitors in series. It also takes a
  vector, works with complex impedances, and keeps units.
- `phasor(r, θ)`: the complex number r∠θ. θ is in radians, so `30·deg` works.
- Decibels: `powerToDb` (10·log of a power ratio), `ampToDb` (20·log of a voltage, current or gain ratio's
  magnitude), and `dbToPower` and `dbToAmp` to convert back. `wattsToDbm` and `dbmToWatts` convert between
  power and dBm. They work element by element, so `ampToDb` of a frequency response gives its level in dB.
- `standardValue(x, n)`: the nearest standard part value in the E3, E6, E12, E24, E48, E96 or E192 series
  (IEC 60063), nearest by ratio, as tolerances are, and keeping units. `standardValue(4.8·μF, 12)` is 4.7 μF.
- Format → Complex results as magnitude∠angle shows the selected results as phasors, such as 5∠53.13° Ω,
  with the angle in degrees. Pick it again to switch back. Several results can be selected at once
  (Shift-click), and a matrix with any complex number in it shows all its elements this way.
  The `.mathmath` file format stores this option, `polar`, in a result's number format. Older files read
  unchanged, and the format version stays 1.

### Changed

- A result whose units are a whole power of one named unit now shows in that unit, as Mathcad 14 does:
  conductance as 1/Ω rather than base units, and likewise Ω², 1/W and 1/L. Units that combine several, such
  as S/m, still show in base units.

## [0.18.0] - 2026-11-05

Image processing.

### Added

- Image processing. A gray image is a matrix of 0 to 255, and a color image is a vector of three matrices
  (R; G; B). Functions that work on a channel do each of a color image's three, and give back the same kind.
- Color: `imageChannels(M)` splits the red, green and blue blocks that `readImage` and Mathcad's `READRGB`
  put side by side into (R; G; B), and `joinChannels` puts them back. `toGray` uses the usual Rec. 601
  weights. `rgbToHsv` and `hsvToRgb` convert to and from hue, saturation and value, each 0 to 255.
- Geometry: `resizeImage(M, rows, cols)`, smooth when enlarging and averaging when shrinking;
  `rotateImage(M, angle)` about the center, counterclockwise, so `30·deg` works; `rotate90(M, k)` for quarter
  turns; `flipRows` and `flipCols`.
- Filters: `convolve2d(M, kernel)`, `gaussianBlur(M, σ)`, `boxBlur(M, n)`, `medianFilter(M, n)`,
  `sharpen(M, amount)`, `sobelEdges(M)` for edges, and `erode` and `dilate`. The border is continued past
  the edge, so an image keeps its size. They match SciPy's, and the tests check them against its numbers.
- Tone: `threshold(M, t)`, `levels(M, lo, hi)` to stretch contrast, `gammaAdjust(M, γ)` (below 1 brightens)
  and `equalize(M)` for histogram equalization.
- Dithering to a number of levels per channel: `ditherFloydSteinberg`, `ditherAtkinson` and `ditherJarvis`
  (error diffusion), and `ditherOrdered(M, levels, n)` with an n×n Bayer matrix. A 640×480 color image
  dithers in under a tenth of a second.
- `writeImage("name.png", M)` keeps an image to save, and puts a Save button under its region that
  downloads the latest result as PNG, JPEG or WebP, from the name. A plain matrix saves as gray, (R; G; B)
  as color.
- Two image display options in Format: *Fit image to its range* stretches a matrix's own lowest to
  highest value over black to white, for filter output and spectra; *False color* shows a gray image on the
  blue ramp the surface plots use.

### Changed

- The `.mathmath` format, still version 1, gains the optional `fit` and `falseColor` settings on image
  regions. Images without them show as before.

### Known limits

- A plain matrix is read as one channel, so a color image in side-by-side blocks must be split with
  `imageChannels` before filtering it, or a blur runs across the seams between the blocks.

## [0.17.0] - 2026-11-05

Signal processing.

### Added

- Mathcad's Fourier transforms: `fft` and `ifft`, `FFT` and `IFFT` for real signals of 2^m values, and
  `cfft`, `icfft`, `CFFT` and `ICFFT` for complex vectors of any length and matrices (a 2-D transform). They
  match Mathcad 14's scaling and signs, checked against its own answers. Any length is fast, not only powers
  of two: a million points take a fraction of a second. Values keep their units.
- Convolution and correlation: `convolve(a, b)` and `correlate(a, b)`, of real or complex vectors, at every
  overlap.
- Windows: `hannWindow(n)`, `hammingWindow(n)`, `blackmanWindow(n)` and `kaiserWindow(n, β)`.
- FIR filter design by the window method: `firLowpass(n, fc)`, `firHighpass`, `firBandpass(n, f1, f2)` and
  `firBandstop`, with a Hamming window unless another is given as a last argument.
- Butterworth filters: `butterLowpass(order, fc)`, `butterHighpass`, `butterBandpass(order, f1, f2)` and
  `butterBandstop`. They return the filter as two coefficient vectors, b and a.
- Filtering: `applyFilter(F, x)` runs a filter forward, as it would in real time; `zeroPhaseFilter(F, x)`
  runs it forward and back, so the output doesn't lag. A matrix is filtered a column (a channel) at a time,
  and the output keeps the signal's units. `freqResponse(F, f)` gives a filter's complex gain at a frequency
  or a vector of them.
- Frequencies given to the filters are fractions of the sample rate, from 0 to 0.5, so `80·Hz/fs` works as
  written. The filters match SciPy's definitions, and the tests check them against its numbers.
- WAV files: attach one with Files, then `readWav("name.wav")` gives its samples between −1 and 1, a column
  per channel, and `wavRate("name.wav")` its sample rate in hertz. 8-, 16-, 24- and 32-bit and
  floating-point files are read.

### Known limits

- Mathcad's wavelet transforms, `wave` and `iwave`, aren't built.
- WAV files can be read but not written yet.
- An attached WAV file is kept inside the sheet, so a long recording makes the sheet file large: a 30-second
  stereo recording at 44.1 kHz adds about 7 MB.

## [0.16.1] - 2026-11-05

The README says where the computing happens.

### Changed

- The README now says plainly near the top that all calculation runs in the browser: the server only sends
  the app's files, worksheets are opened and saved on your own computer, and speed depends on your machine.

## [0.16.0] - 2026-11-05

Polar, surface and contour plots.

### Added

- Polar plots. Format → Polar plot draws a plot's traces around a center, taking x as the angle in radians and
  each y as the distance out. Rings and spokes every 30° stand in for the axes, and the outer ring's value can
  be typed to fix the scale. Switching between X-Y and polar only redraws.
- Surface plots. Format → Surface plot (3-D) draws a matrix of heights, a function of two variables, or three
  matrices X, Y and Z in a vector (for shapes such as a sphere). A function is sampled on a 31 × 31 grid
  between the x and y limits typed under the plot, −5 to 5 unless set. Color runs light to dark with height,
  with a scale at the side in the heights' unit.
- Drag across a surface plot to turn it; up and down tilts it. Turning redraws without recalculating, the
  view is saved with the sheet, one undo turns it back, and Format → Reset the 3-D view returns to the start.
- Contour plots. Format → Contour plot draws the same data as level lines on flat x and y axes, shaded like
  the surface, from a matrix of heights or a function.

### Changed

- The `.mathmath` format, still version 1, gains an optional view on plots (polar, surface or contour) and
  the turned angle of a surface. Plots without them are X-Y plots, as before.

### Known limits

- A contour plot needs a matrix of heights or a function; three matrices X, Y and Z draw only as a surface.
- Surfaces are drawn flat-shaded, back to front, without lighting, and their box is scaled to fit rather
  than kept to true proportions, so a sphere may look squashed.

## [0.15.0] - 2026-11-05

Landscape pages.

### Added

- A Page menu on the toolbar turns the page portrait or landscape. The page's width and height swap and its
  margins stay; page breaks on screen and printing follow, and nothing on the sheet moves or recalculates.
  One undo turns it back. Sheets imported in landscape already opened that way; now any sheet can switch.

## [0.14.0] - 2026-11-05

Missing files, said plainly.

### Added

- When a sheet needs files it doesn't have, a notice under the toolbar names them, with an *Attach files…*
  button that opens the file picker. It counts files that referenced sheets need too, and goes away once
  they're all attached. Before, the only sign was a note on hovering over a grayed region.

### Changed

- An answer waiting for a file keeps its `=` and shows *needs a file* after it, in gray. Before, the `=` was
  dropped, and the region looked as if its answer had vanished.

## [0.13.0] - 2026-11-05

Answers appear as they're ready.

### Changed

- Answers appear one at a time as a sheet calculates, as each region finishes, instead of all at once at the
  end. A long sheet fills in from the top, and an answer above a slow region shows, current, while the slow
  one is still calculating.

### Fixed

- An app test compared the trace panel's `hidden` with a boolean, which the browser's types also allow to be
  a string; it failed the type check only.

## [0.12.0] - 2026-11-05

Trace styles, and graying only what a recalculation may change.

### Added

- Trace styles. Select a plot and choose Format → *Trace styles…*: for each trace, a color (from the plot
  palette or any other), a line (solid, dashed, dotted, dash-dot or none), a weight, and a point symbol
  (circle, square, triangle or cross). Changes show at once, and *Default* puts a trace back. The legend
  follows each trace's style. Styles only change how a plot looks, so nothing recalculates.

### Changed

- While a sheet recalculates, only the answers it may change gray out: those from the first region a change
  affects downward. As the calculation reaches each region that doesn't depend on the change, that answer
  shows as current again, so on a long sheet the gray soon narrows to what really depends on the edit.
  Before, every answer grayed. A change that only affects how something looks grays nothing.
- The `.mathmath` format, still version 1, gains optional per-trace styles on plots. Plots without them save
  as before.

## [0.11.1] - 2026-11-04

Deploys no longer depend on the algebra engine's download site.

### Fixed

- A deploy downloaded the algebra engine from the site that publishes it, so it failed whenever that site was
  down. It now sends the copy already set up here, checked against its pinned hash, and the build only
  downloads when that copy is missing.
- The deploy marker on the server was written before the build, so a failed build left it naming a version
  that wasn't running. It's now written once the new version answers.

## [0.11.0] - 2026-11-04

Random numbers.

### Added

- Random numbers: `rnd(x)`, uniform in [0, x) and in x's units; `runif(m, a, b)`, m uniform numbers in
  [a, b); and `rnorm(m, μ, σ)`, m normal numbers. Each region draws from its own stream, so a sheet's random
  data is the same every time it calculates, and recalculating part of a sheet gives the same numbers as
  recalculating all of it. The numbers differ from other programs' draws.

### Changed

- The scoreboard leaves out an answer that depends on random numbers, at any remove, when it doesn't match,
  since the saved answer came from other draws. One that matches anyway, such as a count, still counts.
  Before, those regions stopped with an error.

## [0.10.0] - 2026-11-03

Recalculating only what changed.

### Changed

- A change recalculates from the first region it affects, downward, and only the regions that depend on it.
  Everything above is reused, and below it a region runs again only when it changed or reads something that
  did, directly or through a function. Editing near the bottom of a long sheet takes moments instead of the
  whole sheet's time. A function defined above a change can't see it, as before, so its callers stay put.
- Changing only how an answer looks, such as its display unit or a plot's title, calculates nothing.
- The calculation worker stays between calculations and remembers the sheet. A newer change stops an older
  calculation between regions instead of ending the worker, so typing during a long calculation keeps what
  was done. Stopping a calculation that's running, with Esc or by switching to EDIT, ends the worker, as does a
  failure, and the next calculation then runs the whole sheet, as do opening a sheet, changing its settings
  and attaching files. Switching to EDIT when nothing is running keeps what the worker remembers.
- The green box visits only the regions being recalculated.
- An element or column definition, such as `v_3 := 9`, counts as reading the matrix it extends, so a change
  to that matrix above reaches it.

### Fixed

- Keys typed straight after Tab (moving to a plot's next slot) or Enter (starting a new region below) could be
  lost: the editor lost its focus for a moment as it reopened.

## [0.9.0] - 2026-11-03

Speed on large sheets, and answers that stay in view while their unit or math is edited.

### Changed

- Looking up a name no longer takes longer with every definition above it. A sheet's definitions now share an
  index of which define each name, so a sheet with hundreds of them runs about as fast per step as a short one.
- Integrals that split at a table's points (see 0.5.0) use a 7-point rule on each piece instead of 15, still
  subdividing whenever the error estimate asks. Results agree with the old rule to about 10⁻¹².
- A vector defined element by element over a range grows in place, instead of being copied once per element.
- Taking a column of a matrix, `M⟨j⟩`, copies it once per matrix rather than on every use, so a function that
  interpolates in a table's columns doesn't copy the table on every call.

### Fixed

- Clicking an answer to choose its unit covered the number with an empty box, so the answer seemed to vanish.
  Now the number stays in view and only the unit opens, filled in with the unit shown and selected, so typing
  replaces it.
- Clicking into math with an answer hid the answer while editing. It now stays in view, grayed, just after the
  math, until the sheet calculates again, as in Mathcad.

## [0.8.0] - 2026-11-03

Deployment (milestone 7).

### Added

- `deploy/`: a Docker image that builds the app and serves it with nginx over HTTPS, and `deploy/deploy.sh`,
  which deploys a committed version (the latest tag by default) to a server over ssh, builds there and checks
  the result. Only files git tracks are sent. Host, port and certificate names come from a `deploy/.env` that
  git ignores. `--working` deploys the working copy instead, for trying a change before committing it.
- `deploy/make-certs.sh` signs the server's certificate with a private CA on the server, creating the CA the
  first time.
- `npm run test:deployed` checks a deployed copy in a real browser: a numeric answer, symbolic answers, a plot,
  saving, a secure context, no console errors or policy violations, and the security policy arriving as a
  header with both the page and the calculation worker's script.
- The toolbar shows the app's version, so a deployed copy says which one it is.

## [0.7.0] - 2026-11-02

The calculating region's green box, units on plot axes, Mathcad's splines and remaining matrix functions, and a
Matrix menu for typing matrix operators.

### Added

- While a sheet calculates, the region being worked on gets a green box, as in Mathcad. It appears only once a
  region has taken a tenth of a second, so quick sheets don't flicker, and it isn't printed.
- Plot axes show their unit after the axis expression: the default in gray, chosen as a result's display unit
  is, such as `(m)` or `(s)`. Click it and type another, such as `ft` or `ms`, and the axis converts; clear it
  to go back to the default. A limit typed with units converts too, and a bare number is in the axis's unit.
- Mathcad's interpolating splines: `lspline`, `pspline` and `cspline` (natural, parabolic and cubic ends), in
  1-D and on a 2-D grid, `bspline` (a piecewise polynomial of chosen degree with breaks where asked), and
  `interp` to evaluate any of them. Outside the data, the end piece continues. `medsmooth(v, n)` takes running
  medians over an odd window, cut short at the ends. Spline vectors are laid out as Mathcad lays them out, and
  46 measured results from Mathcad 14 match to within 10⁻¹³.
- Mathcad's remaining matrix functions: `lsolve`, `rank`, `rref`, `diag`, `norm1` and `norm2`, the condition
  numbers `cond1`, `cond2`, `conde` and `condi`, `svds`, `svd` (U over V), `geninv`, `lu` (P, L and U side by
  side, pivoting as Mathcad does), `qr`, `cholesky`, `eigenvecs` and `eigenvec`. Checked against 33 results
  measured in Mathcad 14.
- A Matrix menu on the toolbar, in place of the Matrix button: insert a 2×2, 3×3, column or row matrix, add a
  row or column, and apply transpose, a column M⟨j⟩, vectorize and |M| to the selection or to what's before
  the caret. These couldn't be typed before. Mathcad's keys work too: Ctrl+M for a matrix, Ctrl+1 transpose,
  Ctrl+6 column and Ctrl+− vectorize, though Chrome keeps Ctrl+1 and Ctrl+6 for its tabs.

### Changed

- The `.mathmath` format, still version 1, gains an optional display unit on plot axes.

### Fixed

- `|M|` on a square matrix gave the size of the determinant, dropping its sign; it's now the determinant, as in
  Mathcad 14 (`|(1 2; 3 4)|` is −2). Mathcad's separate determinant operator now imports as `|M|`. With units,
  Mathcad refuses a determinant; MathMath gives it, in the matrix's unit to the power of its size.

### Known limits

- Eigenvectors, `svd` and `qr` are unique only up to sign, and can differ from Mathcad's in sign (`qr` always
  makes R's diagonal positive). For some non-symmetric matrices, `eigenvals` lists the values in a different
  order from Mathcad, and `eigenvecs` follows it.

- Traces with different units on one axis share no unit, so that axis shows plain base-unit numbers with no
  unit after it.

## [0.6.0] - 2026-11-02

Sums over range variables, Mathcad's sum rules and keys, plot titles, and a script to run the app.

### Added

- Sums and products over a range variable, as in Mathcad: type `$` (or `#` for a product), then the range
  variable and the term. With `i := 0..10`, the sum of `i²` over `i` is 385. They read from and import as
  Mathcad's range sum and range product.
- Mathcad's keys for a sum or product with limits: Ctrl+Shift+4 and Ctrl+Shift+3.
- `scripts/serve.sh` (or `npm run serve`) runs the app in the terminal, reachable from other machines by this
  machine's name, which it lets through Vite's host check without touching `vite.config.ts`. `--built` builds
  first and serves the built app, as a deployment would. More names can be given in `MATHMATH_HOSTS`.
- Plot titles. Format → *Axis titles* adds a title beside each axis, and *Plot title* one above the plot.
  Click a title to type it in place, as plain text; Enter or Esc finishes. The plot keeps its size and its
  area makes room. Empty titles show a placeholder on screen and nothing in print.

### Changed

- Sum and product limits follow Mathcad 14, as measured there: they must be whole numbers without units, and
  limits given high to low count down. A limit of ∞ is refused with `=`, saying to use → for an exact answer,
  where before the sum ran until stopped.
- The built app, served with `vite preview`, now sends the content security policy as a header, so the
  calculation worker is held to it too, as it would be when deployed.
- The `.mathmath` format, still version 1, gains optional title fields on plots and their axes. Files without
  titles save exactly as before.

### Fixed

- Σ over a range variable written with no limits gave the column of its values, and a sum with limits given
  high to low gave 0. Σ of a single number or a range variable is now an error that points to `$`, as in
  Mathcad, and reversed limits count down.

### Known limits

- The term of a sum or product runs over a product only, so `Σ i + 1` is `(Σ i) + 1`. Put a sum in the
  term in parentheses.

## [0.5.0] - 2026-11-02

Wider corpus tests (milestone 6): 592 of 664 stored results in the test worksheets match, up from 383.
References, data files, Ctrl+G for Greek letters, and ranges with units checked as Mathcad checks them.

### Added

- References. A Mathcad reference region imports as an `include` region that shows only the file name.
  It runs the other worksheet's regions at that point, so their definitions hold from there on, without
  showing their results. A reference to an `.mcd` file finds the same sheet saved as `.xmcd`. A missing sheet
  is grayed with a note to load it with Files; a sheet that includes itself stops with a message.
- `readTable("name")` reads an attached text file of numbers and words, split on commas, tabs or spaces, into
  a matrix. Words stay strings, and an empty cell is 0, as Mathcad reads it.
- Mathcad's data-reading components (File Input, the Data Import Wizard and the Excel component) import as
  `Name := readTable("file")`, using only the file's name from the component. readTable reads text, so a
  spreadsheet needs saving as CSV.
- Files → *From this computer…* also takes data files, which add a readTable region, and worksheets
  (`.xmcd` or `.mathmath`), which references then find by name. Several files can be picked at once, and an
  attached `.mathmath` sheet brings the files attached to it.
- `histogram(n, data)` and `hist(bounds, data)`.
- Ctrl+G turns the letter before the caret into its Greek letter, as in Mathcad (`q` is θ, `f` is φ, `D` is Δ),
  and pressing it again turns it back. Typing a letter's name, such as `alpha`, still works too.
- Mathcad's zero-over-zero option, read from imported sheets: with it on, 0/0 is 0, element by element.
- Calling a function with fewer arguments than it takes gives a function of the rest, as in Mathcad.
- The scoreboard can score sheets that read files and reference others: `--also <folder>` adds worksheets to
  find references in, before the corpus, and `--skip` leaves sheets out. Results held up by a missing file
  or a Mathcad function to replace are counted apart, as needing a file.

### Changed

- The `.mathmath` format, still version 1 before 1.0, gains the `include` region kind and two sheet settings,
  `exactCompare` and `zeroOverZero`. Older files open unchanged; a file with a reference in it needs this
  version.
- Comparisons follow the sheet's "exact equality" setting. With it off, as in some Mathcad sheets, numbers
  within a relative 10⁻¹² of each other are equal, as measured in Mathcad 14. New sheets compare exactly.

- Integrals split at the points of any table interpolated at the integration variable, so each piece is
  smooth. Integrals of tabulated data are far faster (one color integral went from 2.6 s to 44 ms) and more
  accurate.
- Arithmetic on arrays of real numbers works on the numbers directly, about three times faster.
- The scoreboard compares a result that depends on an integral or derivative, at any remove and through
  references, with the looser tolerance integrals get, because Mathcad computes them only to its tolerance.
  With a referenced sheet missing, a name left undefined counts as needing that file.

### Fixed

- A call on the right of a global definition (`≡`), which Mathcad saves in a different form, failed to read.
- A name mixing Greek and Latin letters, such as `Δx` or `αβ`, failed to read when typed. Adjacent letters,
  Greek ones included, are now one name, as in Mathcad.
- Ranges with units now follow Mathcad 14's rules, as measured there. A range with units must give its second
  value (`0s, 0.5s..3s`); without it the step would be 1 of a base unit, so `0cm..3cm` gave only 0. Every value
  must have the same unit, though a 0 can go without one. Before, `0m..3s` quietly gave metres and
  `0, 0.5m..2m` lost its unit.
- A derivative at a range or vector of points failed; it's now taken at each point.
- A stored zero now matches a computed zero whatever its display unit.
- An attached sheet that needs more files (references of its own, or data files) kept its reference grayed,
  saying only that some other file wasn't attached, so it looked as if attaching hadn't worked. The reference
  now shows as found, and its note lists every file the sheet still needs, at any depth.
- The note confirming an attached file vanished as soon as the sheet recalculated. It now stays a few seconds.

## [0.4.0] - 2026-11-02

Plots, display units, images and a LIVE / EDIT mode (milestone 5).

### Added

- X-Y plots. Press `@` or use the toolbar. The y and x expressions are slots edited in place; commas give
  several traces, and values typed at the axis ends override the automatic limits. Log axes, points or lines,
  a readout on hover, and a resize handle. Trace colors pass a color-vision check, and each trace has its own
  dash pattern. Plots imported from `.xmcd` files stay as their stored pictures. 3-D plots come later.
- Results show default display units chosen the way Mathcad chooses them: a named unit (N, J, W, Pa, C, V,
  Ω, F, T, Wb, H, lx, L) where one fits, otherwise base units in a fixed order. They agree with Mathcad on
  all 27 of its choices in the self-contained test sheets.
- Click an answer to set its unit. `degC` and `degF` take their offset, and a chosen unit survives editing.
- Image regions show a matrix in gray, or in color from three matrices or three blocks of columns. Mathcad's
  two image viewer components import as image regions.
- `readImage("name")` reads an attached image file. Files → *From this computer…* or *From a web address…*
  attaches a file and adds `■ := readImage("name")` with the name placeholder selected. A web address must be
  `https`, and it is fetched once, when the file is attached, never during a calculation. Attached files travel
  inside the saved worksheet.
- Pictures from files can be placed on the page.
- A LIVE / EDIT toggle on the toolbar replaces the Stop button. LIVE recalculates after every change, as before.
  EDIT calculates nothing, so a slow sheet can be changed without waiting. Answers that go out of date gray
  out (plots and images fade), with a note on hover, and switching back to LIVE calculates at once. Switching
  to EDIT stops a running calculation. Esc still stops one calculation without changing the mode.

### Changed

- Imported sheets keep Mathcad's function names. MathMath's own functions get their own names, and a
  translation table (`src/xmcd/names.ts`) maps the ones that mean the same thing (empty so far).
- Mathcad's file functions (`READRGB`, `READBMP` and the rest) don't run, because they read paths on
  Mathcad's machine. Their regions, and everything depending on them, are grayed, with a note saying to load
  the file with Files instead. `readImage` refuses folder paths and explains why.
- Program blocks draw their bar as part of the array (`\begin{array}{|l}`) rather than as a stretchy `\left|`.
  A stretchy bar is centered on the first line, so a program left as much empty space above it as it hung
  below: one test program went from 361 px to 128 px tall. Programs saved in the old form still open.
- Answers left over from a stopped or failed calculation now gray out with a note, instead of looking current.
- The content security policy allows `https` connections, for attaching images from web addresses.

### Fixed

- Strings lost their spaces when math was read back from the editor. String text is now read verbatim.
- A backslash in a string was written as a LaTeX line break. It's now written as `\textbackslash`.
- A fraction whose numerator is a variable such as `dL` was read as a derivative.
- Files saved by earlier builds lacked fields added since. They're filled on opening, and nothing else
  changes, so such a file reads back and saves again unchanged.
- Opening a sheet could briefly show the previous sheet's answers in regions with the same ids, or keep them
  if the new sheet's calculation failed.
- Results failed to arrive from the calculation worker when two of them shared one buffer, because the
  buffer was listed twice for transfer.

### Known limits

- KaTeX's letters are wider than Mathcad's, so wide programs can touch their neighbors.
- `°C` and `°F` are typed as `degC` and `degF`.
- Images are decoded by the browser, so JPEG pixels may differ from Mathcad's by one level.
- Attaching a file can't be undone. `writeImage` isn't built yet.
- In a file-writing definition whose parameter is a path, the path loses its spaces on the round trip
  through the text form.
- Tested in Chromium only; Firefox and Safari are untested.

## [0.3.0] - 2026-11-01

The paper app, native files and symbolic evaluation (milestones 3 and 4, released together because they
touch the same core files).

### Added

- The worksheet app: click anywhere and type, Mathcad-style keys (`:` `;` `[` `.` `]` `{` `}`), drag, box
  select, shift-click, align, push-down, text regions, display-only math, undo, printing, and open and save.
- Calculation runs in a Web Worker, and Esc stops it.
- The `.mathmath` file format, version 1. It stores expression trees rather than LaTeX. Math that can't be
  read is kept as typed, and regions this version can't edit keep their original data, so saving loses nothing.
- Symbolic evaluation through Giac: the `→` operator (Ctrl+.) and eleven keywords. Sheet definitions are
  substituted as expressions, and every command is printed from the tree, so nothing from a file reaches the
  engine as text. Esc ends a running Giac call.
- Giac is GPL, so setup downloads its WebAssembly build and checks a pinned hash.

### Changed

- The spikes from 0.2.0 are replaced by tests. Scoring is split from the command line so browser checks can
  share it.

### Known limits

- Printing covers the first page width only.
- Text styling isn't imported from `.xmcd` files.
- Keyword chains show on one line, not stacked. `collect` ignores its variable and just factors.
- Results past about 17 digits lose precision when read back from Giac.

## [0.2.0] - 2026-11-01

Editor and algebra spikes.

### Added

- An editor spike: worksheet math round-trips through a live MathLive field, and a paper prototype drives
  click-and-type with real key events. MathLive passed all four criteria set before testing it.
- An algebra spike: 86 expressions run in browser workers through three engines, scored against known
  answers. Giac was chosen.
- Spike code is disposable, and nothing in `src` depends on it. Engines used only by the spike aren't
  project dependencies; see `spikes/README`.

### Changed

- MathLive is pinned to 0.111.4, because a reused field crashes on stale shortcut state.

## [0.1.0] - 2026-11-01

Worksheet importer, numeric engine and scoreboard.

### Added

- Import of math and text regions from `.xmcd` files.
- A tree-walking evaluation engine that carries units.
- A scoreboard that compares results with the answers stored in a folder of worksheets, given by
  `--corpus` or `MATHMATH_CORPUS`. No worksheets are in this repository.
- A benchmark that runs one program through four backends and requires identical output.

### Changed

- `noUncheckedIndexedAccess` is off; it adds noise to numeric code.

## 0.0.0 - 2026-11-01

Project setup: TypeScript, Vitest, the license, and `scripts/setup.sh`, which marks generated folders as
ignored when the checkout is inside Dropbox.

