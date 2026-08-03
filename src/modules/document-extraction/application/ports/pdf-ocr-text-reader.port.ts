export abstract class PdfOcrTextReaderPort {
  public abstract read(buffer: Buffer): Promise<string>;
}
