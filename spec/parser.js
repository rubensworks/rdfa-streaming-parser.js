const { RdfaParser } = require("..");
const { ErrorSkipped } = require('rdf-test-suite');

module.exports = {
  parse: function (data, baseIRI, options) {
    return require('arrayify-stream')(require('streamify-string')(data)
      .pipe(new RdfaParser(Object.assign({ baseIRI }, options))));
  },
};
