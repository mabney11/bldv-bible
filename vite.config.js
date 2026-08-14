import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend API host — change here if your Paleo-Hebrew server runs elsewhere.
const API_HOST = process.env.PALEO_API_HOST || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':      { target: API_HOST, changeOrigin: true },
      '/lexicon':  { target: API_HOST, changeOrigin: true },
      '/admin':    { target: API_HOST, changeOrigin: true },
    },
  },
  build: {
    // Output directly into where the server statically serves from. Without
    // this, the build lands in ./dist and you have to manually copy it to
    // server/public/ — easy to forget, and stale asset hashes hang around
    // when you do remember. `emptyOutDir: true` wipes the directory each
    // build so old hashes can't 404 the new index.html.
    outDir: 'server/public',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split framework code (React/ReactDOM/react-router-dom) into its
        // own chunk, separate from this app's own code. Every route already
        // code-splits into its own chunk via React.lazy (see App.jsx) — this
        // is the same idea one level up: WORKBOOK.md shows this app's pages
        // change close to daily, but the framework underneath barely ever
        // does. Without this split, every deploy's content-hash changes on
        // the ONE chunk everything lived in, so a repeat visitor re-downloads
        // React itself on every deploy even though it's byte-identical.
        // Splitting it out means a deploy that only touches, say,
        // Translate.jsx only invalidates Translate's own small chunk.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'vendor';
          }
        },
      },
    },
  },
});
