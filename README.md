# MathMath

An open-source, web-based engineering math application with a WYSIWYG paper interface. Math, text
and plots sit anywhere on the page, and live math reads like handwritten notes.

**Status: early development.** You can write, calculate, save and print worksheets, but expect rough edges.

## Development

Requires Node 22 or later.

```sh
scripts/setup.sh    # create generated folders and install dependencies
npm run dev         # run the app
npm test
npm run test:e2e    # browser tests on the production build
npm run build
```

To check the engine against results stored in a folder of `.xmcd` worksheets, and to compare ways of
running programs:

```sh
MATHMATH_CORPUS=/path/to/worksheets npm run scoreboard
MATHMATH_CORPUS=/path/to/worksheets npm run roundtrip
npm run bench
```

Use `scripts/setup.sh` rather than a bare `npm install` on a first checkout. It fetches the algebra
engine. If the checkout is inside a Dropbox folder, it also marks generated folders as ignored before they
fill, and `npm test` and `npm run build` then stop with an error if a mark goes missing. Outside Dropbox,
none of this applies.

## Third-party software

Symbolic evaluation uses [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html), a computer
algebra system by Bernard Parisse and others, licensed under the GPL. `scripts/setup.sh` downloads its
WebAssembly build, and the app runs it unchanged in a Web Worker.

## License

GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
