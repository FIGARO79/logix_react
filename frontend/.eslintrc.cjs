module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react/prop-types': 'off', 
    'react/display-name': 'off',
    'react/no-unescaped-entities': 'off',
    'no-empty': 'warn',
    'no-unused-vars': [
      'error', 
      { 
        'varsIgnorePattern': '^(React|_)$', 
        'argsIgnorePattern': '^_' 
      }
    ],
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
