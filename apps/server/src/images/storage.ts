import { Readable } from "node:stream";

import type { ImageMimeType } from "@doodle/shared";

export interface StoreImageInput {
  buffer: Buffer;
  originalName: string;
  mimeType: ImageMimeType;
  metadata: {
    roomCode: string;
    uploadedByFirebaseUid: string;
    createdAt: string;
  };
}

export interface StoredImageFile {
  fileId: string;
}

export interface ImageDownload {
  stream: NodeJS.ReadableStream;
  mimeType: ImageMimeType;
  size: number;
  originalName: string;
}

export interface ImageStorage {
  deleteFile(fileId: string): Promise<void>;
  getFile(fileId: string): Promise<ImageDownload | null>;
  storeFile(input: StoreImageInput): Promise<StoredImageFile>;
}

export function createReadableFromBuffer(buffer: Buffer): NodeJS.ReadableStream {
  return Readable.from(buffer);
}
