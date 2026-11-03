# Builds the app and serves it with nginx. All calculation runs in the browser; the server only sends files.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Giac is downloaded and checked against its pinned hash, as scripts/setup.sh does.
RUN node scripts/fetch-giac.mjs && npm run build && npx tsx deploy/render-nginx.ts /nginx

FROM nginx:1.31.4-alpine
COPY --from=build /nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /nginx/mathmath-headers.conf /etc/nginx/mathmath-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
