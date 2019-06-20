const NAMESPACE = 'canvas-sketch-cli';

// Grab the CLI namespace
window[NAMESPACE] = window[NAMESPACE] || {};

if (!window[NAMESPACE].initialized) {
  initialize();
}

function initialize () {
  // Awaiting enable/disable event
  window[NAMESPACE].liveReloadEnabled = undefined;
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

  const stream = (url, opts) => {
    opts = opts || {};

    return window.fetch(url, Object.assign({}, defaultPostOptions, {
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        save: opts.save,
        encoding: opts.encoding,
        timeStamp: opts.timeStamp,
        fps: opts.fps,
        filename: opts.filename
      })
    }))
      .then(res => {
        if (res.status === 200) {
          return res.json();
        } else {
          return res.text().then(text => {
            throw new Error(text);
          });
        }
      }).catch(err => {
        // Some issue, just bail out and return nil hash
        console.warn(`There was a problem starting the stream export`);
        console.error(err);
        return undefined;
      });
  };

  // File streaming utility
  window[NAMESPACE].streamStart = (opts) => {
    return stream('/canvas-sketch-cli/stream-start', opts);
  };

  window[NAMESPACE].streamEnd = (opts) => {
    return stream('/canvas-sketch-cli/stream-end', opts);
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

  if ('budo-livereload' in window) {
    const client = window['budo-livereload'];
    client.listen(data => {
      if (data.event === 'hot-reload') {
        setupLiveReload(data.enabled);
      }
    });

    // On first load, check to see if we should setup live reload or not
    if (window[NAMESPACE].hot) {
      setupLiveReload(true);
    } else {
      setupLiveReload(false);
    }
  }
}

function setupLiveReload (isEnabled) {
  const previousState = window[NAMESPACE].liveReloadEnabled;
  if (typeof previousState !== 'undefined' && isEnabled !== previousState) {
    // We need to reload the page to ensure the new sketch function is
    // named for hot reloading, and/or cleaned up after hot reloading is disabled
    window.location.reload(true);
    return;
  }

  if (isEnabled === window[NAMESPACE].liveReloadEnabled) {
    // No change in state
    return;
  }

  // Mark new state
  window[NAMESPACE].liveReloadEnabled = isEnabled;

  if (isEnabled) {
    if ('budo-livereload' in window) {
      console.log(`%c[canvas-sketch-cli]%c ✨ Hot Reload Enabled`, 'color: #8e8e8e;', 'color: initial;');
      const client = window['budo-livereload'];
      client.listen(onClientData);
    }
  }
}

function onClientData (data) {
  const client = window['budo-livereload'];
  if (!client) return;

  if (data.event === 'eval') {
    if (!data.error) {
      client.clearError();
    }
    try {
      eval(data.code);
      if (!data.error) console.log(`%c[canvas-sketch-cli]%c ✨ Hot Reloaded`, 'color: #8e8e8e;', 'color: initial;');
    } catch (err) {
      console.error(`%c[canvas-sketch-cli]%c 🚨 Hot Reload error`, 'color: #8e8e8e;', 'color: initial;');
      client.showError(err.toString());

      // This will also load up the problematic script so that stack traces with
      // source maps is visible
      const scriptElement = document.createElement('script');
      scriptElement.onload = () => {
        document.body.removeChild(scriptElement);
      };
      scriptElement.src = data.src;
      document.body.appendChild(scriptElement);
    }
  }
}