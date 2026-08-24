import { createRequire } from 'node:module';

export const MATHJS_CDN_SPECIFIER = 'https://cdn.jsdelivr.net/npm/mathjs@13.0.3/+esm';

const require = createRequire(import.meta.url);
const localMathJsEntry = require.resolve('mathjs');

/**
 * Quest ships as unbundled browser modules and imports MathJS
 * from jsDelivr. Tests resolve that exact production specifier to the pinned
 * local package so CI is deterministic and can run without outbound access.
 */
export const questDependencyResolver = {
  name: 'quest-test-dependency-resolver',
  enforce: 'pre',
  resolveId(source) {
    return source === MATHJS_CDN_SPECIFIER ? localMathJsEntry : null;
  },
};
