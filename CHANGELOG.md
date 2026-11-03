# Changelog

All notable changes to MathMath are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Before 1.0, a minor version is a release with new features and a
patch version is fixes only. Each release is a git tag, `v` plus the version.

The `.mathmath` file format has its own version number, stored in each file. It changes only when the format
does, and those changes are noted here.

## [Unreleased]

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

