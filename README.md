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
algebra system by Bernard Parisse and others, licensed under the GPL. `scripts/setup.sh` downloads its
WebAssembly build, and the app runs it unchanged in a Web Worker.

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
