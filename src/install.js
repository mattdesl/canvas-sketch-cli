const pify = require('pify');
const installIfNeeded = pify(require('install-if-needed'));
const konan = require('konan');
const isBuiltin = require('is-builtin-module');
const packageName = require('require-package-name');
const chalk = require('chalk');

// Install npm modules from a sketch template
module.exports = async function (src, opt = {}) {
  const bullet = opt.bullet || '';
  let requires = konan(src).strings;
  const dependencies = requires
    .filter(req => !/^[./\\]/.test(req))
    .map(req => packageName(req))
    .filter(req => !isBuiltin(req))
    .filter((item, i, list) => list.indexOf(item) === i);
  console.log(`${bullet}Preparing dependencies: ${chalk.bold(dependencies.join(', '))}\n`);
  return installIfNeeded({ dependencies, stdio: 'inherit' });
};
