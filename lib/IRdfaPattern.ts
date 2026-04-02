import type * as RDF from '@rdfjs/types';
import type { IActiveTag } from './IActiveTag';

/**
 * A datastructure for storing an rdfa:Pattern.
 */
export interface IRdfaPattern {
  rootPattern: boolean;
  name: string;
  attributes: Record<string, string>;
  text: string[];
  children: IRdfaPattern[];
  referenced: boolean;
  parentTag?: IActiveTag;
  constructedBlankNodes?: RDF.BlankNode[];
}
