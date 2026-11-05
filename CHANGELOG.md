# Changelog

All notable changes to MathMath are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Before 1.0, a minor version is a release with new features and a
patch version is fixes only. Each release is a git tag, `v` plus the version.

The `.mathmath` file format has its own version number, stored in each file. It changes only when the format
does, and those changes are noted here.

## [Unreleased]

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

