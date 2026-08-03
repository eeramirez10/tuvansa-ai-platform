import { StoredDocument, UploadedDocument } from "../../domain/document-file";

export interface DocumentStoragePort {
  save(file: UploadedDocument): Promise<StoredDocument>;
  read(filePath: string): Promise<Buffer>;
  remove(filePath: string): Promise<void>;
}
