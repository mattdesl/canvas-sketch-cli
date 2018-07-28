const { promisify } = require('util');
const fs = require('fs');
const dateformat = require('dateformat');
const filenamify = require('filenamify');
const spawn = require('cross-spawn');
const semver = require('semver');
const path = require('path');
const chalk = require('chalk');

const readFile = promisify(fs.readFile);
const minVersion = '0.0.10';

module.exports.generateFileName = (prefix = '', ext = '.js') => {
  const separator = prefix ? '-' : '';
  const date = dateformat(Date.now(), 'yyyy.mm.dd-HH.MM.ss');
  const file = `${prefix}${separator}${date}${ext}`;
  return filenamify(file);
};

module.exports.spawnAsync = (cmd, args, opt) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, opt);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('exit', (code, msg) => {
      if (code === 0) resolve();
      else reject(new Error(stderr))
    });
  });
};

module.exports.needsUpdate = function (version) {
  return semver.lt(version, minVersion);
};

module.exports.isCanvasSketchPackage = function (pkg) {
  // new versions have this to mark the repo
  if (pkg.isCanvasSketch) return true;
  // old versions are based on name + GH repo
  if (pkg.name === 'canvas-sketch' && pkg.repository && pkg.repository.url === 'git://github.com/mattdesl/canvas-sketch.git') {
    return true;
  }
  return false;
};

module.exports.readPackage = async (opt = {}, optional = false) => {
  const cwd = opt.cwd || process.cwd();
  const pkgFile = path.resolve(cwd, 'package.json');
  if (optional && !fs.existsSync(pkgFile)) return undefined;
  const data = await readFile(pkgFile, 'utf-8');
  let pkg;
  try {
    pkg = JSON.parse(data);
  } catch (err) {
    throw new Error(`Error parsing JSON in "${chalk.bold('package.json')}": ${err.message}`);
  }
  return pkg;
};
