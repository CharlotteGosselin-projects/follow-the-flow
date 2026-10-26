import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // app.js / sw.js are the current app, replaced by src/ in a later step.
  { ignores: ['node_modules', 'dist', 'test-results', 'playwright-report', 'app.js', 'sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
