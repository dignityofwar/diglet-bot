// MikroORM v7 is published as native ESM. The app itself is fine — Node 24 can `require()` ESM —
// but Jest's CommonJS runtime cannot, so its JS is transpiled down here (see transformIgnorePatterns
// in jest.config.js). `import.meta.resolve` has no CommonJS form and would be emitted verbatim,
// so it is swapped for the `require.resolve` equivalent, which takes the same specifiers.
/* eslint-disable no-undef */
const tsJest = require('ts-jest').default.createTransformer({
  tsconfig: {
    allowJs: true,
    declaration: false,
    isolatedModules: true,
    module: 'commonjs',
    moduleResolution: 'node10',
    ignoreDeprecations: '6.0',
  },
});

const IMPORT_META_RESOLVE = 'import.meta.resolve(';
const SHIM = 'const __importMetaResolve = (s) => require(\'node:url\').pathToFileURL(require.resolve(s)).href;\n';

const patch = (source) => (
  source.includes(IMPORT_META_RESOLVE)
    ? SHIM + source.split(IMPORT_META_RESOLVE).join('__importMetaResolve(')
    : source
);

module.exports = {
  process: (source, path, options) => tsJest.process(patch(source), path, options),
  getCacheKey: (source, path, options) => tsJest.getCacheKey(patch(source), path, options),
};
