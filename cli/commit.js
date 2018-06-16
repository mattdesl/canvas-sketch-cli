const dateformat = require('dateformat');
const { exec } = require('child_process');
const chalk = require('chalk');

module.exports = function (opt = {}) {
  return execify('git status --porcelain')
    .then(result => {
      result = result.trim();
      if (result) {
        return doCommit(opt).then(() => ({ changed: true }));
      } else {
        if (!opt.quiet) {
          console.log(chalk.magenta('Nothing new to commit.'));
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

function generateCommitMessage () {
  // TODO: Maybe figure out a nice naming pattern for the commit
  // message. Ideally it would take the timeStamp from the export function,
  // however we don't want to inject user-modifiable strings into exec...
  const date = dateformat(Date.now(), 'yyyy.mm.dd-HH.MM.ss');
  return `generation-${date}`;
}

function doCommit (opt) {
  const msg = generateCommitMessage();
  return execify(`git add . && git commit -m "${msg}"`)
    .then(result => {
      if (!opt.quiet) {
        console.log(chalk.magenta('Committing latest changes...\n') + result);
      }
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
