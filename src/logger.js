const chalk = require('chalk');
const { wrap } = require('cli-format');
const isError = require('is-error');

module.exports.createLogger = function (opts = {}) {
  const quiet = opts.quiet;

  const width = process.stdout.columns || 80;
  const wordWrap = str => wrap(str, { paddingLeft: '  ', paddingRight: '  ', width });
  const getWrappedPadded = str => `\n${wordWrap(str)}`;
  const getPadded = str => `\n${str}`;

  const bullet = chalk.bold(chalk.green('→ '));

  const stdout = (msg = '') => {
    if (!quiet) console.log(msg);
  };

  const stderr = (msg = '') => {
    if (!quiet) console.error(msg);
  };

  return {
    log (msg = '') {
      stdout(msg ? getWrappedPadded(`${bullet}${msg}`) : '');
    },
    error (header = '', body = '') {
      header = chalk.red(`Error: ${header}`);

      let wrapping = true;
      if (typeof body !== 'string' && isError(body) && body) {
        body = module.exports.getErrorDetails(body).stack;
        if (header) header = `  ${header}`;
        wrapping = false;
      }
      let msg;
      msg = [ header, body ].filter(Boolean).join('\n\n');
      if (wrapping) {
        msg = getWrappedPadded(msg);
      } else {
        msg = getPadded(msg);
      }
      stderr(msg);
    }
  };
};

module.exports.getErrorDetails = function (err) {
  const msg = err.stack;
  const lines = msg.split('\n');
  let endIdx = lines.findIndex(line => line.trim().startsWith('at '));
  if (endIdx === -1 || endIdx === 0) endIdx = 1;
  const message = lines.slice(0, endIdx).join('\n');
  const stack = lines.slice(endIdx).join('\n');
  return { message, stack };
};
