const NAMESPACE = 'canvas-sketch-cli';

// Grab the CLI namespace
window[NAMESPACE] = window[NAMESPACE] || {};

if (!window[NAMESPACE].initialized) {
  initialize();
}

function initialize () {
  window[NAMESPACE].initialized = true;

  const defaultPostOptions = {
    method: 'POST',
    cache: 'no-cache',
    credentials: 'same-origin'
  };

  // File saving utility
  window[NAMESPACE].saveBlob = (blob, opts) => {
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
  window[NAMESPACE].commit = () => {
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

  if ('budo-livereload' in window && window[NAMESPACE].hot) {
    console.log(`%c[canvas-sketch-cli]%c ✨ Hot Reload Enabled`, 'color: #8e8e8e;', 'color: initial;');
    let lastBundle;
    const client = window['budo-livereload'];
    client.listen(data => {
      if (data.event === 'eval') {
        if (!data.error) {
          client.clearError();
        }
        try {
          eval(data.code);
          if (!data.error) console.log(`%c[canvas-sketch-cli]%c ✨ Hot Reloaded`, 'color: #8e8e8e;', 'color: initial;');
        } catch (err) {
          console.error(`%c[canvas-sketch-cli]%c 🚨 Hot Reload error`, 'color: #8e8e8e;', 'color: initial;');
          console.error(err.toString());
          client.showError(err.toString());
        }
      }
    });
  }
}