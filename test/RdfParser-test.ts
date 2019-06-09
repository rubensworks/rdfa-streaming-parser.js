import {blankNode, literal, namedNode} from "@rdfjs/data-model";
import "jest-rdf";
import * as RDF from "rdf-js";
import {PassThrough} from "stream";
import {RdfaParser} from "../lib/RdfaParser";
const DataFactory = require('@rdfjs/data-model');
const streamifyString = require('streamify-string');
const arrayifyStream = require('arrayify-stream');
const quad = require('rdf-quad');

describe('RdfaParser', () => {

  it('should be constructable without args', () => {
    const instance = new RdfaParser();
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(require('@rdfjs/data-model'));
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode(''));
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with empty args', () => {
    const instance = new RdfaParser({});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode(''));
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with a custom data factory', () => {
    const dataFactory: any = { defaultGraph: () => 'abc', namedNode: () => namedNode('abc') };
    const instance = new RdfaParser({dataFactory});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(dataFactory);
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode('abc'));
    expect((<any> instance).defaultGraph).toBe('abc');
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with a custom base IRI', () => {
    const instance = new RdfaParser({baseIRI: 'myBaseIRI'});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode('myBaseIRI'));
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with a custom default graph', () => {
    const defaultGraph = DataFactory.namedNode('abc');
    const instance = new RdfaParser({defaultGraph});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode(''));
    expect((<any> instance).defaultGraph).toBe(defaultGraph);
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with strict', () => {
    const instance = new RdfaParser({ strict: true });
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode(''));
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toEqual(true);
  });

  it('should be constructable with args with a custom data factory, base IRI, strict and default graph', () => {
    const dataFactory: any = { defaultGraph: () => 'abc', namedNode: () => namedNode('abc') };
    const defaultGraph = DataFactory.namedNode('abc');
    const instance = new RdfaParser({ dataFactory, baseIRI: 'myBaseIRI', defaultGraph, strict: true });
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(dataFactory);
    expect((<any> instance).baseIRI).toEqualRdfTerm(namedNode('abc'));
    expect((<any> instance).defaultGraph).toBe(defaultGraph);
    expect((<any> instance).options.strict).toEqual(true);
  });

  describe('#parseNamespace', () => {
    it('should parse a tag without prefix attribute', () => {
      const attributes = {};
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({});
    });

    it('should parse a tag with empty prefix attribute', () => {
      const attributes = {
        prefix: '',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({});
    });

    it('should parse a tag with one prefix', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({
        dc: 'http://purl.org/dc/terms/',
      });
    });

    it('should parse a tag with two prefixes', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/ abc: http://example.org',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({
        abc: 'http://example.org',
        dc: 'http://purl.org/dc/terms/',
      });
    });

    it('should parse a tag with one prefix and silently ignore invalid prefixes (1)', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/ abc',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({
        dc: 'http://purl.org/dc/terms/',
      });
    });

    it('should parse a tag with one prefix and silently ignore invalid prefixes (2)', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/ abc:',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({
        dc: 'http://purl.org/dc/terms/',
      });
    });

    it('should parse a tag without prefix attribute that inherits parent prefixes', () => {
      const attributes = {};
      return expect(RdfaParser.parsePrefixes(attributes, {
        ex: 'http://example.org',
      })).toEqual({
        ex: 'http://example.org',
      });
    });

    it('should parse a tag without prefixes that inherits parent prefixes', () => {
      const attributes = {
        prefix: '',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {
        ex: 'http://example.org',
      })).toEqual({
        ex: 'http://example.org',
      });
    });

    it('should parse a tag with one prefix that combines parent prefixes', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {
        ex: 'http://example.org',
      })).toEqual({
        dc: 'http://purl.org/dc/terms/',
        ex: 'http://example.org',
      });
    });

    it('should parse a tag with one prefix that overrides a parent prefix', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {
        dc: 'http://example.org',
      })).toEqual({
        dc: 'http://purl.org/dc/terms/',
      });
    });

    it('should parse a tag with one prefix with newlines', () => {
      const attributes = {
        prefix: 'dc: http://purl.org/dc/terms/\nex: \nhttp://example.org/',
      };
      return expect(RdfaParser.parsePrefixes(attributes, {})).toEqual({
        dc: 'http://purl.org/dc/terms/',
        ex: 'http://example.org/',
      });
    });
  });

  describe('#expandPrefixedTerm', () => {
    it('should expand a valid prefixed term', () => {
      const activeTag: any = {
        prefixes: {
          dc: 'http://purl.org/dc/terms/',
        },
      };
      return expect(RdfaParser.expandPrefixedTerm('dc:bla', activeTag))
        .toEqual('http://purl.org/dc/terms/bla');
    });

    it('should expand a valid term', () => {
      const activeTag: any = {
        prefixes: {
          term: 'http://purl.org/dc/terms/term',
        },
      };
      return expect(RdfaParser.expandPrefixedTerm('term', activeTag))
        .toEqual('http://purl.org/dc/terms/term');
    });

    it('should not expand an unknown prefix', () => {
      const activeTag: any = {
        prefixes: {
          dc: 'http://purl.org/dc/terms/',
        },
      };
      return expect(RdfaParser.expandPrefixedTerm('bla:bla', activeTag))
        .toEqual('bla:bla');
    });

    it('should not expand an url', () => {
      const activeTag: any = {
        prefixes: {
          dc: 'http://purl.org/dc/terms/',
        },
      };
      return expect(RdfaParser.expandPrefixedTerm('http://example.org/bla', activeTag))
        .toEqual('http://example.org/bla');
    });

    it('should not expand a term', () => {
      const activeTag: any = {
        prefixes: {
          dc: 'http://purl.org/dc/terms/',
        },
      };
      return expect(RdfaParser.expandPrefixedTerm('bla', activeTag)).toEqual('bla');
    });
  });

  describe('a default instance', () => {

    let parser;

    beforeEach(() => {
      parser = new RdfaParser({ baseIRI: 'http://example.org/' });
    });

    describe('#createIri', () => {
      it('should create blank nodes', async () => {
        const activeTag: any = {};
        return expect(parser.createIri('_:b1', activeTag, false))
          .toEqualRdfTerm(blankNode('b1'));
      });

      it('should handle prefixed IRIs', async () => {
        const activeTag: any = {
          prefixes: {
            ex: 'http://example.org/',
          },
        };
        return expect(parser.createIri('ex:def', activeTag, false))
          .toEqualRdfTerm(namedNode('http://example.org/def'));
      });

      it('should handle prefixed IRIs with unknown prefixes', async () => {
        const activeTag: any = {
          prefixes: {},
        };
        return expect(parser.createIri('ex:def', activeTag, false))
          .toEqualRdfTerm(namedNode('ex:def'));
      });

      it('should handle relative IRIs', async () => {
        const activeTag: any = {
          prefixes: {},
        };
        return expect(parser.createIri('def', activeTag, false))
          .toEqualRdfTerm(namedNode('http://example.org/def'));
      });

      it('should not handle relative IRIs in vocab mode without active vocab', async () => {
        const activeTag: any = {
          prefixes: {},
        };
        return expect(parser.createIri('def', activeTag, true))
          .toEqualRdfTerm(namedNode('def'));
      });

      it('should handle relative IRIs in vocab mode with active vocab', async () => {
        const activeTag: any = {
          prefixes: {},
          vocab: 'http://vocab.org/',
        };
        return expect(parser.createIri('def', activeTag, true))
          .toEqualRdfTerm(namedNode('http://vocab.org/def'));
      });

      it('should handle prefixed relative IRIs', async () => {
        const activeTag: any = {
          prefixes: {
            abc: 'abc/',
          },
        };
        return expect(parser.createIri('abc:def', activeTag, false))
          .toEqualRdfTerm(namedNode('http://example.org/abc/def'));
      });

      it('should handle explicit blank nodes', async () => {
        const activeTag: any = {};
        return expect(parser.createIri('[_:b]', activeTag, false))
          .toEqual(blankNode('b'));
      });

      it('should handle blank nodes with no label', async () => {
        const activeTag: any = {};
        return expect(parser.createIri('_:', activeTag, false))
          .toEqual(blankNode('b_identity'));
      });

      it('should handle explicit blank nodes with no label', async () => {
        const activeTag: any = {};
        return expect(parser.createIri('[_:]', activeTag, false))
          .toEqual(blankNode('b_identity'));
      });

      it('should do term expansion', async () => {
        const activeTag: any = {
          prefixes: {
            license: 'http://www.w3.org/1999/xhtml/vocab#license',
          },
        };
        return expect(parser.createIri('license', activeTag, true))
          .toEqual(namedNode('http://www.w3.org/1999/xhtml/vocab#license'));
      });

      it('should do case-insensitive term expansion', async () => {
        const activeTag: any = {
          prefixes: {
            license: 'http://www.w3.org/1999/xhtml/vocab#license',
          },
        };
        return expect(parser.createIri('LiCeNSe', activeTag, true))
          .toEqual(namedNode('http://www.w3.org/1999/xhtml/vocab#license'));
      });

      it('should make term expansion give priority to vocab', async () => {
        const activeTag: any = {
          prefixes: {
            license: 'http://www.w3.org/1999/xhtml/vocab#license',
          },
          vocab: 'http://vocab.org/',
        };
        return expect(parser.createIri('license', activeTag, true))
          .toEqual(namedNode('http://vocab.org/license'));
      });
    });

    describe('#createLiteral', () => {
      it('should create string literals', async () => {
        const activeTag: any = {};
        return expect(parser.createLiteral('abc', activeTag))
          .toEqualRdfTerm(literal('abc'));
      });

      it('should create datatyped literals', async () => {
        const activeTag: any = {
          datatype: namedNode('http://example.org/datatype'),
        };
        return expect(parser.createLiteral('abc', activeTag))
          .toEqualRdfTerm(literal('abc', namedNode('http://example.org/datatype')));
      });

      it('should create language literals', async () => {
        const activeTag: any = {
          language: 'en-us',
        };
        return expect(parser.createLiteral('abc', activeTag))
          .toEqualRdfTerm(literal('abc', 'en-us'));
      });

      it('should give preference to datatype literals over language literals', async () => {
        const activeTag: any = {
          datatype: namedNode('http://example.org/datatype'),
          language: 'en-us',
        };
        return expect(parser.createLiteral('abc', activeTag))
          .toEqualRdfTerm(literal('abc', namedNode('http://example.org/datatype')));
      });

      it('should give interpret datetimes without Z', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03-18T00:00:00', activeTag))
          .toEqualRdfTerm(literal('2012-03-18T00:00:00',
            namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should give interpret datetimes with Z', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03-18T00:00:00Z', activeTag))
          .toEqualRdfTerm(literal('2012-03-18T00:00:00Z',
            namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should give interpret datetimes with negative offset', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03-18T00:00:00-10:00', activeTag))
          .toEqualRdfTerm(literal('2012-03-18T00:00:00-10:00',
            namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should give interpret datetimes with positive offset', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03-18T00:00:00+10:00', activeTag))
          .toEqualRdfTerm(literal('2012-03-18T00:00:00+10:00',
            namedNode('http://www.w3.org/2001/XMLSchema#dateTime')));
      });

      it('should give interpret times without Z', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('00:00:00', activeTag))
          .toEqualRdfTerm(literal('00:00:00',
            namedNode('http://www.w3.org/2001/XMLSchema#time')));
      });

      it('should give interpret times with positive offset', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('00:00:00+01:10', activeTag))
          .toEqualRdfTerm(literal('00:00:00+01:10',
            namedNode('http://www.w3.org/2001/XMLSchema#time')));
      });

      it('should give interpret times with negative offset', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('00:00:00-01:10', activeTag))
          .toEqualRdfTerm(literal('00:00:00-01:10',
            namedNode('http://www.w3.org/2001/XMLSchema#time')));
      });

      it('should give interpret times with Z', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('00:00:00Z', activeTag))
          .toEqualRdfTerm(literal('00:00:00Z',
            namedNode('http://www.w3.org/2001/XMLSchema#time')));
      });

      it('should give interpret dates', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03-18', activeTag))
          .toEqualRdfTerm(literal('2012-03-18',
            namedNode('http://www.w3.org/2001/XMLSchema#date')));
      });

      it('should give interpret years', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012', activeTag))
          .toEqualRdfTerm(literal('2012',
            namedNode('http://www.w3.org/2001/XMLSchema#gYear')));
      });

      it('should give interpret years', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03', activeTag))
          .toEqualRdfTerm(literal('2012-03',
            namedNode('http://www.w3.org/2001/XMLSchema#gYearMonth')));
      });

      it('should give not interpret invalid dates (1)', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral(' 2012-03-12', activeTag))
          .toEqualRdfTerm(literal(' 2012-03-12'));
      });

      it('should give not interpret invalid dates (2)', async () => {
        const activeTag: any = {
          interpretObjectAsTime: true,
        };
        return expect(parser.createLiteral('2012-03-12 ', activeTag))
          .toEqualRdfTerm(literal('2012-03-12 '));
      });
    });

    describe('should error', () => {
      // TODO
    });

    describe('should parse', () => {
      it('an empty document', async () => {
        return expect(await parse(parser, ``))
          .toBeRdfIsomorphic([]);
      });

      it('property attributes to predicates', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body>
    <h2 property="http://purl.org/dc/terms/title">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://purl.org/dc/terms/title', '"The Trouble with Bob"'),
          ]);
      });

      it('multi-line strings', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body>
    <h2 property="http://purl.org/dc/terms/title">The
Trouble
with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://purl.org/dc/terms/title', '"The\nTrouble\nwith Bob"'),
          ]);
      });

      it('absolute about attributes to subjects', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body>
    <h2 about="http://example2.org/" property="http://purl.org/dc/terms/title">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example2.org/', 'http://purl.org/dc/terms/title', '"The Trouble with Bob"'),
          ]);
      });

      it('relative about attributes to subjects', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body>
    <h2 about="img.jpg" property="http://purl.org/dc/terms/title">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/img.jpg', 'http://purl.org/dc/terms/title', '"The Trouble with Bob"'),
          ]);
      });

      it('blank node about attributes to subjects', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body>
    <h2 about="_:b1" property="http://purl.org/dc/terms/title">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1', 'http://purl.org/dc/terms/title', '"The Trouble with Bob"'),
          ]);
      });

      it('content attributes to objects', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body>
    <div property="http://purl.org/dc/terms/title" resource="img.jpg"></div>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://purl.org/dc/terms/title', 'http://example.org/img.jpg'),
          ]);
      });

      it('prefixes and expand them', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property="dc:title" resource="img.jpg"></div>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://purl.org/dc/terms/title', 'http://example.org/img.jpg'),
          ]);
      });

      it('property with default prefix and expand them', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property=":title" resource="img.jpg"></div>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://www.w3.org/1999/xhtml/vocab#title', 'http://example.org/img.jpg'),
          ]);
      });

      it('base tags and set the baseIRI', async () => {
        const output = await parse(parser, `<html>
<head>
    <base href="http://base.com/" />
</head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property="dc:title" resource="img.jpg"></div>
</body>
</html>`);
        expect(output).toBeRdfIsomorphic([
          quad('http://base.com/', 'http://purl.org/dc/terms/title', 'http://base.com/img.jpg'),
        ]);
        return expect(parser.baseIRI).toEqualRdfTerm(namedNode('http://base.com/'));
      });

      it('base tags are ignored when features.baseTag is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        const output = await parse(parser, `<html>
<head>
    <base href="http://base.com/" />
</head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property="dc:title" resource="img.jpg"></div>
</body>
</html>`);
        expect(output).toBeRdfIsomorphic([
          quad('http://example.org/', 'http://purl.org/dc/terms/title', 'http://example.org/img.jpg'),
        ]);
        return expect(parser.baseIRI).toEqualRdfTerm(namedNode('http://example.org/'));
      });

      it('base tags with fragment and set the baseIRI', async () => {
        const output = await parse(parser, `<html>
<head>
    <base href="http://base.com/#fragment" />
</head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property="dc:title" resource="img.jpg"></div>
</body>
</html>`);
        expect(output).toBeRdfIsomorphic([
          quad('http://base.com/', 'http://purl.org/dc/terms/title', 'http://base.com/img.jpg'),
        ]);
        return expect(parser.baseIRI).toEqualRdfTerm(namedNode('http://base.com/'));
      });

      it('base tags without href and not set the baseIRI', async () => {
        await parse(parser, `<html>
<head>
    <base />
</head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property="dc:title" resource="img.jpg"></div>
</body>
</html>`);
        return expect(parser.baseIRI).toEqualRdfTerm(namedNode('http://example.org/'));
      });

      it('typeof with about', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="schema: http://schema.org/">
    <h2 about="#myDoc" typeof="schema:Document">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/#myDoc', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Document'),
          ]);
      });

      it('typeofs with about', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="schema: http://schema.org/">
    <h2 about="#myDoc" typeof="schema:Document1 schema:Document2">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/#myDoc', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Document1'),
            quad('http://example.org/#myDoc', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Document2'),
          ]);
      });

      it('typeof with resource', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="schema: http://schema.org/">
    <h2 resource="#myDoc" typeof="schema:Document">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/#myDoc', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Document'),
          ]);
      });

      it('typeof with about and resource', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="schema: http://schema.org/">
    <h2 about="#myDoc1" resource="#myDoc2" typeof="schema:Document">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/#myDoc1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Document'),
          ]);
      });

      it('typeof without about and resource', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="schema: http://schema.org/">
    <h2 typeof="schema:Document">The Trouble with Bob</h2>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Document'),
          ]);
      });

      it('typeof without about and resource and children', async () => {
        return expect(await parse(parser, `<html>
<head></head>
<body prefix="schema: http://schema.org/">
    <div typeof="schema:Person">
        <span property="schema:name">Albert Einstein</span>
        <span property="schema:givenName">Albert</span>
    </div>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://schema.org/Person'),
            quad('_:b1', 'http://schema.org/name', '"Albert Einstein"'),
            quad('_:b1', 'http://schema.org/givenName', '"Albert"'),
          ]);
      });

      it('rel and href as resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rel="http://example.org/p" href="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://example.org/p', 'http://example.org/o'),
          ]);
      });

      it('rel and resource as resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rel="http://example.org/p" resource="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://example.org/p', 'http://example.org/o'),
          ]);
      });

      it('rel (2x) and resource as resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rel="http://example.org/p1 http://example.org/p2" resource="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://example.org/p1', 'http://example.org/o'),
            quad('http://example.org/', 'http://example.org/p2', 'http://example.org/o'),
          ]);
      });

      it('rel and src as resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rel="http://example.org/p" src="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://example.org/p', 'http://example.org/o'),
          ]);
      });

      it('rev and href as reverse resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rev="http://example.org/p" href="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/o', 'http://example.org/p', 'http://example.org/'),
          ]);
      });

      it('rev and resource as reverse resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rev="http://example.org/p" resource="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/o', 'http://example.org/p', 'http://example.org/'),
          ]);
      });

      it('rev and src as reverse resource link', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rev="http://example.org/p" src="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/o', 'http://example.org/p', 'http://example.org/'),
          ]);
      });

      it('rel, rev and src as reverse resource links', async () => {
        return expect(await parse(parser, `<html>
<head>
    <link rel="http://example.org/p1" rev="http://example.org/p2" src="http://example.org/o" />
</head>
<body>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://example.org/p1', 'http://example.org/o'),
            quad('http://example.org/o', 'http://example.org/p2', 'http://example.org/'),
          ]);
      });

      it('resource should be prioritized over href', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body>
    <a property="http://example.org/p" resource="http://example.org/o1" href="http://example.org/o2"></a>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/', 'http://example.org/p', 'http://example.org/o1'),
          ]);
      });

      it('complex combinations of about, rel, rev and href', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p>
			This photo was taken by
			<a about="photo1.jpg" rel="dc:creator" rev="foaf:img"
   				href="http://www.blogger.com/profile/1109404">Mark Birbeck</a>.
		</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/photo1.jpg',
              'http://purl.org/dc/elements/1.1/creator',
              'http://www.blogger.com/profile/1109404'),
            quad('http://www.blogger.com/profile/1109404',
              'http://xmlns.com/foaf/0.1/img',
              'http://example.org/photo1.jpg'),
          ]);
      });

      it('content attributes', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p about="photo1.jpg" property="dc:title" content="Portrait of Mark" />
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/photo1.jpg',
              'http://purl.org/dc/elements/1.1/title',
              '"Portrait of Mark"'),
          ]);
      });

      it('content that overrides text content', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p about="photo1.jpg" property="dc:title" content="Portrait of Mark">Mark Birbeck</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/photo1.jpg',
              'http://purl.org/dc/elements/1.1/title',
              '"Portrait of Mark"'),
          ]);
      });

      it('datatype to set the object literal datatype', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="xsd:integer">3</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"3"^^http://www.w3.org/2001/XMLSchema#integer'),
          ]);
      });

      it('datatype to set the object literal datatype for content attributes', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="xsd:integer" content="3" />
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"3"^^http://www.w3.org/2001/XMLSchema#integer'),
          ]);
      });

      it('datatype to set the object literal datatype with strings in a nested tag', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="xsd:string"><b>Mark Birbeck</b></p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"Mark Birbeck"'),
          ]);
      });

      it('datatype to set the object literal datatype with strings in nested tags', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="xsd:string"><b>M</b>ark <b>B</b>irbeck</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"Mark Birbeck"'),
          ]);
      });

      it('rdf:XMLLiteral datatype to preserve all nested tags', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#
rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="rdf:XMLLiteral"><b some="attribute">M</b>ark <b>B</b>irbeck</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"<b some="attribute">M</b>ark <b>B</b>irbeck"^^http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral'),
          ]);
      });

      it('rdf:HTML datatype to preserve all nested tags when features.htmlDatatype is enabled', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#
rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="rdf:HTML"><b some="attribute">M</b>ark <b>B</b>irbeck</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"<b some="attribute">M</b>ark <b>B</b>irbeck"^^http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML'),
          ]);
      });

      it('rdf:HTML datatype to not preserve all nested tags when features.htmlDatatype is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#
rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" datatype="rdf:HTML"><b some="attribute">M</b>ark <b>B</b>irbeck</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"Mark Birbeck"^^http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML'),
          ]);
      });

      it('lang to set the object literal language', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" lang="en">abc</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"@en'),
          ]);
      });

      it('lang should be ignored when features.langAttribute is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {}});
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" lang="en">abc</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"'),
          ]);
      });

      it('xml:lang to set the object literal language', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" xml:lang="en">abc</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"@en'),
          ]);
      });

      it('lang to set the object literal language for content attributes', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" lang="en" content="abc" />
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"@en'),
          ]);
      });

      it('xml:lang to set the object literal language for content attributes', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" xml:lang="en" content="abc" />
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"@en'),
          ]);
      });

      it('xml:lang is inherited', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#" xml:lang="en">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" content="abc" />
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"@en'),
          ]);
      });

      it('xml:lang can be unset', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#" xml:lang="en">
	<head>
		<title>Test 0006</title>
	</head>
	<body>
		<p property="dc:title" content="abc" xml:lang="" />
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"abc"'),
          ]);
      });

      it('time tags with dates', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title">2012-03-18</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"2012-03-18"^^http://www.w3.org/2001/XMLSchema#date'),
          ]);
      });

      it('time tags with dates when features.timeTag is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title">2012-03-18</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"2012-03-18"'),
          ]);
      });

      it('time tags with times', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title">00:00:00Z</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"00:00:00Z"^^http://www.w3.org/2001/XMLSchema#time'),
          ]);
      });

      it('time tags with dateTimes', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title">2012-03-18T00:00:00Z</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"2012-03-18T00:00:00Z"^^http://www.w3.org/2001/XMLSchema#dateTime'),
          ]);
      });

      it('time tags with dates in datetime', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title" datetime="2012-03-18">Today</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"2012-03-18"^^http://www.w3.org/2001/XMLSchema#date'),
          ]);
      });

      it('time tags with dates in datetime when features.datetimeAttribute is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title" datetime="2012-03-18">Today</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"Today"'),
          ]);
      });

      it('time tags with times in datetime', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title" datetime="00:00:00Z">Today</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"00:00:00Z"^^http://www.w3.org/2001/XMLSchema#time'),
          ]);
      });

      it('time tags with dateTimes in datetime', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/ xsd: http://www.w3.org/2001/XMLSchema#">
	<head>
	</head>
	<body>
	  <time property="dc:title" datetime="2012-03-18T00:00:00Z">Today</time>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"2012-03-18T00:00:00Z"^^http://www.w3.org/2001/XMLSchema#dateTime'),
          ]);
      });

      it('vocab emits an rdfa:usesVocabulary triple', async () => {
        return expect(await parse(parser, `<html vocab="http://xmlns.com/foaf/0.1/">
	<head>
	</head>
	<body>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://xmlns.com/foaf/0.1/'),
          ]);
      });

      it('vocab sets the active vocabulary', async () => {
        return expect(await parse(parser, `<html vocab="http://xmlns.com/foaf/0.1/">
	<head>
	</head>
	<body>
	  <p property="name">Name</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://xmlns.com/foaf/0.1/'),
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/name',
              '"Name"'),
          ]);
      });

      it('vocab override the active vocabulary', async () => {
        return expect(await parse(parser, `<html vocab="http://example.org/">
	<head>
	</head>
	<body vocab="http://xmlns.com/foaf/0.1/">
	  <p property="name">Name</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://example.org/'),
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://xmlns.com/foaf/0.1/'),
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/name',
              '"Name"'),
          ]);
      });

      it('with vocab set in parser constructor', async () => {
        parser = new RdfaParser({
          baseIRI: 'http://example.org/',
          vocab: 'http://xmlns.com/foaf/0.1/',
        });
        return expect(await parse(parser, `<html>
	<head>
	</head>
	<body>
	  <p property="name">Name</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/name',
              '"Name"'),
          ]);
      });

      it('with language set in parser constructor', async () => {
        parser = new RdfaParser({
          baseIRI: 'http://example.org/',
          language: 'nl-be',
        });
        return expect(await parse(parser, `<html>
	<head>
	</head>
	<body>
	  <p property="http://xmlns.com/foaf/0.1/name">Name</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/name',
              '"Name"@nl-be'),
          ]);
      });

      it('multiple properties', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
	</head>
	<body>
	  <p property="dc:title foaf:title">Title</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"Title"'),
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/title',
              '"Title"'),
          ]);
      });

      it('multiple properties separated by newlines and spaces', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
	</head>
	<body>
	  <p property="dc:title
	  foaf:title">Title</p>
	</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/title',
              '"Title"'),
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/title',
              '"Title"'),
          ]);
      });

      it('chained rel and property', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
	</head>
  <body>
  	<p>
    	This paper was written by
    	<span rel="dc:creator">
      		<span property="foaf:name">Ben Adida</span>.
    	</span>
	</p>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/creator',
              '_:b'),
            quad('_:b',
              'http://xmlns.com/foaf/0.1/name',
              '"Ben Adida"'),
          ]);
      });

      it('multiple chained rel and property', async () => {
        return expect(await parse(parser, `<html prefix="dc: http://purl.org/dc/elements/1.1/
foaf: http://xmlns.com/foaf/0.1/">
	<head>
	</head>
  <body>
  	<p>
    	This paper was written by
    	<span rel="dc:creator dc:creator2">
      		<span property="foaf:name">Ben Adida</span>.
    	</span>
	</p>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/creator',
              '_:b'),
            quad('http://example.org/',
              'http://purl.org/dc/elements/1.1/creator2',
              '_:b'),
            quad('_:b',
              'http://xmlns.com/foaf/0.1/name',
              '"Ben Adida"'),
          ]);
      });

      it('and ignore rel if there is a property and rel is a non-CURIE and non-URI', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body>
  <p vocab="http://schema.org/">
    The homepage of <a href="http://homepage.org/" property="homepage" rel="nofollow">Some Body</a>.
  </p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('http://example.org/',
              'http://schema.org/homepage',
              'http://homepage.org/'),
          ]);
      });

      it('and not ignore rel if there is a property and rel is a non-CURIE and non-URI if ' +
        'features.onlyAllowUriRelRevIfProperty is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        return expect(await parse(parser, `<html>
<head>
</head>
<body>
  <p vocab="http://schema.org/">
    The homepage of <a href="http://homepage.org/" property="homepage" rel="follow">Some Body</a>.
  </p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('http://example.org/',
              'http://schema.org/homepage',
              'http://homepage.org/'),
            quad('http://example.org/',
              'http://schema.org/follow',
              'http://homepage.org/'),
          ]);
      });

      it('and ignore rev if there is a property and rel is a non-CURIE and non-URI', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body>
  <p vocab="http://schema.org/">
    The homepage of <a href="http://homepage.org/" property="homepage" rev="nofollow">Some Body</a>.
  </p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('http://example.org/',
              'http://schema.org/homepage',
              'http://homepage.org/'),
          ]);
      });

      it('and not ignore rel if there is a property and rel is a CURIE', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body>
  <p vocab="http://schema.org/">
    The homepage of <a href="http://homepage.org/" property="homepage" rel="schema:follow">Some Body</a>.
  </p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('http://example.org/',
              'http://schema.org/follow',
              'http://homepage.org/'),
            quad('http://example.org/',
              'http://schema.org/homepage',
              'http://homepage.org/'),
          ]);
      });

      it('and not ignore rel if there is a property and rel is a URI', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body>
  <p vocab="http://schema.org/">
    The homepage of <a href="http://homepage.org/" property="homepage" rel="http://example.org/follow">Some Body</a>.
  </p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('http://example.org/',
              'http://example.org/follow',
              'http://homepage.org/'),
            quad('http://example.org/',
              'http://schema.org/homepage',
              'http://homepage.org/'),
          ]);
      });

      it('unsetting vocab', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body vocab="http://schema.org/">
  <p vocab="">
    The homepage of <a property="homepage">Some Body</a>.
  </p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
          ]);
      });

      it('rel with one typeof child should have their blank node be connected', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p typeof="foaf:Person">Dan Brickley again:-)</p>
	</div>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Person'),
          ]);
      });

      it('complex blank node nesting', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p property="foaf:name">Dan Brickley</p>
	    <p typeof="foaf:Person">Dan Brickley again:-)</p>
	</div>
	<p property="foaf:name">Dan Brickley?</p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b2'),
            quad('_:b1',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley"'),
            quad('_:b2',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Person'),
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley?"'),
          ]);
      });

      it('complex explicit blank node nesting', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p about="[_:]" property="foaf:name">Dan Brickley</p>
	    <p about="[_:]" typeof="foaf:Person">Dan Brickley again:-)</p>
	</div>
	<p about="[_:]" property="foaf:name">Dan Brickley?</p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('_:b1',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley"'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Person'),
            quad('_:b1',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley?"'),
          ]);
      });

      it('complex partial explicit blank node nesting', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p property="foaf:name">Dan Brickley</p>
	    <p about="[_:]" typeof="foaf:Person">Dan Brickley again:-)</p>
	</div>
	<p about="[_:]" property="foaf:name">Dan Brickley?</p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b2'),
            quad('_:b2',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley"'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Person'),
            quad('_:b1',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley?"'),
          ]);
      });

      it('complex disconnected explicit blank node nesting', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p property="foaf:name">Dan Brickley</p>
	    <p typeof="foaf:Person">Dan Brickley again:-)</p>
	</div>
	<p about="[_:]" property="foaf:name">Dan Brickley?</p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b2'),
            quad('_:b2',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley"'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Person'),
            quad('_:b3',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley?"'),
          ]);
      });

      it('complex connected explicit blank node nesting', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p property="foaf:name">Dan Brickley</p>
	    <p property="foaf:name">Dan Brickley again:-)</p>
	</div>
	<p about="[_:]" property="foaf:name">Dan Brickley?</p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('_:b1',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley"'),
            quad('_:b1',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley again:-)"'),
            quad('_:b3',
              'http://xmlns.com/foaf/0.1/name',
              '"Dan Brickley?"'),
          ]);
      });

      it('blank node nesting with typeof', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div about="http://www.example.org/#somebody" rel="foaf:knows">
	    <p typeof="foaf:Person">Dan Brickley again:-)</p>
	</div>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://www.example.org/#somebody',
              'http://xmlns.com/foaf/0.1/knows',
              '_:b1'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Person'),
          ]);
      });

      it('rdfa:Pattern without rdfa:copy', async () => {
        expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <span property="schema:name">Muse</span>
    </div>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/#muse',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/ns/rdfa#Pattern'),
            quad('http://example.org/#muse',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('http://example.org/#muse',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('http://example.org/#muse',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('http://example.org/#muse',
              'http://schema.org/name',
              '"Muse"'),
          ]);

        delete parser.rdfaPatterns['#muse'].text;
        delete parser.rdfaPatterns['#muse'].parentTag;
        expect(parser.rdfaPatterns).toEqual({
          '#muse': {
            attributes: {},
            children: [
              {
                attributes: {
                  href: 'Muse1.jpg',
                  property: 'schema:image',
                },
                children: [],
                name: 'link',
                referenced: false,
                rootPattern: false,
                text: [],
              },
              {
                attributes: {
                  href: 'Muse2.jpg',
                  property: 'schema:image',
                },
                children: [],
                name: 'link',
                referenced: false,
                rootPattern: false,
                text: [],
              },
              {
                attributes: {
                  href: 'Muse3.jpg',
                  property: 'schema:image',
                },
                children: [],
                name: 'link',
                referenced: false,
                rootPattern: false,
                text: [],
              },
              {
                attributes: {
                  property: 'schema:name',
                },
                children: [],
                name: 'span',
                referenced: false,
                rootPattern: false,
                text: [ 'Muse' ],
              },
            ],
            name: 'div',
            referenced: false,
            rootPattern: true,
          },
        });
      });

      it('rdfa:Pattern with one rdfa:copy', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <span property="schema:name">Muse</span>
    </div>

    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b1',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),
          ]);
      });

      it('unreferenced rdfa:copy', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://www.w3.org/ns/rdfa#copy',
              'http://example.org/#muse'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),
          ]);
      });

      it('rdfa:Pattern with two rdfa:copy\'s', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <span property="schema:name">Muse</span>
    </div>

    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>

    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united2">United Center, Chicago, Illinois 2</a>
    </p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b1',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),

            quad('_:b2',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b2',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b2',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b2',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b2',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b2',
              'http://schema.org/location',
              'http://example.org/#united2'),
          ]);
      });

      it('out-of-order rdfa:Pattern with one rdfa:copy', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>

	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <span property="schema:name">Muse</span>
    </div>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b1',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),
          ]);
      });

      it('in-order nested rdfa:Pattern and rdfa:copy', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <div resource="#name" typeof="rdfa:Pattern">
	    <span property="schema:name">Muse</span>
	  </div>
	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <link property="rdfa:copy" href="#name"/>
    </div>

    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b1',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),
          ]);
      });

      it('mixed order nested rdfa:Pattern and rdfa:copy', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <link property="rdfa:copy" href="#name"/>
    </div>
    <div resource="#name" typeof="rdfa:Pattern">
	    <span property="schema:name">Muse</span>
	  </div>

    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b1',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),
          ]);
      });

      it('and ignore rdfa:copy to self-referencing rdfa:Pattern', async () => {
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
  </head>
  <body>
	<div>
	  <div resource="#muse" typeof="rdfa:Pattern">
      <link property="schema:image" href="Muse1.jpg"/>
      <link property="schema:image" href="Muse2.jpg"/>
      <link property="schema:image" href="Muse3.jpg"/>
      <span property="schema:name">Muse</span>
      <link property="rdfa:copy" href="#muse"/>
    </div>

    <p typeof="schema:MusicEvent">
      <link property="rdfa:copy" href="#muse"/>
      <a property="schema:location" href="#united">United Center, Chicago, Illinois</a>
    </p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/MusicEvent'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse1.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse2.jpg'),
            quad('_:b1',
              'http://schema.org/image',
              'http://example.org/Muse3.jpg'),
            quad('_:b1',
              'http://schema.org/name',
              '"Muse"'),
            quad('_:b1',
              'http://schema.org/location',
              'http://example.org/#united'),
          ]);
      });

      it('rdfa:copy via resource attribute', async () => {
        return expect(await parse(parser, `<html>
<head>
</head>
<body vocab="http://schema.org/">
  <div typeof="Person">
    <link property="rdfa:copy" resource="_:a"/>
  </div>
  <p resource="_:a" typeof="rdfa:Pattern">Name: <span property="name">Amanda</span></p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Person'),
            quad('_:b1',
              'http://schema.org/name',
              '"Amanda"'),
          ]);
      });

      it('rdfa:copy and rdfa:Pattern are ignored when features.copyRdfaPatterns is disabled', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        return expect(await parse(parser, `<html>
<head>
</head>
<body vocab="http://schema.org/">
  <div typeof="Person">
    <link property="rdfa:copy" resource="_:a"/>
  </div>
  <p resource="_:a" typeof="rdfa:Pattern">Name: <span property="name">Amanda</span></p>
</body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/ns/rdfa#usesVocabulary',
              'http://schema.org/'),
            quad('_:b1',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://schema.org/Person'),
            quad('_:b1',
              'http://www.w3.org/ns/rdfa#copy',
              '_:b2'),
            quad('_:b2',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://www.w3.org/ns/rdfa#Pattern'),
            quad('_:b2',
              'http://schema.org/name',
              '"Amanda"'),
          ]);
      });

      it('typeof with a single property', async () => {
        parser = new RdfaParser({ baseIRI: 'http://example.org/', features: {} });
        return expect(await parse(parser, `<html prefix="foaf: http://xmlns.com/foaf/0.1/">
  <head>
		<title>Test 0051</title>
  </head>
  <body>
  	<p about="" typeof="foaf:Document" property="foaf:topic">John Doe</p>
  </body>
</html>`))
          .toBeRdfIsomorphic([
            quad('http://example.org/',
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
              'http://xmlns.com/foaf/0.1/Document'),
            quad('http://example.org/',
              'http://xmlns.com/foaf/0.1/topic',
              '"John Doe"'),
          ]);
      });

    });

  });

  describe('#import', () => {
    let parser;

    beforeAll(() => {
      parser = new RdfaParser();
    });

    // TODO
    /*it('should parse a stream', async () => {
      const stream = streamifyString(`<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="http://example.org/resource/"
                   rdf:type="http://example.org/class/"/>
</rdf:RDF>`);
      return expect(await arrayifyStream(parser.import(stream))).toBeRdfIsomorphic([
        quad('http://example.org/resource/', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          'http://example.org/class/'),
      ]);
    });

    it('should parse another stream', async () => {
      const stream = streamifyString(`<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:eg="http://example.org/"
         xml:base="http://example.org/triples">
  <rdf:Description>
    <eg:prop1 eg:prop2="val" rdf:ID="reify"></eg:prop1>
  </rdf:Description>
</rdf:RDF>`);
      return expect(await arrayifyStream(parser.import(stream))).toBeRdfIsomorphic([
        quad('_:b0', 'http://example.org/prop1', '_:b1'),
        quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement'),
        quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject', '_:b0'),
        quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#predicate',
          'http://example.org/prop1'),
        quad('http://example.org/triples#reify', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object', '_:b1'),
        quad('_:b1', 'http://example.org/prop2', '"val"'),
      ]);
    });*/

    it('should forward error events', async () => {
      const stream = new PassThrough();
      stream._read = () => stream.emit('error', new Error('my error'));
      return expect(arrayifyStream(parser.import(stream))).rejects.toThrow(new Error('my error'));
    });
  });
});

function parse(parser: RdfaParser, input: string): Promise<RDF.Quad[]> {
  return arrayifyStream(streamifyString(input).pipe(parser));
}
