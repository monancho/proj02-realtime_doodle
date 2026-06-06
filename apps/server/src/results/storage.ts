import { Readable } from "node:stream";

export interface StoreResultImageInput {
  buffer: Buffer;
  metadata: {
    roomCode: string;
    roundId: string;
    sourceImageId: string;
    mimeType: "image/png";
    createdAt: string;
  };
}

export interface StoredResultImage {
  fileId: string;
}

export interface ResultImageStorage {
  deleteFile(fileId: string): Promise<void>;
  storeResultImage(input: StoreResultImageInput): Promise<StoredResultImage>;
}

export function createReadableFromResultBuffer(
  buffer: Buffer
): NodeJS.ReadableStream {
  return Readable.from(buffer);
}

