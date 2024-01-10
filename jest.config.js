/** @type {import('ts-jest').JestConfigWithTsJest} */
// eslint-disable-next-line no-undef
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: [
    'js',
    'json',
    'ts',
  ],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{ts,tsx}', // Include only TypeScript and TSX files
    '**/*.spec.ts', // Explicitly exclude test files
    '**/*index.ts', // Exclude index files if they just re-export, as an example
    '!database/**', // Exclude database folder, filled with migrations that's pointless to test
    '!config/**', // Exclude config folder, mostly pointless to test
    '!**/*.module.ts', // Exclude module files, really hard to test with not much value
    '!main.ts', // Exclude main.ts, as it's the entrypoint to the app
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['json-summary', 'text', 'lcov'],
  setupFilesAfterEnv: ['./jest-preload.js'],
};
