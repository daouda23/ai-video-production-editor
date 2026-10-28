import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// In dev, open the studio at the root URL. The marketing site of the original
// project (index.html → landing) stays reachable at /landing.html.
const studioAtRoot = (): Plugin => ({
  name: 'studio-at-root',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = (req.url || '').split('?');
      if (path === '/' || path === '/index.html') {
        req.url = `/studio.html${query ? `?${query}` : ''}`;
      }
      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), studioAtRoot()],
  base: './', // Crucial for Electron to load assets from the file system
  define: {
    'process.env': {} // Polyfill process.env to prevent crashes in renderer
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // Disable source maps for production
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        'landing-en': resolve(__dirname, 'landing-en.html'),
        'landing-fr': resolve(__dirname, 'landing-fr.html'),
        docs: resolve(__dirname, 'docs.html'),
        portfolio: resolve(__dirname, 'portfolio.html'),
        services: resolve(__dirname, 'services.html'),
        software: resolve(__dirname, 'software.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        faq: resolve(__dirname, 'faq.html'),
        contact: resolve(__dirname, 'contact.html'),
        datenschutz: resolve(__dirname, 'datenschutz.html'),
        agb: resolve(__dirname, 'agb.html'),
        widerruf: resolve(__dirname, 'widerruf.html'),
        studio: resolve(__dirname, 'studio.html'),
        embed: resolve(__dirname, 'embed.html'),
        'embed-host-demo': resolve(__dirname, 'embed-host-demo.html'),
        portal: resolve(__dirname, 'portal.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
