import {DomHandler} from "domhandler";
import EventEmitter = NodeJS.EventEmitter;
import {Parser as HtmlParser} from "htmlparser2";
import * as RDF from "rdf-js";
import {resolve} from "relative-to-absolute-iri";
import {PassThrough, Transform, TransformCallback} from "stream";

/**
 * A stream transformer that parses RDFa (text) streams to an {@link RDF.Stream}.
 */
export class RdfaParser extends Transform {

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

  protected static readonly PREDICATE_ATTRIBUTES: string[] = [
    'property',
    'rel',
    'rev',
    'typeof',
  ];
  protected static readonly OBJECT_ATTRIBUTES: string[] = [
    'resource',
    'href',
    'content',
    'src',
    'typeof',
  ];

  private readonly options: IRdfaParserOptions;
  private readonly dataFactory: RDF.DataFactory;
  private readonly baseIRI: string;
  private readonly defaultGraph?: RDF.Term;
  private readonly parser: HtmlParser;

  private readonly activeTagStack: IActiveTag[] = [];

  constructor(options?: IRdfaParserOptions) {
    super({ objectMode: true });
    options = options || {};
    this.options = options;

    this.dataFactory = options.dataFactory || require('@rdfjs/data-model');
    this.baseIRI = options.baseIRI || '';
    this.defaultGraph = options.defaultGraph || this.dataFactory.defaultGraph();

    this.parser = this.initializeParser();

    this.activeTagStack.push({
      baseIRI: this.baseIRI,
      subject: this.dataFactory.namedNode(this.baseIRI),
    });
  }

  /**
   * Parses the given text stream into a quad stream.
   * @param {NodeJS.EventEmitter} stream A text stream.
   * @return {NodeJS.EventEmitter} A quad stream.
   */
  public import(stream: EventEmitter): EventEmitter {
    const output = new PassThrough({ objectMode: true });
    stream.on('error', (error) => parsed.emit('error', error));
    stream.on('data', (data) => output.write(data));
    stream.on('end', () => output.emit('end'));
    const parsed = output.pipe(new RdfaParser(this.options));
    return parsed;
  }

  public _transform(chunk: any, encoding: string, callback: TransformCallback): void {
    this.parser.write(chunk);
    callback();
  }

  protected onTagOpen(name: string, attributes: {[s: string]: string}) {
    // Determine the parent tag
    const parentTag: IActiveTag = this.activeTagStack[this.activeTagStack.length - 1];

    // Create a new active tag
    const activeTag: IActiveTag = {};
    if (parentTag) {
      // Inherit language scope and baseIRI from parent
      activeTag.language = parentTag.language;
      activeTag.baseIRI = parentTag.baseIRI;
      activeTag.subject = parentTag.subject;
    } else {
      activeTag.baseIRI = this.baseIRI;
      activeTag.subject = parentTag.subject;
    }
    this.activeTagStack.push(activeTag);

    // Set subject on about attribute
    if (attributes.about) {
      activeTag.subject = this.dataFactory.namedNode(resolve(attributes.about, activeTag.baseIRI));
    }

    // Set predicate
    for (const attributeName of RdfaParser.PREDICATE_ATTRIBUTES) {
      if (attributes[attributeName]) {
        activeTag.predicate = this.dataFactory.namedNode(attributes[attributeName]);
      }
    }

    // Emit triples for all objects
    if (activeTag.predicate) {
      for (const attributeName of RdfaParser.OBJECT_ATTRIBUTES) {
        if (attributes[attributeName]) {
          const object = this.dataFactory.namedNode(resolve(attributes[attributeName], activeTag.baseIRI));
          this.emitTriple(activeTag.subject, activeTag.predicate, object);
        }
      }
    }
  }

  protected onText(data: string) {
    // Save the text inside the active tag
    const activeTag: IActiveTag = this.activeTagStack[this.activeTagStack.length - 1];
    if (!activeTag.text) {
      activeTag.text = [];
    }
    activeTag.text.push(data);
  }

  protected onTagClose() {
    // Get the active tag
    const activeTag: IActiveTag = this.activeTagStack[this.activeTagStack.length - 1];

    // Emit all triples that were determined in the active tag
    if (activeTag.predicate && activeTag.text) {
      this.emitTriple(
        activeTag.subject,
        activeTag.predicate,
        this.dataFactory.literal(activeTag.text.join('')),
      );
    }

    // Remove the active tag from the stack
    this.activeTagStack.pop();
  }

  /**
   * Emit the given triple to the stream.
   * @param {Term} subject A subject term.
   * @param {Term} predicate A predicate term.
   * @param {Term} object An object term.
   */
  protected emitTriple(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term) {
    this.push(this.dataFactory.quad(subject, predicate, object, this.defaultGraph));
  }

  protected initializeParser(): HtmlParser {
    return new HtmlParser(
      <DomHandler> <any> {
        onclosetag: () => this.onTagClose(),
        onend: () => this.push(null),
        onerror: (error: Error) => this.emit('error', error),
        onopentag: (name: string, attributes: {[s: string]: string}) => this.onTagOpen(name, attributes),
        ontext: (data: string) => this.onText(data),
      },
      {
        decodeEntities: true,
        recognizeSelfClosing: true,
      });
  }

}

export interface IActiveTag {
  subject?: RDF.Term;
  predicate?: RDF.Term;
  text?: string[];
  baseIRI?: string;
  language?: string;
}

export interface IRdfaParserOptions {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
  defaultGraph?: RDF.Term;
}
