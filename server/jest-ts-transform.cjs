/**
 * Minimal Jest transformer for TypeScript files during the TS migration.
 * Uses esbuild (bundled with tsx) to strip type annotations.
 */
const { transformSync } = require('esbuild');

module.exports = {
  process(source, filename) {
    const result = transformSync(source, {
      loader: 'ts',
      format: 'esm',
      target: 'esnext',
      sourcemap: 'inline',
      sourcefile: filename,
    });
    return { code: result.code };
  },
};
