const path = require('path');
const { isCanvasSketchPackage, needsUpdate } = require('../util');
const chalk = require('chalk');

module.exports = function createPlugin (settings = {}) {
  return function pluginResolve (bundler, opt = {}) {
    // Get this module's basedir
    const basedir = path.resolve(__dirname, '../');
    const resolver = bundler._bresolve;

    // Clean up the browser resolve function a little bit
    bundler._bresolve = function (id, opts, cb) {
      // When running from within the "canvas-sketch" folder, let's also
      // re-direct any require to that folder. This way users can git clone
      // and test without having to write require('../') to point to the library.
      if (opts.package && opts.package.name && id === opts.package.name) {
        // Package is marked as a canvas-sketch repo (or fork...)
        if (isCanvasSketchPackage(opts.package)) {
          id = './';
          opts = Object.assign({}, opts, { basedir: opts.package.__dirname });
        }
      }

      // Resolve glslify always from here, since it may not be installed in the user project
      if (/^glslify([\\/].*)?$/.test(id)) {
        opts = Object.assign({}, opts, { basedir });
      }

      return resolver.call(bundler, id, opts, (err, result, pkg) => {
        if (err) {
          cb(err);
        } else {
          // Small warning to handle removal of "module" field in recent versions
          if (pkg && pkg.name === 'canvas-sketch' && pkg.version && needsUpdate(pkg.version)) {
            if (settings.logger) {
              settings.logger.log(`${chalk.bold(chalk.yellow('WARN:'))} The version of ${chalk.bold('canvas-sketch')} is older than the CLI tool expects; you should update it to avoid conflicts and bundler errors.\n\nTo update:\n\n  ${chalk.bold('npm install canvas-sketch@latest --save')}`);
              settings.logger.pad();
            }
          }
          cb(null, result, pkg);
        }
      });
    };
  };
};
