const konan = require('konan');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Usually we would support browser-resolve,
// however in this case we just need to resolve
// local deps which is no different in node/browser resolve algorithm
const resolve = promisify(require('resolve'));
const readFile = promisify(fs.readFile);
const isLocal = /^[./\\/]/;

module.exports = async (entry) => {
  const checked = [];
  const dependencies = [];

  const walk = async (file) => {
    // mark this file as checked
    checked.push(file);

    // read from file and parse require/import statements
    const src = await readFile(file, 'utf-8');
    const basedir = path.dirname(file);
    const deps = konan(src).strings;

    // add each to final list of imports if it doesn't exist already
    deps.forEach(id => {
      const existing = dependencies.find(other => {
        return other.basedir === basedir && other.id === id;
      });
      if (!existing) {
        dependencies.push({ basedir, id });
      }
    });

    // find any local dependencies
    const localDeps = deps.filter(req => isLocal.test(req));

    // resolve them to real files
    let ids = await Promise.all(localDeps.map(dep => {
      return resolve(dep, { basedir });
    }));

    // remove already checked files
    ids = ids.filter(id => !checked.includes(id));

    // now let's walk each new dep
    await Promise.all(ids.map(id => walk(id)));
  };

  await walk(entry);
  return dependencies.map(d => d.id);
};
