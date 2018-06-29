#!/usr/bin/env node
const path = require('path');
const budo = require('budo');
const downloads = require('downloads-folder');
const getStdin = require('get-stdin');
const fs = require('fs');
const chalk = require('chalk');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));
const dateformat = require('dateformat');
const filenamify = require('filenamify');
const install = require('./install');
const resolve = require('resolve');
const browserifyFromArgs = require('browserify/bin/args');
const createMiddleware = require('./middleware');
const { createLogger, getErrorDetails } = require('./logger');
const defined = require('defined');

const argv = require('minimist')(process.argv.slice(2), {
  string: ['template'],
  boolean: [ 'open', 'install', 'quiet', 'build', 'forceDefaultIndex' ],
  alias: {
    forceDefaultIndex: 'force-default-index',
    build: 'b',
    dir: 'd',
    open: 'o',
    install: 'I',
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

const generateFileName = (suffix = '') => {
  const separator = suffix ? '-' : '';
  suffix = suffix.replace(/\.js$/, '');
  const date = dateformat(Date.now(), 'yyyy.mm.dd-HH.MM.ss');
  const file = `${date}${separator}${suffix}.js`;
  return filenamify(file);
};

const bundleAsync = (bundler) => {
  return new Promise((resolve, reject) => {
    bundler.bundle((err, src) => {
      if (err) reject(err);
      else resolve(src);
    });
  });
};

const start = async () => {
  const logger = createLogger(argv);
  const cwd = process.cwd();

  let entry = argv._[0];
  delete argv._;
  const browserifyArgs = argv['--'] || [];
  delete argv['--'];

  // Add in glslify by default
  browserifyArgs.unshift('-p', require.resolve('./plugin-resolve'));
  browserifyArgs.unshift('-t', require.resolve('glslify'));

  let entrySrc;
  if (argv.new) {
    const suffix = typeof argv.new === 'string' ? argv.new : undefined;
    const file = generateFileName(suffix);
    await mkdirp(sketchDirectory);

    const filepath = path.join(sketchDirectory, file);
    if (fs.existsSync(filepath)) {
      throw new Error(`The file already exists: ${path.relative(cwd, filepath)}`);
    }

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
    let entryFile;
    try {
      const entryPath = /^[.\//]/.test(entry) ? entry : ('./' + entry);
      entryFile = resolve.sync(entryPath, { basedir: cwd });
    } catch (err) {
      logger.error(`Cannot find file "${chalk.bold(entry)}"`);
      process.exit(1);
    }

    try {
      entrySrc = fs.readFileSync(entryFile, 'utf-8');
    } catch (err) {
      logger.error(`Cannot read entry file "${chalk.bold(path.relative(cwd, entryFile))}"`, err);
      process.exit(1);
    }
  }

  // Install dependencies from the template if needed
  if (argv.install !== false) {
    await install(entrySrc, { logger, cwd, ignore: [ 'glslify' ] });
  }

  // pad the previous logs if necessary
  logger.pad();

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

  const dir = argv.dir || process.cwd();
  const js = argv.js || '/bundle.js';
  const html = argv.html || '/index.html';
  const htmlFile = path.join(dir, html);
  const templateHtmlFile = path.resolve(__dirname, 'templates/index.html');
  const jsFile = path.join(dir, js);

  const defaultIndex = (opt, req) => {
    // If we aren't forcing default index and a file exists at desired spot,
    // use that instead of the default one.
    const file = !argv.forceDefaultIndex && fs.existsSync(htmlFile) ? htmlFile : templateHtmlFile;
    return fs.createReadStream(file);
  };

  if (argv.build) {
    const bundler = browserifyFromArgs(browserifyArgs);
    
  } else {
    const clientMiddleware = createMiddleware(Object.assign({}, argv, { output, cwd, logger }));
    budo(entry, {
      browserifyArgs,
      open: argv.open,
      serve: js,
      middleware: clientMiddleware.middleware,
      ignoreLog: clientMiddleware.ignoreLog,
      live: {
        cache: false,
        debug: true,
        include: [
          // Could find a cleaner way to pass down props
          // to client scripts...
          output ? require.resolve('./client-enable-output.js') : undefined,
          require.resolve('./client.js')
        ].filter(Boolean)
      },
      forceDefaultIndex: true,
      defaultIndex,
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
