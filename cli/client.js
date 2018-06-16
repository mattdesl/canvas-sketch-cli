// Mark the canvas-sketch devtool as active
window['canvas-sketch-cli'] = {
  commit: (files, opts) => {
    // Try to fetch the hash
    return window.fetch('/canvas-sketch-client/commit-hash')
      .then(resp => resp.json())
      .then(result => {
        // Notify user of changes
        console.log(result.changed
          ? `[git] ${result.hash} Committed changes`
          : `[git] ${result.hash} Nothing changed`);
        return result.hash;
      })
      .catch(err => {
        // Some issue, just bail out and return nil hash
        console.warning('Could not fetch commit hash');
        console.error(err);
        return undefined;
      });
  }
};
