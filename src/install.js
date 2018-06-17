const pify = require('pify');
const installIfNeeded = pify(require('install-if-needed'));
const konan = require('konan');
const isBuiltin = require('is-builtin-module');
const packageName = require('require-package-name');
const chalk = require('chalk');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const execAsync = pify(exec);

const writePackageIfNeeded = async (opt = {}) => {
  const bullet = opt.bullet || '';
  const cwd = opt.cwd || process.cwd();
  if (fs.existsSync(path.resolve(cwd, 'package.json'))) return;
  console.log((`${bullet}Generating default ${chalk.bold('package.json')}`));
  const { stdout, stderr } = await execAsync('npm init -y');
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
};

// Install npm modules from a sketch template
module.exports = async function (src, opt = {}) {
  const bullet = opt.bullet || '';
  let requires = konan(src).strings;
  const dependencies = requires
    .filter(req => !/^[./\\]/.test(req))
    .map(req => packageName(req))
    .filter(req => !isBuiltin(req))
    .filter((item, i, list) => list.indexOf(item) === i);

  // nothing to install
  if (dependencies.length === 0) return;

  // write package.json first to ensure deps are installed nicely
  await writePackageIfNeeded(opt);

  // now install
  console.log(`${bullet}Preparing dependencies: ${chalk.bold(dependencies.join(', '))}\n`);
  return installIfNeeded({ dependencies, stdio: 'inherit' });
};
