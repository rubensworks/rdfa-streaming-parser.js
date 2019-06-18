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
  // tslint:disable:object-literal-sort-keys
  public static readonly RDFA_FEATURES: {[profile: string]: IRdfaFeatures} = {
    '': {
      baseTag: true,
      langAttribute: true,
      onlyAllowUriRelRevIfProperty: true,
      inheritSubjectInHeadBody: true,
      datetimeAttribute: true,
      timeTag: true,
      htmlDatatype: true,
      copyRdfaPatterns: true,
      xmlnsPrefixMappings: true,
    },
    'core': {
      baseTag: false,
      langAttribute: true,
      onlyAllowUriRelRevIfProperty: true,
      inheritSubjectInHeadBody: false,
      datetimeAttribute: false,
      timeTag: false,
      htmlDatatype: false,
      copyRdfaPatterns: true,
      xmlnsPrefixMappings: true,
    },
    'html': {
      baseTag: true,
      langAttribute: true,
      onlyAllowUriRelRevIfProperty: true,
      inheritSubjectInHeadBody: true,
      datetimeAttribute: true,
      timeTag: true,
      htmlDatatype: true,
      copyRdfaPatterns: true,
      xmlnsPrefixMappings: true,
    },
    'xhtml': {
      baseTag: true,
      langAttribute: true,
      onlyAllowUriRelRevIfProperty: true,
      inheritSubjectInHeadBody: true,
      datetimeAttribute: true,
      timeTag: true,
      htmlDatatype: true,
      copyRdfaPatterns: true,
      xmlnsPrefixMappings: true,
    },
  };
  // tslint:enable:object-literal-sort-keys

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
  // Regex for valid IRIs
  protected static readonly IRI_REGEX: RegExp = /^([A-Za-z][A-Za-z0-9+-.]*|_):[^ "<>{}|\\\[\]`]*$/;

  private readonly options: IRdfaParserOptions;
  private readonly dataFactory: RDF.DataFactory;
  private readonly defaultGraph?: RDF.Term;
  private readonly parser: HtmlParser;
  private readonly features: IRdfaFeatures;
  private readonly rdfaPatterns: {[patternId: string]: IRdfaPattern};
  private readonly pendingRdfaPatternCopies: {[copyTargetPatternId: string]: IActiveTag[]};

  private readonly activeTagStack: IActiveTag[] = [];

  private baseIRI: RDF.NamedNode;

  constructor(options?: IRdfaParserOptions) {
    super({ objectMode: true });
    options = options || {};
    this.options = options;

    this.dataFactory = options.dataFactory || require('@rdfjs/data-model');
    this.baseIRI = this.dataFactory.namedNode(options.baseIRI || '');
    this.defaultGraph = options.defaultGraph || this.dataFactory.defaultGraph();
    this.features = options.features || RdfaParser.RDFA_FEATURES[options.profile] || RdfaParser.RDFA_FEATURES[''];
    this.rdfaPatterns = this.features.copyRdfaPatterns ? {} : null;
    this.pendingRdfaPatternCopies = this.features.copyRdfaPatterns ? {} : null;

    this.parser = this.initializeParser(options.strict);

    this.activeTagStack.push({
      incompleteTriples: [],
      inlist: false,
      language: options.language,
      listMapping: {},
      listMappingLocal: {},
      name: '',
      prefixes: INITIAL_CONTEXT['@context'],
      skipElement: false,
      vocab: options.vocab,
    });
  }

  /**
   * Retrieve the prefixes of the current tag's attributes.
   * @param {{[p: string]: string}} attributes A tag's attributes.
   * @param {{[p: string]: string}} parentPrefixes The prefixes from the parent tag.
   * @param {boolean} xmlnsPrefixMappings If prefixes should be extracted from xmlnsPrefixMappings.
   * @return {{[p: string]: string}} The new prefixes.
   */
  public static parsePrefixes(attributes: {[s: string]: string},
                              parentPrefixes: {[prefix: string]: string},
                              xmlnsPrefixMappings: boolean): {[prefix: string]: string} {
    const additionalPrefixes: {[prefix: string]: string} = {};
    if (xmlnsPrefixMappings) {
      for (const attribute in attributes) {
        if (attribute.startsWith('xmlns:')) {
          additionalPrefixes[attribute.substr(6)] = attributes[attribute];
        }
      }
    }

    if (attributes.prefix || Object.keys(additionalPrefixes).length > 0) {
      const prefixes: {[prefix: string]: string} = { ...parentPrefixes, ...additionalPrefixes };

      if (attributes.prefix) {
        let prefixMatch;
        // tslint:disable-next-line:no-conditional-assignment
        while (prefixMatch = RdfaParser.PREFIX_REGEX.exec(attributes.prefix)) {
          prefixes[prefixMatch[1]] = prefixMatch[2];
        }
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

    // Expand default namespace
    if (prefix === '') {
      return 'http://www.w3.org/1999/xhtml/vocab#' + local;
    }

    // Try to expand the prefix
    if (prefix) {
      const prefixElement = activeTag.prefixes[prefix];
      if (prefixElement) {
        return prefixElement + local;
      }
    }

    // Try to expand the term
    const expandedTerm = activeTag.prefixes[term.toLocaleLowerCase()];
    if (expandedTerm) {
      return expandedTerm;
    }

    return term;
  }

  /**
   * Check if the given IRI is valid.
   * @param {string} iri A potential IRI.
   * @return {boolean} If the given IRI is valid.
   */
  public static isValidIri(iri: string): boolean {
    return RdfaParser.IRI_REGEX.test(iri);
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
    // Determine the parent tag (ignore skipped tags)
    let parentTagI: number = this.activeTagStack.length - 1;
    while (parentTagI > 0 && this.activeTagStack[parentTagI].skipElement) {
      parentTagI--;
    }
    let parentTag: IActiveTag = this.activeTagStack[parentTagI];
    // If we skipped a tag, make sure we DO use the lang, prefixes and vocab of the skipped tag
    if (parentTagI !== this.activeTagStack.length - 1) {
      parentTag = {
        ...parentTag,
        language: this.activeTagStack[this.activeTagStack.length - 1].language,
        prefixes: this.activeTagStack[this.activeTagStack.length - 1].prefixes,
        vocab: this.activeTagStack[this.activeTagStack.length - 1].vocab,
      };
    }

    // Create a new active tag and inherit language scope and baseIRI from parent
    const activeTag: IActiveTag = {
      collectChildTags: parentTag.collectChildTags,
      incompleteTriples: [],
      inlist: 'inlist' in attributes,
      listMapping: <{[predicate: string]: (RDF.Term|boolean)[]}> <any> [],
      listMappingLocal: parentTag.listMapping,
      name,
      prefixes: null,
      skipElement: false,
    };
    this.activeTagStack.push(activeTag);

    if (this.features.onlyAllowUriRelRevIfProperty) {
      // Ignore illegal rel/rev values when property is present
      if ('property' in attributes && 'rel' in attributes && attributes.rel.indexOf(':') < 0) {
        delete attributes.rel;
      }
      if ('property' in attributes && 'rev' in attributes && attributes.rev.indexOf(':') < 0) {
        delete attributes.rev;
      }
    }

    if (this.features.copyRdfaPatterns) {
      // Save the tag if needed
      if (parentTag.collectedPatternTag) {
        const patternTag: IRdfaPattern = {
          attributes,
          children: [],
          name,
          referenced: false,
          rootPattern: false,
          text: [],
        };
        parentTag.collectedPatternTag.children.push(patternTag);
        activeTag.collectedPatternTag = patternTag;
        return;
      }

      // Store tags with type rdfa:Pattern as patterns
      if (attributes.typeof === 'rdfa:Pattern') {
        activeTag.collectedPatternTag = {
          attributes,
          children: [],
          name,
          parentTag,
          referenced: false,
          rootPattern: true,
          text: [],
        };
        return;
      }

      // Instantiate patterns on rdfa:copy
      if (attributes.property === 'rdfa:copy') {
        const copyTargetPatternId: string = attributes.resource || attributes.href || attributes.src;
        if (this.rdfaPatterns[copyTargetPatternId]) {
          this.emitPatternCopy(parentTag, this.rdfaPatterns[copyTargetPatternId], copyTargetPatternId);
        } else {
          if (!this.pendingRdfaPatternCopies[copyTargetPatternId]) {
            this.pendingRdfaPatternCopies[copyTargetPatternId] = [];
          }
          this.pendingRdfaPatternCopies[copyTargetPatternId].push(parentTag);
        }
        return;
      }
    }

    // Save the tag contents if needed
    if (activeTag.collectChildTags) {
      const attributesSerialized = Object.keys(attributes).map((key) => `${key}="${attributes[key]}"`).join(' ');
      activeTag.text = [`<${name}${attributesSerialized ? ' ' + attributesSerialized : ''}>`];
    }

    // <base> tags override the baseIRI
    if (this.features.baseTag && name === 'base' && attributes.href) {
      let href: string = attributes.href;
      const fragmentIndex = href.indexOf('#');
      if (fragmentIndex >= 0) {
        href = href.substr(0, fragmentIndex);
      }
      this.baseIRI = this.dataFactory.namedNode(href);
    }

    // <time> tags set an initial datatype
    if (this.features.timeTag && name === 'time' && !attributes.datatype) {
      activeTag.interpretObjectAsTime = true;
    }

    // Processing based on https://www.w3.org/TR/rdfa-core/#s_rdfaindetail
    // 1: initialize values
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
    activeTag.prefixes = RdfaParser.parsePrefixes(attributes, parentTag.prefixes, this.features.xmlnsPrefixMappings);

    // 4: handle language
    // Save language attribute value in active tag
    if ('xml:lang' in attributes || (this.features.langAttribute && 'lang' in attributes)) {
      activeTag.language = attributes['xml:lang'] || attributes.lang;
    } else {
      activeTag.language = parentTag.language;
    }

    const isRootTag: boolean = this.activeTagStack.length === 2;
    if (!('rel' in attributes) && !('rev' in attributes)) {
      // 5: Determine the new subject when rel and rev are not present
      if ('property' in attributes && !('content' in attributes) && !('datatype' in attributes)) {
        // 5.1: property is present, but not content and datatype
        // Determine new subject
        if ('about' in attributes) {
          newSubject = this.createIri(attributes.about, activeTag, false, true);
        } else if (isRootTag) {
          newSubject = true;
        } else if (parentTag.object) {
          newSubject = parentTag.object;
        }

        // Determine type
        if ('typeof' in attributes) {
          if ('about' in attributes) {
            typedResource = this.createIri(attributes.about, activeTag, false, true);
          }
          if (!typedResource && isRootTag) {
            typedResource = true;
          }
          if (!typedResource && 'resource' in attributes) {
            typedResource = this.createIri(attributes.resource, activeTag, false, true);
          }
          if (!typedResource && ('href' in attributes || 'src' in attributes)) {
            typedResource = this.createIri(attributes.href || attributes.src, activeTag, false, false);
          }
          if (!typedResource && this.isInheritSubjectInHeadBody(name)) {
            typedResource = newSubject;
          }
          if (!typedResource) {
            typedResource = this.dataFactory.blankNode();
          }

          currentObjectResource = typedResource;
        }
      } else {
        // 5.2
        if ('about' in attributes || 'resource' in attributes) {
          newSubject = this.createIri(attributes.about || attributes.resource, activeTag, false, true);
        }
        if (!newSubject && ('href' in attributes || 'src' in attributes)) {
          newSubject = this.createIri(attributes.href || attributes.src,
            activeTag, false, false);
        }
        if (!newSubject) {
          if (isRootTag) {
            newSubject = true;
          } else if (this.isInheritSubjectInHeadBody(name)) {
            newSubject = parentTag.object;
          } else if ('typeof' in attributes) {
            newSubject = this.dataFactory.blankNode();
          } else if (parentTag.object) {
            newSubject = parentTag.object;
            if (!('property' in attributes)) {
              activeTag.skipElement = true;
            }
          }
        }

        // Determine type
        if ('typeof' in attributes) {
          typedResource = newSubject;
        }
      }
    } else { // either rel or rev is present
      // 6: Determine the new subject when rel or rev are present

      // Define new subject
      if ('about' in attributes) {
        newSubject = this.createIri(attributes.about, activeTag, false, true);
        if ('typeof' in attributes) {
          typedResource = newSubject;
        }
      } else if (isRootTag) {
        newSubject = true;
      } else if (parentTag.object) {
        newSubject = parentTag.object;
      }

      // Define object
      if ('resource' in attributes) {
        currentObjectResource = this.createIri(attributes.resource, activeTag, false, true);
      }
      if (!currentObjectResource) {
        if ('href' in attributes || 'src' in attributes) {
          currentObjectResource = this.createIri(attributes.href || attributes.src, activeTag, false, false);
        } else if ('typeof' in attributes && !('about' in attributes) && !this.isInheritSubjectInHeadBody(name)) {
          currentObjectResource = this.dataFactory.blankNode();
        }
      }

      // Set typed resource
      if ('typeof' in attributes && !('about' in attributes)) {
        if (this.isInheritSubjectInHeadBody(name)) {
          typedResource = newSubject;
        } else {
          typedResource = currentObjectResource;
        }
      }
    }

    // 7: If a typed resource was defined, emit it as a triple
    if (typedResource) {
      for (const type of this.createVocabIris(attributes.typeof, activeTag)) {
        this.emitTriple(
          this.getResourceOrBaseIri(typedResource, activeTag),
          this.dataFactory.namedNode(RdfaParser.RDF + 'type'),
          type,
        );
      }
    }

    // 8: Reset list mapping if we have a new subject
    if (newSubject) {
      activeTag.listMapping = {};
    }

    // 9: If an object was defined, emit triples for it
    if (currentObjectResource) {
      // Handle list mapping
      if ('rel' in attributes && 'inlist' in attributes) {
        for (const predicate of this.createVocabIris(attributes.rel, activeTag)) {
          this.addListMapping(activeTag, predicate, currentObjectResource);
        }
      }

      // Determine predicates using rel or rev (unless rel and inlist are present)
      if (!('rel' in attributes && 'inlist' in attributes)) {
        if ('rel' in attributes) {
          for (const predicate of this.createVocabIris(attributes.rel, activeTag)) {
            this.emitTriple(
              this.getResourceOrBaseIri(newSubject, activeTag),
              predicate,
              this.getResourceOrBaseIri(currentObjectResource, activeTag),
            );
          }
        }
        if ('rev' in attributes) {
          for (const predicate of this.createVocabIris(attributes.rev, activeTag)) {
            this.emitTriple(
              this.getResourceOrBaseIri(currentObjectResource, activeTag),
              predicate,
              this.getResourceOrBaseIri(newSubject, activeTag),
            );
          }
        }
      }
    }

    // 10: Store incomplete triples if we don't have an object, but we do have predicates
    if (!currentObjectResource) {
      if ('rel' in attributes) {
        if ('inlist' in attributes) {
          for (const predicate of this.createVocabIris(attributes.rel, activeTag)) {
            this.addListMapping(activeTag, predicate, null);
            activeTag.incompleteTriples.push({ predicate, reverse: false, list: true });
          }
        } else {
          for (const predicate of this.createVocabIris(attributes.rel, activeTag)) {
            activeTag.incompleteTriples.push({ predicate, reverse: false });
          }
        }
      }
      if ('rev' in attributes) {
        for (const predicate of this.createVocabIris(attributes.rev, activeTag)) {
          activeTag.incompleteTriples.push({ predicate, reverse: true });
        }
      }

      // Set a blank node object, so the children can make use of this when completing the triples
      if (activeTag.incompleteTriples.length > 0) {
        currentObjectResource = this.dataFactory.blankNode();
      }
    }

    // 11: Determine current property value
    if ('property' in attributes) {
      // Create predicates
      activeTag.predicates = this.createVocabIris(attributes.property, activeTag);

      // Save datatype attribute value in active tag
      let localObjectResource: RDF.Term | boolean;
      if ('datatype' in attributes) {
        activeTag.datatype = <RDF.NamedNode> this.createIri(attributes.datatype, activeTag, true, true);
        if (activeTag.datatype
          && (activeTag.datatype.value === RdfaParser.RDF + 'XMLLiteral'
            || (this.features.htmlDatatype && activeTag.datatype.value === RdfaParser.RDF + 'HTML'))) {
          activeTag.collectChildTags = true;
        }
      } else {
        // Try to determine resource
        if (!('rev' in attributes) && !('rel' in attributes) && !('content' in attributes)) {
          if ('resource' in attributes) {
            localObjectResource = this.createIri(attributes.resource, activeTag, false, true);
          }
          if (!localObjectResource && 'href' in attributes) {
            localObjectResource = this.createIri(attributes.href, activeTag, false, false);
          }
          if (!localObjectResource && 'src' in attributes) {
            localObjectResource = this.createIri(attributes.src, activeTag, false, false);
          }
        }
        if ('typeof' in attributes && !('about' in attributes)) {
          localObjectResource = typedResource;
        }
      }

      if ('content' in attributes) {
        // Emit triples based on content attribute has preference over text content
        const object = this.createLiteral(attributes.content, activeTag);
        if ('inlist' in attributes) {
          for (const predicate of activeTag.predicates) {
            this.addListMapping(activeTag, predicate, object);
          }
        } else {
          const subject = this.getResourceOrBaseIri(newSubject, activeTag);
          for (const predicate of activeTag.predicates) {
            this.emitTriple(subject, predicate, object);
          }
        }

        // Unset predicate to avoid text contents to produce new triples
        activeTag.predicates = null;
      } else if (this.features.datetimeAttribute && 'datetime' in attributes) {
        activeTag.interpretObjectAsTime = true;
        // Datetime attribute on time tag has preference over text content
        const object = this.createLiteral(attributes.datetime, activeTag);
        if ('inlist' in attributes) {
          for (const predicate of activeTag.predicates) {
            this.addListMapping(activeTag, predicate, object);
          }
        } else {
          const subject = this.getResourceOrBaseIri(newSubject, activeTag);
          for (const predicate of activeTag.predicates) {
            this.emitTriple(subject, predicate, object);
          }
        }

        // Unset predicate to avoid text contents to produce new triples
        activeTag.predicates = null;
      } else if (localObjectResource) {
        // Emit triples for all resource objects
        const object = this.getResourceOrBaseIri(localObjectResource, activeTag);
        if ('inlist' in attributes) {
          for (const predicate of activeTag.predicates) {
            this.addListMapping(activeTag, predicate, object);
          }
        } else {
          const subject = this.getResourceOrBaseIri(newSubject, activeTag);
          for (const predicate of activeTag.predicates) {
            this.emitTriple(subject, predicate, object);
          }
        }

        // Unset predicate to avoid text contents to produce new triples
        activeTag.predicates = null;
      }
    }

    // 12: Complete incomplete triples
    let incompleteTriplesCompleted = false;
    if (!activeTag.skipElement && newSubject && parentTag.incompleteTriples.length > 0) {
      incompleteTriplesCompleted = true;
      const subject = this.getResourceOrBaseIri(parentTag.subject, activeTag);
      const object = this.getResourceOrBaseIri(newSubject, activeTag);
      for (const incompleteTriple of parentTag.incompleteTriples) {
        if (!incompleteTriple.reverse) {
          if (incompleteTriple.list) {
            // Find the active tag that defined the list by going up the stack
            let firstInListTag = null;
            for (let i = this.activeTagStack.length - 1; i >= 0; i--) {
              if (this.activeTagStack[i].inlist) {
                firstInListTag = this.activeTagStack[i];
                break;
              }
            }
            // firstInListTag is guaranteed to be non-null
            this.addListMapping(firstInListTag, incompleteTriple.predicate, object);
          } else {
            this.emitTriple(subject, incompleteTriple.predicate, object);
          }
        } else {
          this.emitTriple(object, incompleteTriple.predicate, subject);
        }
      }
    }
    if (!incompleteTriplesCompleted && parentTag.incompleteTriples.length > 0) {
      activeTag.incompleteTriples = activeTag.incompleteTriples.concat(parentTag.incompleteTriples);
    }

    // 13: Save evaluation context into active tag
    activeTag.subject = newSubject || parentTag.subject;
    activeTag.object = currentObjectResource || newSubject;
  }

  protected onText(data: string) {
    const activeTag: IActiveTag = this.activeTagStack[this.activeTagStack.length - 1];

    // Collect text in pattern tag if needed
    if (this.features.copyRdfaPatterns && activeTag.collectedPatternTag) {
      activeTag.collectedPatternTag.text.push(data);
      return;
    }

    // Save the text inside the active tag
    if (!activeTag.text) {
      activeTag.text = [];
    }
    activeTag.text.push(data);
  }

  protected onTagClose() {
    // Get the active tag
    const activeTag: IActiveTag = this.activeTagStack[this.activeTagStack.length - 1];
    const parentTag: IActiveTag = this.activeTagStack[this.activeTagStack.length - 2];

    // If we detect a finalized rdfa:Pattern tag, store it
    if (this.features.copyRdfaPatterns && activeTag.collectedPatternTag && activeTag.collectedPatternTag.rootPattern) {
      const patternId = activeTag.collectedPatternTag.attributes.resource;

      // Remove resource and typeof attributes to avoid it being seen as a new pattern
      delete activeTag.collectedPatternTag.attributes.resource;
      delete activeTag.collectedPatternTag.attributes.typeof;

      // Store the pattern
      this.rdfaPatterns[patternId] = activeTag.collectedPatternTag;

      // Apply all pending copies for this pattern
      if (this.pendingRdfaPatternCopies[patternId]) {
        for (const tag of this.pendingRdfaPatternCopies[patternId]) {
          this.emitPatternCopy(tag, activeTag.collectedPatternTag, patternId);
        }
        delete this.pendingRdfaPatternCopies[patternId];
      }

      // Remove the active tag from the stack
      this.activeTagStack.pop();

      // Call end method if our last tag has been popped
      if (this.activeTagStack.length === 1) {
        this.onEnd();
      }

      return;
    }

    // Emit all triples that were determined in the active tag
    if (activeTag.predicates) {
      const subject = this.getResourceOrBaseIri(activeTag.subject, activeTag);
      const object = this.createLiteral((activeTag.text || []).join(''), activeTag);
      if (activeTag.inlist) {
        for (const predicate of activeTag.predicates) {
          this.addListMapping(activeTag, predicate, object);
        }
      } else {
        for (const predicate of activeTag.predicates) {
          this.emitTriple(subject, predicate, object);
        }
      }

      // Reset text, unless the parent is also collecting text
      if (!parentTag.predicates) {
        activeTag.text = null;
      }
    }

    // 14: Handle local list mapping
    if (activeTag.subject && Object.keys(activeTag.listMapping).length > 0) {
      const subject = this.getResourceOrBaseIri(activeTag.subject, activeTag);
      for (const predicateValue in activeTag.listMapping) {
        const predicate = this.dataFactory.namedNode(predicateValue);
        const values = activeTag.listMapping[predicateValue];

        if (values.length > 0) {
          // Non-empty list, emit linked list of rdf:first and rdf:rest chains
          const bnodes = values.map(() => this.dataFactory.blankNode());
          for (let i = 0; i < values.length; i++) {
            const object = this.getResourceOrBaseIri(values[i], activeTag);
            this.emitTriple(bnodes[i], this.dataFactory.namedNode(RdfaParser.RDF + 'first'),
              object);
            this.emitTriple(bnodes[i], this.dataFactory.namedNode(RdfaParser.RDF + 'rest'),
              (i < values.length - 1) ? bnodes[i + 1] : this.dataFactory.namedNode(RdfaParser.RDF + 'nil'));
          }

          // Emit triple for the first linked list chain
          this.emitTriple(subject, predicate, bnodes[0]);
        } else {
          // Empty list, just emit rdf:nil
          this.emitTriple(subject, predicate, this.dataFactory.namedNode(RdfaParser.RDF + 'nil'));
        }
      }
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

    // Call end method if our last tag has been popped
    if (this.activeTagStack.length === 1) {
      this.onEnd();
    }
  }

  protected onEnd() {
    if (this.features.copyRdfaPatterns) {
      this.features.copyRdfaPatterns = false;

      // Emit all unreferenced patterns
      for (const patternId in this.rdfaPatterns) {
        const pattern = this.rdfaPatterns[patternId];
        if (!pattern.referenced) {
          pattern.attributes.typeof = 'rdfa:Pattern';
          pattern.attributes.resource = patternId;
          this.emitPatternCopy(pattern.parentTag, pattern, patternId);
          pattern.referenced = false;
          delete pattern.attributes.typeof;
          delete pattern.attributes.resource;
        }
      }

      // Emit all unreferenced copy links
      for (const patternId in this.pendingRdfaPatternCopies) {
        for (const parentTag of this.pendingRdfaPatternCopies[patternId]) {
          this.activeTagStack.push(parentTag);
          this.onTagOpen('link', { property: 'rdfa:copy', href: patternId });
          this.onTagClose();
          this.activeTagStack.pop();
        }
      }

      this.features.copyRdfaPatterns = true;
    }
  }

  /**
   * If the new subject can be inherited from the parent object
   * if the resource defines no new subject.
   * @param {string} name The current tag name.
   * @returns {boolean} If the subject can be inherited.
   */
  protected isInheritSubjectInHeadBody(name: string) {
    return this.features.inheritSubjectInHeadBody && (name === 'head' || name === 'body');
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
   * Create vocab terms for the given terms attribute.
   * @param {string} terms An attribute value.
   * @param {IActiveTag} activeTag The current active tag.
   * @return {Term[]} The IRI terms.
   */
  protected createVocabIris(terms: string, activeTag: IActiveTag): RDF.Term[] {
    return terms.split(/[ \n\t]+/)
      .map((property) => this.createIri(property, activeTag, true, true))
      .filter((term) => term != null);
  }

  /**
   * Create a new literal node.
   * @param {string} literal The literal value.
   * @param {IActiveTag} activeTag The current active tag.
   * @return {Literal} A new literal node.
   */
  protected createLiteral(literal: string, activeTag: IActiveTag): RDF.Literal {
    if (activeTag.interpretObjectAsTime && !activeTag.datatype) {
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
   * @param {string} term A term string (CURIE or IRI, aka safe-CURIE in RDFa spec).
   * @param {IActiveTag} activeTag The current active tag.
   * @param {boolean} vocab If creating an IRI in vocab-mode (based on vocab IRI),
   *                        or in base-mode (based on base IRI).
   * @param {boolean} allowSafeCurie If safe CURIEs are allowed
   *                                 (invalid CURIEs between square brackets will return null)
   *                                 Otherwise, only IRIs are allowed.
   * @return {Term} An RDF term or null.
   */
  protected createIri(term: string, activeTag: IActiveTag, vocab: boolean, allowSafeCurie: boolean): RDF.Term {
    term = term || '';

    if (!allowSafeCurie) {
      if (!vocab) {
        term = resolve(term, this.baseIRI.value);
      }
      if (!RdfaParser.isValidIri(term)) {
        return null;
      }
      return this.dataFactory.namedNode(term);
    }

    // Handle strict CURIEs
    if (term.length > 0 && term[0] === '[' && term[term.length - 1] === ']') {
      term = term.substr(1, term.length - 2);

      // Strict CURIEs MUST have a prefix separator
      if (term.indexOf(':') < 0) {
        return null;
      }
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
    if (!RdfaParser.isValidIri(iri)) {
      return null;
    }
    return this.dataFactory.namedNode(iri);
  }

  /**
   * Add a list mapping for the given predicate and object in the active tag.
   * @param {IActiveTag} activeTag The active tag.
   * @param {Term} predicate A predicate term.
   * @param {Term | boolean} currentObjectResource The current object resource.
   */
  protected addListMapping(activeTag: IActiveTag, predicate: RDF.Term, currentObjectResource: RDF.Term | boolean) {
    let predicateList = activeTag.listMappingLocal[predicate.value];
    if (!predicateList) {
      activeTag.listMappingLocal[predicate.value] = predicateList = [];
    }
    if (currentObjectResource) {
      predicateList.push(currentObjectResource);
    }
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

  /**
   * Emit an instantiation of the given pattern with the given parent tag.
   * @param {IActiveTag} parentTag The parent tag to instantiate in.
   * @param {IRdfaPattern} pattern The pattern to instantiate.
   * @param {string} rootPatternId The pattern id.
   */
  protected emitPatternCopy(parentTag: IActiveTag, pattern: IRdfaPattern, rootPatternId: string) {
    this.activeTagStack.push(parentTag);
    pattern.referenced = true;
    this.emitPatternCopyAbsolute(pattern, true, rootPatternId);
    this.activeTagStack.pop();
  }

  /**
   * Emit an instantiation of the given pattern with the given parent tag.
   *
   * This should probably not be called directly,
   * call {@link emitPatternCopy} instead.
   *
   * @param {IRdfaPattern} pattern The pattern to instantiate.
   * @param {boolean} root If this is the root call for the given pattern.
   * @param {string} rootPatternId The pattern id.
   */
  protected emitPatternCopyAbsolute(pattern: IRdfaPattern, root: boolean, rootPatternId: string) {
    // Stop on detection of cyclic patterns
    if (!root && pattern.attributes.property === 'rdfa:copy' && pattern.attributes.href === rootPatternId) {
      return;
    }

    this.onTagOpen(pattern.name, pattern.attributes);
    for (const text of pattern.text) {
      this.onText(text);
    }
    for (const child of pattern.children) {
      this.emitPatternCopyAbsolute(child, false, rootPatternId);
    }
    this.onTagClose();
  }

  protected initializeParser(strict: boolean): HtmlParser {
    return new HtmlParser(
      <DomHandler> <any> {
        onclosetag: () => this.onTagClose(),
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
  collectedPatternTag?: IRdfaPattern;
  interpretObjectAsTime?: boolean;
  incompleteTriples?: { predicate: RDF.Term, reverse: boolean, list?: boolean }[];
  inlist: boolean;
  listMapping: {[predicate: string]: (RDF.Term|boolean)[]};
  listMappingLocal: {[predicate: string]: (RDF.Term|boolean)[]};
  skipElement: boolean;
}

export interface IRdfaParserOptions {
  dataFactory?: RDF.DataFactory;
  baseIRI?: string;
  language?: string;
  vocab?: string;
  defaultGraph?: RDF.Term;
  strict?: boolean;
  features?: IRdfaFeatures;
  profile?: RdfaProfile;
}

export type RdfaProfile =
  '' | // All possible RDFa features
  'core' | // https://www.w3.org/TR/rdfa-core/
  'html' | // https://www.w3.org/TR/html-rdfa/
  'xhtml'; // https://www.w3.org/TR/xhtml-rdfa/

export interface IRdfaFeatures {
  /**
   * If the baseIRI can be set via the <base> tag.
   */
  baseTag?: boolean;
  /**
   * If the language can be set via the language attribute.
   */
  langAttribute?: boolean;
  /**
   * If non-CURIE and non-URI rel and rev have to be ignored if property is present.
   */
  onlyAllowUriRelRevIfProperty?: boolean;
  /**
   * If the new subject can be inherited from the parent object if we're inside <head> or <body>
   * if the resource defines no new subject.
   */
  inheritSubjectInHeadBody?: boolean;
  /**
   * If the datetime attribute must be interpreted as datetimes.
   */
  datetimeAttribute?: boolean;
  /**
   * If the time tag contents should be interpreted as datetimes.
   */
  timeTag?: boolean;
  /**
   * If rdf:HTML as datatype should cause tag contents to be serialized to text.
   */
  htmlDatatype?: boolean;
  /**
   * If rdfa:copy property links can refer to rdfa:Pattern's for copying.
   */
  copyRdfaPatterns?: boolean;
  /**
   * If prefixes should be extracted from xmlnsPrefixMappings.
   */
  xmlnsPrefixMappings?: boolean;
}

export interface IRdfaPattern {
  rootPattern: boolean;
  name: string;
  attributes: {[s: string]: string};
  text: string[];
  children: IRdfaPattern[];
  referenced: boolean;
  parentTag?: IActiveTag;
}
