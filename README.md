# MathMath

An open-source, web-based engineering math application with a WYSIWYG paper interface. Math, text
and plots sit anywhere on the page, and live math reads like handwritten notes.

**Status: early development.** Nothing here is usable yet.

## Development

Requires Node 22 or later.

```sh
scripts/setup.sh    # create generated folders and install dependencies
npm test
npm run build
```

Use `scripts/setup.sh` rather than a bare `npm install` on a first checkout. If the checkout is inside
a Dropbox folder, it marks `node_modules` and `dist` as ignored before they fill, and `npm test` and
`npm run build` then stop with an error if a mark goes missing. Outside Dropbox, none of this applies.

## License

GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
