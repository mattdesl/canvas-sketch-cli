const { promisify } = require('util');
const installIfNeeded = promisify(require('install-if-needed'));
const { isCanvasSketchPackage, readPackage } = require('./util');
const isBuiltin = require('is-builtin-module');
const packageName = require('require-package-name');
const semver = require('semver');
const chalk = require('chalk');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const walkDeps = require('./walk-local-deps');
const defined = require('defined');

const execAsync = promisify(exec);

const DEFAULT_IGNORES = [ 'glslify' ];

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
module.exports = async function (entry, opt = {}) {
  const logger = opt.logger;
  const ignore = DEFAULT_IGNORES.concat(opt.ignore).filter(Boolean);
  const maxDepth = defined(opt.maxDepth, Infinity);
  const entrySrc = opt.entrySrc;

  // walk the file and its local dependency tree
  let requires;
  try {
    requires = await walkDeps(entry, { maxDepth, entrySrc });
  } catch (err) {
    throw err;
  }

  let dependencies = requires
    .filter(req => !/^[./\\/]/.test(req) && !ignore.includes(req))
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

  // patch to fix ThreeJS :'(
  // we are locked on an earlier version of ThreeJS unless
  // canvas-sketch is overhauled to esbuild or the esm loader is fixed
  const threeIdx = dependencies.indexOf('three');
  if (threeIdx >= 0) {
    const fixedVers = '0.147.0';
    const toInstall = `three@${fixedVers}`;

    
    const hasThreeDep = currentDeps.includes('three');
    if (!hasThreeDep) {
      // Case A: User does not have ThreeJS already in package.json
      // So we can just add the versioned tag to installation
      filtered = filtered.map(f => f === 'three' ? toInstall : f);

      // filtered.push(toInstall)
      console.warn(chalk.red(
        `
~~~~~~~ NOTE ~~~~~~~
canvas-sketch currently only supports older versions
of ThreeJS, the CLI will auto-install version ${fixedVers}.
~~~~~~~~~~~~~~~~~~~~`
      ));
    } else {
      // Case B: User does have it in package.json
      // Let's compare versions to see if we should warn them or not
      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      const threeDep = 'three' in deps ? deps['three'] : devDeps['three'];
      if (threeDep && !semver.intersects(`<=${fixedVers}`, threeDep)) {
        console.warn(chalk.red(
          `
~~~~~~~ NOTE ~~~~~~~
canvas-sketch currently only supports older versions
of ThreeJS, and this package specifies a higher version number.
You can re-install ${toInstall} to down-grade to a working version:

  npm install ${toInstall} --save-dev

~~~~~~~~~~~~~~~~~~~~`
        ));
      } else {
        // A-OK - user is on the right version range
      }
    }
  }

  let key = 'dependencies';
  const canvasSketchModule = 'canvas-sketch';
  if (isCanvasSketchPackage(pkg)) {
    // Not sure it's really useful to warn the user of this
    if (logger) logger.log(`Note: Not installing ${chalk.bold(canvasSketchModule)} since we are already in its repository`);

    filtered = filtered.filter(dep => dep !== canvasSketchModule);
    key = 'devDependencies';
  }

  // Only install if needed
  if (filtered.length > 0) {
    const obj = { stdio: 'inherit', audit: false, fund: false, silent: true };
    obj[key] = filtered;

    if (logger) {
      if (key === 'devDependencies') {
        logger.log(`Note: Installing into devDependencies since we are in ${chalk.bold(canvasSketchModule)} repository`);
      }
      logger.log(`Installing ${key}:\n  ${chalk.bold(filtered.join(', '))}`);
      logger.pad();
    }

    if (opt.installer) {
      opt.installer.emit('install-start', { entry, modules: filtered });
    }
    try {
      await installIfNeeded(obj);
      if (opt.installer) {
        opt.installer.emit('install-end', { entry, modules: filtered });
      }
    } catch (err) {
      if (opt.installer) {
        opt.installer.emit('install-end', { entry, modules: filtered, err });
      }
      throw err;
    }
  }
};
