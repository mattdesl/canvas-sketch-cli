const chalk = require('chalk');
const { wrap } = require('cli-format');
const isError = require('is-error');
const defined = require('defined');

module.exports.createLogger = function (opts = {}) {
  const quiet = opts.quiet;

  let needsPadding = false;
  const width = process.stdout.columns || 80;
  const wordWrap = str => wrap(str, { paddingLeft: '  ', paddingRight: '  ', width });
  const getPadded = (str, opt = {}) => {
    if (opt.leadingSpace !== false) str = `\n${str}`;
    return str;
  };
  const getWrappedPadded = (str, opt = {}) => getPadded(opt.wordWrap !== false ? wordWrap(str) : str, opt);

  const bullet = chalk.bold(chalk.green('→ '));

  const writeln = (msg = '') => {
    // Write all log output to stderr
    if (!quiet) console.error(msg);
  };

  return {
    pad () {
      if (needsPadding) {
        writeln();
        needsPadding = false;
      }
    },
    writeLine (msg = '') {
      needsPadding = true;
      writeln(msg);
    },
    log (msg = '', opt = {}) {
      needsPadding = true;
      if (msg) {
        msg = `${defined(opt.bullet, bullet)}${msg}`;
        if (opt.padding !== false) msg = getWrappedPadded(msg, opt);
      }
      writeln(msg || '');
    },
    error (header = '', body = '', opt = {}) {
      needsPadding = true;
      let wrapping = true;
      if (typeof header !== 'string' && isError(header) && header) {
        const { message, stack } = module.exports.getErrorDetails(header);
        header = message;
        body = stack;
        wrapping = false;
      } else if (typeof body !== 'string' && isError(body) && body) {
        body = module.exports.getErrorDetails(body).stack;
        wrapping = false;
      }

      header = chalk.red(`${opt.prefix || 'Error: '}${header}`);
      if (!wrapping) header = `  ${header}`;

      let msg;
      msg = [ header, body ].filter(Boolean).join('\n\n');
      if (wrapping) {
        msg = getWrappedPadded(msg, opt);
      } else {
        msg = getPadded(msg, opt);
      }

      writeln(msg);
    }
  };
};

module.exports.getErrorDetails = function (err) {
  if (!err.stack) {
    return {
      message: err.message
    };
  }
  const msg = err.stack;
  const lines = msg.split('\n');
  let endIdx = lines.findIndex(line => line.trim().startsWith('at '));
  if (endIdx === -1 || endIdx === 0) endIdx = 1;
  let message = lines.slice(0, endIdx).join('\n').replace(/^Error:/, '').trim();
  const stack = lines.slice(endIdx).join('\n');
  return { message, stack: err.hideStack ? '' : stack };
};
