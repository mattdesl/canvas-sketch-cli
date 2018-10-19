const path = require('path');
const through = require('through2');
const duplexer = require('duplexer2');
const concatStream = require('concat-stream');
const install = require('../install');
const glslify = require('glslify');

module.exports = (params = {}) => {
  const cwd = params.cwd || process.cwd();
  return (file, bundlerOpt = {}) => {
    const output = through();
    const ext = path.extname(file || '').toLowerCase();

    // skip non-GLSL files
    if (!module.exports.extensions.includes(ext)) {
      return output;
    }

    const basedir = path.dirname(file);
    const stream = duplexer(concatStream(str => {
      str = str.toString();
      // Compile with glslify
      try {
        str = glslify.compile(str, {
          basedir
        });
        output.end(`module.exports = ${JSON.stringify(str)};`);
      } catch (err) {
        stream.emit('error', err);
      }
    }), output);
    return stream;
  };
};

module.exports.extensions = [
  '.glsl',
  '.vert',
  '.frag',
  '.geom',
  '.vs',
  '.fs',
  '.gs',
  '.vsh',
  '.fsh',
  '.gsh',
  '.vshader',
  '.fshader',
  '.gshader'
];
