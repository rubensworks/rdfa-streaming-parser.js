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

  describe('a default instance', () => {

    let parser;

    beforeEach(() => {
      parser = new RdfaParser({ baseIRI: 'http://example.org/' });
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
