import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // app.js / sw.js are the current app, replaced by src/ in a later step.
  { ignores: ['node_modules', 'dist', 'test-results', 'playwright-report', 'app.js', 'sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.tsx'], ...reactHooks.configs.flat.recommended },
  {
    // The app must never talk to a network: these APIs are banned outright in app code.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection'].map(
          (name) => ({
            name,
            message: 'Follow the Flow never sends data over the network.',
          }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'Follow the Flow never sends data over the network.',
        },
        {
          object: 'window',
          property: 'fetch',
          message: 'Follow the Flow never sends data over the network.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
