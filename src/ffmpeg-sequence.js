const ora = require('ora');
const flat = (a, b) => a.concat(b);
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const rimraf = promisify(require('rimraf'));
const { spawnAsync, generateFileName } = require('./util');
const chalk = require('chalk');
const minimist = require('minimist');
const { createLogger, getErrorDetails } = require('./logger');
const mkdirp = promisify(require('mkdirp'));
const commandExists = require('command-exists');

module.exports.args = (opt = {}) => {
  const argv = minimist(process.argv.slice(2), {
    boolean: [ 'quiet', 'force' ],
    default: {
      cmd: 'ffmpeg',
      fps: 24
    },
    alias: {
      force: [ 'f', 'y', 'yes' ],
      format: 'F',
      fps: [ 'r', 'rate' ],
      scale: 's',
      start: 'S',
      time: 't'
    }
  });

  if (opt.format) { // force format when specified
    argv.format = argv.F = opt.format;
  }

  argv.input = argv._[0];
  argv.output = argv._[1];
  delete argv._;

  return argv;
};

module.exports.convert = async (opt = {}) => {
  opt = Object.assign({}, opt);
  const cmd = opt.cmd;
  const logger = createLogger(opt);
  const cwd = path.resolve(opt.cwd || process.cwd());
  const format = opt.format || 'gif';

  let exists = false;
  try {
    exists = await commandExists(cmd);
  } catch (_) {
  }
  if (!exists) {
    logger.error(`${chalk.bold(opt.cmd)} command cannot be found, this most likely means ffmpeg hasn't been installed and set up in PATH environment.\n\nSee canvas-sketch docs for installation instructions.`);
    logger.pad();
    process.exit(1);
  }

  let input = opt.input;
  let output = opt.output;

  if (!input) {
    logger.error('No entry file specified!', `Example usage:\n\n    canvas-sketch-${format} frame-sequence/\n    canvas-sketch-${format} foo/%03d.png`);
    logger.pad();
    process.exit(1);
  }

  input = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  if (output) {
    output = path.isAbsolute(output) ? output : path.resolve(cwd, output);
  } else {
    output = path.resolve(cwd, generateFileName('', `.${format}`));
  }

  if (path.extname(output) === '') {
    output += `.${format}`;
  }

  if (!opt.force && fs.existsSync(output)) {
    throw new Error(`The output file already exists: ${path.relative(cwd, output)} (use -f to overwrite)`);
  }

  // See if the user didn't specify an exact input
  if (!/%[0-9]+d/.test(input)) {
    if (!fs.existsSync(input)) {
      logger.error(chalk.red(`Input file "${path.relative(cwd, input)}" not found`));
      logger.pad();
      process.exit(1);
    }

    // Check if we got a folder
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      // Try to parse out the most relevant image sequence
      const files = fs.readdirSync(input);
      const images = files
        .filter(f => /^[0-9]+\.(png|gif|jpg|jpeg|bmp|tga|tiff)$/i.test(f))
        .map(f => {
          const ext = path.extname(f);
          return {
            ext: path.extname(f),
            name: path.basename(f, ext)
          };
        });

      if (images.length === 0) {
        throw new Error(`Could not find any zero-padded png or jpg images in the folder ${path.relative(cwd, input)}, you may need to specify the files manually like so:\n\n  canvas-sketch-${format} frames/%03d.png`);
      }

      const digits = Object.keys(images.reduce((dict, f) => {
        dict[f.name.length] = true;
        return dict;
      }, {}));
      const exts = Object.keys(images.reduce((dict, f) => {
        dict[f.ext] = true;
        return dict;
      }, {}));

      if (exts.length > 1) { // allow no extensions...
        throw new Error(`There are multiple sequences of different digit file extensions in the folder ${path.relative(cwd, input)}\nEither remove all the sequences except the one you wish to render, or specify an exact sequence:\n\n  canvas-sketch-${format} frames/%03d.png`)
      }
      if (digits.length !== 1) { // don't allow no digits
        throw new Error(`There are multiple sequences of different digit lengths in the folder ${path.relative(cwd, input)}\nEither remove all the sequences except the one you wish to render, or specify an exact sequence:\n\n  canvas-sketch-${format} frames/%03d.png`)
      }

      const numDigits = parseInt(digits[0]);
      const ext = exts[0] || '';
      input = path.join(input, `%0${numDigits}d${ext}`);
    }
  }

  opt = Object.assign({}, opt, { input, output });
  await mkdirp(path.dirname(output));

  let converter = format === 'mp4' ? convertMP4 : convertGIF;

  let spinner = !opt.quiet && ora(`Writing ${chalk.bold(path.relative(cwd, output))}`).start();
  try {
    await converter(opt);
    spinner.succeed();
  } catch (err) {
    spinner.stop();
    logger.log(err.message, { bullet: '' });
    logger.log(
      chalk.red(chalk.bold('ffmpeg did not exit smoothly, see above output for details.')),
      {
        bullet: `${chalk.red(chalk.bold('✖'))} `
      }
    );
  }

  logger.pad();
};

