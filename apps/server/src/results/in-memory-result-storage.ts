import type {
  ResultImageStorage,
  StoreResultImageInput,
  StoredResultImage
} from "./storage";

interface StoredResultImageRecord {
  buffer: Buffer;
  metadata: StoreResultImageInput["metadata"];
}

export class InMemoryResultImageStorage implements ResultImageStorage {
  private readonly filesById = new Map<string, StoredResultImageRecord>();
  private nextId = 1;

  public async deleteFile(fileId: string): Promise<void> {
    this.filesById.delete(fileId);
  }

  public async storeResultImage(
    input: StoreResultImageInput
  ): Promise<StoredResultImage> {
    const fileId = `result-file-${this.nextId}`;

    this.nextId += 1;
    this.filesById.set(fileId, {
      buffer: Buffer.from(input.buffer),
      metadata: { ...input.metadata }
    });

    return { fileId };
  }

  public getStoredFile(fileId: string): StoredResultImageRecord | null {
    const file = this.filesById.get(fileId);

    return file
      ? { buffer: Buffer.from(file.buffer), metadata: { ...file.metadata } }
      : null;
  }
}

