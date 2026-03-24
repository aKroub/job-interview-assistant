/**
 * Custom Jest resolver that maps .js imports to .ts files during the
 * TypeScript migration. When a .js file is not found, it tries the
 * corresponding .ts file instead.
 *
 * This bridges Jest's module resolution with the TypeScript convention
 * of keeping .js extensions in import paths (moduleResolution: Bundler).
 */
module.exports = (path, options) => {
  try {
    return options.defaultResolver(path, options);
  } catch (error) {
    // If a .js file is not found, try the .ts equivalent
    if (path.endsWith('.js')) {
      return options.defaultResolver(path.replace(/\.js$/, '.ts'), options);
    }
    throw error;
  }
};
