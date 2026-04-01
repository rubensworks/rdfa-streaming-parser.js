const config = require('@rubensworks/eslint-config');

module.exports = config([
  {
    // Exclude performance benchmark scripts from linting
    ignores: [ 'perf/**' ],
  },
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: [ './tsconfig.eslint.json' ],
      },
    },
  },
  {
    rules: {
      // Allow importing Node.js built-in modules (used in tests and webpack config)
      'import/no-nodejs-modules': 'off',

      // Allow file extensions in import paths (required for JSON imports)
      'import/extensions': 'off',
    },
  },
  {
    files: [ '**/*.ts' ],
    rules: {
      // This rule requires strictNullChecks, which is not enabled in this project
      'ts/prefer-nullish-coalescing': 'off',

      // Extended naming conventions for this project
      'ts/naming-convention': [
        'error',
        {
          selector: 'default',
          format: [ 'camelCase' ],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'import',
          format: null,
        },
        {
          selector: 'variable',
          format: [ 'camelCase', 'UPPER_CASE' ],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'typeLike',
          format: [ 'PascalCase' ],
        },
        {
          selector: [ 'typeParameter' ],
          format: [ 'PascalCase' ],
          prefix: [ 'T' ],
        },
        {
          selector: 'interface',
          format: [ 'PascalCase' ],
          custom: {
            regex: '^I[A-Z]',
            match: true,
          },
        },
        {
          // Allow UPPER_CASE for static class properties (e.g., namespace constants)
          selector: 'classProperty',
          modifiers: [ 'static' ],
          format: [ 'camelCase', 'UPPER_CASE' ],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          // Allow leading underscore for class methods (e.g., _transform, _flush from Node.js Transform API)
          selector: 'classMethod',
          format: [ 'camelCase' ],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        {
          // Allow any format for object literal property names (e.g., MIME type keys like 'text/html')
          selector: 'objectLiteralProperty',
          format: null,
        },
      ],
    },
  },
]);
