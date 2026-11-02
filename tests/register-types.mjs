import { registerHooks } from 'node:module';
// Node's TypeScript stripping requires extensions; retained tests import a few
// source modules using the bundler convention. Resolve only local source paths.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (
        e.code !== 'ERR_MODULE_NOT_FOUND' ||
        !/^\.\.?\//.test(specifier) ||
        /\.[cm]?[jt]sx?$/.test(specifier)
      )
        throw e;
      return next(specifier + '.ts', context);
    }
  },
});
