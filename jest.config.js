/** Unit tests: colocated *.spec.ts files under src/. E2E has its own config in test/. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'src/.*[.]spec[.]ts$',
  transform: { '^.+[.]ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/test/silence-logs.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts', '!src/**/dto/*.ts'],
  coverageDirectory: 'coverage',
};
