const { RdfaParser } = require('..');

module.exports = {
  parse(data, baseIRI, options) {
    return require('arrayify-stream').arrayifyStream(require('streamify-string')(data)
      .pipe(new RdfaParser({ baseIRI, ...options })));
  },
};
