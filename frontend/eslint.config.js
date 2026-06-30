import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'frontend/dist', 'frontend/release*', 'backend/node_modules', 'frontend/node_modules']),
  ...tseslint.configs.recommended,
  {
    files: ['backend/src/**/*.{ts}', 'electron/**/*.{cjs,ts}', 'frontend/electron/**/*.{cjs,ts}', '../backend/src/**/*.{ts}', '../electron/**/*.{cjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'frontend/src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
])
