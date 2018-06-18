// Mark the canvas-sketch devtool as active
window['canvas-sketch-cli'] = {
  commit: (files, opts) => {
    // Try to fetch the hash
    return window.fetch('/canvas-sketch-client/commit-hash')
      .then(resp => resp.json())
      .then(result => {
        if (result.error) {
          if (result.error.includes('not a git repository')) {
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
  }
};
