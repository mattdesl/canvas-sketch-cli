const dateformat = require('dateformat');
const filenamify = require('filenamify');
const spawn = require('cross-spawn');

module.exports.generateFileName = (suffix = '', ext = '.js') => {
  const separator = suffix ? '-' : '';
  suffix = suffix.replace(/\.js$/, '');
  const date = dateformat(Date.now(), 'yyyy.mm.dd-HH.MM.ss');
  const file = `${date}${separator}${suffix}${ext}`;
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
