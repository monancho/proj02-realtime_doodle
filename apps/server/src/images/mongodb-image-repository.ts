import type { ImageMetadata, ImageMimeType } from "@doodle/shared";
import { ObjectId, type Collection } from "mongodb";

import type { CreateImageMetadataInput, ImageRepository } from "./repository";

export interface ImageDocument {
  _id: ObjectId;
  roomCode: string;
  uploadedBy: {
    firebaseUid: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  originalName: string;
  mimeType: ImageMimeType;
  size: number;
  storageType: "gridfs";
  fileId: ObjectId;
  width: number | null;
  height: number | null;
  used: boolean;
  active?: boolean;
  replacedAt?: Date | null;
  createdAt: Date;
}

export async function ensureImageIndexes(
  collection: Collection<ImageDocument>
): Promise<void> {
  await collection.createIndex({ roomCode: 1, active: 1, used: 1 });
  await collection.createIndex({ roomCode: 1, "uploadedBy.firebaseUid": 1, active: 1 });
  await collection.createIndex({ createdAt: 1 });
}

export function createMongoImageRepository(
  collection: Collection<ImageDocument>
): ImageRepository {
  return new MongoImageRepository(collection);
}

class MongoImageRepository implements ImageRepository {
  public constructor(private readonly collection: Collection<ImageDocument>) {}

  public async countImagesByUploader(input: {
    roomCode: string;
    firebaseUid: string;
  }): Promise<number> {
    return this.collection.countDocuments({
      roomCode: input.roomCode,
      "uploadedBy.firebaseUid": input.firebaseUid,
      active: { $ne: false }
    });
  }

  public async createImageMetadata(
    input: CreateImageMetadataInput
  ): Promise<ImageMetadata> {
    const fileId = new ObjectId(input.fileId);
    const document: ImageDocument = {
      _id: new ObjectId(),
      roomCode: input.roomCode,
      uploadedBy: { ...input.uploadedBy },
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      storageType: "gridfs",
      fileId,
      width: input.width,
      height: input.height,
      used: false,
      active: true,
      replacedAt: null,
      createdAt: new Date()
    };

    await this.collection.insertOne(document);

    return mapImageDocument(document);
  }

  public async findImageById(imageId: string): Promise<ImageMetadata | null> {
    if (!ObjectId.isValid(imageId)) {
      return null;
    }

    const document = await this.collection.findOne({
      _id: new ObjectId(imageId)
    });

    return document ? mapImageDocument(document) : null;
  }

  public async deactivateActiveImagesByRoomCode(roomCode: string): Promise<void> {
    await this.collection.updateMany(
      { roomCode, active: { $ne: false } },
      {
        $set: {
          active: false,
          replacedAt: new Date()
        }
      }
    );
  }

  public async deactivateActiveImagesByUploader(input: {
    roomCode: string;
    firebaseUid: string;
    exceptImageId?: string;
  }): Promise<void> {
    const filter = {
      roomCode: input.roomCode,
      "uploadedBy.firebaseUid": input.firebaseUid,
      active: { $ne: false },
      ...(input.exceptImageId && ObjectId.isValid(input.exceptImageId)
        ? { _id: { $ne: new ObjectId(input.exceptImageId) } }
        : {})
    };

    await this.collection.updateMany(
      filter,
      {
        $set: {
          active: false,
          replacedAt: new Date()
        }
      }
    );
  }

  public async listImagesByRoomCode(roomCode: string): Promise<ImageMetadata[]> {
    const documents = await this.collection
      .find({ roomCode, active: { $ne: false } })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map(mapImageDocument);
  }

  public async listUnusedImagesByRoomCode(
    roomCode: string
  ): Promise<ImageMetadata[]> {
    const documents = await this.collection
      .find({ roomCode, active: { $ne: false }, used: false })
      .sort({ createdAt: 1 })
      .toArray();

    return documents.map(mapImageDocument);
  }

  public async markImageUsed(imageId: string): Promise<ImageMetadata | null> {
    if (!ObjectId.isValid(imageId)) {
      return null;
    }

    const document = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(imageId), active: { $ne: false }, used: false },
      { $set: { used: true } },
      { returnDocument: "after" }
    );

    return document ? mapImageDocument(document) : null;
  }
}

function mapImageDocument(document: ImageDocument): ImageMetadata {
  return {
    id: document._id.toHexString(),
    roomCode: document.roomCode,
    uploadedBy: { ...document.uploadedBy },
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    storageType: document.storageType,
    fileId: document.fileId.toHexString(),
    width: document.width,
    height: document.height,
    used: document.used,
    active: document.active ?? true,
    replacedAt: document.replacedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString()
  };
}
