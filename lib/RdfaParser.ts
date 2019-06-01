import {DomHandler} from "domhandler";
import EventEmitter = NodeJS.EventEmitter;
import {Parser as HtmlParser} from "htmlparser2";
import {PassThrough, Transform, TransformCallback} from "stream";

/**
 * A stream transformer that parses RDFa (text) streams to an {@link RDF.Stream}.
 */
export class RdfaParser extends Transform {

  private readonly options: IRdfaParserOptions;
  private readonly parser: HtmlParser;

  constructor(options?: IRdfaParserOptions) {
    super({ objectMode: true });
    options = options || {};
    this.options = options;

    this.parser = this.initializeParser();
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
  }

  public onTagOpen(name: string, attributes: {[s: string]: string}) {
    // TODO
  }

  public onTagClose() {
    // TODO
  }

  public onText(data: string) {
    // TODO
  }

  protected initializeParser(): HtmlParser {
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
      });
  }

}

export interface IRdfaParserOptions {

}
