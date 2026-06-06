import type { ImageMimeType } from "@doodle/shared";

import {
  createReadableFromBuffer,
  type ImageDownload,
  type ImageStorage,
  type StoreImageInput,
  type StoredImageFile
} from "./storage";

interface StoredFileRecord {
  buffer: Buffer;
  mimeType: ImageMimeType;
  originalName: string;
}

export class InMemoryImageStorage implements ImageStorage {
  private readonly filesById = new Map<string, StoredFileRecord>();
  private nextId = 1;

  public async deleteFile(fileId: string): Promise<void> {
    this.filesById.delete(fileId);
  }

  public async getFile(fileId: string): Promise<ImageDownload | null> {
    const file = this.filesById.get(fileId);

    if (!file) {
      return null;
    }

    return {
      stream: createReadableFromBuffer(file.buffer),
      mimeType: file.mimeType,
      size: file.buffer.byteLength,
      originalName: file.originalName
    };
  }

  public async storeFile(input: StoreImageInput): Promise<StoredImageFile> {
    const fileId = `file-${this.nextId}`;

    this.nextId += 1;
    this.filesById.set(fileId, {
      buffer: Buffer.from(input.buffer),
      mimeType: input.mimeType,
      originalName: input.originalName
    });

    return { fileId };
  }
}
