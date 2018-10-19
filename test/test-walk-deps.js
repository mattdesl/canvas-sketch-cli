const test = require('tape');
const walk = require('../src/walk-local-deps');
const path = require('path');

test('should walk local deps', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/foo.js'));
  t.deepEqual(dependencies, [
    'util', 'foo-bar/blah/bar.js',
    './deep/test.js', './foo.js', './second',
    'three', '../bar.js', '../foo.js'
  ]);
});

test('should walk local deps with depth', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/depth-0.js'), {
    maxDepth: 0
  });
  t.deepEqual(dependencies, [
    'util', './depth-1'
  ]);
});

test('should walk local deps with depth', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/depth-0.js'), {
    maxDepth: 1
  });
  t.deepEqual(dependencies, [
    'util', './depth-1', 'http', './depth-2'
  ]);
});

test('should walk local deps with depth', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/depth-0.js'), {
    maxDepth: 2
  });
  t.deepEqual(dependencies, [
    'util', './depth-1', 'http', './depth-2', 'events'
  ]);
});

test('should walk local deps with depth', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/depth-0.js'));
  t.deepEqual(dependencies, [
    'util', './depth-1', 'http', './depth-2', 'events'
  ]);
});

test('should walk local deps with entry source code', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/depth-0.js'), {
    entrySrc: `require('foobar');`
  });
  t.deepEqual(dependencies, [
    'foobar'
  ]);
});

test('should ignore non JS files', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/shader-require.js'));
  t.deepEqual(dependencies, [ './shader.glsl' ]);
});