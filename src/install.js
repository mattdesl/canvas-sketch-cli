const { promisify } = require('util');
const installIfNeeded = promisify(require('install-if-needed'));
const konan = require('konan');
const { isCanvasSketchPackage, readPackage } = require('./util');
const isBuiltin = require('is-builtin-module');
const packageName = require('require-package-name');
const chalk = require('chalk');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

const writePackageIfNeeded = async (opt = {}) => {
  const logger = opt.logger;
  const cwd = opt.cwd || process.cwd();
  if (fs.existsSync(path.resolve(cwd, 'package.json'))) return;

  if (logger) {
    logger.log(`Generating default "${chalk.bold('package.json')}" file`);
  }
  const { stderr } = await execAsync('npm init -y');
  // It's kinda noisy to print this for average users, and a bit scary looking
  // if (stdout) console.log(stdout.trim());
  if (stderr) console.error(stderr.trim());
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

  const currentDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
  let filtered = dependencies.filter(dep => !currentDeps.includes(dep));

  let key = 'dependencies';
  if (isCanvasSketchPackage(pkg)) {
    const canvasSketchModule = pkg.name || 'canvas-sketch';

    // Not sure it's really useful to warn the user of this
    if (logger) logger.log(`Note: Not installing ${chalk.bold(canvasSketchModule)} since we are already in its repository`);

    filtered = filtered.filter(dep => dep !== canvasSketchModule);
    key = 'devDependencies';
  }

  // Only install if needed
  if (filtered.length > 0) {
    const obj = { stdio: 'inherit' };
    obj[key] = filtered;
    if (logger) {
      if (key === 'devDependencies') {
        logger.log(`Note: Installing into devDependencies since we are in ${chalk.bold(canvasSketchModule)} repository`);
      }
      logger.log(`Installing ${key}:\n  ${chalk.bold(filtered.join(', '))}`);
      logger.pad();
    }
    return installIfNeeded(obj);
  }
};
