import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DocumentStoragePort } from "../../application/ports/document-storage.port";
import { StoredDocument, UploadedDocument } from "../../domain/document-file";

export class LocalDocumentStorageAdapter implements DocumentStoragePort {
  constructor(private readonly storageDirectory: string) {}

  public async save(file: UploadedDocument): Promise<StoredDocument> {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    const safeName = path.basename(file.originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(this.storageDirectory, `${randomUUID()}-${safeName}`);
    await fs.writeFile(filePath, file.buffer, { flag: "wx" });
    return { fileName: file.originalName, filePath, mimeType: file.mimeType };
  }

  public read(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  public async remove(filePath: string): Promise<void> {
    await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
