const defaultPostOptions = {
  method: 'POST',
  cache: 'no-cache',
  credentials: 'same-origin'
};

// Grab the CLI namespace
window['canvas-sketch-cli'] = window['canvas-sketch-cli'] || {};

// File saving utility
window['canvas-sketch-cli'].saveBlob = (blob, opts) => {
  opts = opts || {};

  const form = new window.FormData();
  form.append('file', blob, opts.filename);
  return window.fetch('/canvas-sketch-cli/saveBlob', Object.assign({}, defaultPostOptions, {
    body: form
  })).then(res => {
    if (res.status === 200) {
      return res.json();
    } else {
      return res.text().then(text => {
        throw new Error(text);
      });
    }
  }).catch(err => {
    // Some issue, just bail out and return nil hash
    console.warn(`There was a problem exporting ${opts.filename}`);
    console.error(err);
    return undefined;
  });
};

// git commit utility
window['canvas-sketch-cli'].commit = () => {
  return window.fetch('/canvas-sketch-cli/commit', defaultPostOptions)
    .then(resp => resp.json())
    .then(result => {
      if (result.error) {
        if (result.error.toLowerCase().includes('not a git repository')) {
          console.warn(`Warning: ${result.error}`);
          return null;
        } else {
          throw new Error(result.error);
        }
      }
      // Notify user of changes
      console.log(result.changed
        ? `[git] ${result.hash} Committed changes`
        : `[git] ${result.hash} Nothing changed`);
      return result.hash;
    })
    .catch(err => {
      // Some issue, just bail out and return nil hash
      console.warn('Could not commit changes and fetch hash');
      console.error(err);
      return undefined;
    });
};

// npm/node installation notification
// it works but little popup instead of full page reload would be nice
// if ('budo-livereload' in window) {
//   const budo = window['budo-livereload'];
//   budo.listen((data) => {
//     console.log('[LiveReload] Message form WebSocketServer: ', data);
//   });
// }
