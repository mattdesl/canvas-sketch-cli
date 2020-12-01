const ora = require('ora');
const flat = (a, b) => a.concat(b);
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const rimraf = promisify(require('rimraf'));
const { spawnAsync, generateFileName } = require('./util');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const minimist = require('minimist');
const { createLogger, getErrorDetails } = require('./logger');
const mkdirp = promisify(require('mkdirp'));
const tempy = require('tempy');
const defined = require('defined');
const getFFMPEG = require('./get-ffmpeg-cmd');

const defaults = {
  fps: 24
};

module.exports.args = (opt = {}) => {
  const argv = minimist(process.argv.slice(2), {
    boolean: [ 'quiet', 'force' ],
    default: defaults,
    alias: {
      inputFPS: [ 'input-fps' ],
      outputFPS: [ 'output-fps' ],
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
  const cwd = path.resolve(opt.cwd || process.cwd());
  const cmd = await getFFMPEG({ cwd });
  const logger = createLogger(opt);
  const format = opt.format || 'gif';

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
    await converter({
      ...opt,
      cmd
    });
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
  const args = buildMP4Args(opt, false);
  logCommand(opt.cmd, args);
  return spawnAsync(opt.cmd, args);
}

module.exports.createStream = function (opt = {}) {
  return opt.format === 'gif' ? createGIFStream(opt) : createMP4Stream(opt);
};

module.exports.createGIFStream = createGIFStream;
function createGIFStream (opt = {}) {
  opt = Object.assign({ format: 'gif' }, defaults, opt);
  const encoding = opt.encoding || 'image/png';
  const tmpDir = tempy.directory();

  let digitCount;
  let framesProcessed = 0;
  let extension;

  return {
    promise: Promise.resolve(),
    encoding,
    writeFrame (file, filename) {
      return new Promise((resolve, reject) => {
        framesProcessed++;

        // Grab the digit count while we write the first frames
        if (!digitCount) {
          const digits = /([0-9]+)/.exec(filename);
          const digitStr = digits && digits[1];
          if (!digits || !digitStr || digitStr.length <= 0) {
            return reject(new Error(`Filename ${filename} must be in a format with digits, such as 000.png`));
          }
          digitCount = digitStr.length;
        }

        // Grab extension of frames, e.g. jpg/jpeg/png
        if (!extension) {
          extension = path.extname(filename);
        }

        // Write to temporary directory
        const filePath = path.join(tmpDir, filename);
        const writer = fs.createWriteStream(filePath);
        const stream = file.pipe(writer);
        writer.once('error', reject);
        stream.once('error', reject);
        writer.once('finish', resolve);
      });
    },
    async end () {
      if (framesProcessed === 0) {
        throw new Error('No frames processed');
      }
      const input = path.join(tmpDir, `%0${digitCount}d${extension}`);
      const cmd = await getFFMPEG();
      await convertGIF({
        ...opt,
        cmd,
        input
      });
      // cleanup tmp dir
      await rimraf(tmpDir);
    }
  };
}

module.exports.createMP4Stream = createMP4Stream;
function createMP4Stream (opt = {}) {
  opt = Object.assign({ format: 'mp4' }, defaults, opt);

  const encoding = opt.encoding || 'image/png';
  const quiet = opt.quiet;
  const args = buildMP4Args(opt, true);
  let ffmpegStdin;
  let framesProcessed = 0;
  let exited = false;

  const cmdPromise = getFFMPEG();
  
  const promise = cmdPromise.then(cmd => new Promise((resolve, reject) => {
    logCommand(cmd, args);
    const ffmpeg = spawn(cmd, args);
    const { stdin, stdout, stderr } = ffmpeg;
    ffmpegStdin = stdin;

    if (!quiet) {
      stdout.pipe(process.stdout);
      stderr.pipe(process.stderr);
    }

    stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        return reject(err);
      }
    });

    ffmpeg.on('exit', async (status) => {
      exited = true;
      if (status) {
        return reject(new Error(`FFmpeg exited with status ${status}`));
      } else {
        return resolve();
      }
    });
  }));

  return {
    promise: cmdPromise,
    encoding,
    stream: ffmpegStdin,
    writeBufferFrame (buffer) {
      return new Promise((resolve, reject) => {
        framesProcessed++;
        if (ffmpegStdin.writable && !exited) {
          ffmpegStdin.write(buffer);
          resolve();
        } else {
          reject(new Error('WARN: MP4 stream is no longer writable'));
        }
      });
    },
    writeFrame (readableStream) {
      return new Promise((resolve, reject) => {
        framesProcessed++;
        if (ffmpegStdin && ffmpegStdin.writable && !exited) {
          readableStream.pipe(ffmpegStdin, { end: false });
          readableStream.once('end', resolve);
          readableStream.once('error', reject);
        } else {
          reject(new Error('WARN: MP4 stream is no longer writable'));
        }
      });
    },
    end () {
      ffmpegStdin.end();
      return promise.then(() => {
        if (framesProcessed === 0) return Promise.reject(new Error('No frames processed'));
      });
    }
  };
}

