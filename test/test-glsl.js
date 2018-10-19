const test = require('tape');
const path = require('path');
const browserify = require('browserify');
const pluginGLSL = require('../src/plugins/plugin-glsl');
const { runInNewContext } = require('vm');
const esmify = require('esmify');

test('should require shader files', t => {
  t.plan(1);
  browserify(path.resolve(__dirname, 'fixtures/shader-require.js'), {
    transform: [ pluginGLSL() ]
  }).bundle((err, result) => {
    if (err) return t.fail(err);
    
    runInNewContext(result.toString(), {
      console: {
        log (msg) {
          t.equal(msg, '#define GLSLIFY 1\nvoid main () {\n  gl_FragColor = vec4(1.0);\n}');
        }
      }
    });
  });
});

test('should import shader files', t => {
  t.plan(1);
  browserify(path.resolve(__dirname, 'fixtures/shader-import.js'), {
    transform: [ pluginGLSL() ],
    plugin: [
      (bundler, opts) => {
        esmify(bundler, Object.assign({}, opts, {
          mainFields: [ 'browser', 'main' ],
          nodeModules: false
        }));
      }
    ],
  }).bundle((err, result) => {
    if (err) return t.fail(err);
    runInNewContext(result.toString(), {
      console: {
        log (msg) {
          t.equal(msg, '#define GLSLIFY 1\nvoid main () {\n  gl_FragColor = vec4(1.0);\n}');
        }
      }
    });
  });
});