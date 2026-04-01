import type * as RDF from '@rdfjs/types';
import type { IRdfaPattern } from './IRdfaPattern';

/**
 * Data holder for the RDFa state in XML tags.
 */
export interface IActiveTag {
  name: string;
  prefixesAll: Record<string, string>;
  prefixesCustom: Record<string, string>;
  subject?: RDF.NamedNode | RDF.BlankNode | boolean;
  explicitNewSubject?: boolean;
  predicates?: RDF.NamedNode[];
  object?: RDF.NamedNode | RDF.BlankNode | boolean;
  textWithTags?: string[];
  textWithoutTags?: string[];
  vocab?: string;
  language?: string;
  datatype?: RDF.NamedNode;
  collectChildTags?: boolean;
  collectChildTagsForCurrentTag?: boolean;
  collectedPatternTag?: IRdfaPattern;
  interpretObjectAsTime?: boolean;
  incompleteTriples?: { predicate: RDF.Quad_Predicate; reverse: boolean; list?: boolean }[];
  inlist: boolean;
  listMapping: Record<string, (RDF.Term | boolean)[]>;
  listMappingLocal: Record<string, (RDF.Term | boolean)[]>;
  skipElement: boolean;
  localBaseIRI?: RDF.NamedNode;
}
