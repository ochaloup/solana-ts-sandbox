const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const eslintPluginJest = require('eslint-plugin-jest')
const eslintPluginPrettier = require('eslint-plugin-prettier')
const globals = require('globals')

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...eslintPluginJest.environments.globals.globals,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      jest: eslintPluginJest,
      prettier: eslintPluginPrettier,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...eslintPluginJest.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'semi': ['error', 'never'],

      'prettier/prettier': [
        'error',
        {
          bracketSpacing: true,
          semi: false,
          useTabs: false,
          tabWidth: 2,
          singleQuote: true,
          arrowParens: 'avoid',
          trailingComma: 'es5',
          endOfLine: 'lf',
        },
      ],
    }
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/']
  }
];