const concatStream = require('concat-stream');
const duplexer = require('duplexer2');
const through = require('through2');
const path = require('path');
const minify = require('html-minifier').minify;
const fs = require('fs');
const maxstache = require('maxstache');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

function transform (htmlData, opt = {}) {
  htmlData = maxstache(htmlData, {
    src: opt.src,
    title: opt.title || 'canvas-sketch',
    entry: opt.inline
      ? `<script>${opt.code}</script>`
      : `<script src="${opt.src}"></script>`
  });
  if (opt.compress) {
    htmlData = minify(htmlData, {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      decodeEntities: true,
      html5: true,
      minifyCSS: true,
      minifyJS: !opt.inline,
      removeAttributeQuotes: true,
      removeEmptyAttributes: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      trimCustomFragments: true,
      useShortDoctype: true
    });
  }
  return htmlData;
}

module.exports.stream = (opt = {}) => {
  const output = through();
  return fs.createReadStream(opt.file).pipe(duplexer(concatStream(str => {
    str = str.toString();
    str = transform(str, opt);
    output.end(str);
  }), output));
};

module.exports.read = async (opt = {}) => {
  const data = await readFile(opt.file, 'utf-8');
  return transform(data, opt);
};
