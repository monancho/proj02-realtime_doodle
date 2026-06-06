import { Readable } from "node:stream";

import type { ImageMimeType } from "@doodle/shared";
import { GridFSBucket, ObjectId, type Db } from "mongodb";

import type {
  ImageDownload,
  ImageStorage,
  StoreImageInput,
  StoredImageFile
} from "./storage";

const DEFAULT_ORIGINAL_IMAGE_BUCKET = "originalImages";

interface GridFsFileDocument {
  _id: ObjectId;
  filename: string;
  length: number;
  contentType?: string;
  metadata?: {
    mimeType?: ImageMimeType;
    originalName?: string;
  };
}

export function createGridFsImageStorage(db: Db): ImageStorage {
  return new GridFsImageStorage(
    new GridFSBucket(db, { bucketName: DEFAULT_ORIGINAL_IMAGE_BUCKET })
  );
}

class GridFsImageStorage implements ImageStorage {
  public constructor(private readonly bucket: GridFSBucket) {}

  public async deleteFile(fileId: string): Promise<void> {
    if (ObjectId.isValid(fileId)) {
      await this.bucket.delete(new ObjectId(fileId));
    }
  }

  public async getFile(fileId: string): Promise<ImageDownload | null> {
    if (!ObjectId.isValid(fileId)) {
      return null;
    }

    const objectId = new ObjectId(fileId);
    const files = await this.bucket.find({ _id: objectId }).limit(1).toArray();
    const file = files[0] as GridFsFileDocument | undefined;

    if (!file) {
      return null;
    }

    const mimeType = parseImageMimeType(
      file.metadata?.mimeType ?? file.contentType
    );

    if (!mimeType) {
      return null;
    }

    return {
      stream: this.bucket.openDownloadStream(objectId),
      mimeType,
      size: file.length,
      originalName: file.metadata?.originalName ?? file.filename
    };
  }

  public async storeFile(input: StoreImageInput): Promise<StoredImageFile> {
    const uploadStream = this.bucket.openUploadStream(input.originalName, {
      metadata: {
        ...input.metadata,
        mimeType: input.mimeType,
        originalName: input.originalName
      }
    });

    await new Promise<void>((resolve, reject) => {
      Readable.from(input.buffer)
        .pipe(uploadStream)
        .on("error", reject)
        .on("finish", () => {
          resolve();
        });
    });

    return { fileId: uploadStream.id.toString() };
  }
}

function parseImageMimeType(value: string | undefined): ImageMimeType | null {
  if (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp"
  ) {
    return value;
  }

  return null;
}
