import { Readable } from "node:stream";

import { GridFSBucket, ObjectId, type Db } from "mongodb";

import type {
  ResultImageStorage,
  StoreResultImageInput,
  StoredResultImage
} from "./storage";

const DEFAULT_RESULT_IMAGE_BUCKET = "resultImages";

export function createGridFsResultImageStorage(db: Db): ResultImageStorage {
  return new GridFsResultImageStorage(
    new GridFSBucket(db, { bucketName: DEFAULT_RESULT_IMAGE_BUCKET })
  );
}

class GridFsResultImageStorage implements ResultImageStorage {
  public constructor(private readonly bucket: GridFSBucket) {}

  public async deleteFile(fileId: string): Promise<void> {
    if (ObjectId.isValid(fileId)) {
      await this.bucket.delete(new ObjectId(fileId));
    }
  }

  public async storeResultImage(
    input: StoreResultImageInput
  ): Promise<StoredResultImage> {
    const uploadStream = this.bucket.openUploadStream(
      `${input.metadata.roomCode}-${input.metadata.roundId}.png`,
      {
        metadata: input.metadata
      }
    );

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
