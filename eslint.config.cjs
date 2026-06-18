const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierConfig = require('eslint-config-prettier/flat');
const importX = require('eslint-plugin-import-x');
const jest = require('eslint-plugin-jest');
const nModule = require('eslint-plugin-n');
const promise = require('eslint-plugin-promise');
const reactHooks = require('eslint-plugin-react-hooks');
const regexp = require('eslint-plugin-regexp');
const security = require('eslint-plugin-security');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const sonarjs = require('eslint-plugin-sonarjs');
const unicornModule = require('eslint-plugin-unicorn');
const globals = require('globals');

const importPlugin = importX.default || importX;
const importConfigs = importX.flatConfigs || importPlugin.flatConfigs;
const n = nModule.default || nModule;
const regexpConfigs = regexp.configs || regexp.default.configs;
const sonarPlugin = sonarjs.default || sonarjs;
const unicorn = unicornModule.default || unicornModule;

const jsFiles = ['**/*.{js,cjs,mjs}'];
const declarationFiles = ['**/*.d.ts'];
const testFiles = ['__tests__/**/*.js'];
const integrationTestFiles = ['__tests__/integration/**/*.js'];
const sdkFiles = ['src/**/*.js'];
const moduleScriptFiles = ['scripts/**/*.mjs', 'rollup.config.mjs'];
const rootConfigFiles = ['*.config.js', '*.config.cjs', 'eslint.config.cjs'];
const exampleFiles = ['examples/nextjs-notes-app/src/**/*.js'];
const exampleConfigFiles = ['examples/nextjs-notes-app/*.config.js'];
const commonjsFiles = [...rootConfigFiles, ...exampleConfigFiles, ...testFiles];
const strictFiles = [
  ...sdkFiles,
  ...moduleScriptFiles,
  ...rootConfigFiles,
  ...exampleConfigFiles,
  ...exampleFiles,
];
const lintedFiles = [...jsFiles, ...declarationFiles];

const asArray = (config) => (Array.isArray(config) ? config : [config]);
const scopeConfig = (config, files) => asArray(config).map((item) => ({ ...item, files }));
const scopedRules = (config, files, rules = {}) => ({
  ...config,
  files,
  rules: {
    ...config.rules,
    ...rules,
  },
});

module.exports = [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'examples/nextjs-notes-app/.next/**',
      'examples/nextjs-notes-app/node_modules/**',
      '*.tgz',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  {
    files: lintedFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.es2024,
        ...globals.browser,
        ...globals.node,
        define: 'readonly',
      },
    },
    settings: {
      'import-x/resolver': {
        node: {
          extensions: ['.js', '.mjs', '.cjs', '.ts', '.d.ts'],
        },
      },
    },
  },
  {
    files: [...sdkFiles, ...moduleScriptFiles, ...exampleFiles],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: commonjsFiles,
    languageOptions: {
      sourceType: 'commonjs',
    },
  },

  ...scopeConfig(js.configs.recommended, jsFiles),
  ...scopeConfig(importConfigs.recommended, jsFiles),
  ...scopeConfig(promise.configs['flat/recommended'], jsFiles),
  ...scopeConfig(regexpConfigs['flat/recommended'], strictFiles),
  ...scopeConfig(sonarPlugin.configs.recommended, strictFiles),
  ...scopeConfig(unicorn.configs['flat/recommended'], strictFiles),
  scopedRules(jest.configs['flat/recommended'], testFiles, {
    'jest/expect-expect': 'off',
  }),
  ...scopeConfig(reactHooks.configs.flat.recommended, exampleFiles),
  ...scopeConfig(tsPlugin.configs['flat/recommended'], declarationFiles),
  ...scopeConfig(tsPlugin.configs['flat/stylistic'], declarationFiles),
  prettierConfig,

  {
    files: strictFiles,
    plugins: {
      'import-x': importPlugin,
      n,
      security,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'array-callback-return': ['error', { checkForEach: true }],
      curly: ['error', 'all'],
      'dot-notation': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-duplicate-imports': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
      'no-var': 'error',
      'object-shorthand': ['error', 'always', { avoidExplicitReturnArrows: true }],
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-template': 'error',

      'import-x/no-unresolved': ['error', { commonjs: true, ignore: ['^@/'] }],
      'n/no-deprecated-api': 'error',
      'n/no-exports-assign': 'error',
      'n/no-new-require': 'error',
      'n/no-path-concat': 'error',
      'n/prefer-node-protocol': 'error',
      'security/detect-bidi-characters': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000'], ['^node:', '^@?\\w', '^@/', '^', '^\\.']],
        },
      ],

      'sonarjs/class-name': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/fixme-tag': 'off',
      'sonarjs/function-name': 'off',
      'sonarjs/no-commented-code': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/todo-tag': 'off',
      'sonarjs/variable-name': 'off',
      'unicorn/catch-error-name': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/import-style': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-array-reverse': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-lonely-if': 'off',
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-thenable': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-global-this': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/text-encoding-identifier-case': 'off',
    },
  },
  {
    files: testFiles,
    rules: {
      'jest/no-done-callback': 'off',
      'jest/no-export': 'off',
      'jest/no-standalone-expect': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'promise/always-return': 'off',
      'promise/catch-or-return': 'off',
      'promise/no-callback-in-promise': 'off',
      'promise/param-names': 'off',
    },
  },
  {
    files: integrationTestFiles,
    rules: {
      // dotenv and pg are runtime-only deps of the hosting-owned integration
      // harness, not the SDK package, so they aren't resolvable here.
      'import-x/no-unresolved': ['error', { commonjs: true, ignore: ['^dotenv$', '^pg$'] }],
    },
  },
  {
    files: exampleFiles,
    rules: {
      'import-x/no-unresolved': 'off',
      'no-alert': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: declarationFiles,
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
