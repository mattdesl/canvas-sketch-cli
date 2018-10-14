const envify = require('loose-envify');
const fromString = require('from2-string');
// const through = require('through2');
// const duplexer = require('duplexer2');
// const concatStream = require('concat-stream');
// const relativePath = require('cached-path-relative');
// const path = require('path');

// Utility -> true if path is a top-level node_modules (i.e. not in source)
// const isNodeModule = (file, cwd) => {
//   const dir = path.dirname(file);
//   const relative = relativePath(cwd, dir);
//   return relative.startsWith(`node_modules${path.sep}`);
// };

module.exports = (params = {}) => {
  const isProd = params.mode === 'production';
  return bundler => {
    const global = isProd ? true : undefined;
    bundler.transform(envify, {
      global,
      NODE_ENV: isProd ? 'production' : 'development'
    });

    const storageKey = isProd ? 'window.location.href' : JSON.stringify(params.entry);
    // Pass down a default storage key
    bundler.add(fromString(`
global.CANVAS_SKETCH_DEFAULT_STORAGE_KEY = ${storageKey};
`), {
      file: 'canvas-sketch-cli/injected/storage-key.js'
    });
  };
};
