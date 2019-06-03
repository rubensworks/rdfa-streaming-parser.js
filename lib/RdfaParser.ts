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

  protected static readonly PREFIX_REGEX: RegExp = / *([^ :]*)*: *([^ ]*)* */g;
  protected static readonly PREDICATE_ATTRIBUTES: string[] = [
    'property',
    'rel',
    'rev',
  ];

  private readonly options: IRdfaParserOptions;
  private readonly dataFactory: RDF.DataFactory;
  private readonly defaultGraph?: RDF.Term;
  private readonly parser: HtmlParser;

  private readonly activeTagStack: IActiveTag[] = [];

  private baseIRI: string;

  constructor(options?: IRdfaParserOptions) {
    super({ objectMode: true });
    options = options || {};
    this.options = options;

    this.dataFactory = options.dataFactory || require('@rdfjs/data-model');
    this.baseIRI = options.baseIRI || '';
    this.defaultGraph = options.defaultGraph || this.dataFactory.defaultGraph();

    this.parser = this.initializeParser(options.strict);

    this.activeTagStack.push({
      name: '',
      prefixes: {},
    });
  }

  /**
   * Retrieve the prefixes of the current tag's attributes.
   * @param {{[p: string]: string}} attributes A tag's attributes.
   * @param {{[p: string]: string}} parentPrefixes The prefixes from the parent tag.
   * @return {{[p: string]: string}} The new prefixes.
   */
  public static parsePrefixes(attributes: {[s: string]: string},
                              parentPrefixes: {[prefix: string]: string}): {[prefix: string]: string} {
    if (attributes.prefix) {
      const prefixes: {[prefix: string]: string} = { ...parentPrefixes };
      let prefixMatch;
      // tslint:disable-next-line:no-conditional-assignment
      while (prefixMatch = RdfaParser.PREFIX_REGEX.exec(attributes.prefix)) {
        prefixes[prefixMatch[1]] = prefixMatch[2];
      }

      return prefixes;
    } else {
      return parentPrefixes;
    }
  }

  /**
   * Expand the given term value based on the given prefixes.
   * @param {string} term A term value.
   * @param {{[p: string]: string}[]} prefixes The available prefixes.
   * @return {string} An expanded URL, or the term as-is.
   */
  public static expandPrefixedTerm(term: string, activeTag: IActiveTag): string {
    // Check if the term is prefixed
    const colonIndex: number = term.indexOf(':');
    let prefix: string;
    let local: string;
    if (colonIndex >= 0) {
      prefix = term.substr(0, colonIndex);
      local = term.substr(colonIndex + 1);
    }

    // Try to expand the prefix
    if (prefix) {
      const prefixElement = activeTag.prefixes[prefix];
      if (prefixElement) {
        return prefixElement + local;
      }
    }

    return term;
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

    // Create a new active tag and inherit language scope and baseIRI from parent
    const activeTag: IActiveTag = {
      ...parentTag,
      name,
      prefixes: RdfaParser.parsePrefixes(attributes, parentTag.prefixes),
      text: null,
    };
    this.activeTagStack.push(activeTag);

    // <base> tags override the baseIRI
    if (name === 'base' && attributes.href) {
      this.baseIRI = attributes.href;
    }

    // Set subject on about attribute
    let linkToParent: boolean = false;
    let newSubject: boolean = false;
    if (attributes.about) {
      newSubject = true;
      activeTag.subject = this.createIri(attributes.about, activeTag, false);
    }
    if (!activeTag.subject && attributes.resource) {
      newSubject = true;
      linkToParent = true;
      activeTag.subject = this.createIri(attributes.resource, activeTag, false);
    }

    // Set predicate
    for (const attributeName of RdfaParser.PREDICATE_ATTRIBUTES) {
      if (attributes[attributeName]) {
        activeTag.predicate = this.createIri(attributes[attributeName], activeTag, true);
      }
    }

    // Typeof attribute sets rdf:type
    if (attributes.typeof) {
      // Typeof without about or resource attribute introduces a blank node subject
      if (!newSubject) {
        activeTag.subject = this.dataFactory.blankNode();
      }

      // Emit the triple
      this.emitTriple(
        this.getSubject(activeTag),
        this.dataFactory.namedNode(RdfaParser.RDF + 'type'),
        this.createIri(attributes.typeof, activeTag, true),
      );
    }

    // Emit triples for all objects
    if (linkToParent && activeTag.predicate && newSubject) {
      this.emitTriple(this.getSubject(parentTag), activeTag.predicate, this.getSubject(activeTag));
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
        this.getSubject(activeTag),
        activeTag.predicate,
        this.dataFactory.literal(activeTag.text.join('')),
      );
    }

    // Remove the active tag from the stack
    this.activeTagStack.pop();
  }

  /**
   * Get or create a subject node.
   * @param {IActiveTag} activeTag The active tag.
   * @return {NamedNode} An RDF named node term.
   */
  protected getSubject(activeTag: IActiveTag): RDF.Term {
    return activeTag.subject || this.dataFactory.namedNode(this.getBaseIri(activeTag));
  }

  /**
   * Get the active base IRI.
   * @param {IActiveTag} activeTag The active tag.
   * @return {string} A base IRI.
   */
  protected getBaseIri(activeTag: IActiveTag): string {
    return activeTag.baseIRI || this.baseIRI;
  }

  /**
   * Create a named node for the given term.
   * This will take care of prefix detection.
   * @param {string} term A term string.
   * @param {IActiveTag} activeTag The current active tag.
   * @param {boolean} vocab If creating an IRI in vocab-mode (based on vocab IRI),
   *                        or in base-mode (based on base IRI).
   * @return {Term} An RDF term.
   */
  protected createIri(term: string, activeTag: IActiveTag, vocab: boolean): RDF.Term {
    // Handle blank nodes
    if (term.startsWith('_:')) {
      return this.dataFactory.blankNode(term.substr(2));
    }

    // Handle prefixed IRIs
    let iri: string = RdfaParser.expandPrefixedTerm(term, activeTag);
    if (!vocab) {
      iri = resolve(iri, this.getBaseIri(activeTag));
    }
    return this.dataFactory.namedNode(iri);
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

  protected initializeParser(strict: boolean): HtmlParser {
    return new HtmlParser(
      <DomHandler> <any> {
        onclosetag: () => this.onTagClose(),
        onerror: (error: Error) => this.emit('error', error),
        onopentag: (name: string, attributes: {[s: string]: string}) => this.onTagOpen(name, attributes),
        ontext: (data: string) => this.onText(data),
      },
      {
        decodeEntities: true,
        recognizeSelfClosing: true,
        xmlMode: strict,
      });
  }

}

export interface IActiveTag {
  name: string;
  prefixes: {[prefix: string]: string};
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
  strict?: boolean;
}
