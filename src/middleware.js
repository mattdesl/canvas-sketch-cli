const commit = require('./commit');
const { createStream } = require('./ffmpeg-sequence');
const path = require('path');
const Busboy = require('busboy');
const concat = require('concat-stream');
const fs = require('fs');
const mkdirp = require('mkdirp');
const bodyParser = require('body-parser');

module.exports = (opt = {}) => {
  const logger = opt.logger;
  const quiet = opt.quiet;
  const output = opt.output;
  const streamOpt = opt.stream || {};
  const stream = streamOpt.format;

  // TODO: Buffering is not supported at the moment
  // Something to do with the stream not calling 'end' events
  // streamOpt.buffer;
  const bufferFrames = true;

  if (stream && (stream !== 'gif' && stream !== 'mp4')) {
    throw new Error('Currently the --stream flag must be either gif, mp4, or --no-stream (default)');
  }

  let currentStream, currentStreamFilename;
  let isStreaming = Boolean(stream);

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
    return p.then(() => {
      currentStream = null;
      currentStreamFilename = null;
    }).catch(err => {
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
      if (encoding !== 'image/png' && encoding !== 'image/jpeg') {
        return sendError(res, 'Could not start MP4 stream, you must use "image/png" or "image/jpeg" encoding');
      }

      const format = stream;
      const fileName = `${path.basename(opt.filename)}.${format}`;
      const filePath = path.join(output, fileName);
      if (format === 'gif' && opt.fps > 50) {
        console.warn('WARN: Values above 50 FPS may produce choppy GIFs');
      }
      currentStreamFilename = fileName;

      currentStream = createStream({
        ...streamOpt,
        format,
        encoding,
        quiet: String(process.env.DEBUG_FFMPEG) !== '1',
        fps: opt.fps,
        output: filePath
      });
      return currentStream.promise;
    }).then(() => {
      respond(res, resOpt);
    });
  }

  function handleCommit (req, res, next) {
    commit(Object.assign({}, opt, { logger, quiet })).then(result => {
      respond(res, result);
    }).catch(err => {
      sendError(res, err);
    });
  }

  function createBusboy (req, res) {
    try {
      return Busboy({ headers: req.headers });
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
    let responded = false;
    let fileWritePromise = Promise.resolve();
    busboy.once('file', (fieldName, file, info) => {
      const { mimeType } = info;
      fileWritePromise = new Promise((resolve, reject) => {
        mkdirp(output, err => {
          if (err) return reject(err);

          filename = path.basename(info.filename);
          const filePath = path.join(output, filename);
          const curFileName = filename;
          const usingStream = Boolean(isStreaming && currentStream);

          if (usingStream) {
            if (mimeType && mimeType !== currentStream.encoding) {
              reject(new Error('Error: Currently only single-image exports in image/png or image/jpeg format is supported with MP4 streaming'));
            }

            filename = currentStreamFilename;

            if (currentStream) {
              if (bufferFrames && typeof currentStream.writeBufferFrame === 'function') {
                file.pipe(concat(buf => {
                  currentStream.writeBufferFrame(buf)
                    .then(() => resolve())
                    .catch(err => reject(err));
                }));
              } else {
                currentStream.writeFrame(file, curFileName)
                  .then(() => resolve())
                  .catch(err => reject(err));
              }
            } else {
              reject(new Error('WARN: MP4 stream stopped early'));
            }
          } else {
            const writer = fs.createWriteStream(filePath);
            const stream = file.pipe(writer);
            writer.once('error', reject);
            stream.once('error', reject);
            writer.once('finish', resolve);
          }
        });
      }).catch(err => {
        responded = true;
        sendError(res, err);
      });
    });
    busboy.on('close', () => {
      fileWritePromise
        .then(() => {
          if (responded) return;
          const usingStream = Boolean(isStreaming && currentStream);
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
