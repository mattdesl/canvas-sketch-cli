// Modified from:
// https://github.com/juliangruber/downloads-folder/blob/master/index.js

const os = require("os");
const path = require("path");
const execSync = require("child_process").execSync;
const statSync = require("fs").statSync;

const funcMap = {
  darwin: darwin,
  freebsd: unix,
  linux: unix,
  sunos: unix,
  win32: windows
};

module.exports = (opt) => {
  opt = opt || {};
  var logger = opt.logger;
  var dir = process.env.CANVAS_SKETCH_OUTPUT;
  if (dir) {
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  }
  dir = funcMap[os.platform()]();
  var stat;
  try {
    stat = statSync(dir)
  } catch (err) {}
  let err;
  if (!stat) {
    err = 'Could not find home Downloads directory, defaulting to cwd. Consider setting a CANVAS_SKETCH_OUTPUT environment variable instead, see here:\n\n  https://github.com/mattdesl/canvas-sketch/blob/master/docs/exporting-artwork.md#changing-the-output-folder';
    dir = null;
  } else if (!stat.isDirectory()) {
    err = 'The Downloads directory "' + dir + '" is not a folder, defaulting to cwd. Consider setting a CANVAS_SKETCH_OUTPUT environment variable instead, see here:\n\n  https://github.com/mattdesl/canvas-sketch/blob/master/docs/exporting-artwork.md#changing-the-output-folder'
    dir = null;
  }
  if (err && logger) {
    logger.error(err);
    logger.pad();
  }
  if (!dir) dir = process.cwd();
  return dir;
};

function darwin() {
  return process.env.HOME ? `${process.env.HOME}/Downloads` : null;
}

function unix() {
  let dir;
  try {
    dir = execSync("xdg-user-dir DOWNLOAD").trim();
  } catch (_) {}
  if (dir && dir !== process.env.HOME) return dir;
  else return process.env.HOME ? `${process.env.HOME}/Downloads` : null;
}

function windows() {
  return process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Downloads` : null;
}
