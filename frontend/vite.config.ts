import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    // The API is called on its own origin with credentials, so CORS + cookies
    // must work in dev exactly as they do in production. localhost:5173 and
    // localhost:4000 are the *same site* (ports are not part of a site), which
    // is why SameSite=Lax cookies work here without a proxy.
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    // Warn earlier than the 500kB default: the storefront's first load budget
    // matters more than a dashboard's.
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendor code into its own chunks so
        // an app deploy does not invalidate it in users' caches. Vite 8
        // (Rolldown) only accepts the function form here.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          if (/[\\/]node_modules[\\/](@tanstack|axios)[\\/]/.test(id)) return 'query-vendor';
          return undefined;
        },
      },
    },
  },
});
