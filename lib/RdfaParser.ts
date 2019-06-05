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

  private baseIRI: RDF.NamedNode;

  constructor(options?: IRdfaParserOptions) {
    super({ objectMode: true });
    options = options || {};
    this.options = options;

    this.dataFactory = options.dataFactory || require('@rdfjs/data-model');
    this.baseIRI = this.dataFactory.namedNode(options.baseIRI || '');
    this.defaultGraph = options.defaultGraph || this.dataFactory.defaultGraph();

    this.parser = this.initializeParser(options.strict);

    this.activeTagStack.push({
      incompleteTriples: [],
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
      collectChildTags: parentTag.collectChildTags,
      incompleteTriples: [],
      name,
      prefixes: null,
    };
    this.activeTagStack.push(activeTag);

    // Save the tag contents if needed
    if (activeTag.collectChildTags) {
      const attributesSerialized = Object.keys(attributes).map((key) => `${key}="${attributes[key]}"`).join(' ');
      activeTag.text = [`<${name}${attributesSerialized ? ' ' + attributesSerialized : ''}>`];
    }

    // <base> tags override the baseIRI
    if (name === 'base' && attributes.href) {
      this.baseIRI = this.dataFactory.namedNode(attributes.href);
    }

    // <time> tags set an initial datatype
    if (name === 'time' && !attributes.datatype) {
      activeTag.interpretObjectAsTime = true;
    }

    // Processing based on https://www.w3.org/TR/rdfa-core/#s_rdfaindetail
    // 1: initialize values
    let skipElement: boolean;
    let newSubject: RDF.Term | boolean;
    let currentObjectResource: RDF.Term | boolean;
    let typedResource: RDF.Term | boolean;

    // 2: handle vocab attribute to set active vocabulary
    // Vocab sets the active vocabulary
    if ('vocab' in attributes) {
      if (attributes.vocab) {
        activeTag.vocab = attributes.vocab;
        this.emitTriple(
          this.baseIRI,
          this.dataFactory.namedNode(RdfaParser.RDFA + 'usesVocabulary'),
          this.dataFactory.namedNode(activeTag.vocab),
        );
      } else {
        // If vocab is set to '', then we fallback to the root vocab as defined via the parser constructor
        activeTag.vocab = this.activeTagStack[0].vocab;
      }
    } else {
      activeTag.vocab = parentTag.vocab;
    }

    // 3: handle prefixes
    activeTag.prefixes = RdfaParser.parsePrefixes(attributes, parentTag.prefixes);

    // 4: handle language
    // Save language attribute value in active tag
    if ('lang' in attributes || 'xml:lang' in attributes) {
      activeTag.language = attributes.lang || attributes['xml:lang'];
    } else {
      activeTag.language = parentTag.language;
    }

    const isRootTag: boolean = this.activeTagStack.length === 2;
    if (!attributes.rel && !attributes.rev) {
      // 5: Determine the new subject when rel and rev are not present
      if (attributes.property && !attributes.content && !attributes.datatype) {
        // 5.1: property is present, but not content and datatype
        // Determine new subject
        if ('about' in attributes) {
          newSubject = this.createIri(attributes.about, activeTag, false);
        } else if (isRootTag) {
          newSubject = true;
        } else if (parentTag.object) {
          newSubject = parentTag.object;
        }

        // Determine type
        if (attributes.typeof) {
          if ('about' in attributes) {
            typedResource = this.createIri(attributes.about, activeTag, false);
          } else if (isRootTag) {
            typedResource = true;
          } else {
            if (attributes.resource || attributes.href || attributes.src) {
              typedResource = this.createIri(attributes.resource || attributes.href || attributes.src,
                activeTag, false);
            } else {
              typedResource = this.dataFactory.blankNode();
            }
          }

          currentObjectResource = typedResource;
        }
      } else {
        // 5.2
        if (attributes.about || attributes.resource || attributes.href || attributes.src) {
          newSubject = this.createIri(attributes.about || attributes.resource || attributes.href || attributes.src,
            activeTag, false);
        } else {
          if (isRootTag) {
            newSubject = true;
          } else if (attributes.typeof) {
            newSubject = this.dataFactory.blankNode();
          } else if (parentTag.object) {
            newSubject = parentTag.object;
            if (!attributes.property) {
              skipElement = true;
            }
          }
        }

        // Determine type
        if (attributes.typeof) {
          typedResource = newSubject;
        }
      }
    } else if (attributes.rel || attributes.rev) {
      // 6: Determine the new subject when rel or rev are present

      // Define new subject
      if (attributes.about) {
        newSubject = this.createIri(attributes.about, activeTag, false);
        if (attributes.typeof) {
          typedResource = newSubject;
        }
      } else if (isRootTag) {
        newSubject = true;
      } else if (parentTag.object) {
        newSubject = parentTag.object;
      }

      // Define object
      if (attributes.resource || attributes.href || attributes.src) {
        currentObjectResource = this.createIri(attributes.resource || attributes.href || attributes.src,
          activeTag, false);
      } else if (attributes.typeof && !attributes.about) {
        currentObjectResource = this.dataFactory.blankNode();
      }

      // Set typed resource
      if (attributes.typeof && !attributes.about) {
        typedResource = currentObjectResource;
      }
    }

    // 7: If a typed resource was defined, emit it as a triple
    if (typedResource) {
      this.emitTriple(
        this.getResourceOrBaseIri(typedResource, activeTag),
        this.dataFactory.namedNode(RdfaParser.RDF + 'type'),
        this.createIri(attributes.typeof, activeTag, true),
      );
    }

    // 8: Reset list mapping if we have a new subject
    if (newSubject) {
      // TODO: Reset list mapping
    }

    // 9: If an object was defined, emit triples for it
    if (currentObjectResource) {
      // Handle list mapping
      // TODO

      // Determine predicates using rel or rev (unless rel and inlist are present)
      if (!(attributes.rel && attributes.inlist)) {
        if (attributes.rel && (!attributes.property || attributes.rel.indexOf(':') >= 0)) {
          this.emitTriple(
            this.getResourceOrBaseIri(newSubject, activeTag),
            this.createIri(attributes.rel, activeTag, true),
            this.getResourceOrBaseIri(currentObjectResource, activeTag),
          );
        }
        if (attributes.rev && (!attributes.property || attributes.rev.indexOf(':') >= 0)) {
          this.emitTriple(
            this.getResourceOrBaseIri(currentObjectResource, activeTag),
            this.createIri(attributes.rev, activeTag, true),
            this.getResourceOrBaseIri(newSubject, activeTag),
          );
        }
      }
    }

    // 10: Store incomplete triples if we don't have an object, but we do have predicates
    if (!currentObjectResource) {
      if (attributes.rel) {
        if (attributes.inlist) {
          // TODO
        } else {
          activeTag.incompleteTriples.push({
            predicate: this.createIri(attributes.rel, activeTag, true),
            reverse: false,
          });
        }
      }
      if (attributes.rev) {
        activeTag.incompleteTriples.push({
          predicate: this.createIri(attributes.rev, activeTag, true),
          reverse: true,
        });
      }

      // Set a blank node object, so the children can make use of this when completing the triples
      if (activeTag.incompleteTriples.length > 0) {
        currentObjectResource = this.dataFactory.blankNode();
      }
    }

    // 11: Determine current property value
    if (attributes.property) {
      // Create predicates
      activeTag.predicates = attributes.property.split(/[ \n\t]+/)
        .map((property) => this.createIri(property, activeTag, true));

      // Save datatype attribute value in active tag
      if (attributes.datatype) {
        activeTag.datatype = <RDF.NamedNode> this.createIri(attributes.datatype, activeTag, true);
        if (activeTag.datatype.value === RdfaParser.RDF + 'XMLLiteral') {
          activeTag.collectChildTags = true;
        }
      }

      // Try to determine resource
      if (!attributes.rev && !attributes.rel && !attributes.content) {
        if (attributes.resource || attributes.href || attributes.src) {
          currentObjectResource = this.createIri(attributes.resource || attributes.href || attributes.src,
            activeTag, false);
        }
      } else if (attributes.typeof && !attributes.about) {
        currentObjectResource = typedResource;
      }

      // TODO: handle @inlist

      if (attributes.content) {
        // Emit triples based on content attribute has preference over text content
        for (const predicate of activeTag.predicates) {
          this.emitTriple(
            this.getResourceOrBaseIri(newSubject, activeTag),
            predicate,
            this.createLiteral(attributes.content, activeTag),
          );
        }

        // Unset predicate to avoid text contents to produce new triples
        activeTag.predicates = null;
      } else if (activeTag.interpretObjectAsTime && attributes.datetime) {
        // Datetime attribute on time tag has preference over text content
        for (const predicate of activeTag.predicates) {
          this.emitTriple(
            this.getResourceOrBaseIri(newSubject, activeTag),
            predicate,
            this.createLiteral(attributes.datetime, activeTag),
          );
        }

        // Unset predicate to avoid text contents to produce new triples
        activeTag.predicates = null;
      } else if (currentObjectResource) {
        // Emit triples for all resource objects
        for (const predicate of activeTag.predicates) {
          this.emitTriple(
            this.getResourceOrBaseIri(newSubject, activeTag),
            predicate,
            this.getResourceOrBaseIri(currentObjectResource, activeTag),
            );
        }

        // Unset predicate to avoid text contents to produce new triples
        activeTag.predicates = null;
      }
    }

    // 12: Complete incomplete triples
    let incompleteTriplesCompleted = false;
    if (!skipElement && newSubject && parentTag.incompleteTriples.length > 0) {
      incompleteTriplesCompleted = true;
      for (const incompleteTriple of parentTag.incompleteTriples) {
        if (!incompleteTriple.reverse) {
          this.emitTriple(
            this.getResourceOrBaseIri(parentTag.subject, activeTag),
            incompleteTriple.predicate,
            this.getResourceOrBaseIri(newSubject, activeTag),
          );
        } else {
          this.emitTriple(
            this.getResourceOrBaseIri(newSubject, activeTag),
            incompleteTriple.predicate,
            this.getResourceOrBaseIri(parentTag.subject, activeTag),
          );
        }
      }
    }
    if (!incompleteTriplesCompleted && parentTag.incompleteTriples.length > 0) {
      activeTag.incompleteTriples = activeTag.incompleteTriples.concat(parentTag.incompleteTriples);
    }

    // 13: Save evaluation context into active tag
    activeTag.subject = newSubject;
    activeTag.object = currentObjectResource || newSubject;

    // 14: Handle local list mapping
    // TODO
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
          this.getResourceOrBaseIri(activeTag.subject, activeTag),
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

  // TODO: doc
  protected getResourceOrBaseIri(term: RDF.Term | boolean, activeTag: IActiveTag): RDF.Term {
    return term === true ? this.getBaseIriTerm(activeTag) : <RDF.Term> term;
  }

  /**
   * Get the active base IRI as an RDF term.
   * @param {IActiveTag} activeTag The active tag.
   * @return {NamedNode} The base IRI term.
   */
  protected getBaseIriTerm(activeTag: IActiveTag): RDF.NamedNode {
    return this.baseIRI;
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
    if (term.length > 0 && term[0] === '[' && term[term.length - 1] === ']') {
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
      iri = resolve(iri, this.baseIRI.value);
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
    // Validate IRIs
    if ((subject.termType === 'NamedNode' && subject.value.indexOf(':') < 0)
      || (predicate.termType === 'NamedNode' && predicate.value.indexOf(':') < 0)
      || (object.termType === 'NamedNode' && object.value.indexOf(':') < 0)) {
      return;
    }
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
  subject?: RDF.Term | boolean;
  predicates?: RDF.Term[];
  object?: RDF.Term | boolean;
  text?: string[];
  vocab?: string;
  language?: string;
  datatype?: RDF.NamedNode;
  collectChildTags?: boolean;
  interpretObjectAsTime?: boolean;
  incompleteTriples?: { predicate: RDF.Term, reverse: boolean }[];
}

export interface IRdfaParserOptions {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
  vocab?: string;
  defaultGraph?: RDF.Term;
  strict?: boolean;
}
