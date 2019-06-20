const commit = require('./commit');
const { createMP4Stream } = require('./ffmpeg-sequence');
const path = require('path');
const Busboy = require('busboy');
const fs = require('fs');
const mkdirp = require('mkdirp');
const bodyParser = require('body-parser');

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

  function stopCurrentStream () {
    let p = Promise.resolve();
    if (currentStream) {
      p = currentStream.end();
    }
    currentStream = null;
    currentStreamFilename = null;
    return p.catch(err => {
      console.error(err);
    });
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

    stopCurrentStream().then(() => {
      respond(res, resOpt);
    }).catch(err => sendError(res, err));
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

    stopCurrentStream().then(() => {
      const encoding = opt.encoding || 'image/png';
      let imageFormat = parseMP4ImageEncoding(encoding);
      if (!imageFormat) {
        return sendError(res, 'Could not start MP4 stream, you must use image/png encoding or image/jpeg');
      }

      currentStreamFilename = path.basename(opt.filename);
      const filePath = path.join(output, currentStreamFilename);

      currentStream = createMP4Stream({
        imageFormat,
        quiet: String(process.env.DEBUG_FFMPEG) !== '1',
        fps: opt.fps,
        output: filePath
      });

      respond(res, resOpt);
    });
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

  function parseMP4ImageEncoding (mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'mjpeg';
    return null;
  }

  function handleSaveBlob (req, res, next) {
    if (!output) {
      return sendError(res, `Error trying to saveBlob, the --output flag has been disabled`);
    }

    let busboy = createBusboy(req, res);
    if (!busboy) return;

    let filename;
    let responded = false;
    let fileWritePromise = Promise.resolve();
    const usingStream = Boolean(isStreaming && currentStream);
    busboy.once('file', (field, file, name, encoding, mimetype) => {
      fileWritePromise = new Promise((resolve, reject) => {
        mkdirp(output, err => {
          if (err) return reject(err);

          if (usingStream) {
            filename = currentStreamFilename;
            if (currentStream.stream.writable) {
              const newFormat = parseMP4ImageEncoding(mimetype);
              if (newFormat !== currentStream.imageFormat) {
                reject(new Error('Error: Currently only single-image exports in image/png or image/jpeg format is supported with MP4 streaming'));
              } else {
                file.pipe(currentStream.stream, { end: false });
                file.once('end', resolve);
                file.once('error', reject);
              }
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
      }).catch(err => {
        responded = true;
        sendError(res, err);
      });
    });
    busboy.on('finish', () => {
      fileWritePromise
        .then(() => {
          if (responded) return;
          responded = true;
          respond(res, {
            filename: filename,
            stream: usingStream,
            outputName: path.basename(output),
            client: true
          });
        }).catch(err => {
          if (responded) return;
          responded = true;
          sendError(res, err);
        });
    });
    req.pipe(busboy);
  }
};
