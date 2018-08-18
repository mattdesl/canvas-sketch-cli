const dateformat = require('dateformat');
const { exec } = require('child_process');
const path = require('path');

module.exports = async function (opt = {}) {
  const logger = opt.logger;
  return execify('git status --porcelain')
    .catch(err => {
      if (err.message.includes('Not a git repository')) {
        const err = new Error(`Can't commit changes because the working directory is not a git repository`);
        err.hideStack = true;
        throw err;
      }
      throw err;
    })
    .then(result => {
      result = result.trim();
      if (result) {
        return doCommit(opt).then(() => ({ changed: true }));
      } else {
        if (!opt.quiet) {
          logger.log('Nothing new to commit.');
        }
        return { changed: false };
      }
    })
    .then(result => {
      return execify(`git rev-parse --short HEAD`)
        .then(hash => {
          return { ...result, hash: hash.trim() };
        });
    });
};

function generateCommitMessage (entryName) {
  // TODO: Maybe figure out a nice naming pattern for the commit
  // message. Ideally it would take the timeStamp from the export function,
  // however we don't want to inject user-modifiable strings into exec...
  const date = dateformat(Date.now(), 'yyyy.mm.dd-HH.MM.ss');
  const prefix = entryName ? `[${entryName}]` : '';
  return `${prefix} ${date}`;
}

function doCommit (opt) {
  const msg = generateCommitMessage(opt.entry ? path.relative(opt.cwd, opt.entry) : null);
  return execify(`git add . && git commit -m "${msg}"`)
    .then(result => {
      if (opt.logger) {
        opt.logger.log('Committing latest changes...\n');
      }
      if (!opt.quiet) console.log(result);
    });
}

function execify (cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      stdout = stdout.toString();
      stderr = stderr.toString();
      if (stderr && stderr.length > 0) console.error(stderr);
      resolve(stdout);
    });
  });
}
