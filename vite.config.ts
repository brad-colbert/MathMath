import { defineConfig } from 'vite';

/**
 * No generated code runs in the app, so production can refuse it outright. The one exception is
 * compiling WebAssembly, which the algebra engine needs. A <meta> policy doesn't reach workers, so
 * a deployed server must send this as a header too.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Images can be loaded from a web address, once, when asked for in the Files menu.
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

export { CSP };

export default defineConfig({
  // Nothing inlined: the policy above refuses data: fonts.
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
  // The built app is served with the policy as a header, as a deployment would, so workers get it too.
  preview: { headers: { 'Content-Security-Policy': CSP } },
  plugins: [{
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
  }],
});
