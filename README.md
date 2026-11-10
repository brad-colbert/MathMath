# MathMath

An open-source, web-based engineering math application with a WYSIWYG paper interface. Math, text
and plots sit anywhere on the page, and live math reads like handwritten notes.

**Status: early development.** You can write, calculate, save and print worksheets, but expect rough edges.

## Everything runs in your browser

All the computing happens on your own computer, in the browser. The server only sends the app's files
(the page, its scripts and the algebra engine) and does no calculation.

- **Calculation:** numbers, units, programs and plot data are worked out in a background thread of the page.
  Symbolic algebra runs in a second thread, in Giac compiled to WebAssembly. Plots are drawn in the page.
- **Your worksheets stay with you:** opening and saving use files on your computer, and nothing is uploaded
  or kept on the server. The only outside request the app makes is when you load a picture from a web
  address, which your browser fetches from that site directly.
- **Speed depends on your machine, not the server's:** a large sheet calculates as fast as the computer
  running the browser allows, and one small server can serve many people.

## Development

Requires Node 22 or later.

```sh
scripts/setup.sh    # create generated folders and install dependencies
npm run dev         # run the app
npm test
npm run test:e2e    # browser tests on the production build
npm run build
```

The worksheets in Examples are written as code, in `examples/sheets`. After changing one, run
`npm run examples` to rewrite `public/examples`; `npm test` fails while those files are out of date.

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

## Deploying

The app is static: all calculation runs in the browser, and the server only sends files. `deploy/` builds a
Docker image that serves it with nginx over HTTPS, and deploys a committed version to a server over ssh.

```sh
cp deploy/.env.example deploy/.env   # the ssh host, folder, port and certificate names
deploy/deploy.sh                     # the latest tag; or name a tag, branch or commit
deploy/deploy.sh --working           # the working copy, to try a change before committing it
MATHMATH_URL=https://host:port/ MATHMATH_CA=ca.crt npm run test:deployed   # smoke test in a browser
```

Only files git tracks (or, with `--working`, new files it doesn't ignore) are sent, and the server never needs
access to the repository. It must be HTTPS: opening and saving files and the clipboard need a secure context.
`deploy/make-certs.sh` signs a certificate with a private CA on the server, creating one the first time;
import its `ca.crt` into each browser, trusted for websites. The content security policy in `vite.config.ts`
is sent as a header on every file, because the calculation worker takes its policy from its own script.

## Third-party software

Symbolic evaluation uses [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html), a computer
algebra system by Bernard Parisse, Renée De Graeve and others, licensed under the GNU General Public License,
version 3 or later. `scripts/setup.sh` downloads its WebAssembly build, and the app runs it unchanged in a Web
Worker. About shows Giac's name, license and source link.

- **The build.** `giacwasm.js` from <https://www-fourier.univ-grenoble-alpes.fr/~parisse/giacjs/giacwasm.js>
  (19,016,229 bytes, last modified upstream 2025-10-22), pinned by SHA256 in `scripts/fetch-giac.mjs`:
  `a39869bb02000d0baaf8a24907a57552ab4b63f1944b53c222db8fba2840cb7c`. Asked with `version()`, it reports
  `giac 1.9.0-xx`: built from the 1.9.0 series, with the exact patch level not recorded in the build. (The
  `1.6.0` in that folder's `package.json` is the version of the JavaScript wrapper, not of Giac.)
- **Its source.** Giac's author distributes this identical file, byte for byte, as `doc/giacwasm.js` inside the
  Giac 2.0.0 source package `giac_2.0.0-14.tar.gz`, at
  <https://www-fourier.univ-grenoble-alpes.fr/~parisse/debian/dists/stable/main/source/giac_2.0.0-14.tar.gz>
  (SHA256 `e746ecf6ed8e59ac04b3e6389e7fa3aef1177b12f54c55e38335ba3784a5323f`, as listed in `giac_2.0.0-14.dsc`
  beside it). That package is the source this project points to. The scripts for building the WebAssembly
  file itself aren't in it.
- **License.** GPL-3.0-or-later, as the `package.json` and `LICENSE` published with `giacwasm.js` state.

The Bessel and Airy functions of a complex argument, `src/engine/amos.ts`, are a TypeScript port of SciPy's C++
translation of D. E. Amos's Algorithm 644 (ACM TOMS 12, 1986, with its 1990 and 1995 remarks), from
[scipy/xsf](https://github.com/scipy/xsf) `include/xsf/cpu/amos/amos.h` at commit `3682d380`. That translation is
copyright the SciPy developers under the BSD 3-Clause license; Amos's routines were issued by Sandia Laboratories
and approved for unlimited release. Both notices are kept at the top of `amos.ts`, and, since the build drops
comments, the app serves them as `licenses/amos.txt`, linked from About.

The Earth example carries NASA's Apollo 17 photograph "The Blue Marble", which is in the public domain; see
`examples/assets/README.md`.

## Hosting a copy

A build with `MATHMATH_SITE` set to a folder holding `site.json` adds a host's own parts without changing the
app: extra Content Security Policy sources, a script loaded after the app, and a link to the source code in
About. The script can fill `#site-slot`, a bar at the left of the desk, clear of the paper and of Help on the right,
that otherwise stays hidden and never prints. A tall ad, such as 160 × 600, suits it.

```json
{
  "csp": { "script-src": ["https://ads.example.com"], "frame-src": ["https://ads.example.com"] },
  "script": "extras.js",
  "source": "https://github.com/example/MathMath"
}
```

The build writes `dist/site/extras.js` and `dist/site/csp.txt`, the full policy for the host to send as a
`Content-Security-Policy` header. The page carries the same policy in a `<meta>` tag, and both apply. Without
`MATHMATH_SITE`, a build is exactly as before.

## License

Copyright (C) 2026 Pelican Labs, LLC.

Mathcad is a trademark of PTC Inc. MathMath is not affiliated with or endorsed by PTC.

GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE). Every source file carries the notice.
