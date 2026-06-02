const test = require('tape');
const path = require('path');
const browserify = require('browserify');
const { runInNewContext } = require('vm');
const esmify = require('esmify');
const transformESBuild = require('../src/plugins/transform-esbuild');

// Mirror the bundler configuration the CLI uses: esmify handles local ESM
// (with nodeModules:false) while the esbuild transform converts ESM packages
// inside node_modules into CommonJS that browserify can parse and bundle.
const createBundler = (entry) => {
  const bundler = browserify(entry, {
    plugin: [
      (bundler, opts) => {
        esmify(bundler, Object.assign({}, opts, {
          mainFields: [ 'browser', 'main' ],
          nodeModules: false
        }));
      }
    ]
  });
  // Apply as a *global* transform so it reaches node_modules, matching the
  // `-g` registration the CLI uses.
  bundler.transform(transformESBuild(), { global: true });
  return bundler;
};

test('should bundle a modern ESM-only node_modules dependency', t => {
  t.plan(1);
  createBundler(path.resolve(__dirname, 'fixtures/esm-node-module.js'))
    .bundle((err, result) => {
      if (err) return t.fail(err);
      runInNewContext(result.toString(), {
        console: {
          log (msg) {
            // typeof convert, number of output channels, rounded L channel
            t.equal(msg, 'function 3 731');
          }
        }
      });
    });
});
