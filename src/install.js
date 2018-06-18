const pify = require('pify');
const installIfNeeded = pify(require('install-if-needed'));
const konan = require('konan');
const isBuiltin = require('is-builtin-module');
const packageName = require('require-package-name');
const chalk = require('chalk');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const readFile = pify(fs.readFile);

const readPackage = async (opt = {}) => {
  const cwd = opt.cwd || process.cwd();
  const data = await readFile(path.resolve(cwd, 'package.json'), 'utf-8');
  let pkg;
  try {
    pkg = JSON.parse(data);
  } catch (err) {
    throw new Error(`Error parsing JSON in "${chalk.bold('package.json')}": ${err.message}`);
  }
  return pkg;
};

const execAsync = pify(exec);

const writePackageIfNeeded = async (opt = {}) => {
  const logger = opt.logger;
  const cwd = opt.cwd || process.cwd();
  if (fs.existsSync(path.resolve(cwd, 'package.json'))) return;
  if (logger) logger.log(`Generating default "${chalk.bold('package.json')}" file`);
  const { stdout, stderr } = await execAsync('npm init -y');
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
};

// Install npm modules from a sketch template
module.exports = async function (src, opt = {}) {
  const logger = opt.logger;
  const ignore = [].concat(opt.ignore).filter(Boolean);
  let requires = konan(src).strings;
  const dependencies = requires
    .filter(req => !/^[./\\]/.test(req) && !ignore.includes(req))
    .map(req => packageName(req))
    .filter(req => !isBuiltin(req))
    .filter((item, i, list) => list.indexOf(item) === i);

  // nothing to install
  if (dependencies.length === 0) return;

  // write package.json first to ensure deps are installed nicely
  await writePackageIfNeeded(opt);

  // get package JSON
  const pkg = await readPackage();
  const currentDepObj = pkg.dependencies || {};
  const currentDeps = Object.keys(currentDepObj);
  const filtered = dependencies.filter(dep => !currentDeps.includes(dep));

  // Only install if needed
  if (filtered.length > 0) {
    if (logger) {
      logger.log(`Installing dependencies:\n  ${chalk.bold(dependencies.join(', '))}`);
      logger.pad();
    }
    return installIfNeeded({ dependencies: filtered, stdio: 'inherit' });
  }
};
