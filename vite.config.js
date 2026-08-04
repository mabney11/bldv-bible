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
  },
});
