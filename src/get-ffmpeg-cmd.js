const resolveGlobal = require("resolve-global");
const { promisify } = require("util");
const resolve = promisify(require("resolve"));

module.exports = getCommand;
async function getCommand(opt = {}) {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  // see if user has installed the npm bin
  const {
    moduleName = "@ffmpeg-installer/ffmpeg",
    cwd = process.cwd(),
  } = opt;

  // first resolve local version
  let modulePath;
  try {
    modulePath = await resolve(moduleName, { basedir: cwd });
  } catch (err) {
    if (err.code !== "MODULE_NOT_FOUND") throw err;
  }

  // try to resolve to globally installed version
  if (!modulePath) {
    modulePath = resolveGlobal.silent(moduleName);
  }

  if (modulePath) {
    // if module resolved let's require it and use that
    const moduleInstance = require(modulePath);
    return moduleInstance.path.replace("app.asar", "app.asar.unpacked");
  } else {
    // otherwise let's default to 'ffmpeg'
    console.warn(
      'Warning: Could not find FFMPEG installed locally or globally, ' +
      'defaulting to "ffmpeg" command. You might need to either specify ' +
      'a FFMPEG_PATH env var, or install the following:\n  npm install ' +
      '@ffmpeg-installer/ffmpeg --save'
    );
    return 'ffmpeg';
  }
}
