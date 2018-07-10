const dateformat = require('dateformat');
const filenamify = require('filenamify');
const spawn = require('cross-spawn');
const semver = require('semver');

const minVersion = '0.0.9';

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
