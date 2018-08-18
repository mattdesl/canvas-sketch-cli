const test = require('tape');
const walk = require('../src/walk-local-deps');
const path = require('path');

test('should walk local deps', async t => {
  t.plan(1);
  const dependencies = await walk(path.resolve(__dirname, 'fixtures/foo.js'));
  t.deepEqual(dependencies, [
    'util', 'foo-bar/blah/bar.js',
    './deep/test.js', './foo.js',
    'three', '../bar.js', '../foo.js'
  ]);
});
