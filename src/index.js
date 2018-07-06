#!/usr/bin/env node
const path = require('path');
const budo = require('budo');
const prettyBytes = require('pretty-bytes');
const prettyMs = require('pretty-ms');
const downloads = require('downloads-folder');
const getStdin = require('get-stdin');
const fs = require('fs');
const chalk = require('chalk');
const { promisify } = require('util');
const { generateFileName } = require('./util');
const mkdirp = promisify(require('mkdirp'));
const writeFile = promisify(fs.writeFile);
const install = require('./install');
const resolve = require('resolve');
const browserifyFromArgs = require('browserify/bin/args');
const createMiddleware = require('./middleware');
const { createLogger, getErrorDetails } = require('./logger');
const html = require('./html');
const terser = require('terser');

const argv = require('minimist')(process.argv.slice(2), {
  string: ['template'],
  boolean: [ 'open', 'force', 'pushstate', 'install', 'quiet', 'build' ],
  alias: {
    port: 'p',
    pushstate: 'P',
    build: 'b',
    dir: 'd',
    open: 'o',
    install: 'I',
    force: 'f',
    template: 't',
    new: 'n'
  },
  '--': true,
  default: {
    install: true,
    template: 'default'
  }
});

const templateDirectory = 'templates';
const sketchDirectory = 'sketches';
const defaultDir = '.';

const cwd = argv.cwd || process.cwd();

let dir;
if (argv.dir) {
  dir = path.isAbsolute(argv.dir) ? argv.dir : path.resolve(cwd, argv.dir);
} else {
  dir = path.resolve(cwd, defaultDir);
}

const templateHtmlFile = path.resolve(__dirname, 'templates/index.html');
let htmlFile;
if (argv.html) {
  htmlFile = path.isAbsolute(argv.html) ? path.resolve(argv.html) : path.resolve(cwd, argv.html);
} else {
  htmlFile = templateHtmlFile;
}

const bundleAsync = (bundler) => {
  return new Promise((resolve, reject) => {
    bundler.bundle((err, src) => {
      if (err) reject(err);
      else resolve(src);
    });
  });
};

