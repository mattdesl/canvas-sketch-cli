const path = require('path');

module.exports = function (bundler, opt = {}) {
  // Get this module's basedir
  const basedir = path.resolve(__dirname, '../');
  const resolver = bundler._bresolve;

  // Clean up the browser resolve function a little bit
  bundler._bresolve = function (id, opts, cb) {
    // When running from within the "canvas-sketch" folder, let's also
    // re-direct any require to that folder. This way users can git clone
    // and test without having to write require('../') to point to the library.
    if (opts.package && opts.package.name && id === opts.package.name) {
      if (id === 'canvas-sketch') {
        id = './';
        opts = Object.assign({}, opts, { basedir: opts.package.__dirname });
      }
    }

    // Resolve glslify always from here, since it may not be installed in the user project
    if (/^glslify([\\/].*)?$/.test(id)) {
      opts = Object.assign({}, opts, { basedir });
    }

    return resolver.call(bundler, id, opts, (err, result, pkg) => {
      // Improve error messaging since browserify sometimes gives you just a folder,
      // not the actual file it was required by. Could improve further by parsing
      // file and getting real syntax error message.
      if (err) {
        cb(new Error(`Cannot find module '${id}' from '${path.relative(path.dirname(process.cwd()), opts.filename)}'`));
      } else {
        cb(null, result, pkg);
      }
    });
  };
};
