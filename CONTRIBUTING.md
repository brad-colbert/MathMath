# Contributing to MathMath

Thank you for helping. Bug reports, fixes, new functions, Help text and gallery examples are all welcome.

## Reporting a problem

Open an issue with what you typed, what you expected and what MathMath showed. A small `.mathmath` file that
shows the problem helps most. Don't attach worksheets you aren't free to share.

To report a security problem, don't open an issue: see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and branch from `main`.
2. Set up and check your copy (Node 22 or later):

   ```sh
   scripts/setup.sh    # install dependencies and fetch the algebra engine
   npm run dev         # run the app
   npm run typecheck
   npm test
   npm run test:e2e    # browser tests on the production build; needs Chromium at /usr/bin/chromium
   ```

3. Keep each pull request to one change, and say in it what a user would notice.
4. Sign off every commit (see [Sign-off](#sign-off-the-developer-certificate-of-origin) below).

What a change should include:

- **A changelog line.** Add it under `## [Unreleased]` in `CHANGELOG.md`, as Added, Changed, Fixed or Known
  limits. Say what a user would notice and why, not which function changed. The maintainer sets version
  numbers and tags releases.
- **Tests.** Engine changes need unit tests in `test/`. Changes to the page need a check in `test/e2e/app.e2e.ts`.
- **Help.** A new or changed function needs its Help entry in `src/help/functions/`, with a worked example, and
  any topic page it belongs to in `src/help/topics.ts`. Then run `npm run help:results`, which stores the
  examples' answers.
- **An example, for a new capability.** Add a gallery sheet in `examples/sheets` and run `npm run examples`.
  `npm test` fails while `public/examples` is out of date.

## Code and other material

- Every source file starts with the AGPL notice that the other files carry. In a new file you wrote, you may
  add your own copyright line beside Pelican Labs'.
- Third-party code must have a licence compatible with the GNU AGPL v3 or later. Keep its notice with it, and
  name it under "Third-party software" in `README.md`.
- Write your own code and text. Don't copy from other math programs' source, manuals or help files, or from
  material you don't have the right to share. To match another program's results, test against its answers;
  don't copy its text.
- Don't commit worksheets, data or pictures you didn't make, unless their licence allows it, and say where
  they came from.

## Sign-off: the Developer Certificate of Origin

MathMath uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO), version 1.1.
Contributors keep the copyright in their work. By signing off a commit, you certify the DCO's terms: that you
wrote the change, or otherwise have the right to submit it under the project's licence, the GNU Affero
General Public License v3 or later, and that the contribution and your sign-off are kept as a public record.

Sign off by committing with `-s`:

```sh
git commit -s -m "fix: describe the change"
```

This adds a line to the commit message with the name and email in your git settings:

```
Signed-off-by: Your Name <you@example.com>
```

The address goes public with the commit. If you'd rather not show yours, use your GitHub noreply address
(found under Settings → Emails).

A check on each pull request looks for the line. To add a forgotten sign-off:

```sh
git commit --amend -s --no-edit         # the last commit
git rebase --signoff main               # every commit on your branch
git push --force-with-lease
```

## License

MathMath is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). Your contributions
are accepted under the same licence.