const prepare = async () => {
  const logger = createLogger(argv);

  if (argv._.length > 1) {
    throw new Error('Currently only one entry is supported.\n\nExample usage:\n    canvas-sketch src/index.js');
  }

  let entry = argv._[0];
  delete argv._;
  const browserifyArgs = argv['--'] || [];
  delete argv['--'];

  let entrySrc;
  if (argv.new) {
    const suffix = typeof argv.new === 'string' ? argv.new : undefined;
    let filepath;
    if (entry) {
      filepath = path.isAbsolute(entry) ? path.resolve(entry) : path.resolve(cwd, entry);
    } else {
      filepath = path.resolve(cwd, sketchDirectory, generateFileName(suffix));
    }

    if (!argv.force && fs.existsSync(filepath)) {
      throw new Error(`The file already exists: ${path.relative(cwd, filepath)} (use -f to overwrite)`);
    }

    // Ensure the folder path exists
    const fileDir = path.dirname(filepath);
    await mkdirp(fileDir);

    // Get stdin for piping
    const stdin = (await getStdin()).trim();
    if (stdin && (!argv.template || argv.template === 'default')) {
      // Allow the user to pass in piped code
      entrySrc = stdin;
    } else {
      try {
        entrySrc = fs.readFileSync(path.resolve(__dirname, templateDirectory, `${argv.template}.js`), 'utf-8');
      } catch (err) {
        throw new Error(`Couldn't find a template by the key ${argv.template}`);
      }
    }

    logger.log(`Writing file: ${chalk.bold(path.relative(cwd, filepath))}`);
    fs.writeFileSync(filepath, entrySrc);
    entry = filepath;
  }

  if (!entry) {
    logger.error('No entry file specified!', `Example usage:\n    canvas-sketch src/index.js\n    canvas-sketch --new --template=regl`);
    process.exit(1);
  }

  // Read source code
  if (!entrySrc) {
    try {
      const entryPath = /^[.\//]/.test(entry) ? entry : ('./' + entry);
      entry = resolve.sync(entryPath, { basedir: cwd });
    } catch (err) {
      logger.error(`Cannot find file "${chalk.bold(entry)}"`);
      logger.pad();
      process.exit(1);
    }

    try {
      entrySrc = fs.readFileSync(entry, 'utf-8');
    } catch (err) {
      logger.error(`Cannot read entry file "${chalk.bold(path.relative(cwd, entry))}"`, err);
      logger.pad();
      process.exit(1);
    }
  }

  // Install dependencies from the template if needed
  if (argv.install !== false) {
    await install(entrySrc, { logger, cwd, ignore: [ 'glslify' ] });
  }

  let output = typeof argv.output !== 'undefined' ? argv.output : true;
  if (typeof output === 'string' && /^(true|false)$/.test(output)) {
    // handle string argv parsing
    output = output === 'true';
  }
  if (output == null || output === true) {
    // Default to downloads
    output = downloads();
  } else if (output === '.') {
    // Accept '.' as current dir
    output = cwd;
  }

  // Add in glslify by default
  browserifyArgs.unshift('-p', require.resolve('./plugin-resolve'));
  browserifyArgs.unshift('-t', require.resolve('glslify'));

  return Object.assign({}, argv, {
    browserifyArgs,
    output,
    logger,
    entry,
    cwd
  });
};

const start = async () => {
  const opt = await prepare();
  const logger = opt.logger;

  const fileName = opt.name || path.basename(opt.entry);
  const fileNameBase = path.basename(fileName, path.extname(fileName));

  const jsUrl = encodeURIComponent(fileName);
  const htmlOpts = { file: htmlFile, src: jsUrl };

  if (opt.build) {
    const compress = argv.compress !== false;
    const jsOutFile = path.resolve(dir, `${fileNameBase}.js`);
    if (jsOutFile === opt.entry) {
      throw new Error(`The input and ouput JS files are the same: ${chalk.bold(path.relative(cwd, jsOutFile))}`);
    }

    const htmlOutFile = path.resolve(dir, `${fileNameBase}.html`);
    if (htmlOutFile === htmlOpts.file) {
      throw new Error(`The input and ouput HTML files are the same: ${chalk.bold(path.relative(cwd, htmlOpts.file))}`);
    }

    // Start building our static contents
    let timeStart = Date.now();
    logger.log('Building...');

    // Create bundler from CLI options
    const bundler = browserifyFromArgs(opt.browserifyArgs, {
      entries: opt.entry
    });

    // First, make sure our output (public) dir exists
    await mkdirp(dir);

    // Now bundle up our code into a string
    const buffer = await bundleAsync(bundler);
    let code = buffer.toString();
    if (compress !== false) {
      try {
        code = terser.minify(code, {
          sourceMap: true,
          output: { comments: false },
          compress: {
            keep_infinity: true,
            pure_getters: true
          },
          warnings: true,
          ecma: 5,
          toplevel: false,
          mangle: {
            properties: false
          }
        }).code;
      } catch (err) {
        logger.error('Could not compress JS bundle');
        throw new Error(err);
      }
    }

    // In --stdout mode, just output the code
    if (opt.stdout) {
      console.log('TODO: --stdout mode');
    } else {
      // A util to log the output of a file
      const logFile = (type, file, data) => {
        const bytes = chalk.dim(`(${prettyBytes(data.length)})`);
        logger.log(`${type} → ${chalk.bold(path.relative(cwd, file))} ${bytes}`, { leadingSpace: false });
      };

      // Read the templated HTML, transform it and write it out
      const htmlData = await html.read(Object.assign({}, htmlOpts, { compress }));
      await writeFile(htmlOutFile, htmlData);
      logFile('HTML', htmlOutFile, htmlData);

      // Write bundled JS
      await writeFile(jsOutFile, code);
      logFile('JS  ', jsOutFile, code);

      const ms = (Date.now() - timeStart);
      logger.log(`Finished in ${chalk.magenta(prettyMs(ms))}`, { leadingSpace: false });
      logger.pad();
    }
  } else {
    // pad the previous logs if necessary
    logger.pad();

    const browserifyArgs = opt.browserifyArgs;
    const clientMiddleware = createMiddleware(opt);
    budo(opt.entry, {
      browserifyArgs,
      open: argv.open,
      serve: jsUrl,
      port: argv.port || 9966,
      pushstate: argv.pushstate,
      middleware: clientMiddleware.middleware,
      ignoreLog: clientMiddleware.ignoreLog,
      live: {
        cache: true,
        debug: false,
        include: [
          // Could find a cleaner way to pass down props
          // to client scripts...
          opt.output ? require.resolve('./client-enable-output.js') : undefined,
          require.resolve('./client.js')
        ].filter(Boolean)
      },
      forceDefaultIndex: true,
      defaultIndex: () => html.stream(htmlOpts),
      dir,
      stream: argv.quiet ? null : process.stdout
    });
  }
};

start()
  .catch(err => {
    const { message, stack } = getErrorDetails(err);
    console.error([ '', chalk.red(message), stack, '' ].join('\n'));
  });
