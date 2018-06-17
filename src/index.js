#!/usr/bin/env node
const path = require('path');
const budo = require('budo');
const fs = require('fs');
const chalk = require('chalk');
const pify = require('pify');
const mkdirp = pify(require('mkdirp'));
const dateformat = require('dateformat');
const commit = require('./commit');
const filenamify = require('filenamify');
const install = require('./install');
const resolve = require('resolve');
const { createLogger, getErrorDetails } = require('./logger');

const argv = require('minimist')(process.argv.slice(2), {
  string: ['template'],
  alias: {
    dir: 'd',
    open: 'o',
    install: 'I',
    template: 't',
    new: 'n'
  },
  boolean: [ 'open', 'install' ],
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

const start = async () => {
  const logger = createLogger(argv);
  const cwd = process.cwd();
  const staticDir = argv.dir;

  let entry = argv._[0];
  let entrySrc;
  if (argv.new) {
    const suffix = typeof argv.new === 'string' ? argv.new : undefined;
    const file = generateFileName(suffix);
    await mkdirp(sketchDirectory);

    const filepath = path.join(sketchDirectory, file);
    if (fs.existsSync(filepath)) {
      throw new Error(`The file already exists: ${path.relative(cwd, filepath)}`);
    }
    let template;
    try {
      template = fs.readFileSync(path.resolve(__dirname, templateDirectory, `${argv.template}.js`), 'utf-8');
    } catch (err) {
      throw new Error(`Couldn't find a template by the key ${argv.template}`);
    }

    logger.log(`Writing file: ${chalk.bold(path.relative(cwd, filepath))}`);
    fs.writeFileSync(filepath, template);
    entry = filepath;
    entrySrc = template;
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

  budo(entry, {
    browserify: {
      // resolve glslify requires to here
      plugin: [ require('./plugin-resolve') ],
      // setup by default with glslify
      transform: [ require.resolve('glslify') ]
    },
    open: argv.open,
    serve: 'bundle.js',
    middleware: (req, res, next) => {
      if (req.url === '/canvas-sketch-client/commit-hash') {
        commit().then(result => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        }).catch(err => {
          logger.error('Could not commit changes', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end(err.message);
        });
      } else {
        next(null);
      }
    },
    live: {
      cache: false,
      debug: true,
      include: require.resolve('./client.js')
    },
    defaultIndex: (opt, req) => {
      return fs.createReadStream(path.resolve(__dirname, 'templates/index.html'));
    },
    dir: staticDir,
    stream: argv.quiet ? null : process.stdout
  }).on('connect', ev => {
    ev.webSocketServer.on('connection', client => {
      client.on('message', ev => {
        const data = JSON.parse(ev);
        if (data.event === 'commit') commit();
      });
    });
  });
};

start()
  .catch(err => {
    const { message, stack } = getErrorDetails(err);
    console.error([ '', chalk.red(message), stack, '' ].join('\n'));
  });
