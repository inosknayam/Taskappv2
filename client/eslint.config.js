import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['dist'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.strict,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, ecmaVersion: 'latest', sourceType: 'module' },
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      // Every image needs alt text; decorative images must use alt="".
      'jsx-a11y/alt-text': 'error',
    },
  },
];
