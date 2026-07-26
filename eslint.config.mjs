import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from '@typescript-eslint/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';

// ESLint 10 removed all core formatting rules, so the style rules below now come
// from @stylistic. See https://eslint.org/docs/latest/use/configure/migration-guide
export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'provisioning',
    'src/**/*.test.ts',
  ]),
  {
    files: ['{src,apps,libs,test}/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs['flat/recommended'],
    ],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      '@stylistic/arrow-spacing': ['warn', { before: true, after: true }],
      '@stylistic/brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': 'error',
      '@stylistic/comma-style': 'error',
      '@stylistic/dot-location': ['error', 'property'],
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/max-statements-per-line': ['error', { max: 2 }],
      '@stylistic/no-floating-decimal': 'error',
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1, maxBOF: 0 }],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'never',
        named: 'never',
        asyncArrow: 'always',
      }],
      '@stylistic/space-in-parens': 'error',
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/space-unary-ops': 'error',
      '@stylistic/spaced-comment': 'error',
      'curly': ['error', 'multi-line', 'consistent'],
      'max-nested-callbacks': ['error', { max: 4 }],
      'no-console': 'off',
      'no-empty-function': 'off',
      'no-inline-comments': 'off',
      'no-lonely-if': 'error',
      'no-shadow': ['error', { allow: ['err', 'resolve', 'reject'] }],
      'no-var': 'error',
      'prefer-const': 'error',
      'yoda': 'error',
    },
  },
  {
    // Specs nest describe/it/mock-factory callbacks by nature, and ESLint 10 counts
    // nesting more aggressively than v8 did, so give test files a little more room.
    files: ['**/*.spec.ts'],
    rules: {
      'max-nested-callbacks': ['error', { max: 6 }],
    },
  },
]);