function parseMP4ImageEncoding (encoding) {
  if (encoding === 'image/png') return 'png';
  if (encoding === 'image/jpeg') return 'mjpeg';
  return null;
}

function buildMP4Args (opt = {}, isStream = false) {
  var ss = opt.start != null ? [ '-ss', opt.start ] : '';
  var t = opt.time != null ? [ '-t', opt.time ] : '';
  var fps = 'fps=' + (opt.fps) + '';
  var scale = opt.scale != null ? ('scale=' + opt.scale) : '';
  var filterStr = [ fps, scale ].filter(Boolean).join(',');
  var filter1 = [ '-vf', filterStr ];
  var inFPS, outFPS;

  if (typeof opt.inputFPS === 'number' && isFinite(opt.inputFPS)) {
    // if user specifies --input-fps, take precedence over --fps / -r
    inFPS = opt.inputFPS;
  } else {
    // otherwise, use --fps or the default 24 fps
    inFPS = opt.fps;
  }

  // allow user to specify output rate, otherwise default to omitting it
  if (typeof opt.outputFPS === 'number' && isFinite(opt.outputFPS)) {
    outFPS = opt.outputFPS;
  }

  // build FPS commands
  var inFPSCommand = [ '-framerate', String(inFPS) ];
  var outFPSCommand = outFPS != null ? [ '-r', String(outFPS) ] : false;

  const streamFormat = parseMP4ImageEncoding(opt.encoding || 'image/png');
  const inputArgs = isStream
    ? [ '-f', 'image2pipe', '-c:v', streamFormat, '-i', '-' ]
    : [ '-i', opt.input ];

  return [
    inFPSCommand,
    inputArgs,
    filter1,
    '-y',
    '-an',
    '-preset', 'slow',
    '-c:v', 'libx264',
    '-movflags', 'faststart',
    '-profile:v', 'high',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    // '-x264opts', 'YCgCo',
    ss,
    t,
    outFPSCommand,
    opt.output
  ].filter(Boolean).reduce(flat, []);
}

async function convertGIF (opt = {}) {
  opt = Object.assign({}, defaults, opt);

  const tmpFile = tempy.file({ extension: '.png' });

  const ss = opt.start != null ? [ '-ss', String(opt.start) ] : '';
  const t = opt.time != null ? [ '-t', String(opt.time) ] : '';
  const inputFlag = [ '-i', opt.input ];
  const fpsVal = defined(opt.fps, defaults.fps);
  const extname = path.extname(opt.input);
  // input framerate only seems accetable if you have a sequence...
  // so ignore it if user wants to convert, say, a MP4 file into GIF
  const inputFPS = (!extname || /^\.(png|tif|tga|tiff|webp|jpe?g|bmp)$/i.test(extname)) ? [ '-framerate', fpsVal ] : false;
  const outputFPS = [ '-r', fpsVal ];
  const fps = 'fps=' + fpsVal + '';
  let scale = '';
  if (opt.scale) {
    const scaleStr = Array.isArray(opt.scale) ? opt.scale.join(':') : String(opt.scale);
    scale = `scale=${scaleStr}:flags=lanczos`;
  }
  const filterStr = [ fps, scale ].filter(Boolean).join(',');
  const filter1 = [ '-vf', filterStr + ',palettegen' ];
  const filter2 = [ '-filter_complex', filterStr + '[x];[x][1:v]paletteuse' ];

  const pass1Flags = [ '-y', ss, t, inputFPS, inputFlag, filter1, outputFPS, tmpFile ].filter(Boolean).reduce(flat, []);
  const pass2Flags = [ '-y', ss, t, inputFPS, inputFlag, '-i', tmpFile, filter2, '-f', 'gif', outputFPS, opt.output ].filter(Boolean).reduce(flat, []);
  let needsCleanup = true;

  function finish () {
    if (!needsCleanup) return;
    rimraf.sync(tmpFile);
    needsCleanup = false;
  }

  process.once('exit', () => finish());

  try {
    logCommand(opt.cmd, pass1Flags);
    await spawnAsync(opt.cmd, pass1Flags);
    logCommand(opt.cmd, pass2Flags);
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

function logCommand (cmd, args) {
  if (String(process.env.FFMPEG_DEBUG) === '1') {
    console.log(cmd, args.join(' '));
  }
}