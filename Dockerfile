# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js favicon.svg ./
COPY src ./src
# vite.config.js has build.outDir set to 'server/public', so this writes
# the built bundle straight there — there is no dist/ folder in this repo.
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:22-slim AS runtime
WORKDIR /app/server

# better-sqlite3 has a native binding — install fresh here so it's built
# for this image's OS/arch (a node_modules copied from macOS/Windows dev
# machines will not load). It ships prebuilt binaries for linux-x64 glibc,
# but python3/make/g++ are here as a fallback in case npm has to compile
# from source instead of fetching the prebuilt one.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# App code (this also copies a stale server/public/ from the build context,
# but the next COPY overwrites it with the freshly built one).
COPY server/ ./

# Fresh frontend build wins over anything checked into server/public/.
COPY --from=frontend-build /app/server/public ./public

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "cluster.js"]
