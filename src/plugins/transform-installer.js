const path = require('path');
const through = require('through2');
const duplexer = require('duplexer2');
const concatStream = require('concat-stream');
// const relativePath = require('cached-path-relative');
const install = require('../install');

// Utility -> true if path is a top-level node_modules (i.e. not in source)
// const isNodeModule = (file, cwd) => {
//   const dir = path.dirname(file);
//   const relative = relativePath(cwd, dir);
//   return relative.startsWith(`node_modules${path.sep}`);
// };

module.exports = (params = {}) => {
  const cwd = params.cwd || process.cwd();
  return (file, bundlerOpt = {}) => {
    const output = through();
    if (/\.json$/i.test(file)) {
      return output;
    }

    return duplexer(concatStream(str => {
      str = str.toString();
      install(file, {
        installer: params.installer,
        logger: params.logger,
        cwd,
        entrySrc: str,
        maxDepth: 1
      })
        .then(() => {
          output.end(str);
        }).catch(() => {
          // Let errors bubble up from other transforms instead of this one
          output.end(str);
          // output.emit('error', err);
          // output.end(str);
          // const filepath = path.relative(cwd, file);
          // console.error(`Error processing ${filepath} for auto-module installation`);
          // console.error(err);
          // output.end(str);
        });
    }), output);
  };
};
