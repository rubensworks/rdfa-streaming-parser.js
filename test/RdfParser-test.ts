import {blankNode, namedNode} from "@rdfjs/data-model";
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
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with empty args', () => {
    const instance = new RdfaParser({});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with a custom data factory', () => {
    const dataFactory: any = { defaultGraph: () => 'abc', namedNode: () => 'abc' };
    const instance = new RdfaParser({dataFactory});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(dataFactory);
    expect((<any> instance).baseIRI).toBe('');
    expect((<any> instance).defaultGraph).toBe('abc');
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with a custom base IRI', () => {
    const instance = new RdfaParser({baseIRI: 'myBaseIRI'});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqual('myBaseIRI');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with a custom default graph', () => {
    const defaultGraph = DataFactory.namedNode('abc');
    const instance = new RdfaParser({defaultGraph});
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqual('');
    expect((<any> instance).defaultGraph).toBe(defaultGraph);
    expect((<any> instance).options.strict).toBeFalsy();
  });

  it('should be constructable with args with strict', () => {
    const instance = new RdfaParser({ strict: true });
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(DataFactory);
    expect((<any> instance).baseIRI).toEqual('');
    expect((<any> instance).defaultGraph).toBe(DataFactory.defaultGraph());
    expect((<any> instance).options.strict).toEqual(true);
  });

  it('should be constructable with args with a custom data factory, base IRI, strict and default graph', () => {
    const dataFactory: any = { defaultGraph: () => 'abc', namedNode: () => 'abc' };
    const defaultGraph = DataFactory.namedNode('abc');
    const instance = new RdfaParser({ dataFactory, baseIRI: 'myBaseIRI', defaultGraph, strict: true });
    expect(instance).toBeInstanceOf(RdfaParser);
    expect((<any> instance).dataFactory).toBe(dataFactory);
    expect((<any> instance).baseIRI).toEqual('myBaseIRI');
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
        const activeTag: any = {};
        return expect(parser.createIri('def', activeTag, false))
          .toEqualRdfTerm(namedNode('http://example.org/def'));
      });

      it('should not handle relative IRIs in vocab mode', async () => {
        const activeTag: any = {};
        return expect(parser.createIri('def', activeTag, true))
          .toEqualRdfTerm(namedNode('def'));
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

      it('base tags and set the baseIRI', async () => {
        await parse(parser, `<html>
<head>
    <base href="http://base.com/" />
</head>
<body prefix="dc: http://purl.org/dc/terms/ schema: http://schema.org/">
    <div property="dc:title" resource="img.jpg"></div>
</body>
</html>`);
        return expect(parser.baseIRI).toEqual('http://base.com/');
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
        return expect(parser.baseIRI).toEqual('http://example.org/');
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
