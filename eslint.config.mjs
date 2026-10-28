import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**', '**/generated/**', '**/node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        crypto: 'readonly',
        window: 'readonly',
        document: 'readonly',
        confirm: 'readonly',
        FormData: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
