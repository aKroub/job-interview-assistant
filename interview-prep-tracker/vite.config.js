import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        /**
         * SSE streaming support — disable response buffering for
         * text/event-stream so events flush to the browser immediately.
         * Replaces the CRA setupProxy.js configuration.
         */
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
            if (ct.includes('text/event-stream')) {
              proxyRes.headers['content-encoding'] = 'identity';
            }
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
  },
});
