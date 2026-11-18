# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue. On GitHub, open the repository's
**Security** tab and choose **Report a vulnerability**. Only the maintainer sees the report.

Include what an attacker could do, the steps or a file that shows it, and the version (Help → About).

You'll get a reply as soon as the maintainer can look at it. When it's fixed, the changelog will say so, and
the report can be made public with credit to you, if you'd like it.

## Supported versions

Fixes go into the latest release only.

## What counts

MathMath runs entirely in the browser, and its server only sends the app's files. The most likely problems
are:

- a worksheet file (`.mathmath` or an imported `.xmcd`) that runs script, reaches the network, or escapes the
  page's content security policy when opened;
- text, results or pictures in a worksheet that inject markup into the page;
- weaknesses in the files in `deploy/` used to serve a copy.

A calculation that is wrong, slow or runs out of memory is a bug, not a security problem: open an issue for it.
