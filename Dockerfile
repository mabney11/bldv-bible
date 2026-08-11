# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js favicon.svg ./
COPY src ./src
# Vite's static-passthrough dir (self-hosted fonts referenced as absolute
# /fonts/*.woff2 URLs in Reader.css — never imported, so Vite can't bundle
# them; it just copies public/ verbatim into the output root). This was
# missing, so every deploy silently shipped without public/fonts/ at all —
# the CSS @font-face rules pointed at a path that never existed in the
# image, and every custom typeface (Cochineal, Antykwa Toruńska, Coelacanth,
# Kierkegaard) fell back to the browser default with no visible error.
COPY public ./public
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

# entrypoint.sh re-runs server/build-headings.mjs at container start (once
# corpus.db is symlinked in from the volume) to regenerate headings.json —
# acrostic stanza letters (Psalm 119, etc.) and Psalm/Habakkuk superscriptions.
# That script needs src/lib/books.js for translit()/LETTER_NAMES, which is
# frontend source and otherwise never present in this runtime stage. Without
# it, build-headings.mjs's locate('books.js') fails, the script dies before
# writing ANY file (not even an empty placeholder), and /headings.json 404s
# for the life of the container — entrypoint.sh treats that as a non-fatal
# warning, so the app boots normally and the missing headings go unnoticed
# until someone reads a Psalm. locate() just needs the file findable by name,
# so it doesn't need src/lib/'s directory structure preserved — BUT it does
# need its own package.json declaring "type":"module" alongside it: books.js
# uses `export const`/`export function` (fine in the real repo, where the
# PROJECT ROOT package.json says "type":"module" and locate() climbs up to
# find it), while server/package.json — the nearest one in this image — says
# "type":"commonjs", so without this Node parses the copied file as CommonJS
# and dies on the first `export` with a SyntaxError. Isolate it in its own
# subfolder rather than flipping server/package.json's type, which the rest
# of the CommonJS server code relies on staying as-is.
COPY --from=frontend-build /app/src/lib/books.js ./vendor/books.js
RUN printf '{"type":"module"}\n' > ./vendor/package.json

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "cluster.js"]
