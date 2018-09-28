const konan = require('konan');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const defined = require('defined');
const babel = require('@babel/core');

// Usually we would support browser-resolve,
// however in this case we just need to resolve
// local deps which is no different in node/browser resolve algorithm
const resolve = promisify(require('resolve'));
const readFile = promisify(fs.readFile);
const isLocal = /^[./\\/]/;

module.exports = async (entry, opt = {}) => {
  const maxDepth = defined(opt.maxDepth, Infinity);
  const checked = [];
  const dependencies = [];

  const walk = async (file, src, curDepth = 0) => {
    // mark this file as checked
    checked.push(file);

    if (typeof src === 'undefined') {
      src = await readFile(file, 'utf-8');
    }

    const basedir = path.dirname(file);
    let deps;
    try {
      const babelResult = babel.transform(src, {
        ast: true,
        babelrc: true,
        filename: file,
        sourceFileName: file,
        highlightCode: true
      });
      const result = konan(babelResult.ast);
      deps = result.strings;
    } catch (err) {
      throw err;
    }

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
    curDepth++;
    if (curDepth <= maxDepth) {
      await Promise.all(ids.map(id => {
        return walk(id, undefined, curDepth);
      }));
    }
  };

  await walk(entry, opt.entrySrc, 0);
  return dependencies.map(d => d.id);
};