async function convertMP4 (opt = {}) {
  var ss = opt.start != null ? [ '-ss', opt.start ] : '';
  var t = opt.time != null ? [ '-t', opt.time ] : '';
  var fps = 'fps=' + (opt.fps) + '';
  var scale = opt.scale != null ? ('scale=' + opt.scale) : '';
  var filterStr = [ fps, scale ].filter(Boolean).join(',');
  var filter1 = [ '-vf', filterStr ];
  const args = [
    '-framerate', String(opt.fps),
    '-i', opt.input,
    filter1,
    '-y',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    ss,
    t,
    opt.output
  ].filter(Boolean).reduce(flat, []);
  return spawnAsync(opt.cmd, args);
}

async function convertGIF (opt = {}) {
  var suffix = '__tmp__palette_' + Date.now() + '.png';
  var tmpFileName = path.basename(opt.output, path.extname(opt.output)) + suffix;
  var tmpFile = path.join(path.dirname(opt.output), tmpFileName);

  var ss = opt.start != null ? [ '-ss', opt.start ] : '';
  var t = opt.time != null ? [ '-t', opt.time ] : '';
  var inputFlag = [ '-i', opt.input ];
  var fps = 'fps=' + (opt.fps) + '';
  var scale = opt.scale ? ('scale=' + opt.scale + ':flags=lanczos') : '';
  var filterStr = [ fps, scale ].filter(Boolean).join(',');
  var filter1 = [ '-vf', filterStr + ',palettegen' ];
  var filter2 = [ '-filter_complex', filterStr + '[x];[x][1:v]paletteuse' ];

  var pass1Flags = [ '-y', ss, t, inputFlag, filter1, tmpFile ].filter(Boolean).reduce(flat, []);
  var pass2Flags = [ '-y', ss, t, inputFlag, '-i', tmpFile, filter2, '-f', 'gif', opt.output ].filter(Boolean).reduce(flat, []);
  var needsCleanup = true;

  function finish () {
    if (!needsCleanup) return;
    rimraf.sync(tmpFileName);
    needsCleanup = false;
  }

  process.on('exit', () => {
    finish();
  });

  process.on('SIGINT', (code) => {
    finish();
    process.exit(code);
  });

  try {
    await spawnAsync(opt.cmd, pass1Flags);
    await spawnAsync(opt.cmd, pass2Flags);
    finish();
  } catch (err) {
    finish();
    throw err;
  }
}

module.exports.start = (format) => {
  return module.exports.convert(module.exports.args({ format }))
    .catch(err => {
      const { message, stack } = getErrorDetails(err);
      console.error([ '', chalk.red(message), stack, '' ].join('\n'));
    });
};
