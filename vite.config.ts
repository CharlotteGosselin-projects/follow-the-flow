import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Enforced by the browser: no network requests of any kind (fetch / XHR / WebSocket /
// beacons) and no third-party resources. Only added to the built page, because the dev
// server needs a websocket for hot reload.
const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

// Until the switch-over, the new app's page is app.html so the current index.html keeps
// serving the live app from the repo root. The build still publishes it as index.html.
function publishAsIndex(): Plugin {
  return {
    name: 'publish-as-index',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['app.html'];
      if (page) page.fileName = 'index.html';
    },
  };
}

export default defineConfig({
  // Relative paths, so the app works from any folder (GitHub Pages serves it under /follow-the-flow/).
  base: './',
  server: { open: '/app.html' },
  build: { rollupOptions: { input: 'app.html' } },
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    publishAsIndex(),
    // Offline support: precaches the app's own files. It never contacts any other host.
    VitePWA({
      filename: 'sw.js', // same name as the previous worker, so it replaces it in place
      injectRegister: false, // registered in src/main.tsx
      manifest: false, // public/manifest.webmanifest
      includeAssets: ['icon.svg', 'manifest.webmanifest'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
