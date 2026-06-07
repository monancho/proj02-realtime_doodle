import type { Collection, Filter } from "mongodb";

import type { ImageDocument } from "../images/mongodb-image-repository";
import type { ResultDocument } from "../results/mongodb-result-repository";
import type { RoomDocument } from "../rooms/mongodb-room-repository";
import type { ExpiredRoomCleanupStore } from "./room-cleanup";

export class MongoExpiredRoomCleanupStore implements ExpiredRoomCleanupStore {
  public constructor(
    private readonly rooms: Collection<RoomDocument>,
    private readonly images: Collection<ImageDocument>,
    private readonly results: Collection<ResultDocument>
  ) {}

  public async findExpiredFinishedRoomCodes(input: {
    now: Date;
    retentionMs: number;
  }): Promise<string[]> {
    const cutoff = new Date(input.now.getTime() - input.retentionMs);
    const documents = await this.rooms
      .find(createExpiredFinishedRoomFilter(input.now, cutoff))
      .project<{ roomCode: string }>({ roomCode: 1, _id: 0 })
      .toArray();

    return documents.map((document) => document.roomCode);
  }

  public async listOriginalImageFileIds(roomCodes: string[]): Promise<string[]> {
    if (roomCodes.length === 0) {
      return [];
    }

    const documents = await this.images
      .find({ roomCode: { $in: roomCodes } })
      .project<Pick<ImageDocument, "fileId">>({ fileId: 1 })
      .toArray();

    return documents.map((document) => document.fileId.toString());
  }

  public async listResultImageFileIds(roomCodes: string[]): Promise<string[]> {
    if (roomCodes.length === 0) {
      return [];
    }

    const documents = await this.results
      .find({ roomCode: { $in: roomCodes } })
      .project<Pick<ResultDocument, "resultFileId" | "thumbnailFileId">>({
        resultFileId: 1,
        thumbnailFileId: 1
      })
      .toArray();

    return documents.flatMap((document) =>
      document.thumbnailFileId
        ? [document.resultFileId, document.thumbnailFileId]
        : [document.resultFileId]
    );
  }

  public async deleteImageMetadataByRoomCodes(
    roomCodes: string[]
  ): Promise<number> {
    if (roomCodes.length === 0) {
      return 0;
    }

    const result = await this.images.deleteMany({
      roomCode: { $in: roomCodes }
    });

    return result.deletedCount ?? 0;
  }

  public async deleteResultMetadataByRoomCodes(
    roomCodes: string[]
  ): Promise<number> {
    if (roomCodes.length === 0) {
      return 0;
    }

    const result = await this.results.deleteMany({
      roomCode: { $in: roomCodes }
    });

    return result.deletedCount ?? 0;
  }

  public async deleteRoomsByCodes(roomCodes: string[]): Promise<number> {
    if (roomCodes.length === 0) {
      return 0;
    }

    const result = await this.rooms.deleteMany({
      roomCode: { $in: roomCodes },
      status: "finished"
    });

    return result.deletedCount ?? 0;
  }
}

export function createMongoExpiredRoomCleanupStore(input: {
  images: Collection<ImageDocument>;
  results: Collection<ResultDocument>;
  rooms: Collection<RoomDocument>;
}): MongoExpiredRoomCleanupStore {
  return new MongoExpiredRoomCleanupStore(
    input.rooms,
    input.images,
    input.results
  );
}

function createExpiredFinishedRoomFilter(
  now: Date,
  cutoff: Date
): Filter<RoomDocument> {
  return {
    status: "finished",
    $or: [
      { expiresAt: { $lte: now } },
      {
        expiresAt: { $exists: false },
        finishedAt: { $lte: cutoff }
      },
      {
        expiresAt: { $exists: false },
        finishedAt: { $exists: false },
        updatedAt: { $lte: cutoff }
      }
    ]
  } as Filter<RoomDocument>;
}
