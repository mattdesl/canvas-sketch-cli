const commit = require('./commit');
const path = require('path');
const Busboy = require('busboy');
const fs = require('fs');
const mkdirp = require('mkdirp');

module.exports = (opt = {}) => {
  const logger = opt.logger;
  const quiet = opt.quiet;
  const output = opt.output;
  const cwd = opt.cwd;

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
    ignoreLog: [ '/canvas-sketch-cli/saveBlob', '/canvas-sketch-cli/commit' ],
    middleware: (req, res, next) => {
      const post = /post/i.test(req.method);
      if (post && req.url === '/canvas-sketch-cli/saveBlob') {
        if (!output) {
          return sendError(res, `Error trying to saveBlob, the --output flag has been disabled`);
        }

        var busboy;
        try {
          busboy = new Busboy({ headers: req.headers });
        } catch (err) {
          // Invalid headers in request
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/text');
          res.end(err.message);
          return;
        }

        let filePath, fileName;
        busboy.on('file', (field, file, name) => {
          mkdirp(output, err => {
            if (err) return sendError(res, err);
            fileName = path.basename(name);
            filePath = path.join(output, fileName);
            const writer = fs.createWriteStream(filePath);
            file.pipe(writer).on('error', err => sendError(res, err));
          });
        });
        busboy.on('finish', () => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            filename: fileName,
            outputName: path.basename(output),
            client: true
          }));
        });
        req.pipe(busboy);
      } else if (post && req.url === '/canvas-sketch-cli/commit') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        commit(Object.assign({}, opt, { logger, quiet })).then(result => {
          res.end(JSON.stringify(result));
        }).catch(err => {
          sendError(res, err);
        });
      } else {
        next(null);
      }
    }
  };
};