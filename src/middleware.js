const commit = require('./commit');
const { createMP4Stream } = require('./ffmpeg-sequence');
const path = require('path');
const Busboy = require('busboy');
const fs = require('fs');
const mkdirp = require('mkdirp');
const bodyParser = require('body-parser');
const concat = require('concat-stream');

module.exports = (opt = {}) => {
  const logger = opt.logger;
  const quiet = opt.quiet;
  const output = opt.output;
  const cwd = opt.cwd;

  let currentStream, currentStreamFilename;
  let isStreaming = true;

  const logError = err => {
    logger.error(err);
    logger.pad();
  };

  const sendError = (res, err) => {
    logError(err);
    res.end(JSON.stringify({ error: err.message }));
  };

  return {
    // Ignore these in budo to avoid console spam, especially with animation export
    ignoreLog: [
      '/canvas-sketch-cli/saveBlob',
      '/canvas-sketch-cli/commit',
      '/canvas-sketch-cli/stream-start',
      '/canvas-sketch-cli/stream-end'
    ],
    middleware: [
      bodyParser.json(),
      (req, res, next) => {
        const post = /post/i.test(req.method);
        if (post && req.url === '/canvas-sketch-cli/saveBlob') {
          handleSaveBlob(req, res, next);
        } else if (post && req.url === '/canvas-sketch-cli/commit') {
          handleCommit(req, res, next);
        } else if (post && req.url === '/canvas-sketch-cli/stream-start') {
          handleStreamStart(req, res, next);
        } else if (post && req.url === '/canvas-sketch-cli/stream-end') {
          handleStreamEnd(req, res, next);
        } else {
          next(null);
        }
      }
    ]
  };

  function respond (res, obj) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  }

  function handleStreamEnd (req, res, next) {
    const opt = req.body;
    const resOpt = {
      stream: isStreaming,
      filename: currentStreamFilename || opt.filename,
      outputName: path.basename(output),
      client: true
    };

    if (!isStreaming) {
      return respond(res, resOpt);
    }

    let p = Promise.resolve();
    if (currentStream) {
      p = currentStream.end();
    }

    p.then(() => {
      respond(res, resOpt);
    }, (err) => sendError(res, err));
  }

  function handleStreamStart (req, res, next) {
    const opt = req.body;
    const resOpt = {
      stream: isStreaming,
      filename: opt.filename,
      outputName: path.basename(output),
      client: true
    };

    if (!isStreaming) {
      return respond(res, resOpt);
    }

    if (!output) {
      return sendError(res, `Error trying to start stream, the --output flag has been disabled`);
    }

    currentStreamFilename = path.basename(opt.filename);

    const filePath = path.join(output, currentStreamFilename);
    currentStream = createMP4Stream({
      fps: opt.fps,
      output: filePath
    });

    respond(res, resOpt);
  }

  function handleCommit (req, res, next) {
    commit(Object.assign({}, opt, { logger, quiet })).then(result => {
      res.end(JSON.stringify(result));
      respond(res, result);
    }).catch(err => {
      sendError(res, err);
    });
  }

  function createBusboy (req, res) {
    try {
      return new Busboy({ headers: req.headers });
    } catch (err) {
      // Invalid headers in request
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/text');
      res.end(err.message);
      return false;
    }
  }

  function handleSaveBlob (req, res, next) {
    if (!output) {
      return sendError(res, `Error trying to saveBlob, the --output flag has been disabled`);
    }

    let busboy = createBusboy(req, res);
    if (!busboy) return;

    let filename;
    let fileWritePromise = Promise.resolve();
    const usingStream = Boolean(isStreaming && currentStream);

    busboy.once('file', (field, file, name) => {
      fileWritePromise = new Promise((resolve, reject) => {
        mkdirp(output, err => {
          if (err) return reject(err);

          if (usingStream) {
            filename = currentStreamFilename;
            if (currentStream.stream.writable) {
              const piped = file.pipe(concat(buf => {
                if (currentStream.stream.writable) {
                  currentStream.stream.write(buf);
                }
              }));
              piped.once('finish', () => {
                resolve();
              });
              file.once('error', reject);
              piped.once('error', reject);
            } else {
              reject(new Error('WARN: MP4 stream is no longer writable'));
            }
          } else {
            filename = path.basename(name);
            const filePath = path.join(output, filename);
            const writer = fs.createWriteStream(filePath);
            const piped = file.pipe(writer);
            writer.once('error', reject);
            piped.once('error', reject);
            writer.once('finish', resolve);
          }
        });
      });
    });
    busboy.on('finish', () => {
      fileWritePromise
        .then(() => {
          respond(res, {
            filename: filename,
            stream: usingStream,
            outputName: path.basename(output),
            client: true
          });
        }, err => sendError(res, err));
    });
    req.pipe(busboy);
  }
};