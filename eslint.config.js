const js = require('@eslint/js')
const globals = require('globals')

const nodeGlobals = {
  ...globals.es2024,
  ...globals.node
}

const browserGlobals = {
  ...globals.es2024,
  ...globals.browser
}

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-*/**',
      'release-assets/**',
      '.codex-temp/**',
      '.android-sdk/**',
      '.gradle-home/**',
      'tools/**',
      'coverage/**',
      'android/**',
      'mobile-cordova/www/**',
      'mobile-cordova/platforms/**',
      'mobile-cordova/plugins/**',
      'mobile-cordova/node_modules/**',
      'mobile-cordova/nodejs-project/node_modules/**',
      'mobile-cordova-src/nodejs-project/node_modules/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: nodeGlobals
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn'
    },
    rules: {
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unreachable': 'warn',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      'no-useless-assignment': 'warn'
    }
  },
  {
    files: ['desktop/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: browserGlobals
    }
  },
  {
    files: ['desktop/preload.js'],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...globals.browser
      }
    }
  },
  {
    files: ['mobile-cordova-src/nodejs-project/**/*.js'],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        cordova: 'readonly'
      }
    }
  }
]
