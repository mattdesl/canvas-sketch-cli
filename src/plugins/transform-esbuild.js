const path = require('path');
const through = require('through2');
const duplexer = require('duplexer2');
const concat = require('concat-stream');
const relativePath = require('cached-path-relative');
const esbuild = require('esbuild');

// Extensions we treat as "JavaScript-ish" and let esbuild handle.
// Anything else (glsl, json, css, ...) is passed straight through so that
// the other transforms (glslify, browserify json, etc.) keep working.
const JS_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.es', '.es6'];

// Utility -> true if path is inside a top-level node_modules folder
// (i.e. a dependency, not the user's local source).
const isNodeModule = (file, cwd) => {
  const dir = path.dirname(file);
  const relative = relativePath(cwd, dir);
  return relative.startsWith(`node_modules${path.sep}`);
};

// Quick check to avoid running esbuild on files that don't need it.
// We only need to touch a dependency file when it uses ESM syntax or
// modern operators that browserify's (older) parser cannot read.
const NEEDS_TRANSFORM = /(\bimport\b|\bexport\b|\?\?|\?\.)/;

// A browserify *global* transform that runs esbuild over dependency files
// inside node_modules. Its job is intentionally narrow:
//
//   1. Convert ESM (import/export) published packages into CommonJS so that
//      browserify can bundle them. This is what makes
//      `import { convert } from "@texel/color"` work.
//   2. Lower a handful of modern operators (?? and ?.) down just far enough
//      that browserify's internal parser (module-deps' acorn) can read them.
//
// Crucially this is *not* a "transpile to ES5" step: the target is es2019, so
// modern syntax (classes, async/await, arrow fns, spread, template literals,
// destructuring, ...) is preserved. We only lower what the bundler can't parse.
//
// Local (user) source code is left entirely to esmify, which preserves the
// static-require analysis that glslify/brfs rely on. We never touch it here.
module.exports = (params = {}) => {
  const cwd = params.cwd || process.cwd();
  return function esbuildNodeModules (file, opts = {}) {
    const ext = path.extname(file || '').toLowerCase();

    // Only handle JS-ish dependency files; everything else passes through.
    if (!JS_EXTENSIONS.includes(ext) || !isNodeModule(file, cwd)) {
      return through();
    }

    const output = through();
    const stream = duplexer(concat(buf => {
      const code = buf.toString();

      // Bail out early for plain CommonJS files that don't need any help.
      if (!NEEDS_TRANSFORM.test(code)) {
        output.end(code);
        return;
      }

      esbuild.transform(code, {
        // .jsx gets the jsx loader; everything else is parsed as plain JS so
        // that we don't accidentally treat `<` as JSX in regular .js files.
        loader: ext === '.jsx' ? 'jsx' : 'js',
        format: 'cjs',
        // Lower only the operators browserify's parser can't handle. NOT es5.
        target: 'es2019',
        // Keep non-ASCII identifiers (e.g. `let ε = ...`) as literal characters
        // rather than \uXXXX escapes, which browserify's older parser rejects.
        charset: 'utf8',
        sourcefile: file,
        sourcemap: 'inline'
      }).then(result => {
        output.end(result.code);
      }).catch(err => {
        stream.emit('error', err);
      });
    }), output);
    return stream;
  };
};
