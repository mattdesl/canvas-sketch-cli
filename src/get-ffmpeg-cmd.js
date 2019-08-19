const resolveGlobal = require('resolve-global');
const { promisify } = require('util');
const resolve = promisify(require('resolve'));
const commandExists = require('command-exists');

module.exports = getCommand;
async function getCommand (opt = {}) {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  // see if user has installed the npm bin
  const {
    moduleName = '@ffmpeg-installer/ffmpeg',
    cwd = process.cwd()
  } = opt;

  // first resolve local version
  let modulePath;
  try {
    modulePath = await resolve(moduleName, { basedir: cwd });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }

  // try to resolve to globally installed version
  if (!modulePath) {
    modulePath = resolveGlobal.silent(moduleName);
  }

  if (modulePath) {
    // if module resolved let's require it and use that
    const moduleInstance = require(modulePath);
    return moduleInstance.path.replace('app.asar', 'app.asar.unpacked');
  } else {
    // otherwise let's default to 'ffmpeg'
    const cmd = 'ffmpeg';
    const valid = await hasCommand(cmd);
    if (!valid) {
      throw new Error(`Could not find '${cmd}' command - you may need to install it.\nTry the following:\n  npm i @ffmpeg-installer/ffmpeg --save-dev`);
    }
    return cmd;
  }
}

async function hasCommand (cmd) {
  let exists = false;
  try {
    exists = await commandExists(cmd);
  } catch (_) {
  }
  return exists;
}
