#!/usr/bin/env node
const path = require('path');
const budo = require('budo');
const defined = require('defined');
const rightNow = require('right-now');
const prettyBytes = require('pretty-bytes');
const prettyMs = require('pretty-ms');
const downloads = require('downloads-folder');
const getStdin = require('get-stdin');
const esmify = require('esmify');
const fs = require('fs');
const chalk = require('chalk');
const { promisify } = require('util');
const { generateFileName, readPackage, isCanvasSketchPackage } = require('./util');
const mkdirp = promisify(require('mkdirp'));
const writeFile = promisify(fs.writeFile);
const install = require('./install');
const resolve = require('resolve');
const browserifyFromArgs = require('browserify/bin/args');
const createMiddleware = require('./middleware');
const { createLogger, getErrorDetails } = require('./logger');
const html = require('./html');
const terser = require('terser');
const { EventEmitter } = require('events');
const pluginEnv = require('./plugins/plugin-env');
const pluginResolve = require('./plugins/plugin-resolve');
const fromString = require('from2-string');
const pluginGLSL = require('./plugins/plugin-glsl');
// const transformInstaller = require('./plugins/transform-installer');

const argv = require('minimist')(process.argv.slice(2), {
  string: ['template'],
  boolean: [
    'hot',
    'open',
    'force',
    'pushstate',
    'install',
    'quiet',
    'build',
    'version',
    'inline'
  ],
  alias: {
    version: 'v',
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

if (argv.version) {
  console.log(require('../package.json').version);
  process.exit(0);
}

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

const prepare = async (logger) => {
  // Write a new package, but first check for collision
  const dirName = path.basename(cwd);
  if (dirName === 'canvas-sketch') {
    const pkg = await readPackage({ cwd }, true);
    if (!pkg || !isCanvasSketchPackage(pkg)) {
      throw new Error(`Your folder name is ${chalk.bold('canvas-sketch')} which may lead to conflicts when using this tool. Please choose another folder name and run the command again.`);
    }
  }

  if (argv._.length > 1) {
    throw new Error('Currently only one entry is supported.\n\nExample usage:\n    canvas-sketch src/index.js');
  }

  let entry = argv._[0];
  delete argv._;
  const browserifyArgs = argv['--'] || [];
  delete argv['--'];

  let resolveEntry;
  let entrySrc;
  if (argv.new) {
    const prefix = typeof argv.new === 'string' ? argv.new : undefined;
    let filepath;
    if (entry) {
      filepath = path.isAbsolute(entry) ? path.resolve(entry) : path.resolve(cwd, entry);

      // ensure a file extension is present. If not, automatically add .js
      if (!path.extname(entry)) {
        filepath = `${filepath}.js`;
      }
    } else {
      filepath = path.resolve(cwd, sketchDirectory, generateFileName(prefix));
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
      let templateFile;
      if (/^[\\/.]/.test(argv.template)) {
        templateFile = path.isAbsolute(argv.template)
          ? argv.template
          : path.resolve(cwd, argv.template);
        if (!fs.existsSync(templateFile)) {
          throw new Error(`Couldn't find a template at ${argv.template}`);
        }
      } else {
        templateFile = path.resolve(__dirname, templateDirectory, `${argv.template}.js`);
        if (!fs.existsSync(templateFile)) {
          throw new Error(`Couldn't find a template by the key ${argv.template}`);
        }
      }

      resolveEntry = templateFile;
      try {
        entrySrc = fs.readFileSync(templateFile, 'utf-8');
      } catch (err) {
        throw new Error(`Error while reading the template ${argv.template}`);
      }
    }

    logger.log(`Writing file: ${chalk.bold(path.relative(cwd, filepath))}`);
    fs.writeFileSync(filepath, entrySrc);
    entry = filepath;
  }

  if (!resolveEntry) resolveEntry = entry;

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
    try {
      await install(resolveEntry, { entrySrc, logger, cwd });
    } catch (err) {
      console.error(err.toString());
    }
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

  const mode = defined(argv.mode, argv.build ? 'production' : 'development');
  const hot = Boolean(argv.hot);
  const params = Object.assign({}, argv, {
    mode,
    browserifyArgs,
    extensions: pluginGLSL.extensions,
    output,
    logger,
    hot,
    entry,
    cwd,
    installer: new EventEmitter()
  });

  browserifyArgs.push(
    // Add in ESM support
    '-p', (bundler, opts) => {
      return esmify(bundler, Object.assign({}, opts, {
        // Disable "module" field since it is brutally annoying :(
        // Basically it changes the way CommonJS-authored code needs to
        // be written, forcing authors to update their code paths to use:
        //   require('blah').default
        // The added benefit of tree-shaking ES Modules isn't even used here (no rollup/webpack)
        // so we will just discard it altogether for a cleaner developer & user experience.
        mainFields: [ 'browser', 'main' ],
        // This is a bit frustrating, as well. Babel-ifying the entire node_modules
        // tree is extremely slow, and only fixes a few problematic modules
        // that have decided to publish with ESM, which isn't even standard yet!
        // So, we will only support ESM in local code for canvas-sketch.
        nodeModules: false
      }));
    },
    '-g', pluginGLSL(params),
    // Add in glslify and make it resolve to here
    '-g', require.resolve('glslify'),
    // A plugin that handles resolving some modules to this CLI tool
    '-p', pluginResolve(params),
    // Also add in some envify tools
    '-p', pluginEnv(params)
  );

  // TODO: Figure out a nice way to install automatically
  // if (argv.install !== false) {
  //   browserifyArgs.push('-t', transformInstaller(params));
  // }

  return params;
};

const start = async () => {
  const logger = createLogger(argv);
  let opt;
  try {
    opt = await prepare(logger);
  } catch (err) {
    throw err;
  }

  const fileName = opt.name || path.basename(opt.entry);
  const fileNameBase = path.basename(fileName, path.extname(fileName));

  const jsUrl = opt.js || encodeURIComponent(fileName);
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
      debug: !compress,
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
      throw new Error('--stdout is not yet supported');
    } else {
      // A util to log the output of a file
      const logFile = (type, file, data) => {
        const bytes = chalk.dim(`(${prettyBytes(data.length)})`);
        logger.log(`${type} → ${chalk.bold(path.relative(cwd, file))} ${bytes}`, { leadingSpace: false });
      };

      const inline = opt.inline;

      // Read the templated HTML, transform it and write it out
      const htmlData = await html.read(Object.assign({}, htmlOpts, {
        inline,
        code,
        compress
      }));
      await writeFile(htmlOutFile, htmlData);
      logFile('HTML', htmlOutFile, htmlData);

      // Write bundled JS
      if (!inline) {
        await writeFile(jsOutFile, code);
        logFile('JS  ', jsOutFile, code);
      }

      const ms = (Date.now() - timeStart);
      logger.log(`Finished in ${chalk.magenta(prettyMs(ms))}`, { leadingSpace: false });
      logger.pad();
    }
  } else {
    // pad the previous logs if necessary
    logger.pad();

    const browserifyArgs = opt.browserifyArgs;
    const clientMiddleware = createMiddleware(opt);

    const hotReloading = opt.hot;
    const entries = [
      // Could find a cleaner way to pass down props
      // to client scripts...
      opt.output ? require.resolve('./instrumentation/client-enable-output.js') : undefined,
      hotReloading ? require.resolve('./instrumentation/client-enable-hot.js') : undefined,
      require.resolve('./instrumentation/client.js'),
      opt.entry
    ].filter(Boolean);

    const applyReload = (app, wss) => {
      // Because some editors & operating systems do atomic updates
      // very quickly together on file save, you can end up with duplicate
      // file change events from chokidar in some cases. We guard against
      // this by not evaluating duplicate code that is run within a fraction
      // of a second.
      const chokidarThreshold = 150;

      let lastTime = Date.now();
      let chokidarDelta = Infinity;

      var lastBundle;
      var hasError = false;

      // Tell the active instances whether to enable or disable hot reloading
      wss.on('connection', (socket) => {
        socket.send(JSON.stringify({ event: 'hot-reload', enabled: hotReloading }));
      });

      // Hot reloading reacts on update, after bundle is finished
      app.on('update', (code) => {
        lastTime = rightNow();

        if (hotReloading) {
          code = code.toString();
          if (chokidarDelta < chokidarThreshold && code === lastBundle) {
            // We only do this chokidar guard when the bundle is the same.
            // If the bundle is different, we definitely want to apply the changes!
            return;
          }

          wss.clients.forEach(socket => {
            socket.send(JSON.stringify({
              event: 'eval',
              src: jsUrl,
              error: hasError,
              code
            }));
          });
          lastBundle = code;
        }
      });

      // Non-hot reloading reacts on pending, before bundle starts updating
      // This makes the experience feel more instant
      app.on('pending', () => {
        const now = rightNow();
        chokidarDelta = now - lastTime;
        if (!hotReloading && chokidarDelta > chokidarThreshold) {
          // We avoid duplicate reload events here with the chokidar threshold
          app.reload();
        }
      });

      app.on('pending', () => {
        hasError = false;
      });

      app.on('bundle-error', (err) => {
        hasError = true;
      });
    };

    const app = budo(entries, {
      browserifyArgs,
      open: argv.open,
      serve: jsUrl,
      port: argv.port || 9966,
      pushstate: argv.pushstate,
      middleware: clientMiddleware.middleware,
      ignoreLog: clientMiddleware.ignoreLog,
      forceDefaultIndex: true,
      defaultIndex: () => html.stream(htmlOpts),
      dir,
      stream: argv.quiet ? null : process.stdout
    }).live()
      .watch()
      .on('watch', (ev, file) => {
        app.reload(file);
      })
      .on('connect', ev => {
        // Here we do some things like notify the clients that a module is being
        // installed.
        const wss = ev.webSocketServer;
        const installEvents = [ 'install-start', 'install-end' ];
        installEvents.forEach(key => {
          opt.installer.on(key, ({ modules }) => {
            app.error(key === 'install-start'
              ? `Installing modules from npm: ${modules.join(', ')}`
              : `Reloading...`);
            wss.clients.forEach(socket => {
              socket.send(JSON.stringify({ event: key }));
            });
          });
        });

        applyReload(app, wss);
      });
  }
};

start()
  .catch(err => {
    const { message, stack } = getErrorDetails(err);
    if (err instanceof SyntaxError) {
      console.error(`\n${err.toString()}\n`);
    } else {
      console.error([
        '',
        chalk.red(message),
        '',
        `    ${stack.trim().split('\n').slice(0, 10).join('\n')}`,
        ''
      ].join('\n'));
    }
  });
