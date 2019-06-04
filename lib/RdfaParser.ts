import {DomHandler} from "domhandler";
import EventEmitter = NodeJS.EventEmitter;
import {Parser as HtmlParser} from "htmlparser2";
import * as RDF from "rdf-js";
import {resolve} from "relative-to-absolute-iri";
import {PassThrough, Transform, TransformCallback} from "stream";
import * as INITIAL_CONTEXT from "./initial-context.json";

/**
 * A stream transformer that parses RDFa (text) streams to an {@link RDF.Stream}.
 */
export class RdfaParser extends Transform {

  public static readonly RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly XSD = 'http://www.w3.org/2001/XMLSchema#';
  public static readonly RDFA = 'http://www.w3.org/ns/rdfa#';

  protected static readonly PREFIX_REGEX: RegExp = /[ \n\t]*([^ :\n\t]*)*:[ \n\t]*([^ \n\t]*)*[ \n\t]*/g;
  protected static readonly TIME_REGEXES: { regex: RegExp, type: string }[] = [
    {
      regex: /^[0-9]+-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]((Z?)|([\+-][0-9][0-9]:[0-9][0-9]))$/,
      type: 'dateTime',
    },
    { regex: /^[0-9]+-[0-9][0-9]-[0-9][0-9]$/, type: 'date' },
    { regex: /^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]((Z?)|([\+-][0-9][0-9]:[0-9][0-9]))$/, type: 'time' },
    { regex: /^[0-9]+-[0-9][0-9]$/, type: 'gYearMonth' },
    { regex: /^[0-9]+$/, type: 'gYear' },
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
      prefixes: INITIAL_CONTEXT['@context'],
      vocab: options.vocab,
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

    // Try to expand the term
    const expandedTerm = activeTag.prefixes[term];
    if (expandedTerm) {
      return expandedTerm;
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
      datatype: null,
      interpretObjectAsTime: false,
      name,
      predicates: null,
      prefixes: RdfaParser.parsePrefixes(attributes, parentTag.prefixes),
      text: null,
    };
    this.activeTagStack.push(activeTag);

    // Save the tag contents if needed
    if (activeTag.collectChildTags) {
      const attributesSerialized = Object.keys(attributes).map((key) => `${key}="${attributes[key]}"`).join(' ');
      activeTag.text = [`<${name}${attributesSerialized ? ' ' + attributesSerialized : ''}>`];
    }

    // <base> tags override the baseIRI
    if (name === 'base' && attributes.href) {
      this.baseIRI = attributes.href;
    }

    // Vocab sets the active vocabulary
    if ('vocab' in attributes) {
      activeTag.vocab = attributes.vocab;
      this.emitTriple(
        this.dataFactory.namedNode(this.baseIRI),
        this.dataFactory.namedNode(RdfaParser.RDFA + 'usesVocabulary'),
        this.dataFactory.namedNode(activeTag.vocab),
      );
    }

    // Set subject on about attribute
    let newSubject: boolean = false;
    let object: RDF.Term;
    if (attributes.about) {
      newSubject = true;
      activeTag.subject = this.createIri(attributes.about, activeTag, false);
    }

    // Set the object on resource attribute (will become subject of child node)
    if (!activeTag.subject && attributes.resource) {
      newSubject = true;
      object = this.createIri(attributes.resource, activeTag, false);
    }

    // Property sets predicate with literal object
    if (attributes.property) {
      activeTag.predicates = attributes.property.split(/[ \n\t]+/)
        .map((property) => this.createIri(property, activeTag, true));
    }

    // Rel and rev set the predicate with resource object
    const objectResource = this.getObjectResourceAttributeValue(attributes);
    if (objectResource) {
      if (attributes.rel) {
        this.emitTriple(
          this.getSubject(activeTag),
          this.createIri(attributes.rel, activeTag, true),
          this.createIri(objectResource, activeTag, false),
        );
      }
      if (attributes.rev) {
        this.emitTriple(
          this.createIri(objectResource, activeTag, false),
          this.createIri(attributes.rev, activeTag, true),
          this.getSubject(activeTag),
        );
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
        object || this.getSubject(activeTag),
        this.dataFactory.namedNode(RdfaParser.RDF + 'type'),
        this.createIri(attributes.typeof, activeTag, true),
      );
    }

    // <time> tags set an initial datatype
    if (name === 'time' && !attributes.datatype) {
      activeTag.interpretObjectAsTime = true;
    }

    // Save datatype attribute value in active tag
    if (attributes.datatype) {
      activeTag.datatype = <RDF.NamedNode> this.createIri(attributes.datatype, activeTag, true);
      if (activeTag.datatype.value === RdfaParser.RDF + 'XMLLiteral') {
        activeTag.collectChildTags = true;
      }
    }

    // Save language attribute value in active tag
    if ('lang' in attributes || 'xml:lang' in attributes) {
      activeTag.language = attributes.lang || attributes['xml:lang'];
    }

    // Emit triples for all objects
    if (object && activeTag.predicates && newSubject) {
      for (const predicate of activeTag.predicates) {
        this.emitTriple(this.getSubject(parentTag), predicate, object);
      }
    }

    // Content attribute has preference over text content
    if (attributes.content && activeTag.predicates) {
      for (const predicate of activeTag.predicates) {
        this.emitTriple(
          this.getSubject(activeTag),
          predicate,
          this.createLiteral(attributes.content, activeTag),
        );
      }

      // Unset predicate to avoid text contents to produce new triples
      activeTag.predicates = null;
    }

    // Datatime attribute on time tag has preference over text content
    if (activeTag.interpretObjectAsTime && attributes.datetime && activeTag.predicates) {
      for (const predicate of activeTag.predicates) {
        this.emitTriple(
          this.getSubject(activeTag),
          predicate,
          this.createLiteral(attributes.datetime, activeTag),
        );
      }

      // Unset predicate to avoid text contents to produce new triples
      activeTag.predicates = null;
    }

    // Set the current object as subject
    if (object) {
      activeTag.subject = object;
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
    const parentTag: IActiveTag = this.activeTagStack.length > 1
      ? this.activeTagStack[this.activeTagStack.length - 2] : null;

    // Emit all triples that were determined in the active tag
    if (activeTag.predicates && activeTag.text) {
      for (const predicate of activeTag.predicates) {
        this.emitTriple(
          this.getSubject(activeTag),
          predicate,
          this.createLiteral(activeTag.text.join(''), activeTag),
        );
      }
      activeTag.text = null;
    }

    // Remove the active tag from the stack
    this.activeTagStack.pop();

    // Save the tag contents if needed
    if (activeTag.collectChildTags && activeTag.text) {
      activeTag.text.push(`</${activeTag.name}>`);
    }

    // If we still have text contents, try to append it to the parent tag
    if (activeTag.text && parentTag) {
      if (!parentTag.text) {
        parentTag.text = activeTag.text;
      } else {
        parentTag.text = parentTag.text.concat(activeTag.text);
      }
    }
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
   * Create a new literal node.
   * @param {string} literal The literal value.
   * @param {IActiveTag} activeTag The current active tag.
   * @return {Literal} A new literal node.
   */
  protected createLiteral(literal: string, activeTag: IActiveTag): RDF.Literal {
    if (activeTag.interpretObjectAsTime) {
      for (const entry of RdfaParser.TIME_REGEXES) {
        if (literal.match(entry.regex)) {
          activeTag.datatype = this.dataFactory.namedNode(RdfaParser.XSD + entry.type);
          break;
        }
      }
    }
    return this.dataFactory.literal(literal, activeTag.datatype || activeTag.language);
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
    // Handle explicit blank nodes
    if (term[0] === '[' && term[term.length - 1] === ']') {
      term = term.substr(1, term.length - 2);
    }

    // Handle blank nodes
    if (term.startsWith('_:')) {
      return this.dataFactory.blankNode(term.substr(2) || 'b_identity');
    }

    // Handle vocab IRIs
    if (vocab) {
      if (activeTag.vocab && term.indexOf(':') < 0) {
        return this.dataFactory.namedNode(activeTag.vocab + term);
      }
    }

    // Handle prefixed IRIs
    let iri: string = RdfaParser.expandPrefixedTerm(term, activeTag);
    if (!vocab) {
      iri = resolve(iri, this.getBaseIri(activeTag));
    }
    return this.dataFactory.namedNode(iri);
  }

  /**
   * Get the first attribute that refers to a resource.
   * @param {{[p: string]: string}} attributes Attributes
   * @return {string} An attribute value or null.
   */
  protected getObjectResourceAttributeValue(attributes: {[s: string]: string}): string {
    return attributes.href || attributes.resource || attributes.src;
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
  predicates?: RDF.Term[];
  text?: string[];
  baseIRI?: string;
  vocab?: string;
  language?: string;
  datatype?: RDF.NamedNode;
  collectChildTags?: boolean;
  interpretObjectAsTime?: boolean;
}

export interface IRdfaParserOptions {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
  vocab?: string;
  defaultGraph?: RDF.Term;
  strict?: boolean;
}
